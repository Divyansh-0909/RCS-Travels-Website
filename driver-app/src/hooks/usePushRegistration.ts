import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useNavigate } from 'react-router-native';
import { useApi } from './useApi';

// Only consulted while the app is FOREGROUNDED — a backgrounded phone shows the
// notification the ordinary way, which is the whole point of sending one.
//
// So the offer case is a duplicate and nothing else: OfferPanel is already
// drawing that ride as a card over the app, and a banner sliding down on top of
// it announces the same ride twice, in two different shapes, with two different
// ways to act on it. The sound stays — the card is easy to miss on a screen he
// was already reading.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isOffer = notification.request.content.data?.screen === 'notifications';

    return {
      shouldShowBanner: !isOffer,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});

async function ensureChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('default', {
    name: 'Rides and documents',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#243AFB',
  });
}

/**
 * Ask for permission, register this device, and route notification taps.
 *
 * Mounted once, high in the tree. Everything it does is best-effort: a captain
 * who refuses notifications must still be able to use the whole app, he just
 * finds out about an approval by opening it.
 */
export function usePushRegistration(enabled: boolean) {
  const api = useApi();
  const navigate = useNavigate();
  const registered = useRef(false);

  useEffect(() => {
    if (!enabled || registered.current) return;

    let cancelled = false;

    (async () => {
      try {
        await ensureChannel();

        const existing = await Notifications.getPermissionsAsync();
        const granted = existing.granted
          ? existing
          : await Notifications.requestPermissionsAsync();

        // Declined. Not an error and not worth a dialog — he can turn it on in
        // system settings, and nothing in the app depends on it.
        if (!granted.granted) return;

        const token = await Notifications.getDevicePushTokenAsync();
        if (cancelled || !token?.data) return;

        await api.saveFcmToken(String(token.data));
        registered.current = true;
      } catch {
        // A simulator with no Play Services, a build without google-services.json,
        // a network blip. None of them should surface to a captain who is trying
        // to photograph his licence.
      }
    })();

    return () => { cancelled = true; };
  }, [api, enabled]);

  // Where a tap lands. The backend puts a `screen` on every notification that
  // has somewhere useful to go, so this stays a lookup rather than a growing
  // switch over message kinds — a new notification type needs no change here.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen;
      if (screen === 'documents') navigate('/account/documents');
      else if (screen === 'home') navigate('/');
    });
    return () => sub.remove();
  }, [navigate]);
}
