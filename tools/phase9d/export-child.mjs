import {executeShadowExport} from './export-core.mjs';
import {takeCoverage} from 'node:v8';
process.once('message',async message=>{
  try{
    const result=await executeShadowExport(message);
    takeCoverage();process.send(result);
    if(!['CLAIMED','STAGED'].includes(result.status))process.disconnect();
  }catch{
    process.send({status:'FAILED_CLOSED'});process.exitCode=1;process.disconnect();
  }
});
process.send({status:'READY'});
