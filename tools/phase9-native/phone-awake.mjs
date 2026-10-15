import { fileURLToPath } from 'node:url';
import { physicalDevice } from './device.mjs';
import { setUsbAwake,createFileStore } from './phone-awake-core.mjs';

const stateFile = fileURLToPath(new URL('../../output/phase9-native-device-2026-10-10/phone-awake-state.json',import.meta.url));
const device = await physicalDevice();
console.log(JSON.stringify(await setUsbAwake(device,createFileStore(stateFile),process.argv[2] ?? 'enable')));
