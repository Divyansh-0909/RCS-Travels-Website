export function isOwnerClerkUser(clerkUserId) {
  const ownerClerkUserId = process.env.OWNER_CLERK_USER_ID?.trim()
  return Boolean(ownerClerkUserId && clerkUserId === ownerClerkUserId)
}

export function initialDriverGroup(clerkUserId) {
  return isOwnerClerkUser(clerkUserId) ? 'admin' : 'partner'
}
