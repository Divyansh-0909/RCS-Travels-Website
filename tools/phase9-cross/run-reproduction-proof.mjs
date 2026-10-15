import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createWriteStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { physicalDevice } from '../phase9-native/device.mjs';
import { createFileStore, setUsbAwake } from '../phase9-native/phone-awake-core.mjs';
import { validateUiReproduction } from './ui-reproduction.mjs';

// This bounded diagnostic intentionally fails only after the real UI race and
// its financial assertions. The emitted artifact then launches the fixed recipe.
const output = 'output/phase9c-adversarial-2026-10-11';
const label = process.argv[2];
assert.match(label ?? '', /^[a-z][a-z0-9-]{2,50}$/);
const resumeRun = process.argv[3];
if (resumeRun) assert.match(resumeRun, /^race-\d+-[a-f0-9-]+$/);
const reportPath = join(output, label + '-proof.json');
const device = await physicalDevice();
const store = createFileStore('output/phase9-native-device-2026-10-10/phone-awake-state.json');
assert.equal((await store.read())?.active, true);
await setUsbAwake(device, store, 'enable');
const report = { schema: 'phase9c-captured-failure-proof-v1', status: 'RUNNING', startedAt: new Date().toISOString(),
  executions: [], pulses: 0,
  boundary: 'An explicitly intentional diagnostic failure, controlled backend reproduction, fixed physical UI recipe, and independent recipe repeat. No exact OS/UI event replay or product defect is claimed by the diagnostic failure.' };
await writeFile(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
let pulseError, inFlight = Promise.resolve();
const pulse = async () => {
  assert.equal((await store.read())?.active, true);
  await setUsbAwake(device, store, 'enable');
  await device.adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  report.pulses++;
};
const timer = setInterval(() => {
  inFlight = inFlight.then(pulse).catch(error => { pulseError = error.message.replaceAll(device.serial, '[device-serial-redacted]'); clearInterval(timer); });
}, 20000);
async function execute(name, args, expectedExit) {
  assert.equal(pulseError, undefined);
  const log = join(output, label + '-' + name + '.log');
  const stream = createWriteStream(log, { flags: 'wx' });
  const startedAt = new Date().toISOString();
  const child = spawn(process.execPath, args, { windowsHide: true });
  child.stdout.pipe(stream, { end: false }); child.stderr.pipe(stream, { end: false });
  const exitCode = await new Promise((done, fail) => { child.once('error', fail); child.once('close', done); });
  await new Promise(done => stream.end(done));
  const bytes = await readFile(log);
  report.executions.push({ name, args, startedAt, finishedAt: new Date().toISOString(), exitCode,
    expectedExit, log, logSha256: sha256(bytes) });
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  assert.equal(exitCode, expectedExit, name + ' exit');
  return bytes.toString('utf8');
}
try {
  await pulse();
  const dockerDeadline = Date.now() + 180000;
  for (;;) {
    try {
      const docker = await promisify(execFile)('docker', ['info', '--format', '{{.ServerVersion}}'], {
        windowsHide: true, timeout: 10000, env: { ...process.env, DOCKER_HOST: 'npipe:////./pipe/dockerDesktopLinuxEngine' },
      });
      assert.ok(docker.stdout.trim()); break;
    } catch {
      if (Date.now() >= dockerDeadline) throw new Error('Local Docker Desktop did not become ready');
      await new Promise(done => setTimeout(done, 3000));
    }
  }
  const log = resumeRun ? '' : await execute('capture', ['backend/tests/run-phase9-cross.js', '--adversarial-native', '--keep-awake', '--capture-ui-failure'], 1);
  const run = resumeRun ?? log.match(/Adversarial native scenario: (race-\d+-[a-f0-9-]+)/)?.[1];
  assert.ok(run);
  const artifactPath = join(output, run, 'reproduction.json');
  const raw = await readFile(artifactPath), artifact = validateUiReproduction(JSON.parse(raw));
  assert.match(artifact.outcome, /^CONTROLLED_CAPTURE_WITNESS:/);
  assert.deepEqual(artifact.backend?.order, ['capture', 'offer', 'customer_cancel', 'accept']);
  assert.equal(artifact.actions.length, 4);
  assert.ok(artifact.runtime?.stagedSources);
  report.failure = { run, artifact: artifactPath, artifactSha256: sha256(raw), integrity: JSON.parse(raw).integrity };
  if (resumeRun) {
    const priorFile = join(output, 'reproduction-closure-proof.json'), priorBytes = await readFile(priorFile);
    const prior = JSON.parse(priorBytes), capture = prior.executions.find(item => item.name === 'capture');
    assert.equal(capture.exitCode, 1); assert.ok(capture.args.includes('--capture-ui-failure'));
    const captureBytes = await readFile(capture.log);
    assert.equal(sha256(captureBytes), capture.logSha256);
    assert.equal(captureBytes.toString('utf8').match(/Adversarial native scenario: (race-\d+-[a-f0-9-]+)/)?.[1], resumeRun);
    report.priorAutomaticCapture = { proof: priorFile, sha256: sha256(priorBytes), execution: capture };
  }
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  const launcherLog = await execute('launcher', ['tools/phase9-cross/reproduce-ui-failure.mjs', artifactPath], 0);
  report.fixedUiRun = launcherLog.match(/Adversarial native\/browser race PASS: (race-\d+-[a-f0-9-]+)/)?.[1];
  assert.ok(report.fixedUiRun);
  const repeatLog = await execute('repeat', ['backend/tests/run-phase9-cross.js', '--adversarial-native', '--keep-awake'], 0);
  report.repeatUiRun = repeatLog.match(/Adversarial native\/browser race PASS: (race-\d+-[a-f0-9-]+)/)?.[1];
  assert.ok(report.repeatUiRun);
  await execute('comparison', ['tools/phase9-adversarial/compare.mjs', 'native-race-current', report.fixedUiRun, report.repeatUiRun], 0);
  report.status = 'PASS';
} catch (error) {
  report.status = 'STOPPED'; report.error = error.message.replaceAll(device.serial, '[device-serial-redacted]'); process.exitCode = 1;
} finally {
  clearInterval(timer); await inFlight;
  report.pulseError = pulseError; report.finishedAt = new Date().toISOString();
  report.runnerSha256 = sha256(await readFile(new URL(import.meta.url)));
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ label, status: report.status, report: reportPath }));
}
