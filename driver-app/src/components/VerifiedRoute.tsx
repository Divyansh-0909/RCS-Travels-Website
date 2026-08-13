import { ActivityIndicator, View } from 'react-native';
import { Navigate, Outlet, useLocation } from 'react-router-native';
import { useDriver } from '../hooks/useDriver';

// The gate.
//
// Available, Post, Rides and every ride screen sit behind this. A captain whose
// documents are not approved cannot reach any of them — not because those
// screens would break, but because every request they make would 403 from
// requireApprovedDriver, and a screen full of failed requests is a worse way to
// learn you are not verified than being told.
//
// In practice he has no way to ask for them either: the AppBar drops those tabs
// until he is approved. This stays because a bar is a suggestion and a route is
// a fact — a stale deep link or a push payload can still name one of these paths.
//
// IT IS NOT A SECURITY BOUNDARY, and nothing here should ever be mistaken for
// one. The server refuses an unapproved driver at every endpoint that matters,
// independently, and would keep refusing him if this file were deleted. This is
// a NAVIGATION decision: it puts him on the one screen that can actually help.
//
// Deliberately not applied to Account or Documents. He needs the checklist to
// finish onboarding and Account to reach support, and locking a stuck captain
// out of the only route to a human is how a stuck captain stays stuck.
const VerifiedRoute = () => {
  const { profile, loading, notRegistered } = useDriver();
  const location = useLocation();

  // No verdict yet. A spinner rather than a redirect, because redirecting on
  // incomplete information would bounce an approved captain to the checklist for
  // half a second every time he opened the app.
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  // Signed in with Clerk but no driver row — he verified his phone and closed
  // the app before finishing sign-up. Back to where he stopped.
  if (notRegistered) {
    return <Navigate to="/signup" replace />;
  }

  if (!profile?.onboarding?.canDrive) {
    // Home, which for him is the application status. `state` carries where he was
    // trying to go, so the moment he is approved the app can put him there.
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
};

/**
 * The same gate, one exception: a captain who still owes somebody a ride.
 *
 * The ride screens sit behind THIS rather than VerifiedRoute, because suspension
 * does not cancel the rides a captain was already given. The server agrees —
 * requireDriverForAssignedWork lets a suspended captain read, navigate and
 * complete a booking already assigned to him, while every path that would hand
 * him a NEW one still refuses. Sending him to the status screen here would leave
 * a rider waiting on a car whose driver had no way to say he had arrived.
 *
 * `assignedRides` rather than `blockedBy === 'suspended'`: the question is
 * whether he owes anyone a ride, not why he is blocked. A captain whose papers
 * lapsed mid-shift is in exactly the same position and should finish the same way.
 *
 * Not a security boundary, for the same reason VerifiedRoute is not: the server
 * checks `booking.driverId === driver.id` on each of these routes independently.
 */
export const AssignedWorkRoute = () => {
  const { profile, loading, notRegistered } = useDriver();
  const location = useLocation();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  if (notRegistered) {
    return <Navigate to="/signup" replace />;
  }

  const onboarding = profile?.onboarding;
  if (!onboarding?.canDrive && !(onboarding?.assignedRides ?? 0)) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
};

export default VerifiedRoute;
