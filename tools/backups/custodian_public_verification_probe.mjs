// This child accepts public material only. It generates and loads no private key.
import {historicalVerification,verificationRegistry} from '../phase9d/closure-keys.mjs';

try{
  let input='';
  for await(const part of process.stdin)input+=part;
  if(Buffer.byteLength(input)>32768)throw Error('PUBLIC_PROBE_BOUND');
  const request=JSON.parse(input);
  const result=historicalVerification(request.receipt,request.event,verificationRegistry(request.registry));
  process.stdout.write(JSON.stringify(result)+'\n');
}catch{
  process.stderr.write('PUBLIC_VERIFICATION_REFUSED\n');
  process.exitCode=1;
}
