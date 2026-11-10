import test from 'node:test';
import assert from 'node:assert/strict';
import { captureNativeHierarchy } from './helpers/phase9NativeHierarchy.mjs';

function fixture({ foregroundChanges = false, xml = '<hierarchy><node text="Contact the rider"/></hierarchy>' } = {}) {
  const calls = []; let foreground = 0;
  return { calls, adb: async (...args) => {
    calls.push(args);
    if (args[1] === 'dumpsys') return foregroundChanges && foreground++ ? 'Other foreground app' : 'mResumedActivity: com.rcstravels.driver.phase9/.MainActivity';
    if (args[1] === 'uiautomator') return 'UI hierchary dumped to: ' + args.at(-1);
    if (args[1] === 'cat') return xml;
    return '';
  } };
}
test('native hierarchy is read back from a uniquely owned file and cleaned up', async () => {
  const device = fixture();
  assert.match(await captureNativeHierarchy(device), /Contact the rider/);
  const remote = device.calls.find(c => c[1] === 'uiautomator').at(-1);
  assert.match(remote, /^\/data\/local\/tmp\/rcs-phase9-hierarchy-[a-f0-9-]{36}\.xml$/);
  assert.deepEqual(device.calls.at(-1), ['shell', 'rm', '-f', remote]);
});
test('a foreground change discards the hierarchy and still cleans up its temporary file', async () => {
  const device = fixture({ foregroundChanges: true });
  await assert.rejects(captureNativeHierarchy(device), /Foreground changed/);
  assert.equal(device.calls.at(-1)[1], 'rm');
});
test('missing XML fails capture and still cleans up instead of publishing a status message as evidence', async () => {
  const device = fixture({ xml: 'UI hierchary dumped to: /dev/tty' });
  await assert.rejects(captureNativeHierarchy(device), /did not return/);
  assert.equal(device.calls.at(-1)[1], 'rm');
});
