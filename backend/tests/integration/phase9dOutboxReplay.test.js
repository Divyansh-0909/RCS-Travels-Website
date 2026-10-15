import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {fork} from 'node:child_process';
import pg from 'pg';
import {createTestDatabase,testDatabaseUrl} from '../helpers/database.js';
import {createScheduledScenario} from '../helpers/scheduledScenario.js';
import {createTestClock} from '../helpers/testClock.js';
import {cancelDriverRideInTransaction} from '../../services/driverRideCancellation.js';
import {executeIsolatedShadowWorker} from '../../../tools/phase9d/worker-core.mjs';
import {consequenceState} from '../helpers/phase9dCurrentPolicyWitness.js';
import {EXPORT_TEST_KEY} from '../helpers/phase9dExportFixture.js';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('saved explicit source and interrupted-delivery inputs replay in a fresh database',async()=>{
  const recipe=JSON.parse(await readFile(process.env.PHASE9D_REPLAY_INPUT,'utf8'));
  const db=await createTestDatabase(),url=testDatabaseUrl();url.pathname='/'+db.name;
  const admin=new pg.Client({connectionString:url.toString()});await admin.connect();
  try{
    await admin.query(await readFile(new URL('../../../tools/phase9d/permissions.sql',import.meta.url),'utf8'));
    await admin.query(await readFile(new URL('../../../tools/phase9d/outbox.sql',import.meta.url),'utf8'));
    await admin.query('REVOKE TEMPORARY ON DATABASE "'+db.name+'" FROM PUBLIC');
    const scenario=createScheduledScenario({now:recipe.at});
    const revive=(key,value)=>typeof value==='string'&&key.endsWith('At')?new Date(value):value;
    const collections=JSON.parse(JSON.stringify(recipe.initial),revive);
    for(const [name,rows] of Object.entries(collections)){
      assert.equal(rows.length,scenario.collections[name].length);
      rows.forEach((row,index)=>Object.assign(scenario.collections[name][index],row));
    }
    await scenario.persist(db.client);
    // Owned fixture IDs eliminate generated-identity aliases for this one recipe.
    // Actual collectors/services still create and return their journal records.
    const names=['driver_cancellations','responsibility_evidence_versions','responsibility_adjudication_work'];
    for(const [index,table] of names.entries()){
      const id=recipe.journalIds[index];assert.match(id,/^[a-f0-9-]{36}$/);
      await admin.query(`CREATE FUNCTION public.replay_identity_${index}() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.id='${id}';RETURN NEW;END$$;
        REVOKE ALL ON FUNCTION public.replay_identity_${index}() FROM PUBLIC;
        CREATE TRIGGER replay_identity_${index} BEFORE INSERT ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.replay_identity_${index}()`);
    }
    const initial=await consequenceState(db.client),clock=createTestClock(recipe.at),booking=scenario.bookingStates.current,driver=scenario.driversByGroup.rcs;
    await db.client.$transaction(tx=>cancelDriverRideInTransaction(tx,booking,driver,{reason:'rider_unreachable'},{clock}));
    const committed=await consequenceState(db.client);
    await admin.query('UPDATE outbox9d.configuration SET enabled=true,privacy_key=$1',[EXPORT_TEST_KEY]);
    await admin.query('UPDATE shadow9d.control SET stopped=false,now_at=$1,used_requests=0',[recipe.at]);
    const passwords={exporter:randomUUID(),worker:randomUUID()};
    for(const [role,password]of Object.entries(passwords))await admin.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) command",['shadow9d_'+role,password]).then(r=>admin.query(r.rows[0].command));
    const target=role=>{const value=new URL(url);value.username='shadow9d_'+role;value.password=passwords[role];return value.toString();};
    async function exporter(mode){
      const fence=new URL(target('exporter'));fence.pathname='/rcs_container_test';
      const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
      Object.assign(env,{NODE_ENV:'test',PHASE9_ISOLATED:'1',DATABASE_URL:process.env.DATABASE_URL,DIRECT_URL:process.env.DIRECT_URL,DOTENV_CONFIG_PATH:process.env.DOTENV_CONFIG_PATH,TEST_DATABASE_URL:fence.toString()});
      const child=fork(resolve('../tools/phase9d/export-child.mjs'),[],{env,cwd:resolve('.'),windowsHide:true,execArgv:['--import','./tests/helpers/phase9Isolation.js','--import','tsx'],stdio:['ignore','ignore','ignore','ipc']});
      const exit=new Promise(done=>child.once('exit',(code,signal)=>done({code,signal})));
      const result=await new Promise((done,reject)=>{
        const timer=setTimeout(()=>{child.kill();reject(Error('replay child deadline'));},20000);
        child.on('message',value=>{if(value.status==='READY'){child.send({connectionString:target('exporter'),key:EXPORT_TEST_KEY,mode});return;}clearTimeout(timer);done(value);});
        child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);reject(Error('replay child exited: '+code));});
      });
      if(mode==='stage_then_crash'){child.kill();await exit;}else assert.equal((await exit).code,0);
      return result;
    }
    assert.equal((await exporter('stage_then_crash')).status,'STAGED');
    await admin.query("UPDATE shadow9d.control SET now_at=now_at+interval '121 seconds'");
    assert.equal((await exporter('resume')).status,'ACKED');assert.equal((await exporter('resume')).status,'EMPTY');
    const analysis=await executeIsolatedShadowWorker({connectionString:target('worker'),mode:'resume'},{environment:{}});assert.equal(analysis.status,'COMPLETED');assert.equal(analysis.calls,1);
    assert.equal((await executeIsolatedShadowWorker({connectionString:target('worker'),mode:'resume'},{environment:{}})).calls,0);
    const delivery=(await admin.query('SELECT payload,status,attempts FROM outbox9d.deliveries')).rows[0],receiver=(await admin.query('SELECT snapshot,result,status,attempts FROM shadow9d.work')).rows[0];
    assert.equal(receiver.result.route,'NEEDS_ADMIN_REVIEW');assert.deepEqual(await consequenceState(db.client),committed);
    const outcome={initial,committed,events:recipe.events,delivery,receiver,final:await consequenceState(db.client),fakeCalls:1,liveCalls:0};
    const output=resolve(process.env.PHASE9D_OUTBOX_OUTPUT);assert.equal(output,resolve('../output/phase9d-outbox-broker-2026-10-13'));
    await writeFile(join(output,'replay-outcome-'+recipe.id+'-'+randomUUID()+'.json'),JSON.stringify({recipeId:recipe.id,recipeSha256:digest(recipe),outcome,outcomeSha256:digest(outcome)},null,2),{flag:'wx'});
  }finally{await admin.end();await db.close();}
});
