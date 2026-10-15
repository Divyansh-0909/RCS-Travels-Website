import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {canonical,issueOfflineUsage} from '../../tools/phase9d/recovery-receipt.mjs';
import {recoverySession} from '../../tools/phase9d/recovery-session.mjs';
import {recoveryOperation} from '../../tools/phase9d/recovery-operations.mjs';
import pg from 'pg';
import {readFile} from 'node:fs/promises';

test('capsule admission probes final TCP server rather than temporary initdb socket',async()=>{
  const source=await readFile(new URL('../../tools/phase9d/recovery-capsule.mjs',import.meta.url),'utf8');
  assert.ok(source.includes("'pg_isready','--host','127.0.0.1','--port','5432'"));
  assert.ok(source.includes("record.databaseAdmissionTransport='TCP_FINAL_SERVER'"));
});
test('synthetic issuing authority signs canonical accounting and rejects unsafe numeric usage',()=>{
  const key='synthetic-independent-fixture-secret-at-least-32',binding={receiptId:randomUUID(),requestId:randomUUID(),attemptId:randomUUID(),dispatchId:randomUUID(),configurationHash:'a'.repeat(64),generation:'1',responseHash:null},usage={outcome:'SUCCESS',input:128,output:32,minor:2};
  const receipt=issueOfflineUsage(binding,usage,key);assert.equal(receipt.mac,createHmac('sha256',key).update('offline-usage-v1\n'+canonical(receipt.body)).digest('hex'));
  assert.deepEqual(receipt.body,{schema:'offline-usage-v1',issuer:'independent-offline-provider',keyId:'offline-issuer-v1',frozen:'e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75',provider:'typesafe-ai',model:'jev-1.13.0',...binding,...usage});
  assert.equal(issueOfflineUsage(binding,{...usage,input:999999999},'k'.repeat(32)).body.input,999999999);
  assert.throws(()=>issueOfflineUsage(binding,{...usage,input:1000000000},key));
  assert.equal(canonical({z:[{b:2,a:1}],a:null}),'{"a":null,"z":[{"a":1,"b":2}]}');assert.equal(canonical({b:1,a:2}),canonical({a:2,b:1}));
  for(const name of ['input','output','minor'])for(const value of [-1,0.1,1e30,NaN,'0',null,undefined])assert.throws(()=>issueOfflineUsage(binding,{...usage,[name]:value},key));
  for(const outcome of ['SUCCESS','BILLED_FAILURE','NO_DISPATCH'])assert.equal(issueOfflineUsage(binding,{...usage,outcome,input:0},key).body.outcome,outcome);
  assert.throws(()=>issueOfflineUsage(binding,usage,'x'));assert.throws(()=>issueOfflineUsage(binding,usage,undefined));assert.throws(()=>issueOfflineUsage(binding,{...usage,outcome:'other'},key));
  assert.throws(()=>issueOfflineUsage({...binding,provider:'other'},usage,key));
  assert.throws(()=>issueOfflineUsage(binding,{...usage,requestId:randomUUID()},key));
});
test('narrow operations bind exact command fields and parameterized SQL',async()=>{
  const queries=[],client={async query(sql,args){queries.push({sql,args});return {rows:[{value:{status:'APPLIED'}}]};}},id=randomUUID(),target=randomUUID();
  const commands=[{action:'INSPECT',target},{action:'ACCOUNTING'},{action:'RECONCILE',receipt:{body:{},mac:'a'}},...['STOP','RESUME','TERMINATE','CLEAN'].map(action=>({action,id,target:null,expected:0,reason:'OPERATOR_STOP'}))];
  for(const command of commands)assert.deepEqual(await recoveryOperation(client,command),{status:'APPLIED'});
  assert.deepEqual(queries.map(q=>q.sql),['SELECT broker9d.inspect($1) value','SELECT broker9d.accounting() value','SELECT broker9d.reconcile($1) value',...Array(4).fill('SELECT broker9d.operate($1,$2,$3,$4,$5) value')]);
  assert.deepEqual(queries[2].args,[JSON.stringify(commands[2].receipt)]);assert.deepEqual(queries[3].args,[id,null,'STOP',0,'OPERATOR_STOP']);
  for(const command of [null,[],{action:'OTHER'},{action:'ACCOUNTING',extra:true},{action:'STOP',id:'invalid',target,expected:0,reason:'OPERATOR_STOP'},{action:'STOP',id,target,expected:-1,reason:'OPERATOR_STOP'},{action:'STOP',id,target,expected:1.1,reason:'OPERATOR_STOP'}])await assert.rejects(recoveryOperation(client,command));
  assert.equal(queries.length,7);
  const array=[];array.action='ACCOUNTING';const callable=()=>{};callable.action='ACCOUNTING';
  for(const command of [array,callable])await assert.rejects(recoveryOperation(client,command));
  for(const value of ['prefix'+id,id+'suffix'])await assert.rejects(recoveryOperation(client,{action:'STOP',id:value,target:null,expected:0,reason:'OPERATOR_STOP'}));
});
test('operations session rejects privilege inheritance and URI substitution before connecting',async()=>{
  for(const role of ['broker9d_ops','broker9d_reconciler']){
    const database='rcs_verify_'+'a'.repeat(32),uri=`postgresql://${role}:synthetic@localhost:5432/${database}`,calls=[];
    const rows=[{actor:role,effective:role,database,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false}];
    let created=0;const options=[];
    const factory=option=>{created++;options.push(option);return {async connect(){calls.push('connect');},async query(sql,args){calls.push({sql,args});return sql.includes('pg_roles')?{rows}:{rows:[{installed:true}]};},async end(){calls.push('end');}};};
    const client=await recoverySession(uri,role,{environment:{},factory});await client.end();assert.equal(calls[0],'connect');assert.equal(calls.at(-1),'end');assert.deepEqual(calls[2].args,['broker9d.reconcile(jsonb)']);
    assert.deepEqual(options,[{connectionString:uri,connectionTimeoutMillis:2000,statement_timeout:2000}]);
    for(const value of [uri+'?user=postgres',uri+'#x',uri.replace('localhost','remote'),uri.replace(database,'production'),uri.replace(database,'prefix'+database),uri.replace(database,'prefix/'+database),uri+'suffix',uri.replace(role,'postgres'),uri.replace('postgresql','http')]){const before=created;await assert.rejects(recoverySession(value,role,{environment:{},factory}));assert.equal(created,before);}
    for(const name of ['CLERK_SECRET_KEY','OPENAI_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','RAZORPAY_KEY_SECRET']){const before=created;await assert.rejects(recoverySession(uri,role,{environment:{[name]:'forbidden'},factory}));assert.equal(created,before);}
    await (await recoverySession(uri.replace('postgresql:','postgres:'),role,{environment:{},factory})).end();
    for(const failure of ['connect','identity','routine']){
      let ended=0;await assert.rejects(recoverySession(uri,role,{environment:{},factory:()=>({async connect(){if(failure==='connect')throw Error('offline');},async query(sql){return sql.includes('pg_roles')?{rows:failure==='identity'?[]:rows}:{rows:[{installed:false}]};},async end(){ended++;}})}));assert.equal(ended,1);
    }
  }
  await assert.rejects(recoverySession('invalid','broker9d_exec',{environment:{}}));
});
test('supported pg default factory receives safe options and exact installed-routine query',async()=>{
  const original={connect:pg.Client.prototype.connect,query:pg.Client.prototype.query,end:pg.Client.prototype.end};let calls=0;
  const role='broker9d_ops',database='rcs_verify_'+'b'.repeat(32),uri=`postgresql://${role}:synthetic@localhost:5432/${database}`;
  pg.Client.prototype.connect=async function(){assert.equal(this.connectionParameters.host,'localhost');assert.equal(this.connectionParameters.user,role);calls++;};
  pg.Client.prototype.query=async function(sql,args){
    if(sql.includes('pg_roles'))return {rows:[{actor:role,effective:role,database,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false}]};
    assert.equal(sql,'SELECT to_regprocedure($1) IS NOT NULL installed');assert.deepEqual(args,['broker9d.reconcile(jsonb)']);return {rows:[{installed:true}]};
  };
  pg.Client.prototype.end=async()=>{};
  try{await (await recoverySession(uri,role,{environment:{}})).end();assert.equal(calls,1);}finally{Object.assign(pg.Client.prototype,original);}
});
