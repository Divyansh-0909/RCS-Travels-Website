import {openTransportDatabase} from './transport-database.mjs';
import {createTransportService} from './transport-service.mjs';
import {pumpRemoteExport} from './transport-pump.mjs';
import {takeCoverage} from 'node:v8';
process.once('message',async configuration=>{
  let client;
  try{
    if(!['receiver','sender'].includes(configuration.mode))throw Error('MODE');
    client=await openTransportDatabase(configuration.connectionString,configuration.mode==='receiver'?'shadow9d_capture':'shadow9d_exporter');
    const routine=configuration.mode==='receiver'?'transport9d.receive(jsonb)':'outbox9d.remote_ack(bigint,uuid,jsonb)';
    if((await client.query('SELECT to_regprocedure($1) IS NOT NULL installed',[routine])).rows[0].installed!==true)throw Error('ADAPTER_NOT_INSTALLED');
    if(configuration.mode==='sender'){
      const result=await pumpRemoteExport(client,configuration.endpoint,configuration.requestKey,configuration.privacyKey,
        configuration.crashAfterStage?{afterStage:()=>{process.send({status:'STAGED'});return new Promise(()=>{});}}:{});
      await client.end();takeCoverage();process.send(result);process.disconnect();return;
    }
    let pendingFault=configuration.fault;
    const service=createTransportService({receive:async payload=>(await client.query('SELECT transport9d.receive($1) value',[JSON.stringify(payload)])).rows[0].value},configuration.requestKey,
      {fault:()=>{const mode=pendingFault;pendingFault=null;return mode;}});
    service.listen(0,'127.0.0.1',()=>process.send({status:'LISTENING',port:service.address().port}));
    process.on('message',async message=>{if(message.action==='close'){service.close(async()=>{await client.end();takeCoverage();process.disconnect();});}});
  }catch{await client?.end();takeCoverage();process.send({status:'FAILED_CLOSED'});process.disconnect();}
});
process.send({status:'READY'});
