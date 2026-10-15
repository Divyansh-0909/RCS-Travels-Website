import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { TEST_PACKAGE } from './stage.mjs';

const execute = promisify(execFile);
const ADB = 'C:/Android/platform-tools/adb.exe';
export function selectPhysicalDevice(output) {
  const devices = output.split(/\r?\n/).filter(line => /^\S+\s+device\s/.test(line) && !line.startsWith('emulator-'));
  if (devices.length !== 1) throw new Error('Exactly one authorized physical USB device is required');
  const serial = devices[0].split(/\s+/)[0];
  if (!/^[a-zA-Z0-9_-]+$/.test(serial)) throw new Error('Wireless or invalid device identity rejected');
  return serial;
}
export async function physicalDevice(run = execute) {
  const { stdout } = await run(ADB, ['devices','-l'], { windowsHide: true });
  const serial = selectPhysicalDevice(stdout);
  const usb = await run(ADB, ['-d','get-serialno'], { windowsHide: true });
  assert.equal(usb.stdout.trim(),serial,'Selected device must be the authorized USB transport');
  const adb = async (...args) => {
    try { return (await run(ADB, ['-s',serial,...args], { windowsHide: true, timeout: 120000, maxBuffer: 2 * 1024 * 1024 })).stdout; }
    catch { throw new Error('Selected USB device operation failed; device identity is redacted'); }
  };
  return { serial, adb };
}
export function verifyTestApk(badging) {
  assert.match(badging, /^package: name='com\.rcstravels\.driver\.phase9'/m);
  assert.match(badging, /^application-debuggable/m);
}
export async function installTestApk(device, apk, run = execute, expectedHash = null, previousHash = null) {
  const { stdout } = await run('C:/Android/build-tools/36.0.0/aapt.exe', ['dump','badging',apk], { windowsHide: true });
  verifyTestApk(stdout);
  const present = await device.adb('shell','pm','list','packages','--user','0',TEST_PACKAGE);
  if (present.trim()) {
    if (!expectedHash) throw new Error('Test package already installed: inspect ownership before replacing it');
    const installed = (await device.adb('shell','pm','path','--user','0',TEST_PACKAGE)).trim();
    const match = installed.match(/^package:(\/data\/app\/(?:~~[A-Za-z0-9_=+-]+\/)?com\.rcstravels\.driver\.phase9-[A-Za-z0-9_=+-]+\/base\.apk)$/);
    if (!match) throw new Error('Installed test APK path is not a single owned base APK');
    const checksum = await device.adb('shell','sha256sum',match[1]);
    if (previousHash && checksum.trim() !== `${expectedHash}  ${match[1]}`) {
      assert.match(previousHash,/^[a-f0-9]{64}$/);
      assert.match(expectedHash,/^[a-f0-9]{64}$/);
      assert.equal(checksum.trim(),`${previousHash}  ${match[1]}`,'Installed test APK differs from the verified predecessor');
      // Android enforces matching signatures. Only the exact owned predecessor
      // can be upgraded; -r preserves its data and no other package is touched.
      await device.adb('install','-r','--user','0',apk);
      await installTestApk(device,apk,run,expectedHash);
      return { package:TEST_PACKAGE,primaryAndroidUser:0,overwrittenPackage:true,upgradedVerifiedBuild:true,previousHash };
    }
    assert.equal(checksum.trim(),`${expectedHash}  ${match[1]}`,'Installed test APK differs; no replacement authorized');
    return { package: TEST_PACKAGE, primaryAndroidUser: 0, overwrittenPackage: false, reusedVerifiedBuild: true };
  }
  await device.adb('install','--user','0',apk);
  return { package: TEST_PACKAGE, primaryAndroidUser: 0, overwrittenPackage: false };
}
