import {validateClosureEnvelope} from './closure-contract.mjs';
import {closureHttp} from './closure-http.mjs';
export function closureIngress(client,{sources,ingressKey,signer},fault=()=>null){
  return closureHttp(ingressKey,async frame=>{
    validateClosureEnvelope(frame,sources);
    // Signal delivery need not preempt this turn. Never cross the selected boundary.
    if(fault()==='before-commit'){process.kill(process.pid,'SIGKILL');return new Promise(()=>{});}
    const body=(await client.query('SELECT custody.ingest($1) receipt',[frame])).rows[0].receipt;
    if(fault()==='after-commit'){process.kill(process.pid,'SIGKILL');return new Promise(()=>{});}
    const receipt=await signer(body);
    return fault()==='lost-ack'?null:receipt;
  });
}
