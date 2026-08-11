import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { prisma } from '../db/prisma.js'
import { claimDocument } from '../services/documentScan.js'
import {
  ownerIdFor,
  promoteReplacement,
  recomputeDriverVerification,
  sweepExpiredDocuments,
  uploadPrefix,
  vehicleIdForType,
} from '../services/driverDocuments.js'
import { REQUIRED_DRIVER_DOCUMENTS, EXPIRING_DRIVER_DOCUMENTS } from '../constants/driverDocuments.js'

// The behaviours that only Postgres can settle: the atomic scan claim, the
// two-rows-per-type unique key, the retry window, and the expiry sweep.
//
// GATED, AND DELIBERATELY SO. These write to whatever DATABASE_URL points at,
// and for this project that is the live Supabase instance. Run them with:
//
//   RUN_DB_TESTS=1 npm test
//
// Everything they create is namespaced to one throwaway driver whose clerkId
// carries a recognisable prefix, and the driver is deleted afterwards — the
// documents go with it on the cascade. Nothing here touches a row it did not
// make. They are still skipped by default, because "it only deletes its own
// rows" is a promise about code and the database is not a place to find out the
// promise was wrong.

const ENABLED = process.env.RUN_DB_TESTS === '1'
const CLERK_PREFIX = 'test_documents_'

let driverId = null
// The throwaway driver's one car. Every vehicle-owned document below hangs off
// it, because the unique key is (ownerId, type, isReplacement) and ownerId is
// the CAR for those types — writing them with ownerId = driverId would put them
// in a slot nothing reads.
let vehicleId = null

const future = (days) => new Date(Date.now() + days * 86_400_000)
const past = (days) => new Date(Date.now() - days * 86_400_000)

// Routed by owner through the same helpers the routes use, rather than
// hardcoded: a car document belongs to the vehicle and a licence to the man, and
// writing one of them into the other's slot would put the row somewhere nothing
// reads while every assertion below still passed.
const makeDocument = (type, overrides = {}) => {
  const owner = { driverId, vehicleId: vehicleIdForType(type, vehicleId) }
  return prisma.driverDocument.create({
    data: {
      driverId,
      vehicleId: owner.vehicleId,
      ownerId: ownerIdFor(owner),
      type,
      fileUrl: `${uploadPrefix({ ...owner, type })}${randomUUID()}.jpg`,
      ...overrides,
    },
  })
}

/** The current row for a type, addressed the way the schema keys it. */
const currentDocument = (type) => prisma.driverDocument.findUnique({
  where: {
    ownerId_type_isReplacement: {
      ownerId: ownerIdFor({ driverId, vehicleId: vehicleIdForType(type, vehicleId) }),
      type,
      isReplacement: false,
    },
  },
})

before(async () => {
  if (!ENABLED) return

  const driver = await prisma.driver.create({
    data: {
      clerkId: `${CLERK_PREFIX}${randomUUID()}`,
      name: 'Test Captain',
      phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
      vehicleClass: 'sedan',
      vehicleCapacity: 4,
      vehicleNumber: `TEST${Math.floor(Math.random() * 9999)}`,
      vehicleModel: 'Test Model',
    },
  })
  driverId = driver.id

  const vehicle = await prisma.vehicle.create({
    data: {
      driverId,
      class: 'sedan',
      number: driver.vehicleNumber,
      model: 'Test Model',
    },
  })
  vehicleId = vehicle.id

  // Active, so recomputeDriverVerification counts this car's documents. Without
  // it the driver has no active vehicle and every verification assertion below
  // reads `uploading` regardless of what the rows say.
  await prisma.driver.update({
    where: { id: driverId },
    data: { activeVehicleId: vehicleId },
  })
})

after(async () => {
  if (!ENABLED || !driverId) return
  // Documents and archive rows cascade off the driver.
  await prisma.driver.delete({ where: { id: driverId } }).catch(() => { })
  await prisma.$disconnect()
})

describe('scanner claiming', { skip: !ENABLED && 'set RUN_DB_TESTS=1 to run' }, () => {
  // THE test for the concurrency story. Two workers reach the same row at the
  // same instant; the claim is one conditional UPDATE, so Postgres serialises
  // them and exactly one comes back with a row.
  test('only one of two simultaneous workers claims a document', async () => {
    const document = await makeDocument('dl')

    const [a, b] = await Promise.all([
      claimDocument(document.id),
      claimDocument(document.id),
    ])

    const winners = [a, b].filter(Boolean)
    assert.equal(winners.length, 1, 'exactly one worker may own a scan')
    assert.equal(winners[0].id, document.id)

    const after = await prisma.driverDocument.findUnique({ where: { id: document.id } })
    assert.equal(after.scanStatus, 'scanning')
    assert.ok(after.scanStartedAt, 'and it stamps when the claim was taken')
  })

  test('ten simultaneous workers still produce exactly one claim', async () => {
    const document = await makeDocument('rc')

    const claims = await Promise.all(
      Array.from({ length: 10 }, () => claimDocument(document.id)),
    )

    assert.equal(claims.filter(Boolean).length, 1)
  })

  test('a document already scanning cannot be claimed again', async () => {
    const document = await makeDocument('tax', {
      scanStatus: 'scanning',
      scanStartedAt: new Date(),
    })
    assert.equal(await claimDocument(document.id), null)
  })

  test('a clean document is never re-claimed', async () => {
    const document = await makeDocument('fitness', { scanStatus: 'clean', scannedAt: new Date() })
    assert.equal(await claimDocument(document.id), null)
    assert.equal(await claimDocument(document.id, { allowStale: true }), null)
  })

  // A worker that died mid-scan. Recognised by age, because there is nothing to
  // ask — the process is gone.
  test('a scan abandoned mid-flight is reclaimed by the sweep', async () => {
    const fresh = await makeDocument('permit_all_india', {
      scanStatus: 'scanning',
      scanStartedAt: new Date(),
    })
    assert.equal(await claimDocument(fresh.id, { allowStale: true }), null, 'not while it may still be running')

    const abandoned = await makeDocument('permit_one_year', {
      scanStatus: 'scanning',
      scanStartedAt: past(1),
    })
    assert.ok(await claimDocument(abandoned.id, { allowStale: true }), 'but yes once it is clearly dead')
  })
})

describe('scanner retry window', { skip: !ENABLED && 'set RUN_DB_TESTS=1 to run' }, () => {
  test('a recent failure is retried', async () => {
    const document = await makeDocument('cng_test', {
      scanStatus: 'failed',
      scanReason: 'object missing from storage',
      uploadedAt: new Date(),
      scannedAt: past(1),
    })
    assert.ok(await claimDocument(document.id, { allowStale: true }))
  })

  // The bound that stops the sweep being a perpetual motion machine over a row
  // whose object was deleted from the bucket.
  test('a failure older than the retry window is left alone', async () => {
    const document = await makeDocument('car_photo_front', {
      scanStatus: 'failed',
      scanReason: 'object missing from storage',
      uploadedAt: past(2),
      scannedAt: past(2),
    })
    assert.equal(await claimDocument(document.id, { allowStale: true }), null)

    const after = await prisma.driverDocument.findUnique({ where: { id: document.id } })
    assert.equal(after.scanStatus, 'failed', 'and it KEEPS failed rather than being promoted')
  })

  test('a failure retried moments ago is not retried again immediately', async () => {
    const document = await makeDocument('car_photo_back', {
      scanStatus: 'failed',
      uploadedAt: new Date(),
      scannedAt: new Date(),
    })
    assert.equal(await claimDocument(document.id, { allowStale: true }), null)
  })
})

describe('renewal', { skip: !ENABLED && 'set RUN_DB_TESTS=1 to run' }, () => {
  test('an approved document and its renewal coexist', async () => {
    const type = 'insurance'
    const current = await makeDocument(type, {
      status: 'approved',
      scanStatus: 'clean',
      expiresAt: future(20),
      number: 'POL-CURRENT',
    })
    const replacement = await makeDocument(type, {
      isReplacement: true,
      expiresAt: future(400),
      number: 'POL-NEXT',
    })

    const rows = await prisma.driverDocument.findMany({ where: { driverId, type } })
    assert.equal(rows.length, 2)
    assert.equal(rows.filter((r) => !r.isReplacement).length, 1)

    // The old certificate is still the one in force, so the driver is unaffected
    // by having sent the new one early. This is the whole point.
    const still = await currentDocument(type)
    assert.equal(still.status, 'approved')
    assert.equal(still.id, current.id)

    // And a THIRD is refused by the unique key — a driver cannot queue a stack.
    await assert.rejects(() => makeDocument(type, { isReplacement: true }))

    // Promotion archives the old row and flips the new one in.
    await prisma.$transaction(async (tx) => {
      await tx.driverDocument.update({
        where: { id: replacement.id },
        data: { status: 'approved', scanStatus: 'clean', reviewedAt: new Date() },
      })
      await promoteReplacement(
        await tx.driverDocument.findUnique({ where: { id: replacement.id } }),
        tx,
      )
    })

    const promoted = await currentDocument(type)
    assert.equal(promoted.id, replacement.id)
    assert.equal(promoted.number, 'POL-NEXT')

    assert.equal(await prisma.driverDocument.findUnique({ where: { id: current.id } }), null)

    const archived = await prisma.driverDocumentArchive.findFirst({
      where: { driverId, documentId: current.id },
    })
    assert.ok(archived, 'the old certificate is kept')
    assert.equal(archived.replacedById, replacement.id)
    assert.equal(archived.number, 'POL-CURRENT')
  })
})

describe('duplicate detection', { skip: !ENABLED && 'set RUN_DB_TESTS=1 to run' }, () => {
  // The hash is an audit aid, not a control — nothing rejects on it. What it has
  // to do is make the question answerable in one indexed query.
  test('the same file under two types is findable by hash', async () => {
    const hash = 'f'.repeat(64)
    await prisma.driverDocument.updateMany({
      where: { driverId, type: { in: ['car_photo_front', 'car_photo_back'] } },
      data: { fileHash: hash },
    })

    const duplicates = await prisma.driverDocument.findMany({ where: { driverId, fileHash: hash } })
    assert.ok(duplicates.length >= 2, 'the same photograph sent twice is visible')
  })
})

describe('expiry', { skip: !ENABLED && 'set RUN_DB_TESTS=1 to run' }, () => {
  test('a lapsed required document takes an online driver offline', async () => {
    // Put the driver in the state the sweep is supposed to catch: approved,
    // online, and holding one required certificate that ran out yesterday.
    await prisma.driverDocument.deleteMany({ where: { driverId } })

    // Every REQUIRED type, from the constants file rather than a list written
    // out here — a hand-written set that quietly omits one (the profile photo
    // was added later, and did exactly this) leaves the driver unapprovable, and
    // then "he is not approved after the sweep" passes for the wrong reason.
    for (const type of REQUIRED_DRIVER_DOCUMENTS) {
      await makeDocument(type, {
        status: 'approved',
        scanStatus: 'clean',
        expiresAt: !EXPIRING_DRIVER_DOCUMENTS.includes(type) ? null
          : type === 'insurance' ? past(1)
            : future(200),
      })
    }

    await prisma.driver.update({
      where: { id: driverId },
      data: { verificationStatus: 'approved', isOnline: true },
    })

    await sweepExpiredDocuments()

    const after = await prisma.driver.findUnique({ where: { id: driverId } })
    assert.notEqual(after.verificationStatus, 'approved')
    assert.equal(after.isOnline, false, 'lapsed insurance must not leave him dispatchable')
  })

  test('renewing the lapsed document brings him back', async () => {
    await prisma.driverDocument.update({
      where: { id: (await currentDocument('insurance')).id },
      data: { expiresAt: future(365), status: 'approved', scanStatus: 'clean' },
    })

    await prisma.$transaction((tx) => recomputeDriverVerification(driverId, tx))

    const after = await prisma.driver.findUnique({ where: { id: driverId } })
    assert.equal(after.verificationStatus, 'approved')
    // Still offline: coming back into compliance does not put a captain back on
    // the road behind his back. He goes online himself.
    assert.equal(after.isOnline, false)
  })
})
