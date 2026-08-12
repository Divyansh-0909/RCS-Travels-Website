import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  ownerIdFor,
  ownsUploadPath,
  recomputeDriverVerification,
  recomputeVehicleVerification,
  slotForUpload,
  promoteReplacement,
  uploadPrefix,
  vehicleIdForType,
} from '../services/driverDocuments.js'
import {
  DRIVER_DOCUMENT_TYPES,
  REQUIRED_DRIVER_DOCUMENTS,
  EXPIRING_DRIVER_DOCUMENTS,
  VEHICLE_OWNED_DOCUMENTS,
  isVehicleDocument,
} from '../constants/driverDocuments.js'
import { signedDocumentUrl } from '../services/documentScan.js'
import { UploadUrlRequest, ConfirmDocumentsRequest, reviewDocumentSchema } from '../types.ts'

// The POLICY around a document, as opposed to the checks on the file itself.
//
// All of it runs against a stand-in for the Prisma transaction client rather
// than a database. That is not a compromise — these functions take `tx` as a
// parameter precisely so the rules can be exercised without one, and the rules
// are the part that decides whether a driver is allowed on the road. The
// behaviours that genuinely need Postgres (the atomic scan claim, the unique
// key) are in documentConcurrency.test.js and are gated behind an env var.

const DRIVER = '11111111-1111-4111-8111-111111111111'
// The car he is driving, and the one parked at home. A captain owns several and
// drives one at a time, and almost every rule below is about which of the two a
// given document is allowed to speak for.
const CAR = '33333333-3333-4333-8333-333333333333'
const OTHER_CAR = '44444444-4444-4444-8444-444444444444'

const future = (days) => new Date(Date.now() + days * 86_400_000)
const past = (days) => new Date(Date.now() - days * 86_400_000)

/**
 * Every required type, scan-clean, approved and not expiring. The baseline.
 *
 * The nine car documents are attributed to `vehicleId`; his licence and his
 * photograph carry null, the same way the rows do.
 */
const fullSet = (vehicleId = CAR) => REQUIRED_DRIVER_DOCUMENTS.map((type) => ({
  type,
  vehicleId: isVehicleDocument(type) ? vehicleId : null,
  status: 'approved',
  scanStatus: 'clean',
  // The three photographs cannot lapse; everything with an issuing authority can.
  expiresAt: EXPIRING_DRIVER_DOCUMENTS.includes(type) ? future(200) : null,
}))

// The `OR: [{ vehicleId: null }, { vehicleId: active }]` the recompute filters
// with, applied to fixtures. Written out rather than approximated because the
// scoping IS the rule under test: get it wrong here and every multi-car
// assertion below passes for the wrong reason.
function matchesWhere(document, where) {
  if (where.isReplacement !== undefined && Boolean(document.isReplacement) !== where.isReplacement) return false
  if (where.vehicleId !== undefined && (document.vehicleId ?? null) !== where.vehicleId) return false
  if (where.OR) {
    const ok = where.OR.some((arm) => (document.vehicleId ?? null) === (arm.vehicleId ?? null))
    if (!ok) return false
  }
  return true
}

function fakeTx({ documents = [], driver = {}, vehicle = {}, activeRides = 0 }) {
  const state = {
    driver: { verificationStatus: 'pending', isOnline: false, activeVehicleId: CAR, ...driver },
    vehicle: { verificationStatus: 'notUploaded', ...vehicle },
    updates: [],
    vehicleUpdates: [],
    archived: [],
    deleted: [],
    promoted: [],
    bookingCounts: 0,
  }

  return {
    state,
    driverDocument: {
      // `isReplacement` defaults to false in the schema, so a fixture that omits
      // it is a current document — the same way a row written without it is.
      findMany: async ({ where }) => documents.filter((d) => matchesWhere(d, where)),
      findUnique: async ({ where }) => {
        const { ownerId, type, isReplacement } = where.ownerId_type_isReplacement ?? {}
        return documents.find((d) =>
          d.type === type
          && Boolean(d.isReplacement) === isReplacement
          && ownerIdFor({ driverId: DRIVER, vehicleId: d.vehicleId }) === ownerId) ?? null
      },
      delete: async ({ where }) => { state.deleted.push(where.id) },
      update: async ({ where, data }) => { state.promoted.push({ id: where.id, ...data }); return { ...data, id: where.id } },
    },
    driverDocumentArchive: {
      create: async ({ data }) => { state.archived.push(data); return data },
    },
    driver: {
      findUnique: async () => state.driver,
      update: async ({ data }) => { state.updates.push(data); Object.assign(state.driver, data); return state.driver },
    },
    vehicle: {
      findUnique: async () => state.vehicle,
      update: async ({ data }) => { state.vehicleUpdates.push(data); Object.assign(state.vehicle, data); return state.vehicle },
    },
    // Only consulted when the recompute would otherwise force him offline.
    booking: {
      count: async () => { state.bookingCounts += 1; return activeRides },
    },
  }
}

describe('driver verification', () => {
  test('approved only when every required document is approved and unexpired', async () => {
    const tx = fakeTx({ documents: fullSet() })
    assert.equal(await recomputeDriverVerification(DRIVER, tx), 'approved')
  })

  // The rule the brief is most explicit about: uploading is not approval.
  test('uploading every document does not approve the driver', async () => {
    const tx = fakeTx({
      documents: fullSet().map((d) => ({ ...d, status: 'pending' })),
    })
    assert.equal(await recomputeDriverVerification(DRIVER, tx), 'pending')
  })

  // The four flavours of "not approved yet", which used to be one word. Each maps
  // to a different screen, which is the whole reason they are separate.
  test('nothing on file reads as notUploaded', async () => {
    const tx = fakeTx({ documents: [] })
    assert.equal(await recomputeDriverVerification(DRIVER, tx), 'notUploaded')
  })

  test('some required documents missing reads as uploading', async () => {
    const tx = fakeTx({ documents: fullSet().filter((d) => d.type !== 'insurance') })
    assert.equal(await recomputeDriverVerification(DRIVER, tx), 'uploading')
  })

  test('everything in but a file still being checked reads as scanning', async () => {
    const documents = fullSet().map((d) => ({ ...d, status: 'pending' }))
    documents.find((d) => d.type === 'insurance').scanStatus = 'scanning'
    const tx = fakeTx({ documents })
    assert.equal(await recomputeDriverVerification(DRIVER, tx), 'scanning')
  })

  test('everything checked and waiting on the office reads as pending', async () => {
    const tx = fakeTx({ documents: fullSet().map((d) => ({ ...d, status: 'pending' })) })
    assert.equal(await recomputeDriverVerification(DRIVER, tx), 'pending')
  })

  test('one rejected required document makes him rejected', async () => {
    const documents = fullSet()
    documents.find((d) => d.type === 'dl').status = 'rejected'
    const tx = fakeTx({ documents })
    assert.equal(await recomputeDriverVerification(DRIVER, tx), 'rejected')
  })

  // A scan that could not clear a file is collapsed into `rejected` on purpose:
  // from where the captain is standing both mean the same thing — open the
  // checklist and send that one again. Which of the two it was is on the row.
  test('a failed scan also reads as rejected', async () => {
    const documents = fullSet()
    documents.find((d) => d.type === 'profile_photo').scanStatus = 'failed'
    const tx = fakeTx({ documents })
    assert.equal(await recomputeDriverVerification(DRIVER, tx), 'rejected')
  })

  // The captain's photo is required, so it gates approval exactly like the
  // licence does. A rider being shown nobody is not an acceptable outcome.
  test('a missing profile photo alone blocks approval', async () => {
    const tx = fakeTx({ documents: fullSet().filter((d) => d.type !== 'profile_photo') })
    assert.notEqual(await recomputeDriverVerification(DRIVER, tx), 'approved')
  })

  // Approval is not permanent. This is the whole point of storing expiresAt.
  test('an expired required document drops him out of approved', async () => {
    const documents = fullSet()
    documents.find((d) => d.type === 'insurance').expiresAt = past(1)
    const tx = fakeTx({ documents, driver: { verificationStatus: 'approved' } })
    // Everything is on file, scan-clean and reviewed — the only thing wrong is
    // the date, so this is the office's problem to re-approve, not a rejection.
    assert.equal(await recomputeDriverVerification(DRIVER, tx), 'pending')
  })

  test('an expired document forces an idle online driver offline', async () => {
    const documents = fullSet()
    documents.find((d) => d.type === 'insurance').expiresAt = past(1)

    const tx = fakeTx({ documents, driver: { verificationStatus: 'approved', isOnline: true } })
    await recomputeDriverVerification(DRIVER, tx)

    assert.equal(tx.state.driver.isOnline, false, 'must not stay online on lapsed insurance')
    assert.equal(tx.state.updates.at(-1).isOnline, false)
  })

  // The deferral. Flipping the flag mid-ride does not undo the ride — the rider
  // is already in the car — and all it achieves is telling a captain he is
  // offline at the moment he can least act on it.
  test('a driver mid-ride stays online until the ride ends', async () => {
    const documents = fullSet()
    documents.find((d) => d.type === 'insurance').expiresAt = past(1)

    const tx = fakeTx({
      documents,
      driver: { verificationStatus: 'approved', isOnline: true },
      activeRides: 1,
    })
    await recomputeDriverVerification(DRIVER, tx)

    assert.equal(tx.state.driver.isOnline, true, 'the ride in progress finishes')
  })

  // Deferred, not skipped: the verification status still drops, and THAT is what
  // keeps a new ride off him. requireApprovedDriver and driverAssignment both
  // filter on it, so he cannot be offered anything while he finishes.
  test('the deferred driver still loses his approved status immediately', async () => {
    const documents = fullSet()
    documents.find((d) => d.type === 'insurance').expiresAt = past(1)

    const tx = fakeTx({
      documents,
      driver: { verificationStatus: 'approved', isOnline: true },
      activeRides: 1,
    })
    assert.equal(await recomputeDriverVerification(DRIVER, tx), 'pending')
    assert.equal(tx.state.driver.verificationStatus, 'pending')
  })

  // Once the ride ends the deferral is over, and the completion hook in
  // routes/driver.ts re-runs exactly this.
  test('the same driver goes offline once the ride has ended', async () => {
    const documents = fullSet()
    documents.find((d) => d.type === 'insurance').expiresAt = past(1)

    const tx = fakeTx({
      documents,
      driver: { verificationStatus: 'pending', isOnline: true },
      activeRides: 0,
    })
    await recomputeDriverVerification(DRIVER, tx)
    assert.equal(tx.state.driver.isOnline, false)
  })

  // The count is a query, and the overwhelmingly common call is an approved
  // driver who is still approved. It must not run on that path.
  test('the active-ride count is not queried unless it could change something', async () => {
    const tx = fakeTx({ documents: fullSet(), driver: { verificationStatus: 'approved', isOnline: true } })
    await recomputeDriverVerification(DRIVER, tx)
    assert.equal(tx.state.bookingCounts, 0)

    const offline = fakeTx({ documents: fullSet().map((d) => ({ ...d, status: 'pending' })), driver: { isOnline: false } })
    await recomputeDriverVerification(DRIVER, offline)
    assert.equal(offline.state.bookingCounts, 0, 'nor for a driver who is already offline')
  })

  test('an approved driver who is online is left alone', async () => {
    const tx = fakeTx({ documents: fullSet(), driver: { verificationStatus: 'approved', isOnline: true } })
    await recomputeDriverVerification(DRIVER, tx)
    assert.equal(tx.state.driver.isOnline, true)
    assert.equal(tx.state.updates.length, 0, 'nothing changed, so nothing is written')
  })

  // The optional documents exist for cars that need them. Their absence is not a
  // reason to hold anybody up.
  test('the optional types cannot block approval by being absent', async () => {
    const tx = fakeTx({ documents: fullSet() })
    assert.equal(await recomputeDriverVerification(DRIVER, tx), 'approved')
  })

  test('a pending replacement does not drag down the current document', async () => {
    const documents = [
      ...fullSet(),
      { type: 'insurance', vehicleId: CAR, status: 'pending', expiresAt: future(400), isReplacement: true },
    ]
    // findMany filters on isReplacement: false, which is what protects him.
    const tx = fakeTx({ documents })
    assert.equal(await recomputeDriverVerification(DRIVER, tx), 'approved')
  })
})

// THE RULE THE WHOLE MULTI-CAR DESIGN RESTS ON: a captain's status is about him
// and the car he is IN. Everything he owns and is not driving is somebody else's
// problem until he switches to it.
describe('a captain with two cars', () => {
  test("a rejected document on the parked car does not reject the driver", async () => {
    const documents = [
      ...fullSet(CAR),
      // The Innova in his yard, with a fitness certificate the office refused.
      { type: 'fitness', vehicleId: OTHER_CAR, status: 'rejected', scanStatus: 'clean', expiresAt: future(100) },
    ]
    const tx = fakeTx({ documents, driver: { activeVehicleId: CAR } })
    assert.equal(await recomputeDriverVerification(DRIVER, tx), 'approved')
  })

  test('a lapsed document on the parked car does not take him off the road', async () => {
    const documents = [
      ...fullSet(CAR),
      { type: 'insurance', vehicleId: OTHER_CAR, status: 'approved', scanStatus: 'clean', expiresAt: past(1) },
    ]
    const tx = fakeTx({
      documents,
      driver: { activeVehicleId: CAR, verificationStatus: 'approved', isOnline: true },
    })

    assert.equal(await recomputeDriverVerification(DRIVER, tx), 'approved')
    assert.equal(tx.state.driver.isOnline, true, 'the car he is driving is perfectly legal')
  })

  // The same fixture, read from the other car. This is what a switch does, and
  // the pair is the point: one set of rows, two answers, decided by activeVehicleId.
  test('switching to that car is what makes its paperwork his problem', async () => {
    const documents = [
      ...fullSet(CAR),
      { type: 'fitness', vehicleId: OTHER_CAR, status: 'rejected', scanStatus: 'clean', expiresAt: future(100) },
    ]
    const tx = fakeTx({ documents, driver: { activeVehicleId: OTHER_CAR } })

    // Not merely "not approved" — `rejected`, because the one document the other
    // car holds was refused, and every other required type is simply absent.
    assert.equal(await recomputeDriverVerification(DRIVER, tx), 'rejected')
  })

  test('a car with none of its own papers leaves him uploading, not approved', async () => {
    const tx = fakeTx({ documents: fullSet(CAR), driver: { activeVehicleId: OTHER_CAR } })
    // His licence and photo are on file and count for every car; the nine that
    // belong to this one are not.
    assert.equal(await recomputeDriverVerification(DRIVER, tx), 'uploading')
  })

  // A captain who has signed up but not added a car cannot be approved, because
  // the nine vehicle types are unheld by construction. No special case for it.
  test('a captain with no car at all can never be approved', async () => {
    const personalOnly = fullSet(CAR).filter((d) => d.vehicleId === null)
    const tx = fakeTx({ documents: personalOnly, driver: { activeVehicleId: null } })
    assert.equal(await recomputeDriverVerification(DRIVER, tx), 'uploading')
  })
})

describe('a car has its own verdict', () => {
  test('approved when its own required documents are approved and unexpired', async () => {
    const tx = fakeTx({ documents: fullSet(CAR) })
    assert.equal(await recomputeVehicleVerification(CAR, tx), 'approved')
  })

  // The licence is the man's, not the car's. Counting it here would make every
  // one of his cars look broken the day his licence lapses.
  test("the driver's own documents are not the car's business", async () => {
    const carPapersOnly = fullSet(CAR).filter((d) => d.vehicleId === CAR)
    const tx = fakeTx({ documents: carPapersOnly })
    assert.equal(await recomputeVehicleVerification(CAR, tx), 'approved')
  })

  test('a rejected certificate on this car makes this car rejected', async () => {
    const documents = fullSet(CAR)
    documents.find((d) => d.type === 'rc').status = 'rejected'
    const tx = fakeTx({ documents })
    assert.equal(await recomputeVehicleVerification(CAR, tx), 'rejected')
  })

  // It writes only the vehicle. Taking a driver off the road is a fact about a
  // driver, and only the driver-level recompute knows which car he is in.
  test('it never touches the driver', async () => {
    const documents = fullSet(CAR)
    documents.find((d) => d.type === 'rc').status = 'rejected'
    const tx = fakeTx({ documents, driver: { verificationStatus: 'approved', isOnline: true } })

    await recomputeVehicleVerification(CAR, tx)
    assert.equal(tx.state.updates.length, 0, 'no driver write')
    assert.equal(tx.state.driver.isOnline, true)
  })

  test('nothing is written when the verdict has not moved', async () => {
    const tx = fakeTx({ documents: fullSet(CAR), vehicle: { verificationStatus: 'approved' } })
    await recomputeVehicleVerification(CAR, tx)
    assert.equal(tx.state.vehicleUpdates.length, 0)
  })
})

describe('document ownership', () => {
  // The invariant the unique key rests on. A row whose ownerId disagrees with
  // its own vehicleId is a row the key has stopped protecting.
  test('a car document is owned by its car, a personal one by the driver', () => {
    assert.equal(ownerIdFor({ driverId: DRIVER, vehicleId: CAR }), CAR)
    assert.equal(ownerIdFor({ driverId: DRIVER, vehicleId: null }), DRIVER)
    assert.equal(ownerIdFor({ driverId: DRIVER }), DRIVER)
  })
})

describe('renewal slots', () => {
  // The slot is looked up by OWNER — the car for the nine, the man for his two.
  const carOwned = (fields) => ({ type: 'insurance', vehicleId: CAR, ...fields })

  test('a first upload goes into the current slot', async () => {
    const tx = fakeTx({ documents: [] })
    assert.deepEqual(await slotForUpload(CAR, 'insurance', tx), { isReplacement: false })
  })

  // The behaviour the brief calls out by name: renewing early must not take a
  // valid driver off the road.
  test('renewing an approved, valid document goes into the replacement slot', async () => {
    const tx = fakeTx({ documents: [carOwned({ status: 'approved', expiresAt: future(20) })] })
    assert.deepEqual(await slotForUpload(CAR, 'insurance', tx), { isReplacement: true })
  })

  // The inverse, and just as important: there is no approval left to protect, so
  // routing it to the replacement slot would strand him behind a document that
  // can never be promoted.
  test('replacing an expired document overwrites the current slot', async () => {
    const tx = fakeTx({ documents: [carOwned({ status: 'approved', expiresAt: past(1) })] })
    assert.deepEqual(await slotForUpload(CAR, 'insurance', tx), { isReplacement: false })
  })

  test('replacing a rejected document overwrites the current slot', async () => {
    const tx = fakeTx({ documents: [carOwned({ status: 'rejected', expiresAt: future(200) })] })
    assert.deepEqual(await slotForUpload(CAR, 'insurance', tx), { isReplacement: false })
  })

  test('re-uploading over an unreviewed document overwrites the current slot', async () => {
    const tx = fakeTx({ documents: [carOwned({ status: 'pending', expiresAt: future(200) })] })
    assert.deepEqual(await slotForUpload(CAR, 'insurance', tx), { isReplacement: false })
  })

  // The multi-car rule. One car's valid certificate must not make the OTHER
  // car's first upload look like a renewal — it would land in the replacement
  // slot with nothing to replace, and could never be promoted.
  test("another car's approved document does not put this car's upload in the replacement slot", async () => {
    const tx = fakeTx({ documents: [carOwned({ status: 'approved', expiresAt: future(200) })] })
    assert.deepEqual(await slotForUpload(OTHER_CAR, 'insurance', tx), { isReplacement: false })
  })
})

describe('promotion', () => {
  test('archives the old document and promotes the replacement', async () => {
    const current = {
      id: 'old', driverId: DRIVER, vehicleId: CAR, ownerId: CAR,
      type: 'insurance', fileUrl: `${DRIVER}/${CAR}/insurance/old.jpg`,
      fileHash: 'aaa', number: 'POL-1', expiresAt: future(10), status: 'approved',
      rejectionReason: null, reviewedAt: new Date(), uploadedAt: past(300),
    }
    const replacement = {
      id: 'new', driverId: DRIVER, vehicleId: CAR, ownerId: CAR,
      type: 'insurance', isReplacement: true,
    }

    const tx = fakeTx({ documents: [current] })
    await promoteReplacement(replacement, tx)

    assert.equal(tx.state.archived.length, 1)
    assert.equal(tx.state.archived[0].documentId, 'old')
    assert.equal(tx.state.archived[0].replacedById, 'new', 'the audit trail links the two')
    assert.equal(tx.state.archived[0].status, 'approved', 'and records what it retired under')
    // Carried across so a certificate stays attributable to the car it covered
    // after that car has been sold and its row deleted.
    assert.equal(tx.state.archived[0].vehicleId, CAR)
    assert.deepEqual(tx.state.deleted, ['old'])
    assert.deepEqual(tx.state.promoted, [{ id: 'new', isReplacement: false }])
  })

  test('promoting with nothing in the current slot archives nothing', async () => {
    const tx = fakeTx({ documents: [] })
    await promoteReplacement({
      id: 'new', driverId: DRIVER, vehicleId: CAR, ownerId: CAR, type: 'rc', isReplacement: true,
    }, tx)

    assert.equal(tx.state.archived.length, 0)
    assert.deepEqual(tx.state.deleted, [])
    assert.deepEqual(tx.state.promoted, [{ id: 'new', isReplacement: false }])
  })
})

describe('upload path ownership', () => {
  const OTHER = '22222222-2222-4222-8222-222222222222'
  const owner = (fields) => ({ driverId: DRIVER, type: 'dl', ...fields })

  test('accepts the path this server composed', () => {
    assert.ok(ownsUploadPath(owner({}), `${DRIVER}/dl/9f2c.jpg`))
  })

  test("rejects another driver's path", () => {
    assert.equal(ownsUploadPath(owner({}), `${OTHER}/dl/9f2c.jpg`), false)
  })

  // Without the type segment a driver could confirm his car photo against his
  // insurance slot, and the scan would pass it — a bumper is a valid JPEG.
  test('rejects the right driver under the wrong type', () => {
    assert.equal(
      ownsUploadPath(owner({ type: 'insurance', vehicleId: CAR }), `${DRIVER}/${CAR}/car_photo_front/9f2c.jpg`),
      false,
    )
  })

  test('rejects traversal out of a matching prefix', () => {
    assert.equal(ownsUploadPath(owner({}), `${DRIVER}/dl/../../${OTHER}/dl/x.jpg`), false)
    assert.equal(ownsUploadPath(owner({}), `${DRIVER}/dl/sub/x.jpg`), false)
  })

  test('rejects a prefix with nothing after it', () => {
    assert.equal(ownsUploadPath(owner({}), `${DRIVER}/dl/`), false)
  })

  // A driver id that is a prefix of another would otherwise match. The trailing
  // slash in the prefix is what prevents it; asserted so it stays.
  test('rejects a driver id that merely starts the same', () => {
    assert.equal(ownsUploadPath({ driverId: 'abc', type: 'dl' }, 'abcdef/dl/x.jpg'), false)
  })

  // The multi-car half of the boundary. Without the vehicle segment a captain
  // could confirm the Dzire's valid insurance into the Innova's slot and have
  // the Innova approved on paperwork it never had.
  test('a car document lives under its car', () => {
    assert.equal(
      uploadPrefix({ driverId: DRIVER, vehicleId: CAR, type: 'insurance' }),
      `${DRIVER}/${CAR}/insurance/`,
    )
    assert.ok(ownsUploadPath(
      { driverId: DRIVER, vehicleId: CAR, type: 'insurance' },
      `${DRIVER}/${CAR}/insurance/9f2c.jpg`,
    ))
  })

  test("rejects one of his own cars' paths confirmed against another", () => {
    assert.equal(
      ownsUploadPath(
        { driverId: DRIVER, vehicleId: OTHER_CAR, type: 'insurance' },
        `${DRIVER}/${CAR}/insurance/9f2c.jpg`,
      ),
      false,
    )
  })

  // His licence follows the man, so it must NOT acquire a car segment even when
  // the app sends the car it happens to be showing.
  test('a driver document ignores a vehicle it was handed', () => {
    assert.equal(vehicleIdForType('dl', CAR), null)
    assert.equal(uploadPrefix({ driverId: DRIVER, vehicleId: CAR, type: 'dl' }), `${DRIVER}/dl/`)
    assert.ok(ownsUploadPath({ driverId: DRIVER, vehicleId: CAR, type: 'dl' }, `${DRIVER}/dl/9f2c.jpg`))
  })

  test('every car document is scoped to a car and neither personal one is', () => {
    for (const type of VEHICLE_OWNED_DOCUMENTS) {
      assert.equal(vehicleIdForType(type, CAR), CAR, `${type} must belong to a car`)
    }
    for (const type of ['dl', 'profile_photo']) {
      assert.equal(vehicleIdForType(type, CAR), null, `${type} must belong to the driver`)
    }
  })
})

describe('signed download URLs fail closed', () => {
  // The single most important line in documentScan.js. Everything not `clean`
  // means the same thing from here — nothing is known about those bytes — so
  // nobody gets a URL, and that holds without Storage being reachable at all.
  for (const scanStatus of ['pending', 'scanning', 'failed']) {
    test(`a ${scanStatus} document gets no URL`, async () => {
      assert.equal(await signedDocumentUrl({ scanStatus, fileUrl: 'x/dl/y.jpg' }), null)
    })
  }

  test('a missing document gets no URL', async () => {
    assert.equal(await signedDocumentUrl(null), null)
    assert.equal(await signedDocumentUrl(undefined), null)
  })

  // The refusal above must not depend on anything being healthy. With Supabase
  // unconfigured a `clean` document throws — which is the correct, loud failure
  // — while every other state still quietly returns null.
  test('the refusal does not depend on Supabase being configured', async () => {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) return
    await assert.rejects(() => signedDocumentUrl({ scanStatus: 'clean', fileUrl: 'x/dl/y.jpg' }))
  })
})

describe('request validation', () => {
  test('refuses a content type that is not on the list', () => {
    const parsed = UploadUrlRequest.safeParse({
      documents: [{ type: 'dl', contentType: 'image/svg+xml' }],
    })
    assert.equal(parsed.success, false)
  })

  test('refuses an unknown document type', () => {
    assert.equal(
      UploadUrlRequest.safeParse({ documents: [{ type: 'police_verification', contentType: 'image/jpeg' }] }).success,
      false,
    )
  })

  // Two URLs for one type would sign two paths, and only one could ever become
  // the row — the other is an orphan nothing collects.
  test('refuses the same type twice in one request', () => {
    const parsed = UploadUrlRequest.safeParse({
      documents: [
        { type: 'dl', contentType: 'image/jpeg' },
        { type: 'dl', contentType: 'application/pdf' },
      ],
    })
    assert.equal(parsed.success, false)
  })

  // The ceiling is the whole document list and no more, since this endpoint
  // mints bearer tokens and an unbounded array is an unbounded number of
  // writable URLs from one authenticated call.
  //
  // With eleven types and a one-per-type rule the two constraints now coincide,
  // so this asserts the bound at twelve — the first size no legitimate batch can
  // reach — rather than at a length the uniqueness refine would reject anyway.
  test('bounds the batch, because each entry mints a bearer token', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ type: DRIVER_DOCUMENT_TYPES[i % DRIVER_DOCUMENT_TYPES.length], contentType: 'image/jpeg' }))
    assert.equal(UploadUrlRequest.safeParse({ documents: many }).success, false)
    assert.equal(UploadUrlRequest.safeParse({ documents: [] }).success, false)
  })

  // The full checklist in one go, which is exactly what onboarding sends: eleven
  // distinct types, at the ceiling and legal. This is the case the old `.max(10)`
  // silently refused once the profile photo made it eleven.
  test('accepts the whole checklist at once', () => {
    const all = DRIVER_DOCUMENT_TYPES.map((type) => ({ type, contentType: 'image/jpeg' }))
    assert.equal(UploadUrlRequest.safeParse({ documents: all }).success, true)
  })

  test('accepts a well-formed batch', () => {
    const parsed = UploadUrlRequest.safeParse({
      documents: [
        { type: 'dl', contentType: 'image/jpeg' },
        { type: 'insurance', contentType: 'application/pdf' },
      ],
    })
    assert.equal(parsed.success, true)
  })

  test('the confirm payload takes a date, not a timestamp', () => {
    const ok = ConfirmDocumentsRequest.safeParse({
      documents: [{ type: 'dl', path: 'x/dl/y.jpg', number: 'DL-1', expiresAt: '2027-03-31' }],
    })
    assert.equal(ok.success, true)

    const bad = ConfirmDocumentsRequest.safeParse({
      documents: [{ type: 'dl', path: 'x/dl/y.jpg', expiresAt: '2027-03-31T00:00:00Z' }],
    })
    assert.equal(bad.success, false)
  })

  test('a rejection must carry a reason, because the driver is shown it', () => {
    assert.equal(reviewDocumentSchema.safeParse({ status: 'rejected' }).success, false)
    assert.equal(
      reviewDocumentSchema.safeParse({ status: 'rejected', rejectionReason: 'Photo is blurry' }).success,
      true,
    )
    assert.equal(reviewDocumentSchema.safeParse({ status: 'approved' }).success, true)
  })

  // "I reviewed it and it is unreviewed" is not a thing anybody can mean. A
  // document returns to pending only by being re-uploaded.
  test('an admin cannot set a document back to pending', () => {
    assert.equal(reviewDocumentSchema.safeParse({ status: 'pending' }).success, false)
  })
})

describe('expiry reminder thresholds', () => {
  // The ladder, as the sweep applies it. `REMINDER_DAYS.find(t => days <= t)`
  // picks the WIDEST threshold a document has crossed, so a row first seen with
  // six days left gets the 7-day message once rather than 30 then 7 in a row.
  const REMINDER_DAYS = [30, 7, 1]
  // filter, then take the last — the NARROWEST threshold crossed. `find` on this
  // descending list returns 30 for a document with seven days left, which is the
  // bug this test caught: the dedup would then compare 30 against an
  // expiryWarnedDays of 30 and the 7- and 1-day messages would never fire.
  const thresholdFor = (days) => REMINDER_DAYS.filter((t) => days <= t).at(-1)

  test('picks the widest threshold the document has crossed', () => {
    assert.equal(thresholdFor(30), 30)
    assert.equal(thresholdFor(29), 30)
    assert.equal(thresholdFor(8), 30)
    assert.equal(thresholdFor(7), 7)
    assert.equal(thresholdFor(2), 7)
    assert.equal(thresholdFor(1), 1)
    assert.equal(thresholdFor(0), 1)
  })

  test('says nothing outside the widest window', () => {
    assert.equal(thresholdFor(31), undefined)
    assert.equal(thresholdFor(365), undefined)
  })

  // The dedup, which is the whole reason expiryWarnedDays is an Int and not a
  // boolean: it has to distinguish "told him at 30" from "told him at 7".
  const shouldSend = (warnedDays, threshold) => warnedDays === null || warnedDays > threshold

  test('each threshold fires exactly once, in order', () => {
    let warned = null

    assert.equal(shouldSend(warned, 30), true, 'never warned -> the 30-day message')
    warned = 30
    assert.equal(shouldSend(warned, 30), false, 'and not again an hour later')

    assert.equal(shouldSend(warned, 7), true, 'a week out -> the 7-day message')
    warned = 7
    assert.equal(shouldSend(warned, 7), false)

    assert.equal(shouldSend(warned, 1), true, 'the day before -> the last message')
    warned = 1
    assert.equal(shouldSend(warned, 1), false)
  })

  // The sweep shares the lapse sweep's hourly timer. That is only safe because
  // running it repeatedly cannot produce a second message.
  test('twenty-four passes in a day send one message', () => {
    let warned = null
    let sent = 0
    for (let hour = 0; hour < 24; hour += 1) {
      const threshold = thresholdFor(20)
      if (shouldSend(warned, threshold)) { sent += 1; warned = threshold }
    }
    assert.equal(sent, 1)
  })

  // A document uploaded fresh clears expiryWarnedDays, so next year's window
  // starts silent again rather than being suppressed by last year's record.
  test('a renewal is warned about from scratch', () => {
    const afterRenewal = null
    assert.equal(shouldSend(afterRenewal, 30), true)
  })
})

describe('expiry reminder quiet hours', () => {
  const IST_OFFSET_MS = 330 * 60 * 1000
  const QUIET_FROM_HOUR = 22
  const QUIET_UNTIL_HOUR = 7
  const inQuietHours = (now) => {
    const istHour = new Date(now.getTime() + IST_OFFSET_MS).getUTCHours()
    return istHour >= QUIET_FROM_HOUR || istHour < QUIET_UNTIL_HOUR
  }

  // Built from an IST wall-clock hour, so the assertions read in the timezone
  // the captain actually lives in rather than the server's.
  const atIST = (hour) => new Date(Date.UTC(2026, 7, 12, hour, 0, 0) - IST_OFFSET_MS)

  test('holds reminders overnight', () => {
    for (const hour of [22, 23, 0, 3, 6]) {
      assert.equal(inQuietHours(atIST(hour)), true, `${hour}:00 IST should be quiet`)
    }
  })

  test('sends them through the working day', () => {
    for (const hour of [7, 9, 13, 18, 21]) {
      assert.equal(inQuietHours(atIST(hour)), false, `${hour}:00 IST should send`)
    }
  })
})

describe('days until expiry', () => {
  const IST_OFFSET_MS = 330 * 60 * 1000
  const istMidnight = (d) => {
    const ist = new Date(d.getTime() + IST_OFFSET_MS)
    return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate())
  }
  const daysUntil = (expiresAt, now) =>
    Math.round((istMidnight(expiresAt) - istMidnight(now)) / 86_400_000)

  // Counted in dates, not elapsed time. Measured from the instant, a captain
  // reading "1 day left" at 11pm would read "expired" ninety minutes later with
  // nothing having happened to the document in between.
  test('is stable across the whole of a day', () => {
    const expiry = new Date('2026-09-01T00:00:00.000Z')
    const morning = new Date(Date.UTC(2026, 7, 31, 3, 0) - IST_OFFSET_MS)
    const night = new Date(Date.UTC(2026, 7, 31, 23, 30) - IST_OFFSET_MS)

    assert.equal(daysUntil(expiry, morning), daysUntil(expiry, night))
    assert.equal(daysUntil(expiry, morning), 1)
  })

  test('is zero on the day itself and negative after', () => {
    const expiry = new Date('2026-09-01T00:00:00.000Z')
    assert.equal(daysUntil(expiry, new Date(Date.UTC(2026, 8, 1, 12) - IST_OFFSET_MS)), 0)
    assert.ok(daysUntil(expiry, new Date(Date.UTC(2026, 8, 3, 12) - IST_OFFSET_MS)) < 0)
  })
})
