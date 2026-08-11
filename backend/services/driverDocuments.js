import { prisma } from '../db/prisma.js'
import {
  REQUIRED_DRIVER_DOCUMENTS,
  REQUIRED_VEHICLE_OWNED_DOCUMENTS,
  isVehicleDocument,
} from '../constants/driverDocuments.js'
import { ACTIVE_STATUSES } from '../routes/bookings.js'
import { notifyDocumentExpired, notifyParkedCarDocumentExpired } from './documentNotifications.js'

// The document LIFECYCLE: what a set of documents says about a driver, what
// happens when a renewal is approved, and what happens when one lapses.
//
// Deliberately separate from documentScan.js, which answers a question about a
// FILE. The two are independent gates and stay independent in the code: a
// document can be scan-clean and rejected by an admin, or scan-failed and never
// reviewed at all, and neither state implies anything about the other.
//
// TWO OWNERS. A captain keeps several cars and drives one at a time, so a
// document belongs either to the MAN (his licence, his photograph — uploaded
// once, valid in every car) or to ONE CAR (the other nine, uploaded again per
// car). constants/driverDocuments.js says which is which; everything here reads
// that rather than matching on type names.

/**
 * The value of DriverDocument.ownerId for a row: the car if the type is about a
 * car, the driver if it is about the man.
 *
 * THE ONLY PLACE THIS IS COMPUTED. ownerId is a denormalised column carrying the
 * unique key (see the schema comment for why it cannot simply be a nullable
 * vehicleId), and a row whose ownerId disagrees with its own vehicleId is a row
 * the key has stopped protecting — two current insurance certificates for one
 * car, and nothing anywhere would notice.
 *
 * @param {{ driverId: string, vehicleId?: string | null }} owner
 */
export const ownerIdFor = ({ driverId, vehicleId }) => vehicleId ?? driverId

/**
 * Which vehicle a document of `type` belongs to, given the car the request is
 * about. Null for the two person-owned types, whatever was passed.
 *
 * Passing a vehicle for a licence is not an error worth refusing a whole upload
 * over — it is an app sending its current car along with every document in a
 * mixed batch, which is the natural thing for it to do. It is simply not true of
 * a licence, so it is dropped here rather than argued about at the call site.
 */
export const vehicleIdForType = (type, vehicleId) =>
  isVehicleDocument(type) ? vehicleId ?? null : null

/**
 * The storage prefix a document of this type, for this owner, lives under.
 *
 * Two shapes, because the vehicle documents need the car in the path — without
 * it the RC of the Dzire and the RC of the Innova are the same object key, and
 * the second upload silently overwrites the first.
 *
 *   driver-owned:   {driverId}/{type}/
 *   vehicle-owned:  {driverId}/{vehicleId}/{type}/
 *
 * Still rooted at the driver in both cases, so "everything belonging to this
 * captain" stays one prefix listing in the bucket.
 */
export function uploadPrefix({ driverId, vehicleId, type }) {
  const scoped = vehicleIdForType(type, vehicleId)
  return scoped ? `${driverId}/${scoped}/${type}/` : `${driverId}/${type}/`
}

/**
 * Does this storage path belong to this driver, for this document type and this
 * car?
 *
 * The path is composed server-side by the upload-url endpoint and handed back to
 * the app, which returns it at confirm time. By then it has been round-tripped
 * through a client, so it is a claim again — a caller who names another driver's
 * path is claiming another driver's licence as his own, and a caller who names
 * his OWN other car's path is claiming the Dzire's valid insurance as the
 * Innova's.
 *
 * A named predicate rather than an inline startsWith, because it is a security
 * boundary and a security boundary should be something a test can point at.
 *
 * @param {{ driverId: string, vehicleId?: string | null, type: string }} owner
 * @param {string} path
 */
export function ownsUploadPath(owner, path) {
  // Every segment, not just the driver. Without the type, a driver could confirm
  // the object he uploaded as his car photo against his insurance slot, and the
  // scan would clear it — a photograph of a bumper is a perfectly valid JPEG.
  // Without the vehicle, he could confirm one car's paperwork against another's.
  const prefix = uploadPrefix(owner)
  if (!path.startsWith(prefix)) return false

  // Nothing may climb back out of the prefix it just matched. Storage normalises
  // paths, so `driverId/type/../../other/rc/x.jpg` starts with the right prefix
  // and resolves somewhere else entirely.
  const rest = path.slice(prefix.length)
  return rest.length > 0 && !rest.includes('/') && !rest.includes('..')
}

/**
 * What a set of current documents adds up to, against the types that set is
 * required to contain. Pure — no database, no writes.
 *
 * Extracted because it is applied twice against different inputs: to a car's
 * nine documents to produce Vehicle.verificationStatus, and to the man's two
 * plus his active car's nine to produce Driver.verificationStatus. Two copies of
 * this ladder would eventually disagree about what `scanning` means, and the
 * disagreement would show up as a captain whose car says approved and whose
 * account says pending.
 *
 * @param {Array<{ type: string, status: string, scanStatus: string, expiresAt: Date | null }>} documents
 * @param {readonly string[]} requiredTypes
 */
export function verdictFor(documents, requiredTypes, now = new Date()) {
  const byType = new Map(documents.map((d) => [d.type, d]))
  const held = requiredTypes.map((type) => byType.get(type)).filter(Boolean)

  // Something is wrong and it is HIS to fix: an admin refused a document, or the
  // file check could not clear one. Both are collapsed into `rejected` because
  // from where he is standing they are the same instruction — open the
  // checklist, look at the row that is red, send that one again. Which of the
  // two it was is on the row itself, in the admin's own words or the one generic
  // line the scan gets.
  const needsAttention = held.some(
    (d) => d.status === 'rejected' || d.scanStatus === 'failed',
  )

  // Still being examined by the machine. A distinct state because it resolves on
  // its own in seconds and asks nothing of him — a screen that said "waiting for
  // the office" here would have him ringing support about a scan.
  const stillScanning = held.some(
    (d) => d.scanStatus === 'pending' || d.scanStatus === 'scanning',
  )

  const allValid = requiredTypes.every((type) => {
    const document = byType.get(type)
    if (!document || document.status !== 'approved') return false
    // Null expiry means it cannot lapse (the photographs). A date in the past is
    // a document that WAS approved and no longer counts — approval is not
    // permanent, and this is the only place that says so.
    return document.expiresAt === null || document.expiresAt > now
  })

  // Ordered by which answer is most useful to the captain, not by severity.
  // `rejected` first because it is the only one that asks him to do something
  // specific; `approved` next because it is the only one that opens the app;
  // then the three flavours of waiting, distinguished so the screen can tell him
  // what it is actually waiting FOR rather than showing one spinner for four
  // different situations.
  return (
    needsAttention ? 'rejected'
      : allValid ? 'approved'
        : held.length === 0 ? 'notUploaded'
          : held.length < requiredTypes.length ? 'uploading'
            : stillScanning ? 'scanning'
              : 'pending'
  )
}

/**
 * Recompute and store what ONE CAR's paperwork adds up to.
 *
 * Only the nine vehicle-owned types, and only this car's copies of them. The
 * captain's licence is not this car's business: a lapsed licence stops him
 * driving anything, and recording that against each of his cars in turn would
 * make every one of them look broken.
 *
 * Writes nothing but Vehicle.verificationStatus. It cannot take anybody offline
 * — that is a fact about a driver, and only recomputeDriverVerification below
 * knows whether this is the car he is actually in.
 *
 * @param {string} vehicleId
 * @param {import('@prisma/client').Prisma.TransactionClient} [tx]
 */
export async function recomputeVehicleVerification(vehicleId, tx = prisma) {
  const documents = await tx.driverDocument.findMany({
    where: { vehicleId, isReplacement: false },
    select: { type: true, status: true, scanStatus: true, expiresAt: true },
  })

  const verificationStatus = verdictFor(documents, REQUIRED_VEHICLE_OWNED_DOCUMENTS)

  const vehicle = await tx.vehicle.findUnique({
    where: { id: vehicleId },
    select: { verificationStatus: true },
  })
  if (!vehicle) return null

  if (vehicle.verificationStatus !== verificationStatus) {
    await tx.vehicle.update({ where: { id: vehicleId }, data: { verificationStatus } })
  }

  return verificationStatus
}

/**
 * Recompute and store what this driver's paperwork adds up to.
 *
 * The rule, unchanged from what the schema already implied:
 *
 *   approved  — every required type has a CURRENT row that is approved and
 *               either never expires or has not yet expired
 *   rejected  — any required type has a current row an admin rejected
 *   pending   — anything else: missing, uploaded but unreviewed, scan not clean
 *
 * Note what is NOT in that list. A document being scan-clean does not approve
 * it; a document being uploaded does not approve it. Files passing the security
 * checks is a precondition for review, not a substitute for it.
 *
 * WHICH DOCUMENTS COUNT: his own two, plus the nine belonging to the car named
 * by activeVehicleId. Nothing from any other car he owns. A captain out in the
 * Dzire is not stopped by the Innova's lapsed fitness certificate — that verdict
 * lives on the Innova's own row, and he meets it again the moment he switches
 * back, because switching recomputes this.
 *
 * A captain with no active car can never be `approved`: the nine required
 * vehicle types are unheld, so this lands on `notUploaded` or `uploading`, which
 * is exactly the state he is in.
 *
 * Runs inside the caller's transaction. It must: an approval that lands but
 * whose recomputed verification does not is a driver an admin believes is
 * cleared and dispatch believes is not.
 *
 * @param {string} driverId
 * @param {import('@prisma/client').Prisma.TransactionClient} [tx]
 *   The interactive-transaction client, which is PrismaClient minus $connect,
 *   $disconnect, $on, $use and $extends. Annotated rather than inferred: without
 *   this the default value below types the parameter as the full PrismaClient,
 *   and every caller that actually passes a `tx` fails to compile.
 */
export async function recomputeDriverVerification(driverId, tx = prisma) {
  const driver = await tx.driver.findUnique({
    where: { id: driverId },
    select: { verificationStatus: true, isOnline: true, activeVehicleId: true },
  })
  if (!driver) return null

  const documents = await tx.driverDocument.findMany({
    // Current rows only. A pending replacement is by definition not the document
    // in force, and counting it would let an unreviewed renewal drag down a
    // driver whose existing certificate is perfectly valid.
    //
    // And scoped to the car he is in. `vehicleId: null` picks up his licence and
    // his photograph; the second arm picks up the active car's nine. When he has
    // no active car the two arms coincide and only the personal documents match,
    // which is the correct answer rather than a special case.
    where: {
      driverId,
      isReplacement: false,
      OR: [{ vehicleId: null }, { vehicleId: driver.activeVehicleId }],
    },
    select: { type: true, status: true, scanStatus: true, expiresAt: true },
  })

  const verificationStatus = verdictFor(documents, REQUIRED_DRIVER_DOCUMENTS)

  // Going offline is part of the same write, not a follow-up. A driver whose
  // insurance lapsed at midnight is not allowed to stay online purely because he
  // was already online when it happened — the online flag is a claim to be
  // dispatchable, and he no longer is.
  //
  // EXCEPT WITH A RIDE IN PROGRESS. Flipping the flag mid-ride does not undo the
  // ride: the booking stays assigned, the rider is in the car, and all it
  // achieves is a captain watching his own app tell him he is offline while he
  // is driving somebody. Worse, it is the moment he is least able to do anything
  // about it. So the offline is DEFERRED, not skipped — the ride he is on
  // finishes, and he is taken off the road before the next one.
  //
  // Two things close that gap, deliberately both:
  //   - routes/driver.ts recomputes when a ride reaches a terminal state, which
  //     is what makes it happen immediately in the ordinary case;
  //   - the hourly sweep recomputes anyway, which is what makes it happen at all
  //     if a ride ends by a path that forgets to call this.
  //
  // He cannot pick up a NEW ride in the meantime regardless: every assignment
  // path goes through requireApprovedDriver or the `verificationStatus:
  // 'approved'` filter in driverAssignment, and the status written just below is
  // no longer approved.
  let forceOffline = verificationStatus !== 'approved' && driver.isOnline
  let deferred = false

  if (forceOffline) {
    // Counted only when it would change something. On the overwhelmingly common
    // path — an approved driver still approved — this query never runs.
    const active = await tx.booking.count({
      where: { driverId, status: { in: ACTIVE_STATUSES } },
    })
    if (active > 0) {
      forceOffline = false
      deferred = true
    }
  }

  if (verificationStatus === driver.verificationStatus && !forceOffline) {
    if (deferred) {
      console.log(`driverDocuments: ${driverId} is ${verificationStatus} but mid-ride — staying online until the ride ends`)
    }
    return verificationStatus
  }

  await tx.driver.update({
    where: { id: driverId },
    data: {
      verificationStatus,
      ...(forceOffline ? { isOnline: false } : {}),
    },
  })

  if (forceOffline) {
    console.log(`driverDocuments: ${driverId} forced offline — verification is now ${verificationStatus}`)
  }
  if (deferred) {
    console.log(`driverDocuments: ${driverId} is ${verificationStatus} but mid-ride — staying online until the ride ends`)
  }

  return verificationStatus
}

/**
 * The one call every write path makes after touching a document: settle the car
 * it belonged to, then settle the man.
 *
 * In that order, and both, because the two answer different questions and only
 * one of them can take somebody off the road. Recomputing the driver alone
 * leaves an admin looking at a car whose badge still says `pending` after he
 * approved its last certificate; recomputing the car alone leaves dispatch
 * working from a stale verdict.
 *
 * Cheap when it changes nothing — both halves compare before they write.
 *
 * @param {{ driverId: string, vehicleId?: string | null }} owner
 * @param {import('@prisma/client').Prisma.TransactionClient} [tx]
 */
export async function recomputeAfterDocumentChange({ driverId, vehicleId }, tx = prisma) {
  if (vehicleId) await recomputeVehicleVerification(vehicleId, tx)
  return recomputeDriverVerification(driverId, tx)
}

/**
 * Which slot a new upload of `type` belongs in.
 *
 * A renewal goes into the replacement slot ONLY when there is something worth
 * protecting: a current row that is approved and still valid. In every other
 * case — nothing on file, or a current row that is pending, rejected or already
 * expired — the upload replaces the current row directly, because there is no
 * approval to preserve and routing it to the replacement slot would leave the
 * driver stuck behind a document that can never be promoted.
 *
 * Keyed by OWNER, not by driver: renewing the Innova's insurance must not look
 * at the Dzire's.
 *
 * @param {string} ownerId
 * @param {import('@prisma/client').DriverDocumentType} type
 * @param {import('@prisma/client').Prisma.TransactionClient} [tx]
 */
export async function slotForUpload(ownerId, type, tx = prisma) {
  const current = await tx.driverDocument.findUnique({
    where: { ownerId_type_isReplacement: { ownerId, type, isReplacement: false } },
    select: { status: true, expiresAt: true },
  })

  const worthProtecting =
    current?.status === 'approved' &&
    (current.expiresAt === null || current.expiresAt > new Date())

  return { isReplacement: Boolean(worthProtecting) }
}

/**
 * Promote an approved replacement to be the document in force.
 *
 * The old row is copied into DriverDocumentArchive and deleted, then the
 * replacement flips to `isReplacement: false`. Both inside one transaction and
 * in that order, because the unique key is (ownerId, type, isReplacement) —
 * flipping first would collide with the row still sitting in the current slot.
 *
 * THE OLD STORAGE OBJECT IS NOT DELETED. The archive row points at it, and an
 * archive that points at nothing answers none of the questions it exists for:
 * which certificate was in force on the day of a ride, what an admin actually
 * approved. Storage is the cheapest part of this system.
 */
export async function promoteReplacement(replacement, tx) {
  const { ownerId, type } = replacement

  const current = await tx.driverDocument.findUnique({
    where: { ownerId_type_isReplacement: { ownerId, type, isReplacement: false } },
  })

  if (current) {
    await tx.driverDocumentArchive.create({
      data: {
        documentId: current.id,
        driverId: current.driverId,
        // Carried across so the history of a car stays attributable to that car
        // after it has been sold and its Vehicle row deleted.
        vehicleId: current.vehicleId,
        type: current.type,
        fileUrl: current.fileUrl,
        fileHash: current.fileHash,
        number: current.number,
        expiresAt: current.expiresAt,
        status: current.status,
        rejectionReason: current.rejectionReason,
        reviewedAt: current.reviewedAt,
        uploadedAt: current.uploadedAt,
        replacedById: replacement.id,
      },
    })
    await tx.driverDocument.delete({ where: { id: current.id } })
  }

  return tx.driverDocument.update({
    where: { id: replacement.id },
    data: { isReplacement: false },
  })
}

// How far ahead the driver app warns. Also what GET /driver/me counts.
export const DOCUMENT_WARNING_DAYS = 30

/**
 * The lapse sweep. Finds every document that has expired since the last run and
 * recomputes what it belonged to — which is what takes a driver offline, since
 * recomputeDriverVerification owns that rule.
 *
 * Deliberately recomputes rather than flipping a flag directly: expiry is only
 * one of the ways a driver stops being approved, and having two places that can
 * set verificationStatus is how the two eventually disagree.
 *
 * A LAPSE ON A PARKED CAR IS NOT SILENT. It changes nothing about the driver —
 * the recompute only reads the car he is in — so the "you are off the road"
 * notification correctly does not fire. But he still has to hear about it, or he
 * discovers it on the morning he switches cars, which is the worst possible
 * moment. It gets its own quieter message instead.
 */
export async function sweepExpiredDocuments() {
  const now = new Date()

  // Reads the indexed expiresAt across all drivers and returns the handful of
  // rows that lapsed. Required types only, on both sides of the split: an
  // optional CNG certificate running out cannot take anybody off the road, so
  // waking a captain at 3am about one would be a notification he learns to
  // ignore before the one that matters arrives.
  const lapsed = await prisma.driverDocument.findMany({
    where: {
      isReplacement: false,
      status: 'approved',
      expiresAt: { not: null, lt: now },
      type: { in: REQUIRED_DRIVER_DOCUMENTS },
    },
    select: { driverId: true, vehicleId: true, type: true },
  })

  if (!lapsed.length) return 0

  // Grouped by driver, because one driver with three expired documents is one
  // driver to recompute — but the vehicles are kept alongside, since each of his
  // cars carrying a lapsed certificate needs its own badge put right.
  const byDriver = new Map()
  for (const { driverId, vehicleId, type } of lapsed) {
    const entry = byDriver.get(driverId) ?? { types: [], vehicleIds: new Set(), byVehicle: new Map() }
    entry.types.push(type)
    if (vehicleId) {
      entry.vehicleIds.add(vehicleId)
      entry.byVehicle.set(vehicleId, [...(entry.byVehicle.get(vehicleId) ?? []), type])
    } else {
      entry.byVehicle.set(null, [...(entry.byVehicle.get(null) ?? []), type])
    }
    byDriver.set(driverId, entry)
  }

  let changed = 0
  for (const [driverId, { vehicleIds, byVehicle }] of byDriver) {
    try {
      // What he was BEFORE, and WHICH CAR he is in, so the notification fires on
      // the transition and not on every sweep. This job runs hourly; a driver
      // whose insurance ran out last week must not be told about it twenty-four
      // times a day.
      const before = await prisma.driver.findUnique({
        where: { id: driverId },
        select: { verificationStatus: true, activeVehicleId: true },
      })

      // The same question for each car, and for the same reason: a parked car
      // whose fitness certificate lapsed a fortnight ago is already `rejected`,
      // and re-announcing it every hour is how a captain learns to swipe these
      // away.
      const vehiclesBefore = new Map(
        (await prisma.vehicle.findMany({
          where: { id: { in: [...vehicleIds] } },
          select: { id: true, verificationStatus: true, number: true },
        })).map((v) => [v.id, v]),
      )

      // One transaction per driver rather than one for the lot: a failure on the
      // fourth driver should not roll back the three already put right, and
      // these are independent decisions about independent people.
      const after = await prisma.$transaction(async (tx) => {
        for (const vehicleId of vehicleIds) await recomputeVehicleVerification(vehicleId, tx)
        return recomputeDriverVerification(driverId, tx)
      })

      // The documents that stopped him driving: his own, plus the ones on the car
      // he is actually in. Everything else belongs to a car in his yard.
      const blocking = [
        ...(byVehicle.get(null) ?? []),
        ...(before?.activeVehicleId ? byVehicle.get(before.activeVehicleId) ?? [] : []),
      ]

      if (before?.verificationStatus === 'approved' && after !== 'approved' && blocking.length) {
        await notifyDocumentExpired(driverId, blocking)
        changed += 1
      }

      // Told once, on the transition, for each parked car — and only for a car
      // that WAS approved, so this never fires for one he is still onboarding.
      for (const [vehicleId, types] of byVehicle) {
        if (!vehicleId || vehicleId === before?.activeVehicleId) continue
        const wasApproved = vehiclesBefore.get(vehicleId)?.verificationStatus === 'approved'
        if (!wasApproved) continue
        await notifyParkedCarDocumentExpired(driverId, vehiclesBefore.get(vehicleId)?.number ?? null, types)
      }
    } catch (err) {
      console.error(`driverDocuments: could not recompute ${driverId}:`, err.message)
    }
  }

  if (changed) console.log(`driverDocuments: ${changed} driver(s) taken off the road by lapsed documents`)
  return changed
}

// Hourly, not nightly. A document expires on a date, but "expired" has to become
// true at some point during that day — a nightly job at 02:00 leaves a driver
// carrying a lapsed certificate for up to a day, and the cost of checking is one
// indexed query against a table this small.
const EXPIRY_SWEEP_INTERVAL_MS = 60 * 60 * 1000

export function startDocumentExpiryJob() {
  const run = () => {
    sweepExpiredDocuments().catch((err) =>
      console.error('driverDocuments expiry sweep:', err.message),
    )
  }

  run()
  const timer = setInterval(run, EXPIRY_SWEEP_INTERVAL_MS)
  timer.unref?.()
}
