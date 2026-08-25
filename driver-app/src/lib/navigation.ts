import { AppState, Linking, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { showPermissionPrompt } from '../components/ui/PermissionPrompt';
import { buildDriverNavigationUrl, type NavigationPoint } from './navigationUrl';

export { buildDriverNavigationUrl } from './navigationUrl';

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
export async function openDriverNavigation(destination: NavigationPoint, waypoint?: NavigationPoint | null) {
  const url = buildDriverNavigationUrl(destination, waypoint);

  // Expo Go cannot load this app's local native module. Navigation still works
  // there; the return control is present in development and production builds.
  if (!overlay) {
    await Linking.openURL(url);
    return true;
  }

  if (!overlay.canDrawOverlays()) {
    const accepted = await showPermissionPrompt({
      kind: 'overlay',
      title: 'Keep the return button handy',
      message:
        'Allow “Display over other apps” so a small RCS button can bring you back from Google Maps during a ride.',
      actionLabel: 'Open display settings',
    });

    if (accepted) await overlay.requestPermission();
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
