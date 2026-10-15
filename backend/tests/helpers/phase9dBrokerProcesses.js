import {fork} from 'node:child_process';
import {resolve} from 'node:path';
export async function brokerProcess(configuration){
  const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA','ComSpec','DATABASE_URL','DIRECT_URL','DOTENV_CONFIG_PATH','NODE_V8_COVERAGE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  const fence=new URL(configuration.connectionString);fence.pathname='/rcs_container_test';
  Object.assign(env,{NODE_ENV:'test',PHASE9_ISOLATED:'1',TEST_DATABASE_URL:fence.toString()});
  const child=fork(resolve('../tools/phase9d/broker-child.mjs'),[],{cwd:resolve('.'),env,windowsHide:true,execArgv:['--import','./tests/helpers/phase9Isolation.js','--import','tsx'],stdio:['ignore','ignore','ignore','ipc']});
  const exited=new Promise(done=>child.once('exit',(code,signal)=>done({code,signal})));
  const result=await new Promise((done,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(Error('BROKER_CHILD_DEADLINE'));},60000);
    child.on('message',value=>{if(value.status==='READY'){child.send({protocol:'broker-execution-v1',...configuration});return;}clearTimeout(timer);done(value);});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',()=>{clearTimeout(timer);reject(Error('BROKER_CHILD_EXITED'));});
  });
  return {child,result,exited,async kill(){if(child.exitCode==null&&child.signalCode==null)child.kill();await exited;}};
}
