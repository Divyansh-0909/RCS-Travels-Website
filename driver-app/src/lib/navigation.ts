import { Linking } from 'react-native';
import { buildDriverNavigationUrl, type NavigationPoint } from './navigationUrl';

export { buildDriverNavigationUrl } from './navigationUrl';

/** Open turn-by-turn directions in the installed maps app. */
export async function openDriverNavigation(destination: NavigationPoint, waypoint?: NavigationPoint | null) {
  const url = buildDriverNavigationUrl(destination, waypoint);
  await Linking.openURL(url);
  return true;
}
