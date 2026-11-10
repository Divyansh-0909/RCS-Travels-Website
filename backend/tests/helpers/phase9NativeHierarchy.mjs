import { randomUUID } from 'node:crypto';

export async function captureNativeHierarchy(device) {
  const ownForeground = async () => /(?:mResumedActivity|topResumedActivity).*com\.rcstravels\.driver\.phase9\//.test(
    await device.adb('shell', 'dumpsys', 'activity', 'activities'));
  if (!await ownForeground()) throw Error('Only the foreground isolated test app may be captured');
  const remote = '/data/local/tmp/rcs-phase9-hierarchy-' + randomUUID() + '.xml';
  try {
    // /dev/tty does not return XML through this non-interactive ADB transport.
    // Read back a uniquely owned temporary file and always remove that file.
    await device.adb('shell', 'uiautomator', 'dump', remote);
    const xml = await device.adb('shell', 'cat', remote);
    if (!await ownForeground()) throw Error('Foreground changed during native hierarchy capture; output discarded');
    if (!xml.includes('<hierarchy')) throw Error('Android did not return a native hierarchy XML document');
    return xml;
  } finally { await device.adb('shell', 'rm', '-f', remote); }
}
