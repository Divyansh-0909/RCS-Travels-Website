import { prisma } from '../db/prisma.js'
import { sendPush } from './notification.js'
import { documentLabelOf, REQUIRED_DRIVER_DOCUMENTS } from '../constants/driverDocuments.js'

// What the captain is told, and when.
//
// Onboarding is the one part of this app where a driver is waiting on US. He
// photographs eight documents, taps upload, and then nothing visible happens for
// somewhere between a minute and a day — a machine check he cannot see, then a
// human review he cannot see either. Left alone with that, the second thing he
// does is ring the office, and the third is upload everything again.
//
// So every transition he cannot observe gets a message. The rule for what
// deserves one is not "did the state change" but "would he otherwise be sitting
// there wondering": the scan clearing a single file is invisible bookkeeping and
// says nothing, while the same scan REFUSING a file is the one thing standing
// between him and being paid.
//
// Every function here is best-effort. A push that fails must never fail the
// write it followed — the row is correct, and the checklist screen says the same
// thing the notification would have.

const send = async (driver, message) => {
  try {
    await sendPush(driver, message)
  } catch (err) {
    console.error(`documentNotifications: ${driver?.id} —`, err.message)
  }
}

const driverFor = (driverId) =>
  prisma.driver.findUnique({ where: { id: driverId }, select: { id: true, fcmToken: true, name: true } })

/**
 * Documents just landed and the checks have started.
 *
 * Sent on the confirm, not on the upload: what he needs to know is that the
 * files ARRIVED, and until the confirm they have not — an object in the bucket
 * with no row behind it is not a submitted document.
 */
export async function notifyDocumentsSubmitted(driverId, types) {
  const driver = await driverFor(driverId)
  if (!driver) return

  const count = types.length
  await send(driver, {
    title: count === 1 ? `${documentLabelOf(types[0])} received` : `${count} documents received`,
    // Two facts, in the order he cares about them: it arrived, and here is what
    // happens next. "We'll let you know" is the part that stops him refreshing.
    body: "We're checking them now. You'll get a message as soon as they're reviewed.",
    data: { kind: 'documents_submitted', types: types.join(',') },
  })
}

/**
 * The file check could not clear a document.
 *
 * The wording is deliberately about the FILE and deliberately vague about why.
 * Two reasons: most of these are a photo that did not finish uploading over bad
 * signal rather than anybody trying anything, and naming the check he tripped
 * tells whoever did try exactly which one to aim at next.
 */
export async function notifyScanFailed(driverId, type) {
  const driver = await driverFor(driverId)
  if (!driver) return

  await send(driver, {
    title: `${documentLabelOf(type)} couldn't be checked`,
    body: 'Please open the app and upload that one again — a clear, well-lit photo works best.',
    data: { kind: 'scan_failed', type, screen: 'documents' },
  })
}

/**
 * An admin rejected a document.
 *
 * His words go through verbatim. "Photo is blurry" is worth more than any
 * sentence this file could compose, because it is the only version that says
 * what to do differently.
 */
export async function notifyDocumentRejected(driverId, type, reason) {
  const driver = await driverFor(driverId)
  if (!driver) return

  await send(driver, {
    title: `${documentLabelOf(type)} was not accepted`,
    body: reason || 'Please upload it again.',
    data: { kind: 'document_rejected', type, screen: 'documents' },
  })
}

/**
 * An admin approved a document, and it was not the last one.
 *
 * Deliberately quiet about progress counts he could get wrong: "3 of 8" invites
 * him to work out which five, and the checklist screen already shows him.
 */
export async function notifyDocumentApproved(driverId, type, { remaining }) {
  const driver = await driverFor(driverId)
  if (!driver) return

  await send(driver, {
    title: `${documentLabelOf(type)} approved`,
    body: remaining === 1
      ? 'One more document to go.'
      : `${remaining} documents still to be approved.`,
    data: { kind: 'document_approved', type, screen: 'documents' },
  })
}

/**
 * Everything is approved and he can drive.
 *
 * The only message in this file that is worth interrupting somebody for, and the
 * only one that changes what he can do rather than what he has to do.
 */
export async function notifyDriverApproved(driverId) {
  const driver = await driverFor(driverId)
  if (!driver) return

  await send(driver, {
    title: "You're approved",
    body: 'Your documents are all cleared. Go online to start taking rides.',
    data: { kind: 'driver_approved', screen: 'home' },
  })
}

/**
 * A required document lapsed and he is no longer approved.
 *
 * Says which one and says the consequence in the same breath, because "your
 * insurance expired" without "you're off the road" is a message a busy man
 * postpones.
 */
export async function notifyDocumentExpired(driverId, types) {
  const driver = await driverFor(driverId)
  if (!driver) return

  const named = types.map(documentLabelOf).join(' and ')
  await send(driver, {
    title: types.length === 1 ? `Your ${named} has expired` : 'Documents have expired',
    body: `You can't take rides until ${types.length === 1 ? 'it is' : 'they are'} renewed. Upload the new copy in the app.`,
    data: { kind: 'document_expired', types: types.join(','), screen: 'documents' },
  })
}

/**
 * A required document lapsed on a car he is NOT currently driving.
 *
 * A different message from the one above because it is a different fact. He is
 * not off the road — the car he is in is fine — and telling him he is would send
 * him to the app to find nothing wrong. But he must hear it now rather than on
 * the morning he switches back and cannot go online, which is the moment it
 * costs him a day's work.
 *
 * Names the plate, since the whole point is that he owns more than one car and
 * "your insurance expired" no longer identifies anything.
 */
export async function notifyParkedCarDocumentExpired(driverId, vehicleNumber, types) {
  const driver = await driverFor(driverId)
  if (!driver) return

  const named = types.map(documentLabelOf).join(' and ')
  const car = vehicleNumber ? ` on ${vehicleNumber}` : ''
  await send(driver, {
    title: `${named} expired${car}`,
    body: "That car can't be used until it's renewed. The one you're driving now isn't affected.",
    data: { kind: 'parked_document_expired', types: types.join(','), screen: 'vehicles' },
  })
}

/**
 * A required document is close to lapsing.
 *
 * The whole reason the replacement slot exists: told early enough, he uploads
 * the renewal while the current one is still valid and never goes off the road
 * at all.
 */
export async function notifyDocumentExpiring(driverId, type, days, vehicleNumber = null) {
  const driver = await driverFor(driverId)
  if (!driver) return

  // The plate only when it distinguishes something — the sweep passes null for a
  // captain with one car, where "your insurance" is already exact. For a man with
  // three, a message that does not name the car sends him to check all of them.
  const car = vehicleNumber ? ` (${vehicleNumber})` : ''

  await send(driver, {
    title: days <= 1
      ? `${documentLabelOf(type)}${car} expires ${days === 1 ? 'tomorrow' : 'today'}`
      : `${documentLabelOf(type)}${car} expires in ${days} days`,
    // The sentence that makes the replacement slot worth having. He is not being
    // told to stop — he is being told he can renew WITHOUT stopping, which is the
    // whole reason to do it now rather than on the day.
    body: 'Upload the renewal now and you can keep driving while we review it.',
    data: { kind: 'document_expiring', type, days: days, screen: 'documents' },
  })
}

/**
 * How many required documents are still not approved. Used to decide whether an
 * approval is "one more to go" or "you're done", so the two messages cannot
 * disagree with the checklist the captain is looking at.
 *
 * @param {string} driverId
 * @param {import('@prisma/client').Prisma.TransactionClient} [tx]
 *   Annotated for the reason recomputeDriverVerification spells out: without it
 *   the default below types the parameter as the full PrismaClient and every
 *   caller inside a transaction fails to compile.
 */
export async function remainingRequired(driverId, tx = prisma) {
  const driver = await tx.driver.findUnique({
    where: { id: driverId },
    select: { activeVehicleId: true },
  })

  const approved = await tx.driverDocument.findMany({
    // Scoped the same way recomputeDriverVerification scopes it — his own two
    // plus the active car's nine. Counting every car's documents would tell a
    // captain with two cars "3 documents still to be approved" when the car he
    // is driving needs none of them.
    where: {
      driverId,
      isReplacement: false,
      status: 'approved',
      OR: [{ vehicleId: null }, { vehicleId: driver?.activeVehicleId ?? null }],
    },
    select: { type: true },
  })
  const done = new Set(approved.map((d) => d.type))
  return REQUIRED_DRIVER_DOCUMENTS.filter((type) => !done.has(type)).length
}
