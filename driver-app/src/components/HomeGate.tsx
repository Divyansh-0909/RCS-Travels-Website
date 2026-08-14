import { ActivityIndicator, View } from 'react-native';
import { Navigate } from 'react-router-native';
import { useDriver, type GatedDriverProfile } from '../hooks/useDriver';
import { useRides } from '../hooks/useRides';
import ActiveRide from '../pages/ActiveRide';
import Home from '../pages/Home';
import OnboardingStatus from '../pages/OnboardingStatus';
import Standby from '../pages/Standby';

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
 * ORDER MATTERS. activeRide is tested before isOnline: a captain cannot go
 * offline mid-ride (the server refuses), but if a row ever said otherwise the
 * ride still has to win — stranding him on a board with a rider in his car is
 * the worse failure.
 */
export const homeScreenFor = (profile: GatedDriverProfile | null | undefined): HomeScreen => {
    if (!profile?.onboarding?.canDrive) return 'status';
    if (profile.activeRide) return 'ride';
    return profile.isOnline ? 'standby' : 'board';
};

const HomeGate = () => {
  const { profile, loading, notRegistered } = useDriver();
  // One fetch for whichever screen is chosen. The ride screens need the booking
  // itself — /me answers with { id, status } and nothing a panel could draw.
  const { active, next, refresh } = useRides();

  // Only on the cold start, when there is no profile to render either screen
  // from. A refresh with a profile already in hand keeps showing it, or the
  // screen would blink to a spinner every time the app was resumed.
  if (loading && !profile) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  // Verified his phone, closed the app before finishing sign-up. There is no
  // driver row to have an onboarding state, so neither screen below can say
  // anything true about him.
  if (notRegistered) {
    return <Navigate to="/signup" replace />;
  }

  const screen = homeScreenFor(profile);

  if (screen === 'status') return <OnboardingStatus />;

  // `activeRide` on the profile said there is one; this is the booking behind
  // it. They can disagree for a moment — the profile refreshes on foreground and
  // the list on its own schedule — so the ride screen waits for the row rather
  // than rendering a panel with nothing in it.
  if (screen === 'ride' && active) return <ActiveRide ride={active} onChanged={refresh} />;

  if (screen === 'standby' || screen === 'ride') {
    return <Standby next={next} onChanged={refresh} />;
  }

  return <Home />;
};

export default HomeGate;
