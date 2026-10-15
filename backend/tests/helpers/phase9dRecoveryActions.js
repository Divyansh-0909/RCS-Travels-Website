import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {resolve} from 'node:path';
export async function recoveryAction(fixture,role,routine,args){
  const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec','DATABASE_URL','DIRECT_URL','DOTENV_CONFIG_PATH','NODE_V8_COVERAGE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  const fence=new URL(fixture.uri(fixture.receiver.name,role));fence.pathname='/rcs_container_test';
  Object.assign(env,{NODE_ENV:'test',PHASE9_ISOLATED:'1',TEST_DATABASE_URL:fence.toString()});
  const child=fork(resolve('tests/helpers/phase9dRecoveryActionChild.js'),[],{env,windowsHide:true,execArgv:['--import','./tests/helpers/phase9Isolation.js','--import','tsx'],stdio:['ignore','ignore','ignore','ipc']});
  const exited=new Promise(done=>child.once('exit',(code,signal)=>done({code,signal})));
  let ready,finish;const connected=new Promise(done=>{ready=done;}),finished=new Promise(done=>{finish=done;});
  const timer=setTimeout(()=>child.kill(),30000);
  child.on('message',message=>{if(message.status==='CONNECTED')ready(message);else finish(message);});
  child.once('exit',()=>{clearTimeout(timer);ready({status:'EXITED'});finish({status:'EXITED'});});
  child.send({connectionString:fixture.uri(fixture.receiver.name,role),routine,args});
  const identity=await connected;assert.equal(identity.status,'CONNECTED');
  return {pid:identity.pid,child,finished,exited,start(){child.send('GO');},async stop(){if(child.exitCode===null&&child.signalCode===null)child.kill();await exited;}};
}
