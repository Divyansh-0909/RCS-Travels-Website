import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { physicalDevice } from '../phase9-native/device.mjs';
import { createFileStore, setUsbAwake } from '../phase9-native/phone-awake-core.mjs';

// Run only after all native children/watchdogs finish. Individual sessions remove
// only their owned reverse mappings; this final check never deletes foreign ones.
const device = await physicalDevice(), pkg = 'com.rcstravels.driver.phase9';
const store = createFileStore('output/phase9-native-device-2026-10-10/phone-awake-state.json');
const record = { package: pkg, observedAt: new Date().toISOString(), status: 'PENDING' };
const mappings = async () => (await device.adb('reverse', '--list')).split(/\r?\n/).filter(Boolean)
  .map(line => line.trim().split(/\s+/).slice(-2));
const permissions = async () => {
  const text = await device.adb('shell', 'dumpsys', 'package', pkg);
  const user = text.match(/User 0:([\s\S]*?)(?=\n\s*User \d+:|$)/)?.[1]; assert.ok(user);
  return Object.fromEntries(['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION'].map(key => {
    const value = user.match(new RegExp('android\\.permission\\.' + key + ': granted=(true|false)'));
    assert.ok(value); return [key, value[1] === 'true'];
  }));
};
try {
  record.awakeBefore = (await device.adb('shell', 'settings', 'get', 'global', 'stay_on_while_plugged_in')).trim();
  record.reverseMappingsBefore = await mappings();
  assert.deepEqual(record.reverseMappingsBefore, [], 'A session has not cleaned its reverse mappings; inspect ownership');
  await device.adb('shell', 'am', 'force-stop', '--user', '0', pkg);
  record.permissionsBefore = await permissions();
  for (const [key, granted] of Object.entries(record.permissionsBefore)) {
    if (granted) await device.adb('shell', 'pm', 'revoke', '--user', '0', pkg, 'android.permission.' + key);
  }
  record.permissionsAfter = await permissions();
  for (const granted of Object.values(record.permissionsAfter)) assert.equal(granted, false);
  const process = await device.adb('shell', 'pidof', pkg).catch(() => '');
  record.testAppStopped = process.trim() === ''; assert.equal(record.testAppStopped, true);
  record.reverseMappingsAfter = await mappings(); assert.deepEqual(record.reverseMappingsAfter, []);
  record.status = 'PASS';
} catch (error) {
  record.status = 'FAILED'; record.error = error.message.replaceAll(device.serial, '[device-serial-redacted]'); process.exitCode = 1;
} finally {
  record.restoration = await setUsbAwake(device, store, 'restore');
  record.awakeAfter = (await device.adb('shell', 'settings', 'get', 'global', 'stay_on_while_plugged_in')).trim();
  assert.equal(record.awakeAfter, '0');
  record.finishedAt = new Date().toISOString();
  await writeFile('output/phase9c-adversarial-2026-10-11/phone-cleanup-final.json', JSON.stringify(record, null, 2));
  console.log(JSON.stringify({ status: record.status, awakeAfter: record.awakeAfter, testAppStopped: record.testAppStopped }));
}
