// Unit-only process fixture: no database, model, credentials or application writes.
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {custodyService} from '../../../tools/phase9d/custody-service.mjs';
import {FROZEN,sourceMac,commitment,keyIdentity} from '../../../tools/phase9d/custody-protocol.mjs';
process.once('message',async({fault})=>{
  const e={schema:'custody-event-v1',source:randomUUID(),service:'broker-receiver-v1',database:'d'.repeat(64),sequence:'1',previous:'0'.repeat(64),localId:'1',sourceHash:'a'.repeat(64),action:'REGISTER',actor:'broker9d_exec',request:null,attempt:null,evidenceHash:null,evidenceVersion:null,receipt:null,configuration:null,generation:null,frozen:FROZEN,observed:'2026-10-14T00:00:00.000Z'},keys=generateKeyPairSync('ed25519');
  const sourceKey='synthetic-source',ingressKey='synthetic-ingress-key-at-least-32-bytes';
  const client={async query(){process.send({stage:'QUERY'});return {rows:[{receipt:{schema:'custody-receipt-v1',custodian:'isolated-custody-v1',source:e.source,sequence:'1',hash:commitment(e),custodySequence:'1',receipt:randomUUID(),keyId:keyIdentity(keys.publicKey),outcome:'COMMITTED'}}]};}};
  const server=custodyService(client,{source:e.source,sourceKey,ingressKey,...keys},()=>fault);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  process.send({stage:'READY',port:server.address().port,ingressKey,frame:{event:e,mac:sourceMac(e,sourceKey)}});
});
