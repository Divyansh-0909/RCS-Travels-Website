// Disposable hostile-process witness, never a deployed entry point.
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Client } = require('pg');
const input = []; for await (const bytes of process.stdin) input.push(bytes);
const { connectionString, canaryName, hostAddress,mode,requestId,id,token,sourceDatabase } = JSON.parse(Buffer.concat(input).toString('utf8'));
const exporter=false;
const checks = [], denied = [];
const check = (name, value) => { assert.equal(value, true, name); checks.push(name); };
check('non-root',process.getuid()===1000);
const status = await readFile('/proc/self/status','utf8');
check('no-capabilities', /^CapEff:\s+0+$/m.test(status));
check('no-new-privileges', /^NoNewPrivs:\s+1$/m.test(status));
check('seccomp-enabled', /^Seccomp:\s+2$/m.test(status));
check('bounded-pids',(await readFile('/sys/fs/cgroup/pids.max','utf8')).trim()==='64');
check('bounded-memory',(await readFile('/sys/fs/cgroup/memory.max','utf8')).trim()==='536870912');
const cpu=(await readFile('/sys/fs/cgroup/cpu.max','utf8')).trim().split(/\s+/).map(Number);
check('bounded-cpu',cpu[0]/cpu[1]===0.75);
const deniedFile = async path => { try { await access(path);return false; } catch(error) { return error.code==='ENOENT'||error.code==='EACCES'; } };
check('no-docker-socket',await deniedFile('/var/run/docker.sock'));
check('no-host-private-canary',await deniedFile('/app/'+canaryName));
check('no-repository-env',await deniedFile('/app/backend/.env'));
check('no-root-env',await deniedFile('/app/.env'));
check('no-host-user-files',await deniedFile('/mnt/c/Users'));
let writeDenied=false;try { await writeFile('/app/forbidden','must not write'); }catch(error){writeDenied=['EROFS','EACCES'].includes(error.code);}
check('read-only-code',writeDenied);
check('no-privileged-environment',['CLERK_SECRET_KEY','OPENAI_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','RAZORPAY_KEY_SECRET','HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy'].every(name=>!process.env[name]));
check('no-database-owner-environment',!(await readFile('/proc/1/environ','utf8')).includes('POSTGRES_PASSWORD='));
async function refused(host,port){return new Promise(resolve=>{
  const socket=createConnection({host,port}), timer=setTimeout(()=>{socket.destroy();resolve(true);},1500);
  socket.once('connect',()=>{clearTimeout(timer);socket.destroy();resolve(false);});
  socket.once('error',()=>{clearTimeout(timer);resolve(true);});
});}
check('no-external-route',await refused('198.51.100.1',443));
check('no-host-service-route',await refused(hostAddress,49199));
// The shared default ORM cannot supply privileged credentials or authority.
globalThis.prisma=new Proxy({}, {get(){throw new Error('APPLICATION_ORM_DENIED');}});
for(const actor of ['rcs_test_user','shadow9d_worker','shadow9d_ops','shadow9d_capture',...(exporter?['shadow9d_exporter']:[])]){
  const attempted=new URL(connectionString);attempted.username=actor;attempted.password='rcs_test_password';
  const client=new Client({connectionString:attempted.toString(),connectionTimeoutMillis:2000});
  let code;try{await client.connect();}catch(error){code=error.code;}finally{await client.end();}
  assert.equal(code,'28P01',actor+' invalid password must not authenticate over loopback');
  denied.push({label:'authentication:'+actor,sqlstate:code});
}
const db=new Client({connectionString,connectionTimeoutMillis:2000,statement_timeout:2000});await db.connect();
try {
  for(const [label,sql] of [
    ['booking','UPDATE public.bookings SET status=status'],['payment','DELETE FROM public.payments'],
    ['wallet','TRUNCATE public.wallet_entries'],['human-final','DELETE FROM public.responsibility_admin_reviews'],
    ['audit','DELETE FROM audit9d.events'],['ops','SELECT shadow9d.set_stop(false)'],
    ['escalation','SET ROLE shadow9d_owner'],['owner-session','SET SESSION AUTHORIZATION rcs_test_user'],
    ['server-file',"SELECT pg_read_file('/proc/self/environ')"],['server-program',"COPY (SELECT 'synthetic') TO PROGRAM 'true'"],
    ['password-catalog','SELECT rolpassword FROM pg_authid'],['server-file-import',"SELECT lo_import('/proc/self/environ')"],
    ['role-grant','GRANT shadow9d_ops TO shadow9d_worker'],
    ['broker-budgets','UPDATE broker9d.configuration SET minor_limit=100000'],['broker-control','SELECT broker9d.set_stop(false)'],
    ['broker-history','DELETE FROM broker9d.attempts'],['broker-audit','DELETE FROM broker9d.events'],['transport-signing-key','SELECT * FROM transport9d.configuration'],
    ...(exporter?[['source-table','SELECT * FROM public.responsibility_evidence_versions'],['source-function',"SELECT outbox9d.source('synthetic-capsule-work')"],['privacy-key','SELECT * FROM outbox9d.configuration'],['unfenced-receiver',"SELECT shadow9d.enqueue('x','{}','x','x')"],['payload-deletion','SELECT outbox9d.delete_payload(1)']]:[])]) {
    let code;try{await db.query(sql);}catch(error){code=error.code;}
    assert.equal(code,'42501',label);denied.push({label,sqlstate:code});
  }
}finally{await db.end();}

const sourceURL=new URL(connectionString);sourceURL.pathname='/'+sourceDatabase;
const application=new Client({connectionString:sourceURL.toString()});await application.connect();
try{for(const table of ['bookings','payments','wallet_entries','driver_payouts','drivers','responsibility_admin_reviews','driver_cancellations']){
  let code;try{await application.query('DELETE FROM public.'+table+' WHERE false');}catch(error){code=error.code;}assert.equal(code,'42501');denied.push({label:'actual-source:'+table,sqlstate:code});
}}finally{await application.end();}
const {brokerSession}=await import('./broker-session.mjs');
const client=await brokerSession(connectionString,mode==='broker'?'broker9d_exec':'broker9d_guard');
try{
  const {executeBrokerAttempt}=await import('./broker-execution.mjs'),{commitGuardedBrokerResult}=await import('./broker-guard.mjs');
  const outcome=mode==='broker'?await executeBrokerAttempt(client,requestId,'valid'):await commitGuardedBrokerResult(client,id,token);
  console.log(JSON.stringify({checks,denied,outcome,liveCalls:0}));
}finally{await client.end();}
