import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {custodyClosureFixture} from '../helpers/phase9dCustodyClosureFixture.js';
import {commitment,keyIdentity,sourceMac} from '../../../tools/phase9d/custody-protocol.mjs';
import {durableReceipt} from '../../../tools/phase9d/closure-keys.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
test('custody SQL security, rotation fencing and storage admission regressions',async t=>{
  const f=await custodyClosureFixture(),witness={schema:'custody-safety-v1',mutations:[],catalog:[]};
  const pairs=new Map([[f.keyId,f.keys.privateKey]]);
  const accept=async(client,event)=>(await client.query('SELECT custody.ingest($1) body',[{event,mac:sourceMac(event,f.sourceKey)}])).rows[0].body;
  const rotated=generateKeyPairSync('ed25519'),next=keyIdentity(rotated.publicKey),pem=rotated.publicKey.export({type:'spki',format:'pem'});
  try{
    const request=await f.register(0),event=(await f.frame(1)).event;
    await t.test('rotation refuses unsigned committed receipts; signer replacement recovers original identity',async()=>{
      const body=await accept(f.ingest,event);
      assert.equal((await f.audit.query('SELECT custody.rotate($1,$2,1) ok',[next,pem])).rows[0].ok,false);
      const pid=(await f.signer.query('SELECT pg_backend_pid() id')).rows[0].id;
      await f.audit.query('SELECT pg_terminate_backend($1)',[pid]);
      await assert.rejects(durableReceipt(f.signer,body,pairs));
      const replacement=await f.connect('custody_signer');
      const receipt=await durableReceipt(replacement,body,pairs);
      assert.equal(receipt.body.receipt,body.receipt);
      assert.deepEqual(await durableReceipt(replacement,body,new Map()),receipt);
      witness.signerTermination={actualBackendTermination:true,receiptIdentityPreserved:true};
    });
    await t.test('two independently connected rotation operators have one epoch winner',async()=>{
      const other=generateKeyPairSync('ed25519'),otherId=keyIdentity(other.publicKey),otherPem=other.publicKey.export({type:'spki',format:'pem'});
      // Independent sessions, not two promises on one PostgreSQL connection.
      const {Client}=await import('pg'),second=new Client({connectionString:process.env.CUSTODY_DATABASE_URL});await second.connect();
      try{
        const outcomes=await Promise.all([f.audit.query('SELECT custody.rotate($1,$2,1) ok',[next,pem]),second.query('SELECT custody.rotate($1,$2,1) ok',[otherId,otherPem])]);
        assert.equal(outcomes.filter(r=>r.rows[0].ok).length,1);
        witness.rotationWinner=(await f.inspector.query("SELECT key_id,epoch FROM custody.keys WHERE status='ACTIVE'")).rows[0];
        assert.equal(witness.rotationWinner.epoch,'2');
      }finally{await second.end();}
    });
    await t.test('all five pressure dimensions stop registration and reservation while STOP survives',async()=>{
      const fields=[['max_unacknowledged','1'],['max_payload_bytes','1024'],['max_review','1'],['max_review_age_seconds','1'],['max_storage_bytes','1048576']];
      const original=(await f.b.query('SELECT * FROM custody_export.limits')).rows[0];
      for(const [field,value]of fields){
        await f.b.query('BEGIN');
        try{
          if(field==='max_payload_bytes')await f.b.query("INSERT INTO custody_export.events(seq,local_id,event,hash) SELECT 999,999,jsonb_build_object('observed','2026-10-12T00:00:00.000Z','padding',(SELECT string_agg(md5(g::text),'') FROM generate_series(1,200) g)),repeat('f',64)");
          if(field==='max_review'||field==='max_review_age_seconds')await f.b.query("UPDATE custody_export.events SET status='REVIEW',receipt=NULL,event=jsonb_set(event,'{observed}','\"2026-10-12T00:00:00.000Z\"') WHERE seq=1");
          if(field==='max_storage_bytes')await f.b.query("ALTER TABLE custody_export.events ADD COLUMN capacity_probe text;ALTER TABLE custody_export.events ALTER COLUMN capacity_probe SET STORAGE PLAIN;INSERT INTO custody_export.events(seq,local_id,event,hash,capacity_probe) SELECT 10000+g,10000+g,jsonb_build_object('observed','2026-10-12T00:00:00.000Z'),md5(g::text),repeat('x',4096) FROM generate_series(1,300) g");
          // These changes must be visible to restricted callers: use this same
          // transaction with SET LOCAL ROLE, then roll all fixture changes back.
          await f.b.query('UPDATE custody_export.limits SET '+field+'='+value);
          await f.b.query('SAVEPOINT admission');await f.b.query('SET LOCAL ROLE broker9d_exec');
          await assert.rejects(f.b.query('SELECT broker9d.reserve($1)',[request]),{code:'54000'});
          await f.b.query('ROLLBACK TO admission');
          await f.b.query('SAVEPOINT register_probe');await f.b.query('SET LOCAL ROLE broker9d_exec');
          await assert.rejects(f.b.query('SELECT broker9d.register($1)',[JSON.stringify(f.message(1))]),{code:'54000'});
          await f.b.query('ROLLBACK TO register_probe');
        }finally{await f.b.query('ROLLBACK');}
      }
      assert.deepEqual((await f.b.query('SELECT * FROM custody_export.limits')).rows[0],original);
      assert.equal((await f.control('STOP')).status,'APPLIED');
      witness.pressureDimensions=fields.map(([field])=>field);
    });
    await t.test('ingestion waiting on rotation never commits under the retired epoch',async()=>{
      const frame=await f.frame(2),third=generateKeyPairSync('ed25519'),id=keyIdentity(third.publicKey),material=third.publicKey.export({type:'spki',format:'pem'});
      const pid=(await f.ingest.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      await f.audit.query('BEGIN');await f.audit.query("SELECT key_id FROM custody.keys WHERE status='ACTIVE' FOR UPDATE");
      const pending=accept(f.ingest,frame.event).then(body=>({body}),error=>({error:error.code}));
      let blocked=false;
      try{
        for(let i=0;i<100&&!blocked;i++){blocked=(await f.audit.query("SELECT wait_event_type='Lock' blocked FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.blocked===true;if(!blocked)await new Promise(ok=>setTimeout(ok,10));}
        assert.equal(blocked,true);assert.equal((await f.audit.query('SELECT custody.rotate($1,$2,2) ok',[id,material])).rows[0].ok,true);await f.audit.query('COMMIT');
      }catch(error){await f.audit.query('ROLLBACK');await pending;throw error;}
      const observed=await pending;let body=observed.body;
      if(observed.error){assert.equal(observed.error,'23514');body=await accept(f.ingest,frame.event);}
      assert.equal(body.keyId,id);const signer=await f.connect('custody_signer');await durableReceipt(signer,body,new Map([[id,third.privateKey]]));
      witness.ingestionRotation={actualLockWitness:true,firstAttempt:observed.error??'COMMITTED',committedEpoch:3};
    });
    await t.test('changed SQL inventory pins owners, search paths, PUBLIC execution and grants',async()=>{
      for(const [client,schemas]of [[f.b,['custody_export']],[f.audit,['custody']]]){
        const rows=(await client.query(`SELECT p.oid::regprocedure::text signature,n.nspname,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,p.proacl::text acl,l.lanname,pg_get_functiondef(p.oid) definition,
          EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') public_execute,
          EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') extension_member
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname=ANY($1) ORDER BY signature`,[schemas])).rows;
        for(const row of rows){
          if(!row.extension_member){assert.equal(row.owner,row.nspname==='custody'?'custody_owner':'custody_source_owner');assert.ok(row.proconfig?.some(value=>value.startsWith('search_path=pg_catalog, ')));}
          assert.equal(row.public_execute,false,row.signature);witness.catalog.push({...row,definitionSha256:hash(row.definition)});
        }
        witness.defaultPrivileges??=[];
        witness.defaultPrivileges.push(...(await client.query("SELECT pg_get_userbyid(defaclrole) owner,defaclobjtype,defaclacl::text FROM pg_default_acl WHERE defaclrole IN (SELECT oid FROM pg_roles WHERE rolname IN('custody_owner','custody_source_owner'))")).rows);
      }
    });
    await t.test('selected SQL omissions are killed and exact catalog definitions restored',async()=>{
      const signature='custody.ingest(jsonb)',original=(await f.audit.query('SELECT pg_get_functiondef($1::regprocedure) definition',[signature])).rows[0].definition;
      const condition="IF encode(custody.hmac('custody-source-v1'||chr(10)||canonical,source.verification_secret,'sha256'),'hex')<>frame->>'mac' THEN";
      assert.ok(original.includes(condition));const mutant=original.replace(condition,'IF false THEN');
      try{
        await f.audit.query(mutant);await f.ingest.query('BEGIN');
        const body=(await f.ingest.query('SELECT custody.ingest($1) body',[{event,mac:'0'.repeat(64)}])).rows[0].body;
        assert.equal(body.source,event.source);
        witness.mutations.push({signature,operator:'omit source MAC admission',status:'KILLED',originalSha256:hash(original),mutantSha256:hash(mutant)});
      }finally{await f.ingest.query('ROLLBACK');await f.audit.query(original);}
      assert.equal((await f.audit.query('SELECT pg_get_functiondef($1::regprocedure) definition',[signature])).rows[0].definition,original);
      await assert.rejects(f.ingest.query('SELECT custody.ingest($1)',[{event,mac:'0'.repeat(64)}]),{code:'23514'});
    });
    await t.test('competing recovery operators and three recovery limits preserve unresolved history during stop',async()=>{
      assert.equal((await f.b.query('SELECT stopped FROM broker9d.control')).rows[0].stopped,true);
      for(let i=0;i<3;i++)assert.ok((await f.sender.query('SELECT custody_export.next() frame')).rows[0].frame);
      const password=randomUUID(),role='custody_recovery_competitor',{Client}=await import('pg');
      await f.b.query('CREATE ROLE '+role+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;GRANT USAGE ON SCHEMA custody_export TO '+role+';GRANT EXECUTE ON FUNCTION custody_export.retry(uuid,bigint,int) TO '+role);
      await f.b.query((await f.b.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) sql",[role,password])).rows[0].sql);
      const uri=new URL(f.uri(f.receiver.name,'broker9d_exec'));uri.username=role;uri.password=password;
      const other=new Client({connectionString:uri.toString()});await other.connect();
      try{
        const ids=[randomUUID(),randomUUID()],results=await Promise.all([f.operator.query('SELECT custody_export.retry($1,1,3) ok',[ids[0]]),other.query('SELECT custody_export.retry($1,1,3) ok',[ids[1]])]);
        assert.equal(results.filter(r=>r.rows[0].ok).length,1);
        for(let cycle=1;cycle<=3;cycle++){
          for(let i=0;i<3;i++)assert.ok((await f.sender.query('SELECT custody_export.next() frame')).rows[0].frame);
          assert.equal((await f.operator.query('SELECT custody_export.retry($1,1,3) ok',[randomUUID()])).rows[0].ok,cycle<3);
        }
        const retained=(await f.sourceInspector.query('SELECT status,attempts,recoveries,hash FROM custody_export.events WHERE seq=1')).rows[0];
        assert.deepEqual({...retained,hash:null},{status:'REVIEW',attempts:3,recoveries:3,hash:null});assert.equal(retained.hash,commitment(event));
        witness.recovery={independentSessions:true,winners:1,maxRecoveries:3,state:'REVIEW',duringStop:true};
      }finally{await other.end();}
    });
    await f.unchanged();witness.status='EXECUTED';
    await writeFile(join(process.env.CUSTODY_OUTPUT,'safety-witness-'+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});
  }finally{await f.close();}
});
