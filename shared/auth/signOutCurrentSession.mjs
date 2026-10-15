// Capture the intended device session before awaiting the SDK. Never broaden a
// current-session logout into all client sessions when there is no active one.
export async function signOutCurrentSession(signOut, sessionId) {
  if (!sessionId) return
  await signOut({ sessionId })
}
