// Local atomic cleanup plus durable provider handoff. No dotenv/provider client.
// Missing/disabled hold infrastructure is a review-required result, never bypass.
export class AccountRetentionError extends Error {
  constructor(code, message, status = 409) {
    super(message)
    this.name = 'AccountRetentionError'
    this.code = code
    this.status = status
  }
}

const reviewRequired = () => new AccountRetentionError(
  'RETENTION_REVIEW_REQUIRED',
  'Cleanup requires a current retention and hold review. No data was removed.',
)

async function beginCleanup(tx, userId, action) {
  const [available] = await tx.$queryRaw`SELECT to_regprocedure('retention_cleanup.begin_cleanup(text,text)') IS NOT NULL AS installed`
  if (!available?.installed) throw reviewRequired()
  const scope = `account:${userId}`
  const [row] = await tx.$queryRaw`SELECT retention_cleanup.begin_cleanup(${scope}::text,${action}::text) AS decision`
  if (row?.decision?.status !== 'ALLOWED_SYNTHETIC_LOCAL_ONLY') throw reviewRequired()
  return scope
}

export async function deleteAccountRecords(db, clerkId, activeStatuses) {
  return db.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { clerkId }, select: { id: true } })
    if (!user) throw new AccountRetentionError('ACCOUNT_NOT_FOUND', 'User has not signed up', 404)
    const scope = await beginCleanup(tx, user.id, 'ACCOUNT_DELETE')
    // The gate locks the reviewed rows and shares the hold/copy lock order.
    const live = await tx.booking.findFirst({ where: { userId: user.id, status: { in: activeStatuses } }, select: { id: true } })
    if (live) throw new AccountRetentionError('ACTIVE_RIDE', 'You have an active ride. Cancel or complete it before deleting your account.')
    await tx.savedPlace.deleteMany({ where: { userId: user.id } })
    const sentinel = `deleted:${user.id}`
    await tx.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date(), name: null, gender: null, dob: null, emergencyContact: null,
        whatsappNumber: null, phone: sentinel, clerkId: sentinel, bookingCode: sentinel },
      select: { id: true },
    })
    const [provider] = await tx.$queryRaw`SELECT retention_cleanup.queue_provider(${scope}::text,${clerkId}::text) AS decision`
    if (provider?.decision?.status !== 'WAITING_PROVIDER_REVIEW') throw reviewRequired()
    return { ok: true, externalCleanup: 'WAITING_PROVIDER_REVIEW' }
  }, { maxWait: 5000, timeout: 10000 })
}

export async function deleteSavedPlaceRecords(db, clerkId, placeId) {
  return db.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { clerkId }, select: { id: true } })
    if (!user) throw new AccountRetentionError('ACCOUNT_NOT_FOUND', 'User has not signed up', 404)
    await beginCleanup(tx, user.id, 'SAVED_PLACE_DELETE')
    const { count } = await tx.savedPlace.deleteMany({ where: { id: placeId, userId: user.id } })
    if (!count) throw new AccountRetentionError('PLACE_NOT_FOUND', 'Saved place not found', 404)
    return { ok: true }
  }, { maxWait: 5000, timeout: 10000 })
}
