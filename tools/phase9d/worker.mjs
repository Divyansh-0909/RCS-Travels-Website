import { executeIsolatedShadowWorker } from './worker-core.mjs';
import { takeCoverage } from 'node:v8';

process.once('message', async message => {
  try {
    const result = await executeIsolatedShadowWorker(message);
    if (message.mode !== 'claim_then_crash') {
      process.send(result); process.disconnect();
    } else {
      // Preserve native V8 observations before deliberate parent termination.
      takeCoverage(); process.send(result);
    }
  } catch {
    process.send({ status: 'FAILED_CLOSED' });
    process.exitCode = 1;
    process.disconnect();
  }
});
