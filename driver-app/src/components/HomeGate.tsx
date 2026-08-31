import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Navigate } from 'react-router-native';
import { useApi } from '../hooks/useApi';
import { useDriver, type GatedDriverProfile } from '../hooks/useDriver';
import { useRides } from '../hooks/useRides';
import type { UpcomingBooking } from '../types/enums';
import { RideCancelled } from './RideCancelled';
import { RideCompleted } from './RideCompleted';
import ActiveRide from '../pages/ActiveRide';
import AppText from './AppText';
import Home from '../pages/Home';
import OnboardingStatus from '../pages/OnboardingStatus';
import Standby from '../pages/Standby';
import { HomeGateSkeleton } from './ui/LoadingSkeletons';
import { MapLoadingSkeleton, SkeletonBlock, SkeletonSection } from './ui/Skeleton';

// What "/" means depends on who is asking.
//
// An approved captain's home is his work; an unapproved one's is the state of
// his application — and it is his HOME, not a screen he was redirected to. That
// distinction is the whole reason this component exists rather than a <Navigate>
// to /onboarding/status: the Home tab in the bar points at "/", so sending him
// elsewhere would leave him on a screen no tab was lit for, looking at a bar
// that claimed he was nowhere.
//
// It also means approval needs no navigation at all. The profile refreshes when
// the app comes back to the foreground, canDrive flips, and this swaps the ride
// board in under the tab he was already on. Going online and starting a ride
// work the same way — the screen changes under him, the address does not.

export type HomeScreen = 'status' | 'ride' | 'standby' | 'board';

/**
 * Which of the four "/" is showing. Exported because App.tsx needs the same
 * answer for a different reason: the two map screens are full-bleed and must not
 * get the top padding that clears the header on the others. Two components
 * deciding that separately is how a map ends up with a white stripe above it.
 *
 * ORDER MATTERS. An accepted ride wins even if an approval gate changes while
 * the captain is working: nothing may replace the controls needed to finish the
 * trip. Without an accepted ride, every approved online captain sees Standby;
 * the board is the offline home.
 */
export const homeScreenFor = (profile: GatedDriverProfile | null | undefined): HomeScreen => {
    const hasAcceptedRide = Boolean(profile?.activeRide)
        || (profile?.onboarding?.assignedRides ?? 0) > 0;
    if (hasAcceptedRide) return 'ride';
    if (!profile?.onboarding?.canDrive) return 'status';
    return profile.isOnline ? 'standby' : 'board';
};

const HomeGate = () => {
  const { profile, loading, notRegistered } = useDriver();
  const api = useApi();
  // One fetch for whichever screen is chosen. The ride screens need the booking
  // itself — /me answers with { id, status } and nothing a panel could draw.
  const {
    rides,
    active,
    next,
    scheduled,
    loading: ridesLoading,
    error: ridesError,
    refresh,
  } = useRides();

  // THE RIDE THAT HAS JUST ENDED, held past the moment it stopped being active.
  // A ride leaving `active` — finished, or called off by the rider — is gone from
  // the next read, so without this the screen jumps straight back to the board
  // and he never learns what happened to it. Kept until he dismisses it.
  //
  // WHY IT IS FETCHED RATHER THAN REMEMBERED. The snapshot we hold is the ride as
  // it was while ACTIVE, which by definition says nothing about how it ended: the
  // terminal status and the cancellation charge are both written at the moment it
  // leaves the list. So the transition is the trigger and the row is re-read for
  // the answer.
  const [ended, setEnded] = useState<UpcomingBooking | null>(null);
  const previous = useRef<UpcomingBooking[]>([]);
  useEffect(() => {
    // The rider may cancel before the captain starts driving, when the booking
    // is still `assigned` and therefore is `next`, not `active`. Compare the
    // whole open list so both that case and a mid-ride cancellation produce the
    // same terminal notice.
    const left = previous.current.find(
      (oldRide) => !rides.some((ride) => ride.id === oldRide.id),
    );
    previous.current = rides;

    if (!left || left.id === ended?.id) return;

    let cancelled = false;
    (async () => {
      const fresh = await api.getRide(left.id);
      if (cancelled) return;
      // A read that fails still has to produce a screen — falling back to the
      // snapshot shows the completion rather than nothing, which is the better
      // of the two wrong answers.
      setEnded(fresh?.error ? left : (fresh.booking ?? fresh));
    })();

    return () => { cancelled = true; };
  }, [rides, ended, api]);

  // Only on the cold start, when there is no profile to render either screen
  // from. A refresh with a profile already in hand keeps showing it, or the
  // screen would blink to a spinner every time the app was resumed.
  if (loading && !profile) {
    return <HomeGateSkeleton />;
  }

  // Verified his phone, closed the app before finishing sign-up. There is no
  // driver row to have an onboarding state, so neither screen below can say
  // anything true about him.
  if (notRegistered) {
    return <Navigate to="/signup" replace />;
  }

  const screen = homeScreenFor(profile);

  if (screen === 'status') return <OnboardingStatus />;

  // A completion TAKES the screen — he has just dropped somebody off and the
  // fare is the thing he wants. A cancellation does not: nothing is being asked
  // of him, so it rides over whichever screen he has been returned to as a
  // dismissible notice, and is rendered further down with the rest of the shell.
  if (ended?.status === 'completed') {
    return <RideCompleted ride={ended} onDone={() => setEnded(null)} />;
  }
  const cancelled = ended?.status === 'cancelled' ? ended : null;

  // The notice rides over whichever of the three he lands on, so each is wrapped
  // rather than the cancellation being a fourth screen. Nothing is being asked of
  // him — it is a statement about a ride that has already gone.
  const withNotice = (screen: ReactNode) => (
    <>
      {screen}
      {cancelled ? <RideCancelled ride={cancelled} onDismiss={() => setEnded(null)} /> : null}
    </>
  );

  // The profile says the captain holds a ride; this is the full booking behind
  // it. That includes `assigned`, immediately after accepting, as well as later
  // on-road states. The two requests can settle a moment apart, so the ride
  // screen waits for the row rather than falling back to Standby.
  if (screen === 'ride' && active) {
    return withNotice(<ActiveRide ride={active} onChanged={refresh} />);
  }

  // Never substitute Standby for an accepted ride while its full booking is
  // still arriving. The profile knows the ride owns this screen, but the map,
  // route and sliders need the detailed row from /rides.
  if (screen === 'ride') {
    return withNotice(
      <View className="flex-1 w-full items-center justify-center gap-3 px-6">
        {ridesLoading || !ridesError ? (
          <>
            <MapLoadingSkeleton />
            <SkeletonSection
              className="absolute inset-x-5 bottom-6 rounded-3xl bg-white p-5 gap-3"
            >
              <SkeletonBlock width={112} height={12} />
              <SkeletonBlock width="66%" height={24} />
              <SkeletonBlock width="100%" height={48} radius={12} />
            </SkeletonSection>
          </>
        ) : (
          <>
            <AppText className="text-base font-semibold text-[var(--background-primary)]">
              Active ride could not be loaded
            </AppText>
            <AppText className="text-sm text-center text-red-600">{ridesError}</AppText>
            <Pressable
              role="button"
              onPress={refresh}
              style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
            >
              <View className="rounded-xl bg-primary px-5 py-3">
                <AppText className="text-sm font-semibold text-[var(--foreground)]">Try again</AppText>
              </View>
            </Pressable>
          </>
        )}
      </View>,
    );
  }

  if (screen === 'standby') {
    return withNotice(<Standby next={next} onChanged={refresh} />);
  }

  return withNotice(
    <Home
      scheduled={scheduled}
      loading={ridesLoading}
      error={ridesError}
      onRefresh={refresh}
    />,
  );
};

export default HomeGate;
