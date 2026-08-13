import { ActivityIndicator, View } from 'react-native';
import { Navigate } from 'react-router-native';
import { useDriver } from '../hooks/useDriver';
import Home from '../pages/Home';
import OnboardingStatus from '../pages/OnboardingStatus';

// What "/" means depends on who is asking.
//
// An approved captain's home is the ride board. An unapproved one's home is the
// state of his application — and it is his HOME, not a screen he was redirected
// to. That distinction is the whole reason this component exists rather than a
// <Navigate> to /onboarding/status: the Home tab in the bar points at "/", so
// sending him elsewhere would leave him on a screen no tab was lit for, looking
// at a bar that claimed he was nowhere.
//
// It also means approval needs no navigation at all. The profile refreshes when
// the app comes back to the foreground, canDrive flips, and this swaps the ride
// board in under the tab he was already on.
const HomeGate = () => {
  const { profile, loading, notRegistered } = useDriver();

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

  return profile?.onboarding?.canDrive ? <Home /> : <OnboardingStatus />;
};

export default HomeGate;
