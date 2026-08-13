import { useEffect } from 'react';
import * as Location from 'expo-location';
import { LOCATION_TASK } from '../lib/locationTask';

/**
 * Starts and stops the location service; it does not do the reporting.
 *
 * The fixes themselves are posted from lib/locationTask.ts, which the OS runs
 * whether or not this app is on screen. This hook only decides WHEN that service
 * should exist and how hard it should work — which is a question about the
 * captain's state, and so belongs where his profile is.
 *
 * WHY HTTP AND NOT A SOCKET, since the foreground service does keep a process
 * alive that could hold one. Location is last-write-wins: there is nothing to
 * replay, so a socket's delivery guarantees buy nothing, and every dropped fix
 * is one we would rather skip than resend. A stateless POST also survives the
 * process being killed and restarted headless without any reconnect handshake,
 * which on a captain's 4G is the common case rather than the exception.
 */

/**
 * Two cadences, and the OS enforces both. On a live ride a rider is watching the
 * marker, so fixes are frequent and precise. Idle, the only reader is the
 * dispatch radius search, which wants to know his neighbourhood and nothing
 * finer — and he may sit idle for eight hours, so this setting is the one that
 * decides whether the app survives a shift on a charge.
 *
 * `distanceInterval: 0` ON PURPOSE, in both. It would be tempting to let the OS
 * suppress wake-ups until he moves, but the task's heartbeat is what tells
 * dispatch a parked captain is still there, and a heartbeat can only fire on a
 * wake-up that happens. The filtering is done in the task instead, where
 * skipping a send is free and skipping a wake-up is not recoverable.
 *
 * `timeInterval` is Android-only, which costs nothing here: this app ships on
 * Android alone, which is also what makes the foreground service below a
 * complete answer rather than half of one.
 */
const MODES = {
  ride: {
    accuracy: Location.Accuracy.High,
    timeInterval: 4_000,
    distanceInterval: 0,
  },
  idle: {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 20_000,
    distanceInterval: 0,
  },
} as const;

/**
 * The notification that makes all of this legal.
 *
 * Android will not let an app read location from the background indefinitely;
 * it will let a FOREGROUND SERVICE do it, and the price of one is a persistent
 * notification the captain cannot dismiss. So this text is not chrome — it is
 * the thing being exchanged for the permission, and it should say plainly what
 * is being collected and why, because it is the only disclosure he sees while
 * driving.
 */
const FOREGROUND_SERVICE = {
  notificationTitle: 'Online with RCS Captains',
  notificationBody: 'Sharing your location so nearby rides reach you.',
  notificationColor: '#243AFB',
  // FALSE, so swiping the app away does not quietly take him off the map. He is
  // still online — the server still thinks so, and riders are still being
  // offered his car — and the notification stays up saying exactly that. Going
  // offline is what ends a shift, and it is one tap away in the app the
  // notification opens.
  killServiceOnDestroy: false,
} as const;

/**
 * Both halves of the permission, in the order Android insists on: foreground
 * first, background only after it is granted. Returns what to do about it, so
 * the caller can say something useful rather than fail silently.
 *
 * This is asked from the go-online tap rather than from an effect, because the
 * answer decides whether going online is allowed at all. A captain online
 * without it has no row in driver_locations, is invisible to the radius search,
 * and sits through a shift wondering why the rides stopped.
 *
 * BACKGROUND IS A SECOND, SEPARATE PROMPT on Android 11+, and it does not offer
 * "Allow all the time" inline — it sends him to Settings. That is why a denial
 * here is reported as its own case: telling him to enable location when what he
 * has to do is change it from "While using the app" to "Allow all the time"
 * would send him round in a circle.
 */
export type LocationPermission = 'granted' | 'deniedForeground' | 'deniedBackground';

export async function ensureLocationPermission(): Promise<LocationPermission> {
  const foreground = await Location.getForegroundPermissionsAsync();
  const haveForeground = foreground.granted
    || (foreground.canAskAgain && (await Location.requestForegroundPermissionsAsync()).granted);
  if (!haveForeground) return 'deniedForeground';

  const background = await Location.getBackgroundPermissionsAsync();
  const haveBackground = background.granted
    || (background.canAskAgain && (await Location.requestBackgroundPermissionsAsync()).granted);
  if (!haveBackground) return 'deniedBackground';

  return 'granted';
}

/**
 * @param enabled he is online — the only state the server accepts a fix in
 *        (POST /driver/location 403s otherwise).
 * @param onRide  he holds a ride somebody is watching, which picks the cadence.
 */
export function useDriverLocation(enabled: boolean, onRide: boolean) {
  const mode = onRide ? MODES.ride : MODES.idle;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
      if (cancelled) return;

      if (!enabled) {
        // Also the repair path for a service that outlived its shift: the app
        // may open to a captain the server says is offline while a task from a
        // killed session is still registered and still holding a notification.
        if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
        return;
      }

      const { granted } = await Location.getBackgroundPermissionsAsync();
      if (!granted || cancelled) return;

      // Re-registering an already-running task is how the cadence changes:
      // startLocationUpdatesAsync replaces the options of a task of the same
      // name, so accepting a ride tightens the interval without a stop/start
      // that would drop the notification and flicker the service.
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        ...mode,
        foregroundService: FOREGROUND_SERVICE,
      });
    })();

    return () => { cancelled = true; };
    // NO STOP IN THE CLEANUP, deliberately. This effect re-runs whenever the
    // cadence changes, and stopping there would tear the service down and build
    // it back up mid-ride. The service is ended by `enabled` going false — that
    // is, by him going offline — and by nothing else.
  }, [enabled, mode]);
}
