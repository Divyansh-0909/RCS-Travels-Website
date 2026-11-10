import fs from 'node:fs';

const transient = new Set(['EPERM', 'EACCES', 'EBUSY']);
const pause = delay => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);

// Windows can briefly deny replacing a file while another process has it open.
// Keep the previous checkpoint intact: never unlink or truncate it as a fallback.
export function replaceCheckpoint(temporary, destination, operations = {}) {
  const rename = operations.rename || fs.renameSync;
  const wait = operations.wait || pause;
  for (let attempt = 0; ; attempt++) {
    try { rename(temporary, destination); return; }
    catch (error) {
      if (!transient.has(error.code) || attempt >= 8) throw error;
      wait(Math.min(20 * 2 ** attempt, 200));
    }
  }
}
