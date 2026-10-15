import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { physicalDevice } from '../phase9-native/device.mjs';
import { createFileStore, setUsbAwake } from '../phase9-native/phone-awake-core.mjs';

const label = process.argv[2];
assert.match(label, /^[a-z][a-z0-9-]{2,60}$/);
const plans = {
  'permissions-recovery': [['native-permissions-trial-2', 'permissions'], ['native-permissions-repeat-1', 'permissions'],
    ['native-recovery-trial-1', 'recovery'], ['native-recovery-repeat-1', 'recovery']],
  closure: [['native-appeal-repeat-1', 'appeal'], ['native-terminal-repeat-1', 'terminal'],
    ['native-competing-current-1', 'competing'], ['native-competing-repeat-1', 'competing'],
    ['native-replacement-current-1', 'replacement'], ['native-replacement-repeat-1', 'replacement'],
    ['native-permissions-trial-1', 'permissions'], ['native-permissions-repeat-1', 'permissions'],
    ['native-recovery-trial-1', 'recovery'], ['native-recovery-repeat-1', 'recovery']],
};
assert.ok(Object.hasOwn(plans, label));
const output = 'output/phase9c-adversarial-2026-10-11';
const device = await physicalDevice();
const store = createFileStore('output/phase9-native-device-2026-10-10/phone-awake-state.json');
assert.equal((await store.read())?.active, true, 'An existing owner-approved awake lease is required');
await setUsbAwake(device, store, 'enable');
const record = { schema: 'phase9c-native-queue-v1', label, startedAt: new Date().toISOString(), results: [], pulses: 0,
  boundary: 'One physical recipe at a time. Wake events keep the display active; they never bypass a secure lock or change other settings. The shared awake lease is restored only after all native work ends.' };
const file = join(output, label + '-queue.json');
await writeFile(file, JSON.stringify(record, null, 2), { flag: 'wx' });
let pulseError, inFlight = Promise.resolve();
const pulse = async () => {
  assert.equal((await store.read())?.active, true, 'Awake lease was restored externally');
  await setUsbAwake(device, store, 'enable');
  await device.adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  record.pulses++;
};
const timer = setInterval(() => {
  inFlight = inFlight.then(pulse).catch(error => { pulseError = error.message.replaceAll(device.serial, '[device-serial-redacted]'); clearInterval(timer); });
}, 20000);
try {
  await pulse();
  for (const [name, mode] of plans[label]) {
    assert.equal(pulseError, undefined, 'Display watchdog failed: ' + pulseError);
    const exitCode = await new Promise((done, fail) => {
      const child = spawn(process.execPath, ['tools/phase9-cross/run-adversarial-recorded.mjs', name, mode], { windowsHide: true, stdio: 'inherit' });
      child.once('error', fail); child.once('close', done);
    });
    record.results.push({ label: name, mode, exitCode });
    await writeFile(file, JSON.stringify(record, null, 2));
    assert.equal(exitCode, 0, 'Queue stops at the first failed recipe: ' + name);
  }
  record.status = 'PASS';
} catch (error) {
  record.status = 'STOPPED'; record.error = error.message.replaceAll(device.serial, '[device-serial-redacted]'); process.exitCode = 1;
} finally {
  clearInterval(timer); await inFlight; record.finishedAt = new Date().toISOString(); record.pulseError = pulseError;
  await writeFile(file, JSON.stringify(record, null, 2));
}
