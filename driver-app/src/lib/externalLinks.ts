import { Alert, Linking } from 'react-native';
import { driverCopy as dc } from './copy';

/**
 * Launch a native/external URL without letting a rejected Linking promise escape
 * an event handler. Missing diallers, mail apps, browsers, or OEM intent failures
 * should leave the captain in the app with an explanation instead of surfacing as
 * an unhandled rejection.
 */
export function openExternalUrl(
  url: string,
  failureMessage = dc("Please try again."),
) {
  void Linking.openURL(url).catch(() => {
    Alert.alert(dc("Could not open link"), failureMessage);
  });
}

export function callPhoneNumber(phone: string) {
  openExternalUrl(
    `tel:${phone}`,
    dc("Could not open the phone app. Please try again."),
  );
}
