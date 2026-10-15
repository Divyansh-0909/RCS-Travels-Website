import config from './stryker.config.mjs';
export default {
  ...config,
  mutate:['tools/phase9-native/device.mjs'],
  concurrency:1,
  jsonReporter:{ fileName:'output/phase9-native-device-2026-10-10/mutation-device-current.json' },
};
