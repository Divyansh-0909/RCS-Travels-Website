// Actual child/signal probe with an explicitly synthetic in-memory DB adapter.
import assert from 'node:assert/strict';
import {closureIngress} from '../../../tools/phase9d/closure-ingress.mjs';
const mode=process.argv[2];assert.ok(['before-commit','after-commit','normal'].includes(mode));
const source='00000000-0000-4000-8000-000000000001',key='synthetic-crash-fixture-key-at-least-thirty-two';
const client={async query(){process.send({status:'DATABASE_ADAPTER_CALLED'});return {rows:[{receipt:{synthetic:true}}]};}};
const options={sources:new Map([[source,{id:source,service:'broker-receiver-v1'}]]),ingressKey:key,signer:async()=>({synthetic:true})};
const server=mode==='normal'?closureIngress(client,options):closureIngress(client,options,()=>mode);
server.listen(0,'127.0.0.1',()=>process.send({status:'READY',port:server.address().port,key,source,mutationSelector:process.env.__STRYKER_ACTIVE_MUTANT__??null}));
process.on('message',message=>{if(message==='close'){server.closeAllConnections();server.close(()=>process.disconnect());}});
