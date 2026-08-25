import type { LocationObject } from 'expo-location';

// Screen-local location state disappears when HomeGate swaps Standby for the
// active ride after Google Maps opens. Keep the newest native fix at module
// scope so the next map can start at the same car position synchronously,
// before Android has time to produce another GPS callback.
let latestLocation: LocationObject | null = null;
const MAX_REUSED_FIX_AGE_MS = 2 * 60_000;

export function rememberDriverLocation(location: LocationObject) {
  if (!latestLocation || location.timestamp >= latestLocation.timestamp) {
    latestLocation = location;
  }
}

export function getRememberedDriverLocation() {
  if (!latestLocation || Date.now() - latestLocation.timestamp > MAX_REUSED_FIX_AGE_MS) return null;
  return latestLocation;
}
