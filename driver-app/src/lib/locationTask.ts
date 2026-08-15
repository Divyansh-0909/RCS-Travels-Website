import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getClerkInstance } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { sendLocation } from '../api/api';

/**
 * Where the captain's position is actually sent from — a headless task, not the
 * React tree.
 *
 * THE WHOLE POINT IS THAT HE IS NOT LOOKING AT THIS APP. He drives with the
 * phone locked or with Google Maps in front, which is when a rider most needs
 * the marker to move, and it is exactly when an ordinary app stops running. What
 * keeps this alive is the ANDROID FOREGROUND SERVICE that
 * hooks/useDriverLocation.ts starts alongside it: the persistent notification in
 * his tray is not decoration, it is the contract with the OS that exempts the
 * process from Doze and App Standby. Android-only by design — the app ships
 * there and nowhere else, so there is no iOS background mode to keep in step.
 *
 * This file must stay importable with no side effects beyond defineTask, and it
 * must be imported for its side effect before the app renders (main.tsx). Expo
 * looks the task up BY NAME when the OS wakes the process, which can happen with
 * no UI mounted at all, so a registration that only ran inside a component would
 * not exist at the moment it is needed.
 */

export const LOCATION_TASK = 'rcs-driver-location';

/** A position on its way to the server. Exported with reportFix, which takes it. */
export type Fix = { lat: number; lng: number };

/**
 * The send gate, and the reason it lives here rather than in the hook.
 *
 * The OS decides how often we are WOKEN — that is the accuracy and interval the
 * hook registers with, and it changes with whether he is on a ride. This decides
 * how often we TRANSMIT, and it is deliberately one policy for both cases,
 * because the two states already differ in how often a fix arrives at all. On a
 * ride the OS delivers every few seconds and a moving car clears MIN_MOVE_M
 * every time, so it sends at that rate. Parked, nothing clears it and the
 * heartbeat carries him instead.
 *
 * IDLE_HEARTBEAT_MS IS HALF OF A CONTRACT WITH THE SERVER. Dispatch drops any
 * driver whose last fix is older than LOCATION_STALE_AFTER_MS
 * (backend/constants/dispatch.js), which is three of these. Raise it here
 * without raising it there and parked captains stop being offered rides.
 */
const MIN_MOVE_M = 20;
const IDLE_HEARTBEAT_MS = 2 * 60 * 1000;

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Survives between wake-ups for as long as the OS keeps the JS context, which
// under a foreground service is the whole shift. If it is torn down anyway the
// worst case is one redundant POST on the next fix, so this never needs to be
// persisted.
let lastSent: { lat: number; lng: number; at: number } | null = null;
let inFlight = false;
let loadingClerk: Promise<unknown> | null = null;

/**
 * Consecutive "Driver is not online" refusals.
 *
 * A SINGLE 403 IS NOT AN ANSWER, and this counter is the whole reason. Going
 * online is two things happening at once: the app flips isOnline locally so the
 * screen and the GPS move on the tap, and a PATCH goes off to make it true on
 * the server. The service can therefore be running, and a fix can arrive, a
 * moment before the row says he is online — a race the captain never sees and
 * that resolves itself in one round trip.
 *
 * Stopping on the first one would lose that race permanently: the service shuts
 * down, the notification disappears, and a captain who is online everywhere he
 * can see stops being findable by dispatch until he toggles again.
 *
 * Three in a row is a different claim. At these cadences that is a stretch of
 * refusals no handshake explains, and means he really is offline.
 */
let refusals = 0;
const REFUSALS_BEFORE_STOP = 3;

/** Metres between two coordinates. Same haversine as the server's. */
function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * A session token, with no React anywhere.
 *
 * getClerkInstance() IS THE SAME OBJECT ClerkProvider USES — the provider calls
 * it too on native, so while the app is on screen this hands back the already
 * loaded instance and costs nothing. Woken headless, it builds one from the very
 * same SecureStore token cache the UI signed in with and refreshes the session
 * JWT itself, which is what makes a captured token unnecessary: nothing has to
 * be stashed anywhere, and a signed-out captain simply has no session here.
 */
async function authToken() {
  const clerk = getClerkInstance({ publishableKey, tokenCache });
  if (!clerk.loaded) {
    // Shared, so a burst of wake-ups cannot start several loads at once.
    loadingClerk ??= clerk.load();
    await loadingClerk;
  }
  return (await clerk.session?.getToken()) ?? null;
}

/**
 * The send gate, shared by both ways a fix can reach this module.
 *
 * TWO CALLERS, ONE THROTTLE, AND ONE `lastSent`. The background task is the
 * normal path; the foreground watcher in useDriverLocation is the fallback for a
 * handset that will not start the service at all. If each kept its own idea of
 * when it last sent, a device that switched between them would either double up
 * or go quiet for a heartbeat — and worse, the two would disagree about whether
 * the server had heard from him recently, which is the one thing the staleness
 * cutoff depends on.
 *
 * `post` is passed in because the credential differs: headless, the task builds
 * its own token; in the foreground, useApi already has one.
 */
export async function reportFix(
    fix: Fix,
    post: (fix: Fix) => Promise<{ error?: string; status?: number } | undefined>,
) {
    const now = Date.now();

    const moved =
        !lastSent || metresBetween(lastSent.lat, lastSent.lng, fix.lat, fix.lng) >= MIN_MOVE_M;
    const heartbeatDue = !lastSent || now - lastSent.at >= IDLE_HEARTBEAT_MS;
    if (!moved && !heartbeatDue) return;

    // Never queue. A backlog of positions is a backlog of WRONG positions — by
    // the time the third is delivered the first two describe places he has
    // already left. Skipping is correct, not a compromise.
    if (inFlight) return;
    inFlight = true;

    try {
        const res = await post(fix);

        // He went offline, or the service outlived the shift that justified it.
        // Only acted on once the refusals stop looking like the going-online
        // handshake — see `refusals`.
        if (res?.status === 403) {
            refusals += 1;
            return;
        }

        // Anything else is dropped rather than retried: the next fix is seconds
        // away and more accurate. lastSent stays put, so the heartbeat still
        // counts this send as outstanding and tries again.
        if (res?.error) return;

        // Reset only on a fix the server took, so a run of 403s broken by network
        // errors still adds up to a stop.
        refusals = 0;
        lastSent = { ...fix, at: now };
    } finally {
        inFlight = false;
    }
}

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  // Losing signal is not an error worth acting on — it is a tunnel, and the next
  // wake-up brings a fix.
  if (error) return;

  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };

  // THE NEWEST OF THE BATCH, not each in turn. Android hands over several fixes
  // at once after a spell without a wake-up, and every one but the last
  // describes somewhere he has already left — posting the whole batch would
  // walk the rider's marker through his recent history and leave it behind
  // where he actually is.
  const newest = locations?.[locations.length - 1];
  if (!newest) return;

  const fix = { lat: newest.coords.latitude, lng: newest.coords.longitude };

  // The gate, the retry policy and the refusal counting all live in reportFix,
  // which the foreground fallback shares. All this path owns is the credential:
  // headless, there is no useAuth to borrow one from.
  await reportFix(fix, async (f) => {
    const token = await authToken();
    if (!token) return { error: 'no session' };
    return sendLocation(f, async () => token);
  });
});
