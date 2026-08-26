import { useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import * as Location from 'expo-location';
import { showPermissionPrompt } from '../components/ui/PermissionPrompt';
import { rememberDriverLocation } from '../lib/driverLocationCache';
import { LOCATION_TASK, onLocationAccepted, reportFix } from '../lib/locationTask';
import { useApi } from './useApi';
import { useDriver } from './useDriver';

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
    // Samsung and other OEMs may stop producing stationary screen-off fixes for
    // PRIORITY_BALANCED_POWER_ACCURACY even while our foreground-service
    // notification remains visible. High maps to Android's GPS-backed priority,
    // which keeps the native callback alive; reportFix still limits stationary
    // network traffic to one heartbeat every two minutes.
    accuracy: Location.Accuracy.High,
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
/**
 * Starting the service is retried, because the failure it hits is a RACE rather
 * than a refusal.
 *
 * expo-task-manager keeps its Android context in a WeakReference and hands the
 * SharedPreferences built from it to callers that do not null-check
 * (TaskService.getSharedPreferences returns null; TasksPersistence.getAll
 * dereferences it). Before TaskService has been constructed with a live context
 * — which on a cold start is the first second or so — startLocationUpdatesAsync
 * rejects with a NullPointerException from inside the library.
 *
 * A second later the same call succeeds. Dropping to the degraded foreground
 * watcher over a race that resolves on its own would cost the captain the whole
 * shift's background reporting for the sake of one early tick, so it is worth
 * asking again before giving up.
 *
 * The initial settle is what keeps the common case to a single attempt: without
 * it every cold start would log a failure before its first success.
 */
const START_SETTLE_MS = 600;
const START_BACKOFF_MS = [1500, 4000];
const IMMEDIATE_FIX_BACKOFF_MS = [1500, 4000];
const IMMEDIATE_FIX_TIMEOUT_MS = 12_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  let haveForeground = foreground.granted;

  if (!haveForeground) {
    const canRequest = foreground.canAskAgain;
    const accepted = await showPermissionPrompt({
      kind: 'location',
      title: canRequest ? 'Share your location' : 'Turn on location access',
      message: canRequest
        ? 'RCS Captains uses your location to find nearby rides and guide customers to your live position.'
        : 'Location access is off. Turn it on in app settings before going online.',
      actionLabel: canRequest ? 'Continue' : 'Open app settings',
    });

    if (!accepted) return 'deniedForeground';
    if (!canRequest) {
      await Linking.openSettings();
      return 'deniedForeground';
    }

    haveForeground = (await Location.requestForegroundPermissionsAsync()).granted;
  }
  if (!haveForeground) return 'deniedForeground';

  const background = await Location.getBackgroundPermissionsAsync();
  let haveBackground = background.granted;

  if (!haveBackground) {
    const canRequest = background.canAskAgain;
    const accepted = await showPermissionPrompt({
      kind: 'background-location',
      title: canRequest ? 'Keep rides reaching you' : 'Allow location all the time',
      message: canRequest
        ? 'Choose “Allow all the time” so dispatch can find you while you drive with the app in the background.'
        : 'Open app settings and set Location to “Allow all the time” before going online.',
      actionLabel: canRequest ? 'Continue' : 'Open app settings',
    });

    if (!accepted) return 'deniedBackground';
    if (!canRequest) {
      await Linking.openSettings();
      return 'deniedBackground';
    }

    haveBackground = (await Location.requestBackgroundPermissionsAsync()).granted;
  }
  if (!haveBackground) return 'deniedBackground';

  return 'granted';
}

/**
 * @param enabled he is online — the only state the server accepts a fix in
 *        (POST /driver/location 403s otherwise).
 * @param onRide  he holds a ride somebody is watching, which picks the cadence.
 */
export function useDriverLocation(enabled: boolean, onRide: boolean) {
  const api = useApi();
  const { patchProfile } = useDriver();
  const mode = onRide ? MODES.ride : MODES.idle;
  const [resumeEpoch, setResumeEpoch] = useState(0);
  const wasEnabled = useRef(false);

  // The normal path is the TaskManager callback, not this React hook. Listen to
  // the shared reporter so a background-task acknowledgement can remove the
  // Connecting pill while the app is visible too.
  useEffect(() => {
    if (!enabled) return;
    return onLocationAccepted(() => patchProfile({ dispatchReady: true }));
  }, [enabled, patchProfile]);

  // Some Android vendors stop a foreground location service under memory or
  // battery pressure but leave the driver row online. Re-run the registration
  // check whenever the captain returns to the app, so an already-online driver
  // becomes findable again without having to toggle Offline then Online.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setResumeEpoch((epoch) => epoch + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let watcher: Location.LocationSubscription | null = null;
    const justCameOnline = enabled && !wasEnabled.current;
    const shouldPublishImmediately = justCameOnline || resumeEpoch > 0;
    wasEnabled.current = enabled;

    // A successful response is the transition from Connecting to Online. A
    // failed response deliberately leaves the intent alone: the foreground
    // service and every later OS fix keep retrying until one is accepted.
    const postFix = (fix: { lat: number; lng: number }) => api.sendLocation(fix);

    // The task normally reports the first OS-delivered fix. That can take up to
    // the idle interval, though, leaving a newly-online driver invisible to
    // dispatch unnecessarily. Read one current position here and deliberately
    // bypass the shared throttle once; every later fix continues through the
    // existing 20 m / two-minute gate.
    const publishImmediateFix = async () => {
      if (!shouldPublishImmediately || cancelled) return;

      let last: unknown;
      for (let attempt = 0; attempt <= IMMEDIATE_FIX_BACKOFF_MS.length; attempt++) {
        try {
          // Expo documents that a high-accuracy one-shot can take a long time,
          // especially indoors. Bound it so one unavailable GPS fix cannot hold
          // this repair loop forever. The long-running service is started in
          // parallel below and remains the authoritative retry path.
          const location = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: mode.accuracy }),
            wait(IMMEDIATE_FIX_TIMEOUT_MS).then(() => {
              throw new Error('current location timed out');
            }),
          ]);
          if (cancelled) return;
          rememberDriverLocation(location);

          const accepted = await reportFix(
            { lat: location.coords.latitude, lng: location.coords.longitude },
            postFix,
            true,
          );
          if (accepted) return;
          last = new Error('location upload was not accepted');
        } catch (err) {
          last = err;
        }

        const backoff = IMMEDIATE_FIX_BACKOFF_MS[attempt];
        if (backoff === undefined) break;
        await wait(backoff);
        if (cancelled) return;
      }

      // The native service remains the long-running retry loop. This warning is
      // diagnostic only; the visible state stays Connecting until a later fix
      // is acknowledged or the captain goes offline.
      console.warn('immediate location fix could not be reported:', (last as Error)?.message);
    };

    /**
     * FOREGROUND ONLY, and only when the service refuses to start.
     *
     * Reporting nothing is the worst outcome available here: a captain who looks
     * online to himself, and to the switch, while dispatch cannot see him. So a
     * handset that will not run the service still reports for as long as the app
     * is on screen — degraded, but findable. Shares reportFix with the task, so
     * both paths throttle against one `lastSent` rather than two.
     */
    const watchInForeground = async () => {
      watcher = await Location.watchPositionAsync(
        { accuracy: mode.accuracy, timeInterval: mode.timeInterval, distanceInterval: 0 },
        (loc) => {
          rememberDriverLocation(loc);
          void reportFix(
            { lat: loc.coords.latitude, lng: loc.coords.longitude },
            postFix,
          );
        },
        () => {},
      );
      if (cancelled) { watcher.remove(); watcher = null; }
    };

    /** 'ok' when there is nothing more to do; 'no-permission' to degrade without retrying. */
    const attemptStart = async (): Promise<'ok' | 'no-permission'> => {
      const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
      if (cancelled) return 'ok';

      if (!enabled) {
        // Also the repair path for a service that outlived its shift: the app
        // may open to a captain the server says is offline while a task from a
        // killed session is still registered and still holding a notification.
        if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
        return 'ok';
      }

      const { granted } = await Location.getBackgroundPermissionsAsync();
      if (cancelled) return 'ok';

      // A settled answer, not a race — retrying changes nothing. He can still be
      // found while he is looking at the app.
      if (!granted) return 'no-permission';

      // Re-registering an already-running task is how the cadence changes:
      // startLocationUpdatesAsync replaces the options of a task of the same
      // name, so accepting a ride tightens the interval without a stop/start
      // that would drop the notification and flicker the service.
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        ...mode,
        foregroundService: FOREGROUND_SERVICE,
      });
      return 'ok';
    };

    (async () => {
      // Let the native side finish coming up before the first ask. See
      // START_SETTLE_MS — this is the difference between one clean attempt and a
      // guaranteed failure followed by a retry, on every cold start.
      if (enabled) await wait(START_SETTLE_MS);
      if (cancelled) return;

      // Run the one-shot and the native service startup independently. A
      // high-accuracy current-position request can take a long time indoors;
      // awaiting it here used to prevent startLocationUpdatesAsync from running
      // at all, leaving an already-online captain stuck on an old database fix.
      // Whichever path receives a usable fix first reports it through the same
      // throttle and makes dispatch find him.
      void publishImmediateFix();

      let last: unknown;

      for (let attempt = 0; attempt <= START_BACKOFF_MS.length; attempt++) {
        try {
          if (await attemptStart() === 'no-permission') break;
          return;
        } catch (err) {
          last = err;
          const backoff = START_BACKOFF_MS[attempt];
          if (backoff === undefined) break;
          await wait(backoff);
          if (cancelled) return;
        }
      }

      // Out of attempts, or refused outright. THIS USED TO BE AN UNHANDLED
      // REJECTION, which is how it reached the captain as a red box rather than
      // a log. Whatever the reason — the library's null context, an OEM battery
      // manager refusing the service, Android declining to start one from a state
      // it considers background — none of it is worth failing the shift over.
      if (last) console.warn('location service did not start:', (last as Error)?.message);
      if (!cancelled) await watchInForeground().catch(() => {});
    })();

    return () => {
      cancelled = true;
      watcher?.remove();
    };
    // NO SERVICE STOP IN THE CLEANUP, deliberately. This effect re-runs whenever
    // the cadence changes, and stopping there would tear the service down and
    // build it back up mid-ride. The service is ended by `enabled` going false —
    // that is, by him going offline — and by nothing else. The foreground
    // watcher IS torn down, because it belongs to this effect's lifetime.
  }, [enabled, mode, api, patchProfile, resumeEpoch]);
}
