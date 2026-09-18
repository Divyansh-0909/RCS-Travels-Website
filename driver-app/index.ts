import { registerRootComponent } from 'expo';

import Main from './src/main';
import VerifyWheel from './src/verifyWheel';

// registerRootComponent calls AppRegistry.registerComponent('main', () => Main);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(process.env.EXPO_PUBLIC_WHEEL_VERIFY === '1' ? VerifyWheel : Main);
