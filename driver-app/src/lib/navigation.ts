import { Alert, AppState, Linking, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type ReturnOverlayModule = {
  canDrawOverlays(): boolean;
  requestPermission(): Promise<void>;
  show(): Promise<boolean>;
  hide(): Promise<void>;
};

const overlay = Platform.OS === 'android'
  ? requireOptionalNativeModule<ReturnOverlayModule>('ReturnOverlay')
  : null;

// A captain can return with Android's Back/Recents controls instead of tapping
// the bubble. Remove it in that case so it never floats over our own screens.
AppState.addEventListener('change', (state) => {
  if (state === 'active') overlay?.hide().catch(() => {});
});

/** Open turn-by-turn directions and leave an Android button over Google Maps. */
export async function openDriverNavigation(address: string) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;

  // Expo Go cannot load this app's local native module. Navigation still works
  // there; the return control is present in development and production builds.
  if (!overlay) {
    await Linking.openURL(url);
    return true;
  }

  if (!overlay.canDrawOverlays()) {
    Alert.alert(
      'Allow the return button',
      'Enable “Display over other apps” for RCS Captains. Then come back and tap Navigate again.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => overlay.requestPermission() },
      ],
    );
    return false;
  }

  await overlay.show();
  try {
    await Linking.openURL(url);
    return true;
  } catch (error) {
    // Do not strand a floating button on screen when Maps could not launch.
    await overlay.hide().catch(() => {});
    throw error;
  }
}
