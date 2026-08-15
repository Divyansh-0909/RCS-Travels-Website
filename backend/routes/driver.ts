import { Router } from 'express'
import type { Request, Response } from 'express'
import type { BookingStatus, Driver, DriverDocumentType } from '@prisma/client'
import { getAuth, clerkClient } from '@clerk/express'
import { protect } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import { ACTIVE_STATUSES } from './bookings.js'
import { ASSIGNABLE_STATUSES, claimBookingForDriver } from '../services/driverAssignment.js'
import { withdrawOtherOffers } from '../services/scheduledOffers.js'
import { seatsOf } from '../constants/vehicles.js'
import { commissionOn } from '../services/commission.js'
import { isStorageConfigured, signedUploadUrl, stat, remove } from '../lib/storage.js'
import { sniffUpload, scanDocument, discardUpload, DRIVER_SCAN_MESSAGE } from '../services/documentScan.js'
import { enqueueDocumentScan } from '../lib/tasks.js'
import { signedDriverPhotoUrl } from '../services/driverPhoto.js'
import { notifyDocumentsSubmitted } from '../services/documentNotifications.js'
import {
    DOCUMENT_CONTENT_TYPES,
    DOCUMENT_EXTENSIONS,
    DRIVER_DOCUMENT_TYPES,
    EXPIRING_DRIVER_DOCUMENTS,
    NUMBERED_DRIVER_DOCUMENTS,
    REQUIRED_DRIVER_DOCUMENTS,
    REQUIRED_VEHICLE_OWNED_DOCUMENTS,
    documentLabelOf,
    isImageOnly,
    isVehicleDocument,
    maxBytesFor,
} from '../constants/driverDocuments.js'
import {
    ownerIdFor,
    ownsUploadPath,
    recomputeAfterDocumentChange,
    recomputeDriverVerification,
    slotForUpload,
    uploadPrefix,
    vehicleIdForType,
    DOCUMENT_WARNING_DAYS,
} from '../services/driverDocuments.js'
import { addVehicle, removeVehicle, switchActiveVehicle } from '../services/driverVehicles.js'
import { locationSchema, UploadUrlRequest, ConfirmDocumentsRequest, rideParamsSchema, driverOnlineSchema, driverAccountInformationSchema, addVehicleSchema, activeVehicleSchema, fcmTokenSchema, rideStatusSchema, driverRidesQuerySchema } from '../types.ts'

// The driver-facing API. Nothing calls it yet — the driver app is Phase 5, and until
// it exists the assignment loop takes a driver's answer from sendFCM's return value
// instead (services/notification.js).
//
// accept takes the same transition getDriver does, and takes it the same way:
// claimBookingForDriver, which guards the booking status and the vehicle's seats in
// one transaction. It used to be a plain update guarded only against a booking that
// was already `assigned`, which let a cancelled, completed or expired ride be
// re-assigned, and left the accepting driver at full capacity. decline shares the
// same allowlist but still writes nothing — it only reports the booking's status back.
const driverRouter = Router()

const EARTH_RADIUS_KM = 6371

// `reached` accepts BOTH of the states before it, and that is the design rather
// than laxity: en_route is an optional step. On an on-spot ride the two moments
// can be seconds apart, and a captain who taps straight through to Reached must
// not be blocked over a status he skipped.
//
// It is not optional on a SCHEDULED ride, though, which is why it exists. A
// captain accepts Tuesday's 6am airport run on Sunday afternoon, and the booking
// is `assigned` for forty hours — so without this, `assigned` would have to mean
// both "somebody has it, see you Tuesday" and "he is in the car coming to you
// now". The rider's screen already draws them differently (statusLabels has
// "Driver on the way", and TrackingPage reveals the OTP from en_route on, so the
// code is in her hand before he arrives rather than while he waits at the kerb).
const RIDE_TRANSITIONS = {
    en_route: ['assigned'],
    reached: ['assigned', 'en_route'],
    started: ['reached'],
    completed: ['started'],
} as const satisfies Record<string, readonly BookingStatus[]>

type RideTransition = keyof typeof RIDE_TRANSITIONS

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180

    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2

    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number): number => deg * Math.PI / 180;
    const toDeg = (rad: number): number => rad * 180 / Math.PI;

    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);

    const λ1 = toRad(lon1);
    const λ2 = toRad(lon2);

    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);

    const x =
        Math.cos(φ1) * Math.sin(φ2) -
        Math.sin(φ1) * Math.cos(φ2) *
        Math.cos(λ2 - λ1);

    const θ = Math.atan2(y, x);

    return (toDeg(θ) + 360) % 360;
}

const HISTORY_STATUSES = ['completed', 'cancelled'] as const satisfies readonly BookingStatus[]

// PAYMENT IS NOT MODELLED YET. There is no payment column anywhere on Booking, no
// User.paymentTerms, and no gateway — that whole block is still open in ROADMAP.txt
// ("PAYMENTS + MONTHLY ACCOUNTS", gateway undecided). What is true today is that
// every ride is cash handed to the captain at the drop, so completion IS collection.
//
// It is derived here rather than in the app so there is exactly one place to change
// when the real thing lands: swap the body for a read of the payment row, and add
// the 'on_account' arm the roadmap already calls for ("Driver's ride card for
// account customers must say 'do not collect'"). The app renders whatever this says
// and decides nothing itself.
type PaymentState = 'paid' | 'due' | 'void'

const paymentStateOf = (booking: { status: BookingStatus; cancellationCharge: number | null }): PaymentState => {
    if (booking.status === 'completed') return 'paid'
    if (booking.status === 'cancelled') return booking.cancellationCharge ? 'due' : 'void'
    return 'due'
}

const drivenMinutes = (startedAt: Date | null, completedAt: Date | null): number | null =>
    startedAt && completedAt
        ? Math.max(1, Math.round((completedAt.getTime() - startedAt.getTime()) / 60000))
        : null

// Monday 00:00 India time, as a UTC instant.
//
// The week has to be the captain's, not the server's: this process can run anywhere,
// and a summary headed "this week" that rolls over at 18:30 on Sunday because the box
// is in UTC is wrong in the way nobody reports — it just quietly pays a Monday
// morning's rides into the week before. IST is fixed at +05:30 with no DST, so the
// arithmetic is a shift rather than a timezone library.
const IST_OFFSET_MS = 330 * 60 * 1000

function startOfWeekIST(now: Date): Date {
    const ist = new Date(now.getTime() + IST_OFFSET_MS)
    // getUTCDay on the shifted clock reads the IST weekday. Rebased so Monday is 0,
    // because the week a driver is paid on starts on Monday and Sunday is its end.
    const weekday = (ist.getUTCDay() + 6) % 7
    const istMidnight = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate())

    return new Date(istMidnight - weekday * 86_400_000 - IST_OFFSET_MS)
}

// The 1st, 00:00 India time, as a UTC instant. Same reasoning as startOfWeekIST above
// and the same arithmetic: a month that rolls over at 18:30 on the last day because
// the box is in UTC quietly pays a whole day's rides into the month before, and
// nobody reports it because the total still looks plausible.
function startOfMonthIST(now: Date): Date {
    const ist = new Date(now.getTime() + IST_OFFSET_MS)
    const istFirst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1)

    return new Date(istFirst - IST_OFFSET_MS)
}

const formatPickupTime = (scheduledAt: Date | null): string =>
    scheduledAt
        ? new Date(scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
        : 'IMMEDIATE PICKUP'

// Signed in and has a Driver row — nothing more. Every screen a captain sees
// BEFORE he is cleared runs through this: his documents, his cars, the status
// page that explains why he cannot go online yet. Gating those on approval would
// lock a pending captain out of the only screens that could ever make him
// approved.
async function requireDriver(req: Request, res: Response): Promise<Driver | null> {
    const { userId } = getAuth(req)
    if (!userId) {
        res.status(401).json({ error: 'Not signed in' })
        return null
    }

    const driver = await prisma.driver.findUnique({ where: { clerkId: userId } })
    if (!driver) {
        res.status(403).json({ error: 'Not a registered driver' })
        return null
    }

    return driver
}

/**
 * The body of the two gates below.
 *
 * `allowSuspended` is a parameter of THIS function and is never exposed as an
 * options bag on the exported gates: every call site names the gate it means, so
 * loosening a suspension takes changing a function name in a diff rather than
 * flipping a boolean nobody reads twice.
 */
async function resolveDriver(req: Request, res: Response, allowSuspended: boolean): Promise<Driver | null> {
    const { userId } = getAuth(req)
    if (!userId) {
        res.status(401).json({ error: 'Not signed in' })
        return null
    }

    const driver = await prisma.driver.findUnique({ where: { clerkId: userId } })
    if (!driver) {
        res.status(403).json({ error: 'Not a registered driver' })
        return null
    }
    if (!driver.isActive) {
        res.status(403).json({ error: 'Driver account is inactive' })
        return null
    }
    if (driver.verificationStatus !== 'approved') {
        res.status(403).json({ error: 'Driver not yet approved' })
        return null
    }
    if (driver.suspendedAt && !allowSuspended) {
        res.status(403).json({
            error: 'Driver account is suspended',
            reason: driver.suspensionReason,
            suspendedAt: driver.suspendedAt,
        })
        return null
    }

    return driver
}

/** Everything that takes on NEW work. A suspended captain is refused, with the reason. */
async function requireApprovedDriver(req: Request, res: Response): Promise<Driver | null> {
    return resolveDriver(req, res, false)
}

/**
 * Everything that FINISHES work he already holds — a suspended captain passes.
 *
 * WHY SUSPENSION CANNOT REFUSE THESE. A captain is suspended for conduct, and the
 * rides already in his hands do not disappear when he is. If this gate refused
 * him, a rider would sit watching a tracking map that had stopped moving, for a
 * driver who could no longer mark himself arrived, on a booking that could never
 * reach `completed` — and because vehicle capacity is only restored on
 * completion, his seats would stay spent for good, so a reinstated captain would
 * come back permanently a seat short. Refusing here does not undo the assignment;
 * it only strands it.
 *
 * WHAT KEEPS THIS SAFE is that it grants no new work. Every assignment path —
 * candidatesWithin, candidatesIn, both accept endpoints — filters on
 * `suspendedAt` being null, so a suspended captain can be offered nothing and can
 * claim nothing. And because those paths filter it, any booking CURRENTLY
 * assigned to him necessarily predates his suspension: "is this ride his and
 * still active" is proof enough that he was given it while in good standing, and
 * no `assignedAt` column is needed to establish it.
 *
 * The per-booking routes below still check `booking.driverId === driver.id`
 * themselves. That check is what makes this gate specific rather than a blanket
 * reopening — it is doing real work here, so do not remove it as redundant.
 */
async function requireDriverForAssignedWork(req: Request, res: Response): Promise<Driver | null> {
    return resolveDriver(req, res, true)
}


driverRouter.post('/me', protect, async (req, res) => {
    const parsed = driverAccountInformationSchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', issues: parsed.error.issues })
    }
    const { name, vehicleClass, vehicleNumber, vehicleModel, } = parsed.data

    if (!name || typeof name !== 'string' || name.trim().length < 2)
        return res.status(400).json({ error: 'name must be at least 2 characters' })

    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })

    const clerkUser = await clerkClient.users.getUser(userId)
    const email = clerkUser.emailAddresses[0]?.emailAddress
    const phone = email?.replace('@rcs-travels.com', '').replace(/^91/, '')

    if (!phone)
        return res.status(400).json({ error: 'Could not resolve phone from account' })

    const existingDriver = await prisma.driver.findUnique({
        where: { clerkId: userId }
    })

    if (existingDriver) {
        return res.status(403).json({
            error: 'Driver account already exists'
        })
    }

    const seats = seatsOf(vehicleClass)
    if (seats === null) return res.status(400).json({ error: 'Unknown vehicle class' })

    const number = vehicleNumber.trim().toUpperCase()

    // The driver and his first car, in one transaction. Two writes because the
    // FK runs Driver -> Vehicle and the vehicle cannot exist before its owner;
    // one transaction because a captain row with no car is a state no screen in
    // the app knows how to render, and a crash between the two would leave him
    // in it permanently with no way to add one (signup 403s on the second try).
    //
    // The four vehicle columns on Driver are written from the SAME values as the
    // Vehicle row rather than from the request twice — see the schema comment on
    // Driver.vehicleClass. This is the only place outside services/driverVehicles.js
    // that writes them, and only because the row does not exist yet.
    const driver = await prisma.$transaction(async (tx) => {
        const created = await tx.driver.create({
            data: {
                clerkId: userId,
                name,
                phone,
                vehicleClass,
                vehicleCapacity: seats,
                vehicleNumber: number,
                // No `|| null` on either write: driverAccountInformationSchema
                // requires a model of at least two characters, so by here there
                // is always one. A null branch would be unreachable code that
                // reads as though a captain may still skip the field.
                vehicleModel: vehicleModel.trim(),
            }
        })

        const vehicle = await tx.vehicle.create({
            data: {
                driverId: created.id,
                class: vehicleClass,
                number,
                model: vehicleModel.trim(),
            }
        })

        return tx.driver.update({
            where: { id: created.id },
            data: { activeVehicleId: vehicle.id },
            include: { activeVehicle: true },
        })
    })

    return res.status(201).json(driver)
})

// The captain's fleet. One car for almost everybody; two or three for the
// owner-drivers who keep a hatchback and an Innova and take whichever the
// booking asked for.
driverRouter.get('/me/vehicles', protect, async (req, res) => {
    const driver = await requireDriver(req, res)
    if (!driver) return

    const vehicles = await prisma.vehicle.findMany({
        where: { driverId: driver.id },
        orderBy: { createdAt: 'asc' },
        select: {
            id: true, class: true, number: true, model: true,
            verificationStatus: true, createdAt: true,
        },
    })

    // Which required documents each car is still missing, so the list can show
    // "3 documents to go" against the Innova without a call per car. Only the
    // nine vehicle-owned types — his licence is not any car's business.
    const held = await prisma.driverDocument.findMany({
        where: { driverId: driver.id, isReplacement: false, vehicleId: { not: null } },
        select: { vehicleId: true, type: true },
    })

    const heldByVehicle = new Map<string, Set<string>>()
    for (const { vehicleId, type } of held) {
        if (!vehicleId) continue
        const set = heldByVehicle.get(vehicleId) ?? new Set<string>()
        set.add(type)
        heldByVehicle.set(vehicleId, set)
    }

    return res.json({
        activeVehicleId: driver.activeVehicleId,
        vehicles: vehicles.map((vehicle) => ({
            ...vehicle,
            seats: seatsOf(vehicle.class),
            isActive: vehicle.id === driver.activeVehicleId,
            missing: REQUIRED_VEHICLE_OWNED_DOCUMENTS.filter(
                (type: string) => !heldByVehicle.get(vehicle.id)?.has(type),
            ),
        })),
    })
})

driverRouter.post('/me/vehicles', protect, async (req, res) => {
    const driver = await requireDriver(req, res)
    if (!driver) return

    const parsed = addVehicleSchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', issues: parsed.error.issues })
    }

    const result = await addVehicle(driver.id, parsed.data)
    if ('error' in result) return res.status(result.status).json(result)

    return res.status(201).json({
        vehicle: { ...result.vehicle, seats: seatsOf(result.vehicle.class) },
        madeActive: result.madeActive,
        verificationStatus: result.verificationStatus,
        // The nine he now has to photograph for this car. Sent back so the app
        // can go straight to that checklist instead of asking for it again.
        missing: REQUIRED_VEHICLE_OWNED_DOCUMENTS,
    })
})

// Change which car he is driving. See services/driverVehicles.js — this moves
// five columns and his verification status, and it is refused mid-ride and
// against a scheduled booking the new car cannot serve.
driverRouter.patch('/me/active-vehicle', protect, async (req, res) => {
    const driver = await requireDriver(req, res)
    if (!driver) return

    const parsed = activeVehicleSchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', issues: parsed.error.issues })
    }

    // Refused while online rather than silently taking him offline. Going online
    // is a claim about a specific car — it is what dispatch matches against — and
    // a captain who switched cars from a list screen without noticing he was
    // still online has made that claim about the wrong one.
    if (driver.isOnline) {
        return res.status(409).json({ error: 'Go offline before you change cars' })
    }

    const result = await switchActiveVehicle(driver.id, parsed.data.vehicleId)
    if ('error' in result) return res.status(result.status).json(result)

    return res.json({
        activeVehicleId: result.vehicle.id,
        vehicle: { ...result.vehicle, seats: seatsOf(result.vehicle.class) },
        // The new car's paperwork is not the old car's, so this can drop him from
        // `approved` to `pending` on the same call. The app renders it rather
        // than assuming a switch is always harmless.
        verificationStatus: result.verificationStatus,
    })
})

driverRouter.delete('/me/vehicles/:id', protect, async (req, res) => {
    const driver = await requireDriver(req, res)
    if (!driver) return

    const parsed = rideParamsSchema.safeParse(req.params)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid vehicle id' })

    const result = await removeVehicle(driver.id, parsed.data.id)
    if ('error' in result) return res.status(result.status).json(result)

    return res.json(result)
})

// Which car a batch of documents is about.
//
// Three answers, and the distinction between the last two is the whole reason
// this is a function:
//
//   null       — the batch is his licence and his photograph and nothing else.
//                No car is involved and none is required, so a captain who has
//                not added one yet can still upload these.
//   a Vehicle  — the batch contains at least one of the nine car documents.
//   undefined  — a response has already been sent; the caller must return.
//
// The car is taken from the body when given and from `activeVehicleId` when not.
// Explicit wins because a captain photographing the papers of the Innova in his
// yard is doing it while driving the Dzire, and defaulting to the active car
// would file the Innova's RC against the Dzire — where it would be accepted,
// approved, and quietly wrong.
async function resolveUploadVehicle(
    driver: Driver,
    body: { vehicleId?: string, documents: { type: string }[] },
    res: Response,
) {
    const needsVehicle = body.documents.some(({ type }) => isVehicleDocument(type))
    if (!needsVehicle) return null

    const vehicleId = body.vehicleId ?? driver.activeVehicleId
    if (!vehicleId) {
        res.status(409).json({
            error: 'Add your car before uploading its papers',
            // Named so the app routes to the right screen rather than showing a
            // dead end on the document checklist.
            action: 'add_vehicle',
        })
        return undefined
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } })
    // Ownership, not existence. A captain naming another captain's vehicle id
    // would otherwise get a signed URL writing into that man's folder.
    if (!vehicle || vehicle.driverId !== driver.id) {
        res.status(404).json({ error: 'That car is not on your account' })
        return undefined
    }

    return vehicle
}

driverRouter.post('/me/documents/upload-url', protect, async (req, res) => {
    if (!isStorageConfigured()) {
        return res.status(503).json({ error: 'Document uploads are not configured on this server' })
    }

    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Not signed in' })

    const driver = await prisma.driver.findUnique({ where: { clerkId: userId } })
    if (!driver) return res.status(403).json({ error: 'Not a registered driver' })

    const parsed = UploadUrlRequest.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', issues: parsed.error.issues })
    }
    // A PDF where a photograph belongs. Refused before a URL exists rather than
    // after the upload, because the whole point of checking here is that the
    // captain has not spent anything yet.
    const wrongFormat = parsed.data.documents.find(
        ({ type, contentType }) => isImageOnly(type) && contentType === 'application/pdf',
    )
    if (wrongFormat) {
        return res.status(415).json({
            error: `${documentLabelOf(wrongFormat.type)} must be a photo, not a PDF`,
            type: wrongFormat.type,
        })
    }

    const vehicle = await resolveUploadVehicle(driver, parsed.data, res)
    if (vehicle === undefined) return

    const results = await Promise.all(
        parsed.data.documents.map(async ({ type, contentType }) => {
            const extension = DOCUMENT_EXTENSIONS[contentType]
            // Composed by uploadPrefix, which is the same function ownsUploadPath
            // checks against at confirm time. One definition of where a document
            // lives, so the two can never drift into a state where this endpoint
            // hands out a path the next one refuses.
            const prefix = uploadPrefix({ driverId: driver.id, vehicleId: vehicle?.id, type })
            const path = `${prefix}${crypto.randomUUID()}.${extension}`
            // The content type is BOUND INTO THE SIGNATURE, so this URL will only
            // accept a PUT carrying exactly this header. It is what stops a
            // caller asking for a JPEG's URL and then pushing a PDF through it —
            // the check that used to be the bucket's own mime allowlist. The
            // captain app already sends it (uploadDocuments.ts), so nothing on
            // the phone changes.
            // Per content type, not one number: an image has already been
            // through the app's resize-and-compress step and a PDF has not.
            // The SAME limit the confirm endpoint and the scanner check against,
            // read from the same function, so the three can never disagree.
            const signed = await signedUploadUrl(path, contentType, maxBytesFor(contentType))

            // `headers` is what the app must send on the PUT, verbatim. Returned
            // rather than reconstructed on the phone so the limits live in one
            // place — a second copy in the app is a number that drifts.
            return { type, path: signed.path, uploadUrl: signed.uploadUrl, headers: signed.headers }
        })
    )

    return res.json({
        documents: results,
        // Echoed so the app confirms against the same car this batch was signed
        // for, rather than against whatever is active by the time the uploads
        // finish. A captain can switch cars mid-upload.
        vehicleId: vehicle?.id ?? null,
        expiresInSeconds: 2 * 60 * 60,
    })
})

driverRouter.post('/me/documents', protect, async (req, res) => {
    if (!isStorageConfigured()) {
        return res.status(503).json({ error: 'Document uploads are not configured on this server' })
    }

    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Not signed in' })

    const driver = await prisma.driver.findUnique({ where: { clerkId: userId } })
    if (!driver) return res.status(403).json({ error: 'Not a registered driver' })

    const parsed = ConfirmDocumentsRequest.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', issues: parsed.error.issues })
    }

    const vehicle = await resolveUploadVehicle(driver, parsed.data, res)
    if (vehicle === undefined) return

    // Validated before anything is written, and all of it before any of it: a
    // captain who submits six documents with one bad expiry date should be told
    // which one, not left with five saved rows and a screen that has forgotten
    // what he typed.
    const checked: {
        type: DriverDocumentType
        path: string
        isReplacement: boolean
        vehicleId: string | null
        ownerId: string
        number: string | null
        expiresAt: Date | null
    }[] = []

    for (const { type, path, number, expiresAt } of parsed.data.documents) {
        // Prefix check first — it costs nothing and it is the one that matters.
        // uploadPrefix composed this path at upload-url time, so a path that does
        // not match was either not issued by this server, or was issued to
        // somebody else, or belongs to ANOTHER OF HIS OWN CARS — which is the new
        // one, and the reason the vehicle is part of the prefix at all. Without
        // it a captain could confirm the Dzire's valid insurance into the
        // Innova's slot and have the Innova approved on paperwork it never had.
        if (!ownsUploadPath({ driverId: driver.id, vehicleId: vehicle?.id, type }, path)) {
            return res.status(403).json({ error: `That upload does not belong to this driver`, type })
        }

        if (EXPIRING_DRIVER_DOCUMENTS.includes(type) && !expiresAt) {
            return res.status(400).json({
                error: `${documentLabelOf(type)} needs the date it expires`,
                type,
            })
        }
        // The inverse, and not pedantry: a car photo carrying an expiry date
        // would be swept up by the lapse job and take a driver offline over a
        // photograph that cannot go out of date.
        if (!EXPIRING_DRIVER_DOCUMENTS.includes(type) && expiresAt) {
            return res.status(400).json({
                error: `${documentLabelOf(type)} does not expire`,
                type,
            })
        }
        // An expiry already in the past. Almost always a typo in the year, and
        // accepting it would create a document that is expired the moment it is
        // approved — the driver would be taken offline by the sweep for a
        // certificate he just uploaded, with nothing on screen explaining it.
        if (expiresAt && new Date(`${expiresAt}T00:00:00.000Z`) <= new Date()) {
            return res.status(400).json({
                error: `${documentLabelOf(type)} has already expired — check the date`,
                type,
            })
        }

        // The number printed on the document. Required for everything with an
        // issuing authority behind it, and meaningless for the two car photos —
        // which is why this is a list and not a blanket rule.
        if (NUMBERED_DRIVER_DOCUMENTS.includes(type) && !number) {
            return res.status(400).json({
                error: `${documentLabelOf(type)} needs the number printed on it`,
                type,
            })
        }

        let info: { size: number | null, contentType: string | null }
        try {
            info = await stat(path)
        } catch {
            return res.status(409).json({
                error: `${documentLabelOf(type)} was not uploaded — try again`,
                type,
            })
        }

        // `info.contentType` is the Content-Type header the UPLOADER sent —
        // Storage stores that string and never looks at the bytes, so this
        // check and the bucket's own allowedMimeTypes both trust the client.
        // Kept because it is free and gives the ordinary mistake a clear
        // answer; NOT relied on. sniffUpload below is the real one.
        if (!DOCUMENT_CONTENT_TYPES.includes(info.contentType ?? '')) {
            return res.status(415).json({
                error: `${documentLabelOf(type)} must be a JPEG, PNG or PDF`,
                type,
            })
        }

        // Per content type: an image has already been through the app's
        // resize-and-compress step and a PDF has not, so 5 MB of "compressed
        // photo" means the compression never ran. Re-checked against the real
        // byte count by the scanner; this is the early, cheap answer.
        const sizeLimit = maxBytesFor(info.contentType ?? '')
        if ((info.size ?? 0) > sizeLimit) {
            return res.status(413).json({
                error: `${documentLabelOf(type)} is larger than ${sizeLimit / 1024 / 1024} MB`,
                type,
            })
        }

        // The first bytes of the object, as a 16-byte Range request. This is the
        // one check that must be inline: it is what stops a row ever existing
        // that points at an HTML file labelled image/jpeg, and an admin later
        // opening it on the dashboard that administers the whole fleet.
        //
        // Everything heavier — re-encoding the image, reading a PDF for active
        // content — needs the whole file and runs after the response, against
        // the scan_status column.
        let actualType: string | null
        try {
            actualType = await sniffUpload(path)
        } catch (err) {
            // Storage was unreachable, not "the file is bad". A 503 tells the
            // app to retry; a rejection would tell the captain his licence was
            // refused over somebody else's outage.
            console.error(`documents: could not read ${path}:`, (err as Error).message)
            return res.status(503).json({
                error: 'Could not check that upload just now. Please try again.',
                type,
            })
        }

        // Not one of the three formats. The object is deleted rather than left
        // in the bucket: no row will ever reference it, so it is storage nobody
        // is paying attention to holding bytes somebody chose deliberately.
        if (!actualType) {
            await discardUpload(path)
            return res.status(415).json({
                error: `${documentLabelOf(type)} is not really a JPEG, PNG or PDF`,
                type,
            })
        }
        // Declared one thing, is another. Innocently this is a picker handing
        // back a HEIC labelled JPEG; deliberately it is the first half of a
        // type-confusion attack. Same answer, and the same disposal, either way.
        if (actualType !== info.contentType) {
            await discardUpload(path)
            return res.status(415).json({
                error: `${documentLabelOf(type)} is not the kind of file it claims to be`,
                type,
            })
        }
        // Re-checked against what the bytes ACTUALLY are, not what was declared
        // when the URL was signed. The upload-url check catches the honest
        // mistake; this one catches a caller who asked for a JPEG's URL and then
        // PUT a PDF through it.
        if (isImageOnly(type) && actualType === 'application/pdf') {
            await discardUpload(path)
            return res.status(415).json({
                error: `${documentLabelOf(type)} must be a photo, not a PDF`,
                type,
            })
        }

        // Whose row this is: the car for the nine vehicle types, the man for his
        // licence and photograph. Computed once here and carried through the
        // upsert below, because it is both the unique key and the thing the slot
        // is looked up against.
        const documentVehicleId = vehicleIdForType(type, vehicle?.id)
        const ownerId = ownerIdFor({ driverId: driver.id, vehicleId: documentVehicleId })

        // Current slot, or replacement slot alongside an approved document that
        // is still valid. See slotForUpload — this is what stops a driver who
        // renews his insurance early from going off the road for being early.
        // Keyed by owner, so renewing the Innova's insurance is measured against
        // the Innova's certificate and not the Dzire's.
        const { isReplacement } = await slotForUpload(ownerId, type)

        checked.push({
            type,
            path,
            isReplacement,
            vehicleId: documentVehicleId,
            ownerId,
            number: number ?? null,
            // Date-only on the wire (an expiry is a day, not an instant) and
            // parsed as UTC midnight, so the lapse sweep treats the document as
            // valid through the whole of the day printed on it.
            expiresAt: expiresAt ? new Date(`${expiresAt}T00:00:00.000Z`) : null,
        })
    }

    // What each slot pointed at before this request, so the objects actually
    // being overwritten can be collected once their replacements are committed.
    // Keyed by slot, not by type: the current row's object must survive a
    // renewal landing in the replacement slot beside it.
    const previous = await prisma.driverDocument.findMany({
        where: {
            // By owner rather than by driver: the same type in the same slot on
            // another of his cars is a different row pointing at a different
            // object, and collecting it here would delete the Dzire's insurance
            // when he re-uploads the Innova's.
            OR: checked.map(({ ownerId, type, isReplacement }) => ({ ownerId, type, isReplacement })),
        },
        select: { ownerId: true, type: true, isReplacement: true, fileUrl: true },
    })

    // One transaction: a captain re-submitting three lapsed documents has either
    // re-submitted all three or none, and a partial write would leave him
    // pending on a set of papers that was never reviewed as a set.
    //
    // Interactive rather than the array form, so the verification recompute at
    // the bottom lands with the rows it is derived from. It has to: a captain
    // re-uploading the licence an admin rejected leaves the row at `pending`,
    // and if his own status stayed `rejected` he would be looking at a screen
    // that says his papers are refused with nothing on it refused.
    const { rows, verificationStatus } = await prisma.$transaction(async (tx) => {
        const rows = []

        for (const { type, path, isReplacement, vehicleId, ownerId, number, expiresAt } of checked) {
            rows.push(await tx.driverDocument.upsert({
                where: { ownerId_type_isReplacement: { ownerId, type, isReplacement } },
                create: { driverId: driver.id, vehicleId, ownerId, type, isReplacement, fileUrl: path, number, expiresAt },
                // status back to pending and the previous verdict cleared: a
                // renewed document that kept `approved` from the file it replaced
                // would go live without anybody having looked at it, which is the
                // whole failure mode document review exists to prevent.
                //
                // scanStatus back to pending for the same reason one level down:
                // the verdict on the row belongs to the FILE the row pointed at,
                // and this is a different file. fileHash cleared with it — a
                // fingerprint of bytes nothing points at any more is worse than
                // none, because a duplicate check would match on it.
                update: {
                    fileUrl: path,
                    number,
                    expiresAt,
                    status: 'pending',
                    rejectionReason: null,
                    reviewedAt: null,
                    uploadedAt: new Date(),
                    scanStatus: 'pending',
                    scanReason: null,
                    scannedAt: null,
                    scanStartedAt: null,
                    fileHash: null,
                    // A renewal carries its own expiry date and has been warned
                    // about nothing. Left set, the reminder sweep would read the
                    // OLD document's "already told him at 7 days" against the NEW
                    // one's date and stay silent right through next year's window.
                    expiryWarnedDays: null,
                    expiryWarnedAt: null,
                },
                select: { id: true, fileUrl: true },
            }))
        }

        // In the same transaction as the rows it reads. A captain re-uploading
        // the licence an admin rejected leaves that row at `pending`, and if his
        // own verificationStatus stayed `rejected` he would be looking at a
        // screen saying his papers were refused with nothing on it refused.
        //
        // It cannot approve anybody — every row this loop just wrote is
        // `pending` — so the only transitions it can make from here are
        // rejected -> pending and approved -> pending.
        //
        // Settles the CAR as well, which matters even when the car is parked: the
        // badge on his vehicle list has to stop saying `rejected` the moment he
        // re-uploads the certificate that was refused, whether or not he happens
        // to be driving it today.
        const verificationStatus = await recomputeAfterDocumentChange(
            { driverId: driver.id, vehicleId: vehicle?.id },
            tx,
        )

        return { rows, verificationStatus }
    })

    // After the commit, and failure here is deliberately not an error: the rows
    // are correct, the driver is unblocked, and what is left behind is a few
    // hundred kilobytes of orphaned object. Failing the request over that would
    // make the captain re-upload documents that are already saved.
    const orphaned = previous
        .filter((row) => !checked.some((d) =>
            d.ownerId === row.ownerId && d.type === row.type
            && d.isReplacement === row.isReplacement && d.path === row.fileUrl))
        .map((row) => row.fileUrl)

    if (orphaned.length) {
        // Swallowed, as before. The rows are committed and the captain is
        // unblocked; what is left behind is a few hundred kilobytes nothing
        // points at, and failing the request over it would make him re-upload
        // documents that are already saved.
        try {
            await remove(orphaned)
        } catch (err) {
            console.error('documents: could not remove replaced objects', orphaned, (err as Error).message)
        }
    }

    // Which required documents are still missing, so the app can render the rest
    // of the checklist without a second call and without keeping its own copy of
    // the required list. Current rows only — a renewal sitting in the
    // replacement slot does not mean the type is on file for the first time.
    //
    // Scoped to one car — the one this batch was about, or the one he is driving
    // if the batch was only his licence. An unscoped count would tell a captain
    // with two cars that nothing is missing because the OTHER car has an RC.
    const scopeVehicleId = vehicle?.id ?? driver.activeVehicleId
    const held = await prisma.driverDocument.findMany({
        where: {
            driverId: driver.id,
            isReplacement: false,
            OR: [{ vehicleId: null }, { vehicleId: scopeVehicleId }],
        },
        select: { type: true },
    })
    const heldTypes = new Set<string>(held.map((d) => d.type))

    // The heavy half of the check — re-encoding each image from its decoded
    // pixels, reading each PDF for active content — happens somewhere else, so a
    // captain who has just uploaded six documents does not hold a spinner through
    // six downloads and six JPEG encodes. None of it changes what this endpoint
    // has to say.
    //
    // ONE TASK PER DOCUMENT rather than a loop after the response, and the
    // difference is Cloud Run. `setImmediate` used to run the scans here, which
    // works on a server that keeps executing after it answers; on Cloud Run the
    // CPU is throttled once the response is sent, so that work could get a few
    // milliseconds and then stall until some later request happened to wake the
    // instance. The five-minute sweep did rescue it — but "rescued in five
    // minutes" is a captain watching a Checking… screen for five minutes on the
    // one screen standing between him and being paid.
    //
    // Per document, not per batch, because they are independent: a 10 MB PDF
    // failing to download must not delay the verdict on the licence beside it,
    // and the queue's own concurrency limit is what keeps two sharp decodes from
    // landing on one instance at once.
    setImmediate(async () => {
        // Told first, before any scanning starts. He has just tapped upload and
        // is watching the screen; a confirmation that arrives after a 10 MB PDF
        // has been downloaded and read is a confirmation he stopped waiting for.
        await notifyDocumentsSubmitted(driver.id, checked.map((d) => d.type))

        for (const { id } of rows) {
            const queued = await enqueueDocumentScan(id)
            // No queue configured (a laptop), or the enqueue failed. Fall back to
            // scanning inline — which is what this endpoint always did, and is
            // still right anywhere the process keeps running after it answers.
            // enqueueDocumentScan never throws, so a queue outage degrades to the
            // old behaviour rather than losing the scan.
            if (!queued) await scanDocument(id)
        }
    })

    return res.json({
        // `status` is the admin's review, which has not happened. `scanStatus`
        // is the file check, which is running right now — the app shows
        // "Checking…" against these until GET /me/documents says otherwise.
        documents: checked.map(({ type }) => ({ type, status: 'pending', scanStatus: 'pending' })),
        missing: REQUIRED_DRIVER_DOCUMENTS.filter((type) => !heldTypes.has(type)),
        // Recomputed inside the same transaction as the rows above, so the app
        // never has to guess whether re-uploading a rejected document cleared
        // the rejection off his account. It cannot come back `approved` here —
        // every row just written is pending review.
        verificationStatus,
    })
})

// The checklist screen, and what the app polls after an upload to find out how
// the file check went. Outside requireApprovedDriver for the same reason
// GET /me is: this is the endpoint that explains why he is not approved.
//
// No signed URLs here. A captain does not need to re-download his own licence,
// and minting a URL per document on every poll would be a fistful of Storage
// calls to answer a question about four columns.
driverRouter.get('/me/documents', protect, async (req, res) => {
    const driver = await requireDriver(req, res)
    if (!driver) return

    // ONE CAR AT A TIME. The checklist is a screen about a specific vehicle plus
    // the two documents that belong to the man, so it takes a `vehicleId` and
    // falls back to the car he is driving. Returning every car's documents at
    // once would put three RCs on one list with nothing to tell them apart.
    const requestedVehicleId = typeof req.query.vehicleId === 'string' ? req.query.vehicleId : null
    const vehicleId = requestedVehicleId ?? driver.activeVehicleId

    const vehicle = vehicleId
        ? await prisma.vehicle.findUnique({
            where: { id: vehicleId },
            select: { id: true, driverId: true, class: true, number: true, model: true, verificationStatus: true },
        })
        : null

    if (vehicleId && (!vehicle || vehicle.driverId !== driver.id)) {
        return res.status(404).json({ error: 'That car is not on your account' })
    }

    const documents = await prisma.driverDocument.findMany({
        where: {
            driverId: driver.id,
            OR: [{ vehicleId: null }, { vehicleId: vehicle?.id ?? null }],
        },
        select: {
            id: true,
            type: true,
            vehicleId: true,
            isReplacement: true,
            number: true,
            expiresAt: true,
            status: true,
            rejectionReason: true,
            uploadedAt: true,
            scanStatus: true,
        },
        orderBy: { uploadedAt: 'desc' },
    })

    const current = documents.filter((d) => !d.isReplacement)
    const heldTypes = new Set<string>(current.map((d) => d.type))

    // NO fileUrl and NO signed URL, at any scan status. A captain has the
    // document in his hand; nothing on his screen needs the stored copy, and the
    // cheapest way to be sure a private object never leaks is for this endpoint
    // never to have been able to name one.
    //
    // scanReason is withheld too. It is the TECHNICAL reason — "sharp:
    // unsupported image format", "PDF contains active content: /JavaScript" —
    // written for an admin and the logs. Telling an uploader which check he
    // tripped is telling him which check to aim at next, so every failure reads
    // the same from here.
    const shape = (d: (typeof documents)[number]) => ({
        id: d.id,
        type: d.type,
        label: documentLabelOf(d.type),
        required: REQUIRED_DRIVER_DOCUMENTS.includes(d.type),
        status: d.status,
        scanStatus: d.scanStatus,
        // The admin's words, shown verbatim — "photo is blurry" is exactly what
        // the captain needs and exactly what an admin wrote it for.
        rejectionReason: d.rejectionReason,
        scanMessage: d.scanStatus === 'failed' ? DRIVER_SCAN_MESSAGE : null,
        number: d.number,
        expiresAt: d.expiresAt,
        uploadedAt: d.uploadedAt,
    })

    return res.json({
        // Which car this checklist is about, so the screen can put the plate at
        // the top of it. Null only for a captain who has not added one yet, whose
        // list is his licence and his photograph and nothing else.
        vehicle: vehicle && {
            id: vehicle.id,
            class: vehicle.class,
            number: vehicle.number,
            model: vehicle.model,
            verificationStatus: vehicle.verificationStatus,
            isActive: vehicle.id === driver.activeVehicleId,
        },
        // The document in force for each type he has one for.
        documents: current.map(shape),
        // Renewals waiting on the scan and on review. Kept apart rather than
        // merged into the list above, because the screen has to be able to say
        // "approved, and a renewal is being checked" — one row showing `pending`
        // would read as the approval having been withdrawn.
        replacements: documents.filter((d) => d.isReplacement).map(shape),
        // Every type, so the app renders a checklist rather than a list of what
        // happens to exist. The order is the provider's own.
        //
        // `owner` rides along so the screen can draw the one line that explains
        // the whole model to a captain with two cars: these two are yours, the
        // rest are this car's.
        allTypes: DRIVER_DOCUMENT_TYPES.map((type) => ({
            type,
            label: documentLabelOf(type),
            required: REQUIRED_DRIVER_DOCUMENTS.includes(type),
            expires: EXPIRING_DRIVER_DOCUMENTS.includes(type),
            needsNumber: NUMBERED_DRIVER_DOCUMENTS.includes(type),
            owner: isVehicleDocument(type) ? 'vehicle' : 'driver',
        })),
        missing: REQUIRED_DRIVER_DOCUMENTS.filter((type) => !heldTypes.has(type)),
        warningDays: DOCUMENT_WARNING_DAYS,
    })
})

// Deliberately still outside requireApprovedDriver. This is the one endpoint a
// pending or rejected driver must be able to read, because it is what tells him he is
// pending or rejected; gating it behind approval would answer "not yet approved" to
// the only question that could explain it.
driverRouter.get('/me', protect, async (req, res) => {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Not signed in' })

    const driver = await prisma.driver.findUnique({ where: { clerkId: userId } })
    if (!driver) return res.status(403).json({ error: 'Not a registered driver' })

    // The month, not the week the Rides board totals. Two screens, two questions: the
    // History tab heads a list of recent rides and answers "how did this week go",
    // while Account is where a captain checks how he is doing — and the answer he
    // acts on there is the one that lines up with his own monthly costs.
    const monthStart = startOfMonthIST(new Date())
    const warnBy = new Date(Date.now() + DOCUMENT_WARNING_DAYS * 86_400_000)

    // Three aggregates rather than three more columns on Driver, and all three
    // concurrently because none of them reads the others. The rating is derived for
    // the reason the DriverReview model gives; the week is the same figure the Rides
    // board totals, computed the same way so the two screens cannot disagree; and the
    // expiring count moves with the clock rather than with a write, so there is no
    // moment at which a cached copy of it could be refreshed.
    const [rating, month, expiring, renewing, heldRides] = await Promise.all([
        prisma.driverReview.aggregate({
            where: { driverId: driver.id },
            _avg: { rating: true },
            _count: { _all: true },
        }),
        prisma.booking.aggregate({
            where: { driverId: driver.id, status: 'completed', completedAt: { gte: monthStart } },
            _sum: { fare: true, commissionAmt: true },
            _count: { _all: true },
        }),
        // Current rows only, and the types with a renewal already in flight, so
        // the two can be differenced below. A captain who has already uploaded
        // next year's insurance has done the thing the warning asks of him;
        // counting it again would nag him for it until an admin gets round to
        // the review.
        //
        // Scoped to him and the car he is driving, the same way his
        // verificationStatus is. The Innova's insurance expiring next week is
        // real and he is told about it — on the vehicle list, where it names the
        // car — but it does not belong in a badge on the home screen that means
        // "you are about to be stopped from driving".
        prisma.driverDocument.findMany({
            where: {
                driverId: driver.id,
                isReplacement: false,
                expiresAt: { not: null, lte: warnBy },
                OR: [{ vehicleId: null }, { vehicleId: driver.activeVehicleId }],
            },
            select: { type: true },
        }),
        prisma.driverDocument.findMany({
            where: {
                driverId: driver.id,
                isReplacement: true,
                OR: [{ vehicleId: null }, { vehicleId: driver.activeVehicleId }],
            },
            select: { type: true },
        }),
        // Rides he has been given and not yet finished. ACTIVE_STATUSES is wider
        // than this on purpose — it includes `pending` and `confirmed`, which are
        // states a booking holds before anyone is assigned to it, and neither can
        // carry his driverId anyway. These four are the ones he is actually
        // holding.
        //
        // The rows rather than a count(), because two different questions come out
        // of the same handful of records and a second query for the other one
        // would be a round trip to learn something already in hand. A captain
        // holds a few rides at most, so this is the same read either way.
        prisma.booking.findMany({
            where: {
                driverId: driver.id,
                status: { in: ['assigned', 'en_route', 'reached', 'started'] },
            },
            select: { id: true, status: true },
        }),
    ])

    // Expiring, minus the ones he has already sent a renewal for.
    const renewingTypes = new Set<string>(renewing.map((d) => d.type))
    const expiringDocuments = expiring.filter((d) => !renewingTypes.has(d.type)).length

    const assignedRides = heldRides.length

    // THE RIDE HE IS ACTUALLY DRIVING, which is a different question from how many
    // he holds — and the app cannot answer it from assignedRides, because that
    // counts `assigned` too. A captain who took Tuesday's airport run on Sunday
    // holds a ride all week without being on one, and treating that as "in
    // progress" would strip his navigation for three days.
    //
    // Sent because the shell reads it: the tab bar and the online switch both come
    // off the screen while a rider is in the car. It rides on /me rather than
    // getting an endpoint of its own since every screen already has this profile
    // and refreshes it on foreground.
    const activeRide = heldRides.find((r) => r.status !== 'assigned') ?? null

    const {
        id, verificationStatus, rejectionReason, isOnline,
        vehicleClass, vehicleNumber, vehicleModel, phone, name,
        group, walletBalance, activeVehicleId,
    } = driver

    // How many cars he keeps. The app shows a switcher only when there is
    // something to switch between — a picker with one entry is a control that
    // does nothing, on the screen a captain uses most.
    const vehicleCount = await prisma.vehicle.count({ where: { driverId: id } })

    return res.json({
        id, verificationStatus, rejectionReason, isOnline,
        vehicleClass, vehicleNumber, vehicleModel, phone, name,
        // The car these four columns are a copy of. Sent so the app can address
        // the vehicle endpoints without a second call, and so a stale cache is
        // visible rather than silent.
        activeVehicleId,
        vehicleCount,
        vehicleSeats: seatsOf(vehicleClass),
        // A short-lived URL, minted per request, never the stored path. pfpUrl on
        // the row is a private Storage key and nothing outside this server has
        // any business holding one.
        pfpUrl: await signedDriverPhotoUrl(driver),
        // THE ROUTING ANSWER. The app opens on whatever this says, so it is
        // computed here rather than inferred in the client from four other
        // fields — two clients inferring the same rule differently is how a
        // captain ends up on a screen that cannot help him.
        //
        // `canDrive` is the gate: false means Home, Rides, Available and Post are
        // all closed to him and the app puts him on the checklist instead. It is
        // the same condition requireApprovedDriver enforces server-side, so the
        // screen he is shown and the requests he is allowed cannot disagree.
        onboarding: {
            canDrive: verificationStatus === 'approved' && !driver.suspendedAt && driver.isActive,
            // Why not, in the app's words rather than an enum it has to translate.
            // Null when he can drive.
            blockedBy:
                !driver.isActive ? 'inactive'
                    : driver.suspendedAt ? 'suspended'
                        : verificationStatus === 'approved' ? null
                            : verificationStatus,
            suspendedAt: driver.suspendedAt,
            suspensionReason: driver.suspensionReason,
            // RIDES HE STILL OWES, and the reason this is not folded into
            // canDrive. The two answer different questions: canDrive is "may he
            // take NEW work" and stays false throughout a suspension, while this
            // is "does he still owe somebody a ride he was given before it" — and
            // a suspended captain can be false on the first and true on the
            // second at the same time.
            //
            // The app needs both or it cannot route him: with only canDrive it
            // puts a captain who has a rider waiting on the application-status
            // screen, with no way to reach the ride the server would happily let
            // him finish (see requireDriverForAssignedWork). Non-zero here is what
            // opens the Rides tab for him.
            //
            // Always computed, not just while suspended — a number that only
            // appears in one state is a number every reader has to remember to
            // guard, and a captain in good standing simply has canDrive true too.
            assignedRides,
        },
        // The dispatch group, sent as the enum key. The app picks the captain's words
        // for it; the server does not, because the same three keys have to read as
        // priority tiers on an admin screen and as an affiliation on his own.
        // { id, status } while a rider is in the car or he is driving to one, null
        // otherwise. The shell strips itself down to nothing but the bell on the
        // strength of this — see useOnActiveRide in the app.
        activeRide,
        group,
        // Signed, and negative is a real state — an unpaid fine larger than the credit
        // on hand is what blocks going online. The app renders the sign.
        walletBalance,
        // Null rather than 0.0 when nobody has rated him. A captain on his first week
        // has no average, and showing him one made of no reviews invites him to
        // wonder who gave it to him.
        rating: rating._count._all
            ? { average: rating._avg.rating ?? 0, count: rating._count._all }
            : null,
        // `earned` is what reached the captain — the same fare-minus-commission the
        // expanded ride row calls "You keep", so the tile and the rows behind it
        // cannot disagree. Completed rides only: a cancellation charge is money owed
        // to the provider, not a ride he did.
        month: {
            earned: (month._sum.fare ?? 0) - (month._sum.commissionAmt ?? 0),
            rides: month._count._all,
            since: monthStart,
        },
        expiringDocuments,
    })
})

driverRouter.patch('/online', protect, async (req, res) => {
    const driver = await requireDriverForAssignedWork(req, res)
    if (!driver) return

    const parsed = driverOnlineSchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', issues: parsed.error.issues })
    }
    const { isOnline } = parsed.data

    if (!isOnline) {
        const active = await prisma.booking.count({
            where: { driverId: driver.id, status: { in: ACTIVE_STATUSES } },
        })
        if (active > 0) return res.status(409).json({ error: 'Finish your active ride before going offline' })
    }

    await prisma.driver.update({
        where: { id: driver.id },
        data: { isOnline },
    })

    return res.json({ isOnline })
})

driverRouter.post('/location', protect, async (req, res) => {
    const driver = await requireDriverForAssignedWork(req, res)
    if (!driver) return
    if (!driver.isOnline) return res.status(403).json({ error: 'Driver is not online' })

    const parsed = locationSchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', issues: parsed.error.issues })
    }
    const { lat, lng } = parsed.data //From phone from expo helper fn

    const previous = await prisma.driverLocation.findUnique({
        where: { driverId: driver.id },
    })

    let speedKmh: number | null = null
    let bearing: number | null = null

    const now = new Date()

    if (previous) {
        const distance = haversineDistance(previous.latitude, previous.longitude, lat, lng)
        const seconds = (now.getTime() - previous.updatedAt.getTime()) / 1000

        if (seconds > 0) speedKmh = (distance / seconds) * 3600
        bearing = getBearing(previous.latitude, previous.longitude, lat, lng)
    }

    await prisma.driverLocation.upsert({
        where: { driverId: driver.id },
        create: { driverId: driver.id, latitude: lat, longitude: lng, speedKmh, bearing },
        update: { latitude: lat, longitude: lng, speedKmh, bearing },
    })

    return res.json({ ok: true })
})

/**
 * A captain gives a ride back.
 *
 * NOT THE SAME ACT AS A RIDER CANCELLING, and it is deliberately narrower. He may
 * hand back a ride he has taken but not begun — something came up, the car will
 * not start, he misjudged the distance — and the booking goes back out to
 * dispatch rather than dying. Once he has marked himself ARRIVED that stops being
 * true: the rider is standing there waiting for him, and walking away at that
 * point is a support conversation, not a button.
 *
 * BEFORE_ARRIVAL is exactly the window the app offers it in, and the server keeps
 * its own copy of the rule because a client that has been open a while can be
 * showing a button for a state the ride has already left.
 *
 * The booking returns to `confirmed`, not `pending`: it was confirmed once and
 * the rider has not changed anything. Its offers are all withdrawn — the ride is
 * about to be offered again and stale rows would let a second captain accept a
 * ride he was never re-offered — and the seats come back, the same way and for
 * the same reasons as in the rider's cancel.
 *
 * NO CANCELLATION CHARGE. That number is the rider's for changing her mind; a
 * captain handing back a ride owes nothing under any rule written so far.
 */
const DRIVER_CANCELLABLE_STATUSES: BookingStatus[] = ['assigned', 'en_route']

driverRouter.patch('/rides/:id/cancel', protect, async (req, res) => {
    const driver = await requireDriverForAssignedWork(req, res)
    if (!driver) return

    const parsed = rideParamsSchema.safeParse(req.params)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid booking id', issues: parsed.error.issues })
    }

    const booking = await prisma.booking.findUnique({ where: { id: parsed.data.id } })
    if (!booking) return res.status(404).json({ error: 'Booking not found' })
    if (booking.driverId !== driver.id) return res.status(403).json({ error: 'Forbidden' })

    if (!DRIVER_CANCELLABLE_STATUSES.includes(booking.status)) {
        return res.status(409).json({
            error: booking.status === 'reached' || booking.status === 'started'
                ? 'Call support to drop a ride you have already reached'
                : `Cannot cancel a ${booking.status} ride`,
            status: booking.status,
        })
    }

    const seats = seatsOf(driver.vehicleClass)

    await prisma.$transaction(async (tx) => {
        // Guarded on the status it was read at, so two taps — or a tap racing the
        // rider's own cancel — cannot both take effect.
        const { count } = await tx.booking.updateMany({
            where: { id: booking.id, status: booking.status },
            data: { status: 'confirmed', driverId: null },
        })
        if (count === 0) return

        await tx.rideOffer.updateMany({
            where: { bookingId: booking.id, status: 'pending' },
            data: { status: 'withdrawn', respondedAt: new Date() },
        })

        if (seats !== null) {
            if (booking.sharing) {
                // One seat back, capped in the WHERE rather than in JS — see the
                // identical guard in the rider's cancel for why the cap cannot be
                // decided against a value read before the transaction.
                await tx.driver.updateMany({
                    where: { id: driver.id, vehicleCapacity: { lt: seats } },
                    data: { vehicleCapacity: { increment: 1 } },
                })
            } else {
                await tx.driver.update({
                    where: { id: driver.id },
                    data: { vehicleCapacity: seats },
                })
            }
        }
    })

    return res.json({ bookingId: booking.id, status: 'confirmed' })
})

driverRouter.post('/fcm-token', protect, async (req, res) => {
    const driver = await requireDriverForAssignedWork(req, res)
    if (!driver) return

    const parsed = fcmTokenSchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', issues: parsed.error.issues })
    }
    const { fcmToken } = parsed.data

    await prisma.driver.update({
        where: { id: driver.id },
        data: { fcmToken },
    })

    return res.json({ ok: true })
})

driverRouter.get('/upcoming-ride', protect, async (req, res) => {
    const driver = await requireDriverForAssignedWork(req, res)
    if (!driver) return

    const booking = await prisma.booking.findFirst({
        where: {
            driverId: driver.id,
            status: "assigned",
        },
        select: {
            id: true,
            reference: true,
            status: true,
            pickupAddress: true,
            dropAddress: true,
            scheduledAt: true,
            fare: true,
            vehicleClass: true,
            sharing: true,
            isOutstation: true,
        },
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
    })

    return res.json({ booking })
})

driverRouter.get('/rides', protect, async (req, res) => {
    const driver = await requireDriverForAssignedWork(req, res)
    if (!driver) return

    const parsed = driverRidesQuerySchema.safeParse(req.query)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid query', issues: parsed.error.issues })
    }
    const { scope, page, limit } = parsed.data
    const isHistory = scope === 'history'

    const bookings = await prisma.booking.findMany({
        where: {
            driverId: driver.id,
            status: { in: isHistory ? [...HISTORY_STATUSES] : ACTIVE_STATUSES },
        },
        select: {
            id: true,
            reference: true,
            status: true,
            pickupAddress: true,
            dropAddress: true,
            scheduledAt: true,
            fare: true,
            vehicleClass: true,
            sharing: true,
            isOutstation: true,
            // Both below are read only by the panel Home gives the ride being driven
            // — who is in the car, and the number to call. They stay on the list
            // rather than waiting for /rides/:id because that panel is the first
            // thing the app renders.
            customerPhone: true,
            user: { select: { name: true } },
            // Everything from here down is the Rides page's expanded row. It is on the
            // list rather than behind /rides/:id because expanding is a fold, not a
            // navigation: a captain checking what he earned opens three rows in a row,
            // and three round trips to answer taps on a list already in hand is the
            // kind of latency that gets an app closed at a traffic light.
            needsCarrier: true,
            distanceKm: true,
            rideFare: true,
            commissionPct: true,
            commissionAmt: true,
            cancelledBy: true,
            cancellationCharge: true,
            startedAt: true,
            completedAt: true,
            createdAt: true,
        },
        // History reads newest-first — the ride you just finished is the one you are
        // most likely looking for. Upcoming reads soonest-first, for the same reason.
        //
        // createdAt rather than completedAt, though completedAt is what the app files
        // a finished ride under. A cancelled ride has no completion stamp — there is
        // no cancelledAt column at all — and Postgres sorts nulls FIRST on DESC, so
        // ordering by it would float every cancellation to the top of the list. This
        // column is total and never null, which is what a paging key has to be; the
        // app re-sorts the page it gets by the moment each ride actually happened.
        orderBy: isHistory
            ? [{ createdAt: 'desc' }]
            : [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
        ...(isHistory ? { skip: (page - 1) * limit, take: limit } : {}),
    })

    // Aggregated in the database rather than summed from `bookings` above. The rows
    // sent back are one page of at most `limit`, so adding them up would quietly stop
    // counting the moment a captain had a better week than the page size — and it
    // would undercount by exactly the amount he most wants to see. Completed rides
    // only: a cancellation charge is money owed to the provider, not a ride he did.
    const weekStart = startOfWeekIST(new Date())
    const week = isHistory
        ? await prisma.booking.aggregate({
            where: {
                driverId: driver.id,
                status: 'completed',
                completedAt: { gte: weekStart },
            },
            _sum: { fare: true, commissionAmt: true },
            _count: { _all: true },
        })
        : null

    return res.json({
        bookings: bookings.map(({ startedAt, completedAt, ...booking }) => ({
            ...booking,
            completedAt,
            durationMin: drivenMinutes(startedAt, completedAt),
            paymentState: paymentStateOf(booking),
        })),
        // Null on the upcoming board, which has nothing to total. `earned` is what
        // reached the captain — the same fare-minus-commission the expanded row calls
        // "You keep", so the panel and the rows under it cannot disagree.
        summary: week && {
            earned: (week._sum.fare ?? 0) - (week._sum.commissionAmt ?? 0),
            rides: week._count._all,
            since: weekStart,
        },
        // Only meaningful on history; the app stops asking for more when it is false.
        hasMore: isHistory && bookings.length === limit,
    })
})

driverRouter.get('/rides/:id', protect, async (req, res) => {
    const driver = await requireDriverForAssignedWork(req, res)
    if (!driver) return

    const parsed = rideParamsSchema.safeParse(req.params)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid booking id', issues: parsed.error.issues })
    }
    const { id } = parsed.data

    const booking = await prisma.booking.findUnique({
        where: { id },
        include: { user: { select: { name: true, phone: true } } },
    })
    if (!booking) return res.status(404).json({ error: 'Booking not found' })
    if (booking.driverId !== driver.id) return res.status(403).json({ error: 'Forbidden' })

    // The list row's fields are all repeated here, under the same names and derived by
    // the same two helpers. The captain app's detail screen is the expanded form of a
    // row it already drew, so the two payloads have to agree on what a booking looks
    // like — a screen that had to translate between two shapes of the same record is a
    // screen that will eventually disagree with the list it was opened from.
    return res.json({
        // `id` as well as `bookingId`. The old name stays because it is what this
        // endpoint has always answered with; `id` is what every client type keys on.
        id: booking.id,
        bookingId: booking.id,
        // What the captain reads out on a support call. `id` stays in the payload
        // because it is what the app keys rows on and what /driver/rides/:id takes.
        reference: booking.reference,
        status: booking.status,
        isOutstation: booking.isOutstation,
        pickupAddress: booking.pickupAddress,
        pickupLat: booking.pickupLat,
        pickupLng: booking.pickupLng,
        dropAddress: booking.dropAddress,
        dropLat: booking.dropLat,
        dropLng: booking.dropLng,
        vehicleClass: booking.vehicleClass,
        needsCarrier: booking.needsCarrier,
        fare: booking.fare,
        rideFare: booking.rideFare,
        distanceKm: booking.distanceKm,
        scheduledAt: booking.scheduledAt,
        preferSafeRoute: booking.preferSafeRoute,
        safeWaypointLat: booking.safeWaypointLat,
        safeWaypointLng: booking.safeWaypointLng,
        sharing: booking.sharing,
        shareGroupId: booking.shareGroupId,
        pickupOrder: booking.pickupOrder,
        commissionPct: booking.commissionPct,
        commissionAmt: booking.commissionAmt,
        cancelledBy: booking.cancelledBy,
        cancellationCharge: booking.cancellationCharge,
        completedAt: booking.completedAt,
        createdAt: booking.createdAt,
        durationMin: drivenMinutes(booking.startedAt, booking.completedAt),
        paymentState: paymentStateOf(booking),
        // The number the Call rider button dials. customerPhone is the one captured on
        // the booking; user.phone is the account's. They are usually the same and the
        // booking's is the one that ride was made with.
        customerPhone: booking.customerPhone,
        user: {
            name: booking.user.name,
            phone: booking.user.phone,
        },
    })
})

driverRouter.patch('/rides/:id/status', protect, async (req, res) => {
    const driver = await requireDriverForAssignedWork(req, res)
    if (!driver) return

    const parsedParams = rideParamsSchema.safeParse(req.params)
    if (!parsedParams.success) {
        return res.status(400).json({ error: 'Invalid booking id', issues: parsedParams.error.issues })
    }
    const { id } = parsedParams.data

    const parsedBody = rideStatusSchema.safeParse(req.body)
    if (!parsedBody.success) {
        return res.status(400).json({ error: 'Invalid request body', issues: parsedBody.error.issues })
    }
    const { to, otp, lat, lng } = parsedBody.data

    const booking = await prisma.booking.findUnique({
        where: { id },
        select: {
            id: true,
            status: true,
            driverId: true,
            sharing: true,
            // The four the unmatched-fare switch below reads. `shareGroupId` is
            // the whole test — it is written only when somebody actually joined,
            // so null on a shared ride that has reached its drop means nobody did.
            shareGroupId: true,
            soloFare: true,
            fare: true,
            rideFare: true,
            pickupLat: true,
            pickupLng: true,
            dropLat: true,
            dropLng: true,
            user: { select: { bookingCode: true } },
        },
    })
    if (!booking) return res.status(404).json({ error: 'Booking not found' })
    if (booking.driverId !== driver.id) return res.status(403).json({ error: 'Forbidden' })

    if (booking.status === to) {
        return res.json({ bookingId: booking.id, status: to, alreadyApplied: true })
    }

    const from: BookingStatus = booking.status
    const legalFrom: readonly BookingStatus[] = RIDE_TRANSITIONS[to as RideTransition]
    if (!legalFrom.includes(from)) {
        return res.status(409).json({ error: `Cannot move a ${from} ride to ${to}`, status: from })
    }

    const hasFix = lat !== undefined && lng !== undefined
    let distanceKm: number | null = null
    if (hasFix) {
        distanceKm = to === 'completed'
            ? haversineDistance(lat, lng, booking.dropLat, booking.dropLng)
            : haversineDistance(lat, lng, booking.pickupLat, booking.pickupLng)
    }

    if (to === 'started') {
        if (!otp || otp !== booking.user.bookingCode) {
            return res.status(403).json({ error: 'Wrong OTP' })
        }
    }

    // EVERY TRANSITION NEEDS ITS OWN ARM HERE. The last one is a catch-all, not a
    // test for 'completed' — so a status added to the schema and the table above
    // and forgotten here does not error, it falls through and stamps completedAt
    // on a ride that has barely begun. The row then reads as finished to
    // everything that goes by timestamps while its status says otherwise, and
    // nothing anywhere complains.
    //
    // en_route carries no timestamp because there is no column for one. An
    // `enRouteAt` would be worth a migration if the accept-to-set-off lag is ever
    // worth measuring — it is the number that says whether captains sit on rides
    // they have accepted — but the status works without it.
    const now = new Date()
    const data: Record<string, unknown> =
        to === 'en_route' ? { status: to } :
            to === 'reached' ? { status: to, reachedAt: now, reachedDistanceKm: distanceKm } :
                to === 'started' ? { status: to, startedAt: now } :
                    { status: to, completedAt: now, completedDistanceKm: distanceKm }

    // THE UNMATCHED-SHARE FARE SWITCH.
    //
    // A rider who chose sharing was quoted two prices and shown both: the
    // discounted one if somebody joins, the solo one if nobody does. This is
    // where the second one is applied. `shareGroupId` is the test and the only
    // one needed — it is written solely by a successful join, so a shared ride
    // arriving at `completed` without one was driven alone.
    //
    // COMPLETION IS THE EARLIEST HONEST MOMENT, not merely a convenient one. A
    // joiner can be added right up until the host's drop (rule B), so any earlier
    // switch would charge a rider the solo fare for a ride that then went on to
    // be shared.
    //
    // A joiner who matched and then cancelled leaves shareGroupId set, and the
    // discount stands. That is deliberate: the rider did nothing wrong, and the
    // rule stays a single column test rather than an audit of who cancelled when.
    if (
        to === 'completed' &&
        booking.sharing &&
        !booking.shareGroupId &&
        booking.soloFare != null &&
        booking.rideFare != null
    ) {
        // The pass-through charges are identical under both prices — one toll
        // barrier, one roof carrier — so the gap between fare and rideFare
        // carries across unchanged and the solo ride fare needs no re-itemising.
        const extras = booking.fare - booking.rideFare
        const soloRideFare = Math.max(0, booking.soloFare - extras)

        // Recomputed, never scaled. Commission only applies above
        // COMMISSION_MIN_FARE, so a shared fare under the floor pays nothing
        // while the solo fare above it pays 5% — scaling the stored amount would
        // keep a zero at zero and quietly hand the cut away.
        // couponAmount 0: an unmatched share reverts to the solo fare, and no
        // coupon has been redeemed against this booking (redemption ships with
        // ROADMAP block 12). Passed explicitly — the floor is post-coupon now.
        const { pct, amt } = commissionOn({ rideFare: soloRideFare, couponAmount: 0 })

        data.fare = booking.soloFare
        data.rideFare = soloRideFare
        data.commissionPct = pct
        data.commissionAmt = amt
    }

    const seats = seatsOf(driver.vehicleClass)

    // The transition and the seats it frees go together: a completed ride whose
    // capacity write never landed leaves the vehicle permanently short a seat, and
    // nothing later recomputes it.
    const moved = await prisma.$transaction(async (tx) => {
        const { count } = await tx.booking.updateMany({
            where: { id: booking.id, status: from },
            data,
        })
        if (count === 0) return false

        if (to === 'completed' && seats !== null) {
            if (booking.sharing) {
                // The cap belongs in the WHERE, not in a ternary over the snapshot
                // read at the top of the request. `increment: stale < seats ? 1 : 0`
                // decides against a value another finishing ride may already have
                // changed, which can walk the vehicle past its own seat count.
                await tx.driver.updateMany({
                    where: { id: driver.id, vehicleCapacity: { lt: seats } },
                    data: { vehicleCapacity: { increment: 1 } },
                })
            } else {
                // Solo had the whole vehicle, so this is an absolute write back to
                // full — idempotent, and needs no guard.
                await tx.driver.update({
                    where: { id: driver.id },
                    data: { vehicleCapacity: seats },
                })
            }
        }

        return true
    })

    if (!moved) {
        return res.status(409).json({ error: 'Ride changed while the request was in flight' })
    }

    // The ride just ended, so a driver whose paperwork lapsed while he was
    // driving can now be taken off the road. recomputeDriverVerification defers
    // going offline while a ride is in progress — deliberately, because flipping
    // the flag mid-ride tells a captain he is offline while a rider is in his
    // car and undoes nothing — and this is the moment the deferral is over.
    //
    // Outside the transaction above, which is about the ride and its seats, and
    // never allowed to fail the request: the status change has committed and is
    // what the app is waiting for. The hourly sweep in services/driverDocuments
    // is the backstop if this loses.
    if (to === 'completed') {
        try {
            await prisma.$transaction((tx) => recomputeDriverVerification(driver.id, tx))
        } catch (err) {
            console.error(`driver: could not recompute verification for ${driver.id}:`, (err as Error).message)
        }
    }

    return res.json({ bookingId: booking.id, status: to, distanceKm })
})

// The notification page. Every scheduled offer this driver still holds, in the
// state the spec requires: an offer he has neither accepted nor rejected stays
// here until he answers it or the ride goes to somebody else.
//
// Deliberately NOT filtered by isOnline. An offline driver is supposed to see
// these — that is the whole reason offers are rows — and the app shows him
// "Go Online to Accept" instead of hiding the ride.
driverRouter.get('/offers', protect, async (req, res) => {
    const driver = await requireApprovedDriver(req, res)
    if (!driver) return

    const offers = await prisma.rideOffer.findMany({
        where: { driverId: driver.id, status: 'pending' },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            createdAt: true,
            booking: {
                select: {
                    id: true, reference: true, pickupAddress: true, pickupLat: true, pickupLng: true,
                    dropAddress: true, dropLat: true, dropLng: true,
                    fare: true, vehicleClass: true, scheduledAt: true,
                    sharing: true, needsCarrier: true, status: true,
                    // What the offer card shows beyond the route and the fare.
                    // Each of these changes whether a captain wants the ride at
                    // all: how far he will actually drive, whether it takes him
                    // out of the city for the day, and whether it runs the longer
                    // safer way. He is deciding in a few seconds, so anything he
                    // would otherwise have to accept the ride to discover belongs
                    // in this list.
                    distanceKm: true, isOutstation: true, preferSafeRoute: true,
                },
            },
        },
    })

    return res.json({
        // canAccept is the server's answer, not the app's guess — the accept
        // endpoint enforces the same rule and the two must not disagree.
        canAccept: driver.isOnline,
        offers: offers
            // A booking that moved on between the sweep and this read: the
            // withdrawal sweep will catch it, but never show a dead ride.
            .filter((o) => ASSIGNABLE_STATUSES.includes(o.booking.status))
            .map((o) => ({
                offerId: o.id,
                offeredAt: o.createdAt,
                bookingId: o.booking.id,
                reference: o.booking.reference,
                pickup: { address: o.booking.pickupAddress, lat: o.booking.pickupLat, lng: o.booking.pickupLng },
                drop: { address: o.booking.dropAddress, lat: o.booking.dropLat, lng: o.booking.dropLng },
                fare: o.booking.fare,
                vehicleClass: o.booking.vehicleClass,
                pickupTime: formatPickupTime(o.booking.scheduledAt),
                // THE RAW DATE AS WELL AS THE LABEL, and the null is the point.
                // formatPickupTime answers with prose — a locale stamp, or the
                // words 'IMMEDIATE PICKUP' — which is right for a notification
                // body and useless to a screen: the app cannot restyle it, cannot
                // say "in 3 days", and would have to STRING-MATCH those two words
                // to tell a scheduled ride from an on-spot one. scheduledAt is
                // null for immediate, so the same question is a null check.
                scheduledAt: o.booking.scheduledAt,
                // Nullable by design — a booking exists before its route has been
                // priced — so the card needs a dash, not a number, when it is
                // missing. This is the trip length; how far away the PICKUP is
                // gets measured in the app against its own last GPS fix.
                distanceKm: o.booking.distanceKm,
                isOutstation: o.booking.isOutstation,
                // The rider asked for the safer way. It is his request rather than
                // the computed detour (safeWaypointLat/Lng hold that) — what the
                // captain needs to know is that the route is not the short one.
                safeRoute: o.booking.preferSafeRoute,
                sharing: o.booking.sharing,
                needsCarrier: o.booking.needsCarrier,
            })),
    })
})

// Accept a scheduled offer.
//
// The offline rule lives here: an offline driver may HOLD an offer but cannot
// take it. Everything else is the same guard the ride-now accept uses —
// claimBookingForDriver — because with an offer broadcast to a whole group, two
// drivers tapping accept at the same time is the normal case, not an edge one.
driverRouter.patch('/offers/:id/accept', protect, async (req, res) => {
    const driver = await requireApprovedDriver(req, res)
    if (!driver) return

    const parsed = rideParamsSchema.safeParse(req.params)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid offer id', issues: parsed.error.issues })
    }

    if (!driver.isOnline) {
        return res.status(409).json({ error: 'Go online to accept this ride', code: 'OFFLINE' })
    }

    const offer = await prisma.rideOffer.findUnique({
        where: { id: parsed.data.id },
        include: { booking: true },
    })

    if (!offer || offer.driverId !== driver.id) return res.status(404).json({ error: 'Offer not found' })
    if (offer.status !== 'pending') {
        return res.status(409).json({ error: `This offer was already ${offer.status}`, status: offer.status })
    }

    const booking = offer.booking
    if (!ASSIGNABLE_STATUSES.includes(booking.status)) {
        return res.status(409).json({ error: `A ${booking.status} ride cannot be accepted`, status: booking.status })
    }

    const seats = seatsOf(driver.vehicleClass)
    const hasRoom = booking.sharing
        ? driver.vehicleCapacity > 0
        : seats !== null && driver.vehicleCapacity >= seats
    if (!hasRoom) return res.status(409).json({ error: 'Vehicle has no room for this ride' })

    // Everything above is a read-then-check against a snapshot, and two drivers
    // tapping accept at the same instant BOTH pass all of it. Those checks buy a
    // specific error message in the ordinary case; this call is the only thing
    // deciding who actually gets the ride — and, via the capacity guard, whether
    // this driver had room for it at the moment he asked.
    const claim = await claimBookingForDriver(
        booking,
        driver,
        booking.confirmedAt ?? new Date(),
        // Both inside the claim's transaction: answering his own offer, and
        // taking the ride off everyone else's notification page.
        async (tx) => {
            await tx.rideOffer.update({
                where: { id: offer.id },
                data: { status: 'accepted', respondedAt: new Date() },
            })
            await withdrawOtherOffers(booking.id, driver.id, tx)
        },
    )

    if (claim === 'booking_taken') {
        // Somebody else got there first. Take this offer off his page rather than
        // leaving it to be tapped again.
        await prisma.rideOffer.updateMany({
            where: { id: offer.id, status: 'pending' },
            data: { status: 'withdrawn', respondedAt: new Date() },
        })
        return res.status(409).json({ error: 'Ride was taken while the request was in flight' })
    }

    if (claim === 'no_room') {
        // His own second accept beat this one to the seats. The offer stays
        // pending on purpose — finish a ride and it fits again.
        return res.status(409).json({ error: 'Vehicle has no room for this ride' })
    }

    return res.json({
        bookingId: booking.id,
        status: 'assigned',
        pickup: { address: booking.pickupAddress, lat: booking.pickupLat, lng: booking.pickupLng },
        drop: { address: booking.dropAddress, lat: booking.dropLat, lng: booking.dropLng },
        fare: booking.fare,
        vehicleClass: booking.vehicleClass,
        pickupTime: formatPickupTime(booking.scheduledAt),
        // Released only now. An offer is not an assignment, so the rider's number
        // is not in the offer payload.
        customerPhone: booking.customerPhone,
    })
})

// Reject an offer. Unlike accept, this works OFFLINE: a driver who knows he
// can't do Tuesday's 6am should be able to say so without going online first,
// and the sooner he does the sooner the ride escalates to the next group.
driverRouter.patch('/offers/:id/reject', protect, async (req, res) => {
    const driver = await requireApprovedDriver(req, res)
    if (!driver) return

    const parsed = rideParamsSchema.safeParse(req.params)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid offer id', issues: parsed.error.issues })
    }

    // Guarded on `pending` and on ownership in one write, so a double-tap or a
    // race with the withdrawal sweep cannot overwrite an answer already given.
    const { count } = await prisma.rideOffer.updateMany({
        where: { id: parsed.data.id, driverId: driver.id, status: 'pending' },
        data: { status: 'rejected', respondedAt: new Date() },
    })

    if (count === 0) return res.status(409).json({ error: 'Offer not found, or already answered' })

    return res.json({ offerId: parsed.data.id, status: 'rejected' })
})

driverRouter.patch('/rides/:id/accept', protect, async (req, res) => {
    const driver = await requireApprovedDriver(req, res)
    if (!driver) return

    const parsed = rideParamsSchema.safeParse(req.params)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid booking id', issues: parsed.error.issues })
    }
    const { id } = parsed.data

    const booking = await prisma.booking.findUnique({ where: { id } })

    if (!booking) return res.status(404).json({ error: 'Booking not found' })

    if (!ASSIGNABLE_STATUSES.includes(booking.status)) {
        return res.status(409).json({ error: `A ${booking.status} ride cannot be accepted`, status: booking.status })
    }

    const seats = seatsOf(driver.vehicleClass)
    const hasRoom = booking.sharing
        ? driver.vehicleCapacity > 0
        : seats !== null && driver.vehicleCapacity >= seats
    if (!hasRoom) return res.status(409).json({ error: 'Vehicle has no room for this ride' })

    // Same as the scheduled path: the hasRoom check above is a snapshot two
    // concurrent requests both pass, and this is what settles both the ride and
    // the seats.
    const claim = await claimBookingForDriver(booking, driver, booking.confirmedAt ?? new Date())

    if (claim === 'booking_taken') {
        return res.status(409).json({ error: 'Ride was taken while the request was in flight' })
    }
    if (claim === 'no_room') {
        return res.status(409).json({ error: 'Vehicle has no room for this ride' })
    }

    return res.json({
        bookingId: booking.id,
        status: 'assigned',
        pickup: {
            address: booking.pickupAddress,
            lat: booking.pickupLat,
            lng: booking.pickupLng,
        },
        drop: {
            address: booking.dropAddress,
            lat: booking.dropLat,
            lng: booking.dropLng,
        },
        fare: booking.fare,
        vehicleClass: booking.vehicleClass,
        pickupTime: formatPickupTime(booking.scheduledAt),
        customerPhone: booking.customerPhone,
    })
})


driverRouter.patch('/rides/:id/decline', protect, async (req, res) => {
    const driver = await requireApprovedDriver(req, res)
    if (!driver) return

    const parsed = rideParamsSchema.safeParse(req.params)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid booking id', issues: parsed.error.issues })
    }
    const { id } = parsed.data

    const booking = await prisma.booking.findUnique({
        where: { id },
        select: { id: true, status: true },
    })

    if (!booking) return res.status(404).json({ error: 'Booking not found' })

    if (!ASSIGNABLE_STATUSES.includes(booking.status)) {
        return res.status(409).json({ error: `A ${booking.status} ride cannot be declined`, status: booking.status })
    }

    console.log(`Ride ${booking.id} declined by driver ${driver.id}`)

    return res.json({
        bookingId: booking.id,
        status: booking.status,
    })
})


export default driverRouter
