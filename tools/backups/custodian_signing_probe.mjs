// Synthetic probe only. Private signing material remains inside this short-lived child.
import {generateKeyPairSync} from 'node:crypto';
import {createInterface} from 'node:readline';
import {commitment,keyIdentity,signReceipt,sourceMac} from '../phase9d/custody-protocol.mjs';
import {historicalVerification,verificationRegistry} from '../phase9d/closure-keys.mjs';

const keys=generateKeyPairSync('ed25519');
const keyId=keyIdentity(keys.publicKey);
const publicKey=keys.publicKey.export({type:'spki',format:'pem'});
const input=createInterface({input:process.stdin});
for await (const line of input){
  try{
    const request=JSON.parse(line);let result;
    if(request.command==='public')result={keyId,publicKey};
    else if(request.command==='frame')result={frame:{event:request.event,mac:sourceMac(request.event,request.secret)},hash:commitment(request.event)};
    else if(request.command==='sign')result=signReceipt(request.body,keys.privateKey);
    else if(request.command==='verify')result=historicalVerification(request.receipt,request.event,verificationRegistry([{keyId,publicKey,status:request.status??'ACTIVE'}]));
    else throw Error('UNKNOWN_PROBE_COMMAND');
    process.stdout.write(JSON.stringify({ok:true,result})+'\n');
  }catch{
    process.stdout.write(JSON.stringify({ok:false,error:'SYNTHETIC_SIGNING_PROBE_REFUSED'})+'\n');
  }
}
