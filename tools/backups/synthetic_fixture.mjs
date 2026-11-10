// Existing accepted synthetic lineage topology; no runtime .env or provider calls.
import {createInterface} from 'node:readline';
import {writeFile} from 'node:fs/promises';
let fixture;
try {
  await writeFile(process.env.BACKUP_FIXTURE_READY+'.progress','loading-fixture');
  const {custodyLineageFixture}=await import('../../backend/tests/helpers/phase9dCustodyLineageFixture.js');
  await writeFile(process.env.BACKUP_FIXTURE_READY+'.progress','creating-fixture');
  fixture=await custodyLineageFixture();
  await writeFile(process.env.BACKUP_FIXTURE_READY,JSON.stringify({source:fixture.source.name,receiver:fixture.receiver.name}),{flag:'wx'});
  const input=createInterface({input:process.stdin});
  for await(const line of input){if(line==='close')break;}
  input.close();
  process.stdin.destroy();
  await fixture.close();
} catch (error) {
  const frames=String(error.stack??'').split('\n').slice(1).filter(line=>/^\s+at /.test(line)).slice(0,6);
  const migration=String(error.message??'').match(/^Isolated migrations failed \([^)]*\)/)?.[0];
  await writeFile(process.env.BACKUP_FIXTURE_READY,JSON.stringify({code:'SYNTHETIC_FIXTURE_FAILED_DETAILS_WITHHELD',type:error.name,frames,...(migration?{migration}:{})}),{flag:'wx'}).catch(()=>{});
  if(fixture)await fixture.close().catch(()=>{});
  process.exitCode=1;
}
