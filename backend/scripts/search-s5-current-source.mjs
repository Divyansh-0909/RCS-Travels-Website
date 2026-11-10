import { baseline, preservation, json, PACKAGE } from '../benchmarks/search/s5Continuation/artifacts.js';

if (process.argv[2] === '--baseline') console.log(JSON.stringify({ protectedFiles: await baseline() }));
else if (process.argv[2] === '--preservation') console.log(JSON.stringify(await preservation()));
else if (process.argv[2] === '--verify') {
  const { verifyRegistration } = await import('../benchmarks/search/s5Continuation/registration.js');
  console.log(JSON.stringify(await verifyRegistration(await json(PACKAGE + 'registration.json'))));
} else if (process.argv[2] === '--register') {
  const { register } = await import('../benchmarks/search/s5Continuation/registration.js');
  console.log(JSON.stringify(await register()));
} else throw new Error('OFFLINE_ONLY: --baseline, --register, --verify or --preservation; no live command exists');
