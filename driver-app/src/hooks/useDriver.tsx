import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useApi } from './useApi';
import { usePushRegistration } from './usePushRegistration';
import type { DriverProfile } from '../types/enums';


type OnboardingState = {
  canDrive: boolean;
  /** null when he can drive; otherwise why not, in one word. */
  blockedBy: 'notUploaded' | 'uploading' | 'scanning' | 'pending' | 'rejected' | 'suspended' | 'inactive' | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  /**
   * Rides he was given and has not finished — assigned, en route, reached or
   * started.
   *
   * SEPARATE FROM canDrive, and the pair is what routes a suspended captain.
   * canDrive answers "may he take NEW work" and is false throughout a
   * suspension; this answers "does he still owe somebody a ride from before
   * it", and both can be true at once. The server lets him finish those rides
   * (requireDriverForAssignedWork), so an app that read only canDrive would
   * strand a rider by putting the captain on the status screen with no route
   * to the ride.
   */
  assignedRides: number;
};

/**
 * The row plus the routing answer the server computes with it. Exported because
 * HomeGate decides which screen "/" is from exactly this shape, and App.tsx asks
 * HomeGate the same question to match its padding — neither can take a bare
 * DriverProfile, which has no `onboarding`.
 */
export type GatedDriverProfile = DriverProfile & { onboarding: OnboardingState };

type DriverContextValue = {
  /** null while the first load is in flight, or if the driver row is missing. */
  profile: GatedDriverProfile | null;
  loading: boolean;
  error: string | null;
  /** 403 "Not a registered driver" — signed in with Clerk, no driver row yet. */
  notRegistered: boolean;
  refresh: () => Promise<void>;
  /**
   * Write a field the app already knows the answer to, without waiting to be
   * told it again.
   *
   * FOR ONE CASE, AND IT IS A REAL ONE: the online switch. HomeGate picks the
   * screen off profile.isOnline, so before this a captain tapped Online and then
   * watched the old screen while two requests went out and came back — the
   * PATCH, and then a whole /me to learn the single field the PATCH had just
   * confirmed. On a cold Render instance that is seconds of a switch that looks
   * broken.
   *
   * Safe here precisely because the endpoint answers with the field: once the
   * PATCH succeeds, the value written here and the value on the row are the same
   * thing, so nothing is being guessed and no reconciling fetch is owed. The
   * caller puts it back if the request is refused.
   */
  patchProfile: (patch: Partial<GatedDriverProfile>) => void;
};

const DriverContext = createContext<DriverContextValue | null>(null);

export const DriverProvider = ({ children }: { children: ReactNode }) => {
  const api = useApi();
  const { isSignedIn } = useAuth();
  const [profile, setProfile] = useState<DriverContextValue['profile']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notRegistered, setNotRegistered] = useState(false);

  // Registered as soon as there is a driver row to attach the token to, and not
  // one step later: POST /driver/fcm-token 403s without one, and the first thing
  // the backend wants to push is "your documents arrived" — which happens
  // minutes after sign-up, long before he is approved. Gating this on approval
  // instead would mean the entire onboarding ran silently, which is exactly the
  // stretch the notifications exist for.
  usePushRegistration(Boolean(profile));

  const refresh = useCallback(async () => {
    // Nobody to ask about. Without this the provider fires a guaranteed 401 on
    // every cold start of a logged-out app — and worse, parks that 401 in
    // `error`, so the sign-up screen would render a network failure it caused
    // itself.
    if (!isSignedIn) {
      setProfile(null);
      setNotRegistered(false);
      setError(null);
      setLoading(false);
      return;
    }

    const result = await api.getMe();

    if (result.error) {
      // 403 is not an error to show. It is the ordinary state of somebody who
      // has just verified his phone and has no driver row yet, and the router
      // reads it to send him to the sign-up details rather than to an error.
      if (result.status === 403) {
        setNotRegistered(true);
        setProfile(null);
        setError(null);
      } else {
        setError(result.error);
      }
    } else {
      setNotRegistered(false);
      setError(null);
      setProfile(result as DriverContextValue['profile']);
    }
    setLoading(false);
  }, [api, isSignedIn]);

  useEffect(() => { refresh(); }, [refresh]);

  // Re-asked whenever the app comes back to the foreground. This is what makes
  // an approval land without the captain doing anything: he gets the push, taps
  // it, the app wakes, and the gate has already lifted by the time he is looking
  // at it. Polling on a timer would do the same thing and drain his battery for
  // the 23 hours a day nothing changes.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const patchProfile = useCallback((patch: Partial<GatedDriverProfile>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = useMemo(
    () => ({ profile, loading, error, notRegistered, refresh, patchProfile }),
    [profile, loading, error, notRegistered, refresh, patchProfile],
  );

  return <DriverContext.Provider value={value}>{children}</DriverContext.Provider>;
};

export function useDriver() {
  const value = useContext(DriverContext);
  if (!value) throw new Error('useDriver must be used inside a DriverProvider');
  return value;
}
