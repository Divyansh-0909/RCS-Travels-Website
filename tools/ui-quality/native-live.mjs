import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { physicalDevice } from '../phase9-native/device.mjs';
import { atomicJson } from '../handoff/core.mjs';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile), runtime = new URL('../../output/handoff/', import.meta.url);
const output = new URL('native-screen.png', runtime), metadata = fileURLToPath(new URL('native-screen.json', runtime));
const frames = new URL('native-frames/', runtime); await fs.mkdir(frames, { recursive: true });
const pkg = 'com.rcstravels.driver.phase9';
const record = value => atomicJson(metadata, { at: new Date().toISOString(), source: 'DEVICE', package: pkg, connected: false, foreground: false, ...value });
const foreground = async device => /(?:mResumedActivity|topResumedActivity).*com\.rcstravels\.driver\.phase9\//.test(await device.adb('shell','dumpsys','activity','activities'));
while (true) {
  try {
    const device = await physicalDevice();
    if (!await foreground(device)) record({ connected: true, foreground: false });
    else {
      const { stdout } = await execute('C:/Android/platform-tools/adb.exe', ['-s',device.serial,'exec-out','screencap','-p'],
        { encoding: 'buffer', windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024 });
      if (await foreground(device)) {
        if (stdout.length < 24 || stdout.toString('hex',0,8) !== '89504e470d0a1a0a') throw Error('No PNG frame');
        const temporary = new URL('native-screen-next.png', runtime); await fs.writeFile(temporary,stdout); await fs.rename(temporary,output);
        record({ connected: true, foreground: true, width: stdout.readUInt32BE(16), height: stdout.readUInt32BE(20) });
        await fs.writeFile(new URL(new Date().toISOString().replace(/[:.]/g,'-')+'.png',frames),stdout);
        const saved=(await fs.readdir(frames)).filter(name=>/^\d{4}-[\dTZ-]+\.png$/.test(name)).sort();
        for(const name of saved.slice(0,-30)) await fs.unlink(new URL(name,frames));
      } else record({ connected: true, foreground: false });
    }
  } catch { record({ connected: false, foreground: false }); }
  await new Promise(resolve=>setTimeout(resolve,3000));
}
