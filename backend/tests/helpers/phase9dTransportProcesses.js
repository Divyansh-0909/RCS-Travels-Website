import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {resolve} from 'node:path';
export async function transportProcess(configuration){
  const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec','DATABASE_URL','DIRECT_URL','DOTENV_CONFIG_PATH','NODE_V8_COVERAGE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  const fence=new URL(configuration.connectionString);fence.pathname='/rcs_container_test';
  Object.assign(env,{NODE_ENV:'test',PHASE9_ISOLATED:'1',TEST_DATABASE_URL:fence.toString()});
  const child=fork(resolve('../tools/phase9d/transport-child.mjs'),[],{cwd:resolve('.'),env,windowsHide:true,execArgv:['--import','./tests/helpers/phase9Isolation.js','--import','tsx'],stdio:['ignore','ignore','pipe','ipc']});
  // Retain bounded startup diagnostics for the recurring capsule child failure.
  // Never expose credentials that a dependency might include in an error URL.
  let diagnostic='';child.stderr.on('data',bytes=>{diagnostic=(diagnostic+bytes.toString()).replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g,'[database-url-redacted]').slice(-2048);});
  const exited=new Promise(done=>child.once('exit',(code,signal)=>done({code,signal})));
  const result=await new Promise((done,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(Error('TRANSPORT_CHILD_DEADLINE'));},15000);
    child.on('message',value=>{if(value.status==='READY'){child.send(configuration);return;}clearTimeout(timer);done(value);});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',(code,signal)=>{clearTimeout(timer);reject(Error('TRANSPORT_CHILD_EXITED:'+code+':'+signal+':'+diagnostic));});
  });
  if(configuration.mode==='receiver')assert.equal(result.status,'LISTENING');
  return {child,result,exited,async close(){if(child.exitCode==null&&child.signalCode==null){if(configuration.mode==='receiver')child.send({action:'close'});else child.kill();}await exited;},
    async kill(){child.kill();await exited;}};
}
