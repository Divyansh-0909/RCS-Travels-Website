import { Router } from 'express'
import { getAuth } from '@clerk/express'
import type { Prisma } from '@prisma/client'
import { protect, protectAdmin } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import { getFareZones, saveFareZones } from '../services/fareZones.js'
import { bookingListQuerySchema, driverListQuerySchema, userListQuerySchema, fareZoneCollectionSchema, rideParamsSchema, reviewDocumentSchema, suspendDriverSchema, driverGroupSchema } from '../types.ts'
import { normalizeReference } from '../lib/bookingReference.js'
// Already annotated as BookingStatus[] at its definition, which is what lets it be
// used in a `status: { in: … }` filter from a .ts file — see the comment there.
import { ACTIVE_STATUSES } from './bookings.js'
import {
    documentLabelOf,
    PROFILE_PHOTO_TYPE,
    REQUIRED_DRIVER_DOCUMENTS,
    REQUIRED_DRIVER_OWNED_DOCUMENTS,
    REQUIRED_VEHICLE_OWNED_DOCUMENTS,
} from '../constants/driverDocuments.js'
import {
    notifyDocumentApproved,
    notifyDocumentRejected,
    notifyDriverApproved,
    remainingRequired,
} from '../services/documentNotifications.js'
import { signedDocumentUrl } from '../services/documentScan.js'
import { promoteReplacement, recomputeAfterDocumentChange } from '../services/driverDocuments.js'
import { withdrawOffersForDriver } from '../services/scheduledOffers.js'

// Three list endpoints, the fare-zone editor, document review, suspension, and
// the move between the RCS fleet and the partner pool.
//
// THERE IS NO "APPROVE THIS DRIVER" ENDPOINT, and that is deliberate rather than
// missing. A captain's verificationStatus is DERIVED — recomputeDriverVerification
// returns `approved` exactly when every required document is approved and still
// valid, and it is recomputed on every document review, every renewal and every
// expiry sweep. A manual override would be a fourth writer of a field the other
// three keep recomputing, so it would survive until the next sweep and then
// silently revert. Approving the documents IS approving the captain.
//
// Suspension is the opposite case and needs its own column precisely because it is
// NOT derivable from anything: it is a judgement about conduct, so somebody has to
// record it, with a reason, and be able to lift it. Manual booking re-assignment is
// still unbuilt.
//
// Every route is behind protectAdmin (metadata.role === 'admin' on the Clerk session).
const adminRouter = Router()

adminRouter.get('/booking', protect, protectAdmin, async (req, res) => {
    const parsed = bookingListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid query parameters', issues: parsed.error.issues })
    }
    const { search, status, startDate, endDate, customerPhone, customerName, driverName, vehicleClass, source, isOutstation, cancelledBy, page, limit } = parsed.data

    const where: Prisma.BookingWhereInput = {}
    if (search) {
        // A whole booking reference → that one ride; digits → phone search; anything
        // else → names, addresses, and ride-id prefix.
        const compact = search.replace(/[\s+\-()]/g, '')
        const reference = normalizeReference(search)
        if (reference) {
            // Ahead of the phone branch on purpose: a reference pasted without its
            // RCS is seven digits, which the phone branch would otherwise take and
            // answer nothing for. Equality, since the whole value is in hand.
            where.reference = reference
        } else if (/^\d+$/.test(compact)) {
            where.OR = [
                { customerPhone: { contains: compact } },
                { driver: { phone: { contains: compact } } },
            ]
        } else {
            where.OR = [
                { id: { startsWith: search } },
                { reference: { startsWith: compact.toUpperCase() } },
                { user: { name: { contains: search, mode: 'insensitive' } } },
                { driver: { name: { contains: search, mode: 'insensitive' } } },
                { pickupAddress: { contains: search, mode: 'insensitive' } },
                { dropAddress: { contains: search, mode: 'insensitive' } },
            ]
        }
    }
    if (status) where.status = status
    if (customerPhone) where.customerPhone = { contains: customerPhone }
    if (customerName) where.user = {
        name: { contains: customerName, mode: "insensitive" },
    }
    if (driverName) where.driver = {
        name: { contains: driverName, mode: "insensitive" },
    }
    if (vehicleClass) where.vehicleClass = vehicleClass
    if (source) where.source = source
    if (isOutstation !== undefined) where.isOutstation = isOutstation
    if (cancelledBy) where.cancelledBy = cancelledBy
    if (startDate || endDate) {
        const scheduledAt: Prisma.DateTimeFilter = {}
        if (startDate) scheduledAt.gte = new Date(`${startDate}T00:00:00+05:30`)
        if (endDate) {
            const end = new Date(`${endDate}T00:00:00+05:30`)
            end.setDate(end.getDate() + 1)
            scheduledAt.lt = end
        }
        where.scheduledAt = scheduledAt
    }

    // Only the fields the dashboard renders; `shareGroupId` is kept for the co-rider grouping below.
    const bookingSelect = {
        id: true,
        // The readable ride name, "RCS4831902". Filtered on above and printed by
        // the expanded card, but it was never SELECTED — so the card rendered
        // "Ride ID:" followed by nothing, and the copy button beside it put the
        // word `undefined` on the clipboard. `id` stays because it keys the row.
        reference: true,
        customerPhone: true,
        pickupAddress: true,
        dropAddress: true,
        vehicleClass: true,
        scheduledAt: true,
        createdAt: true,
        isOutstation: true,
        fare: true,
        status: true,
        source: true,
        sharing: true,
        shareGroupId: true,
        user: { select: { name: true } },
        driver: { select: { name: true, phone: true } },
    } satisfies Prisma.BookingSelect

    const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
            where,
            select: bookingSelect,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.booking.count({ where }),
    ])

    // Attach co-riders: each is a separate booking row with the same shareGroupId.
    type AdminBooking = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>
    type GroupMember = { id: string; shareGroupId: string | null; customerPhone: string; user: { name: string | null } }
    const shareGroupIds = [...new Set(
        bookings.filter((b: AdminBooking) => b.sharing && b.shareGroupId).map((b: AdminBooking) => b.shareGroupId as string)
    )]
    let groupMembers: GroupMember[] = []
    if (shareGroupIds.length > 0) {
        groupMembers = await prisma.booking.findMany({
            where: { shareGroupId: { in: shareGroupIds } },
            select: { id: true, shareGroupId: true, customerPhone: true, user: { select: { name: true } } },
        })
    }
    const bookingsWithCoRiders = bookings.map((b: AdminBooking) => ({
        ...b,
        coRiders: b.sharing && b.shareGroupId
            ? groupMembers
                .filter(m => m.shareGroupId === b.shareGroupId && m.id !== b.id)
                .map(m => ({ name: m.user.name, phone: m.customerPhone }))
            : [],
    }))

    res.json({ total, page, limit, bookings: bookingsWithCoRiders })
})

adminRouter.get('/driver', protect, protectAdmin, async (req, res) => {
    const parsed = driverListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid query parameters', issues: parsed.error.issues })
    }
    const { search, driverName, driverPhone, vehicleClass, vehicleNumber, verificationStatus, group, isOnline, startDate, endDate, page, limit } = parsed.data

    const where: Prisma.DriverWhereInput = {}
    if (search) {
        const compact = search.replace(/[\s+\-()]/g, '')
        if (/^\d+$/.test(compact)) {
            where.OR = [
                { phone: { contains: compact } },
                { vehicleNumber: { contains: compact, mode: 'insensitive' } },
            ]
        } else {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { vehicleNumber: { contains: search, mode: 'insensitive' } },
            ]
        }
    }
    if (driverName) where.name = {
        contains: driverName,
        mode: "insensitive",
    }
    if (driverPhone) where.phone = driverPhone
    if (isOnline !== undefined) where.isOnline = isOnline
    if (vehicleClass) where.vehicleClass = vehicleClass
    if (vehicleNumber) where.vehicleNumber = {
        contains: vehicleNumber ,
        mode: "insensitive",
    }
    if (verificationStatus) where.verificationStatus = verificationStatus
    if (group) where.group = group
    if (startDate || endDate) {
        const createdAt: Prisma.DateTimeFilter = {}
        if (startDate) createdAt.gte = new Date(`${startDate}T00:00:00+05:30`)
        if (endDate) {
            const end = new Date(`${endDate}T00:00:00+05:30`)
            end.setDate(end.getDate() + 1)
            createdAt.lt = end
        }
        where.createdAt = createdAt
    }

    const [drivers, total] = await Promise.all([
        prisma.driver.findMany({
            where,
            select: {
                id: true,
                name: true,
                phone: true,
                vehicleClass: true,
                vehicleNumber: true,
                isOnline: true,
                verificationStatus: true,
                // Which side of the fleet he drives on. On the list rather than
                // only on the review screen, because it is the one thing about a
                // captain an admin looks for without opening anything — "who is
                // in the fleet" is a question you ask of the whole page.
                group: true,
                // Both, not just the timestamp. A suspension the dashboard can
                // see but not explain is one an admin cannot decide whether to
                // lift, which is the only action he has.
                suspendedAt: true,
                suspensionReason: true,
                createdAt: true,
            },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.driver.count({ where }),
    ])

    res.json({ total, page, limit, drivers })
})

adminRouter.get('/user', protect, protectAdmin, async (req, res) => {
    const parsed = userListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid query parameters', issues: parsed.error.issues })
    }
    const { search, userName, userPhone, gender, startDate, endDate, page, limit } = parsed.data

    const where: Prisma.UserWhereInput = {}
    if (search) {
        const compact = search.replace(/[\s+\-()]/g, '')
        if (/^\d+$/.test(compact)) {
            where.OR = [
                { phone: { contains: compact } },
                { bookingCode: { contains: compact } },
            ]
        } else {
            where.OR = [
                { id: { startsWith: search } },
                { name: { contains: search, mode: 'insensitive' } },
            ]
        }
    }
    if (userName) where.name = {
        contains: userName,
        mode: "insensitive",
    }
    if (userPhone) where.phone = { contains: userPhone }
    if (gender) where.gender = { equals: gender, mode: "insensitive" }
    if (startDate || endDate) {
        const createdAt: Prisma.DateTimeFilter = {}
        if (startDate) createdAt.gte = new Date(`${startDate}T00:00:00+05:30`)
        if (endDate) {
            const end = new Date(`${endDate}T00:00:00+05:30`)
            end.setDate(end.getDate() + 1)
            createdAt.lt = end
        }
        where.createdAt = createdAt
    }

    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where,
            select: {
                id: true,
                name: true,
                phone: true,
                gender: true,
                bookingCode: true,
                createdAt: true,
                deletedAt: true,
                _count: { select: { bookings: true } },
            },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count({ where }),
    ])

    res.json({ total, page, limit, users })
})

// ─── Fare zones ──────────────────────────────────────────────────────────────
// The Edit Fares tab. The first mutation on this router, and the one with the
// widest blast radius: a save here changes what every rider is quoted on the
// next request, with no deploy in between.

adminRouter.get('/zones', protect, protectAdmin, (_req, res) => {
    res.json(getFareZones())
})

adminRouter.put('/zones', protect, protectAdmin, async (req, res) => {
    const parsed = fareZoneCollectionSchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid fare zones', issues: parsed.error.issues })
    }

    // Two zones sharing a name make the change summary ambiguous and any later
    // "which zone priced this ride" question unanswerable.
    const names = parsed.data.features.map(f => f.properties.name)
    const duplicate = names.find((n, i) => names.indexOf(n) !== i)
    if (duplicate) {
        return res.status(400).json({ error: `Do area ka naam ek jaisa hai: “${duplicate}”. Dono ke naam alag rakhein.` })
    }

    try {
        const saved = await saveFareZones(parsed.data, getAuth(req).userId)
        res.json(saved)
    } catch (err) {
        console.error('saveFareZones failed:', err)
        res.status(500).json({ error: 'Fare zones save nahi ho paaye. Dobara koshish karein.' })
    }
})

// Every document this driver holds, current and pending renewal, with a
// short-lived URL for the ones that passed the file check.
//
// The URL is minted per request and lives two minutes. It is not stored, not
// cached and not put on the driver-facing endpoint at all — a permanent URL to a
// private identity document is the thing this whole design exists to avoid.
adminRouter.get('/drivers/:id/documents', protect, protectAdmin, async (req, res) => {
    const parsed = rideParamsSchema.safeParse(req.params)
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid driver id', issues: parsed.error.issues })
    }

    const driver = await prisma.driver.findUnique({
        where: { id: parsed.data.id },
        select: {
            id: true, name: true, phone: true, verificationStatus: true,
            isOnline: true, activeVehicleId: true,
            // The review screen is where the move between fleet and partner pool
            // is made, so it has to be able to say which side he is on now — and
            // to recognise the owner's row, which it must not offer to move.
            group: true,
            // A suspension is invisible in verificationStatus by design — his
            // paperwork is still in order — so without these the review screen
            // would show a fully approved captain and no hint that he is stopped.
            suspendedAt: true, suspensionReason: true,
        },
    })
    if (!driver) return res.status(404).json({ error: 'Driver not found' })

    // His cars, so the documents below can be grouped under the one they belong
    // to. An admin reviewing a captain with two cars is looking at two RCs and
    // two insurance certificates, and a flat list gives him no way to tell which
    // is which — or to notice that the one he is approving is for the car sitting
    // in the man's yard rather than the one on the road.
    const vehicles = await prisma.vehicle.findMany({
        where: { driverId: driver.id },
        orderBy: { createdAt: 'asc' },
        select: {
            id: true, class: true, number: true, model: true,
            verificationStatus: true, createdAt: true,
        },
    })

    const documents = await prisma.driverDocument.findMany({
        where: { driverId: driver.id },
        orderBy: [{ isReplacement: 'asc' }, { uploadedAt: 'desc' }],
    })

    // Sequentially rather than Promise.all: ten Storage round trips fired at once
    // to render one screen is a burst this project has no reason to make, and the
    // screen is not waiting on a human's patience the way the app is.
    const withUrls = []
    for (const document of documents) {
        withUrls.push({
            id: document.id,
            type: document.type,
            label: documentLabelOf(document.type),
            required: REQUIRED_DRIVER_DOCUMENTS.includes(document.type),
            // Null for his licence and his photograph, which belong to the man.
            // Everything else names the car it is about.
            vehicleId: document.vehicleId,
            isReplacement: document.isReplacement,
            number: document.number,
            expiresAt: document.expiresAt,
            status: document.status,
            rejectionReason: document.rejectionReason,
            reviewedAt: document.reviewedAt,
            uploadedAt: document.uploadedAt,
            scanStatus: document.scanStatus,
            // The TECHNICAL reason, which the driver never sees. This is the
            // audience it was written for.
            scanReason: document.scanReason,
            fileHash: document.fileHash,
            // Null for anything not `clean` — signedDocumentUrl fails closed and
            // this endpoint does not second-guess it. An admin seeing no link
            // against a `failed` document is the system working.
            url: await signedDocumentUrl(document),
            // Only true when the row can actually be acted on. The dashboard
            // disables its buttons off this rather than deciding for itself.
            reviewable: document.scanStatus === 'clean',
        })
    }

    // What the same file looked like under previous certificates. Read-only and
    // never given a URL — this is the audit trail, not a second review queue.
    const history = await prisma.driverDocumentArchive.findMany({
        where: { driverId: driver.id },
        orderBy: { archivedAt: 'desc' },
        take: 50,
    })

    const hasCurrent = (type: string, vehicleId: string | null) =>
        documents.some((d) => d.type === type && !d.isReplacement && d.vehicleId === vehicleId)

    return res.json({
        driver,
        // Each car with its own verdict and its own outstanding list, so the
        // dashboard renders a section per vehicle. `isActive` is the one field an
        // admin needs and could not work out for himself: approving a document on
        // the car he is NOT driving changes nothing about whether he can work
        // today, and a screen that hides that invites the wrong conclusion when
        // the driver's own badge stays amber after an approval.
        vehicles: vehicles.map((vehicle) => ({
            ...vehicle,
            isActive: vehicle.id === driver.activeVehicleId,
            // LABELS, not type slugs. This list is printed straight onto the
            // review screen and nothing branches on it — an admin reading "Still
            // to upload: rc, permit_all_india" is being handed column names. The
            // captain app's own /me endpoints still send types, because that app
            // matches them against its checklist rows.
            missing: REQUIRED_VEHICLE_OWNED_DOCUMENTS
                .filter((type: string) => !hasCurrent(type, vehicle.id))
                .map(documentLabelOf),
        })),
        documents: withUrls,
        history,
        // The man's own two. The per-car lists live on `vehicles` above — a single
        // flat `missing` cannot mean anything for a captain with two cars, since
        // the same type is simultaneously present on one and absent on the other.
        missing: REQUIRED_DRIVER_OWNED_DOCUMENTS
            .filter((type: string) => !hasCurrent(type, null))
            .map(documentLabelOf),
    })
})

// Approve or reject one document, and recompute what the driver's paperwork adds
// up to, in one transaction.
//
// The two are inseparable. An approval that commits while the recomputed
// verification does not is a driver an admin believes is cleared and dispatch
// believes is not, and nothing in the system would ever notice the disagreement.
adminRouter.patch('/documents/:id', protect, protectAdmin, async (req, res) => {
    const parsedParams = rideParamsSchema.safeParse(req.params)
    if (!parsedParams.success) {
        return res.status(400).json({ error: 'Invalid document id', issues: parsedParams.error.issues })
    }

    const parsedBody = reviewDocumentSchema.safeParse(req.body)
    if (!parsedBody.success) {
        return res.status(400).json({ error: 'Invalid request body', issues: parsedBody.error.issues })
    }
    const { status, rejectionReason } = parsedBody.data

    const document = await prisma.driverDocument.findUnique({ where: { id: parsedParams.data.id } })
    if (!document) return res.status(404).json({ error: 'Document not found' })

    // THE GATE. An admin cannot approve — or reject — a document the file check
    // has not cleared, because to review it he has to open it, and the URL for
    // anything not `clean` is null. Reviewing what you cannot see is the failure
    // mode this prevents: a rubber-stamped row pointing at a file nobody looked
    // at, indistinguishable afterwards from one that was properly checked.
    if (document.scanStatus !== 'clean') {
        return res.status(409).json({
            error: `This document has not passed the file check (${document.scanStatus}) and cannot be reviewed`,
            scanStatus: document.scanStatus,
            scanReason: document.scanReason,
        })
    }

    const result = await prisma.$transaction(async (tx) => {
        const reviewed = await tx.driverDocument.update({
            where: { id: document.id },
            data: {
                status,
                // Cleared on approval rather than left behind: a stale reason
                // under an approved document is what a screen will eventually
                // render next to a green tick.
                rejectionReason: status === 'rejected' ? rejectionReason ?? null : null,
                reviewedAt: new Date(),
            },
        })

        // An approved renewal becomes the document in force, and the one it
        // replaces moves to the archive. A REJECTED renewal does not: it simply
        // sits there, and the certificate already approved keeps working — which
        // is the entire reason replacements are a separate slot.
        const promoted = reviewed.isReplacement && status === 'approved'
            ? await promoteReplacement(reviewed, tx)
            : reviewed

        // The captain's photo becomes his profile picture the moment it is
        // approved, and not one step earlier. pfpUrl is what a RIDER is shown, so
        // it must never point at a file the scan has not cleared and a human has
        // not looked at — this is the only line in the codebase that writes it.
        //
        // The stored PATH, not a URL: the object stays private and the rider gets
        // a short-lived signed URL minted per booking. A permanent URL in a
        // column is a permanent URL in every JSON response that ever echoes it.
        if (promoted.type === PROFILE_PHOTO_TYPE) {
            await tx.driver.update({
                where: { id: document.driverId },
                data: { pfpUrl: status === 'approved' ? promoted.fileUrl : null },
            })
        }

        // The car AND the man, in that order. Approving the Innova's last
        // certificate has to turn the Innova's own badge green even when the
        // captain is out in the Dzire — and it must NOT make him dispatchable in
        // the Dzire, which is exactly what recomputing only the driver, or only
        // against every car he owns, would get wrong in opposite directions.
        const verificationStatus = await recomputeAfterDocumentChange(
            { driverId: document.driverId, vehicleId: document.vehicleId },
            tx,
        )
        const remaining = await remainingRequired(document.driverId, tx)

        return { document: promoted, verificationStatus, remaining }
    })

    // After the commit, never inside it. A push that hangs would hold a database
    // transaction open on Supabase's pooler for as long as Firebase took to
    // answer, and a push that throws would roll back a review an admin has
    // already been told succeeded.
    setImmediate(async () => {
        if (status === 'rejected') {
            await notifyDocumentRejected(document.driverId, document.type, rejectionReason ?? null)
            return
        }
        // The one message worth interrupting somebody for: it changes what he can
        // do, not what he has to do. Sent instead of the per-document approval,
        // not as well as it — two notifications a second apart for the same event
        // is how an app teaches people to swipe it away.
        if (result.verificationStatus === 'approved') {
            await notifyDriverApproved(document.driverId)
            return
        }
        await notifyDocumentApproved(document.driverId, document.type, { remaining: result.remaining })
    })

    return res.json({
        document: {
            id: result.document.id,
            type: result.document.type,
            status: result.document.status,
            isReplacement: result.document.isReplacement,
            rejectionReason: result.document.rejectionReason,
            reviewedAt: result.document.reviewedAt,
        },
        // Recomputed here so the dashboard never has to guess whether this
        // approval was the last one needed.
        driverVerificationStatus: result.verificationStatus,
    })
})

/**
 * Stop a captain driving, or let him back on.
 *
 * The only mutation here that is a judgement rather than a derivation. Everything
 * else about a captain's eligibility falls out of his documents; this is somebody
 * deciding he asked a rider for extra cash, and it therefore has to be recorded
 * by hand, with a reason, and be reversible.
 *
 * WHAT SUSPENSION DOES, mechanically: `suspendedAt` is read by
 * requireApprovedDriver, which refuses every driver route with the reason
 * attached, and by driverAssignment/scheduledOffers, which both filter on
 * `suspendedAt: null` — so a suspended captain is invisible to dispatch and
 * cannot accept anything even if an offer were somehow already in his hand.
 *
 * IT DOES NOT TOUCH `verificationStatus`. That field means "his paperwork is in
 * order", which is still true of a suspended captain and will be recomputed back
 * to `approved` by the next sweep regardless. Conflating the two would make a
 * suspension look like a document problem to the captain, who would then re-upload
 * a perfectly good licence trying to fix it.
 */
adminRouter.patch('/drivers/:id/suspension', protect, protectAdmin, async (req, res) => {
    const parsedParams = rideParamsSchema.safeParse(req.params)
    if (!parsedParams.success) {
        return res.status(400).json({ error: 'Invalid driver id', issues: parsedParams.error.issues })
    }

    const parsedBody = suspendDriverSchema.safeParse(req.body)
    if (!parsedBody.success) {
        return res.status(400).json({ error: 'Invalid request body', issues: parsedBody.error.issues })
    }
    const { suspended, reason } = parsedBody.data

    const driver = await prisma.driver.findUnique({
        where: { id: parsedParams.data.id },
        select: { id: true, isOnline: true, suspendedAt: true },
    })
    if (!driver) return res.status(404).json({ error: 'Driver not found' })

    // Idempotent by omission rather than by erroring: suspending a suspended
    // captain is almost always two admins looking at the same screen, and the
    // useful answer is the current state, not a 409 that makes one of them
    // wonder whether it worked.
    if (Boolean(driver.suspendedAt) === suspended) {
        return res.json({
            id: driver.id,
            suspendedAt: driver.suspendedAt,
            suspensionReason: reason ?? null,
            changed: false,
        })
    }

    // Mid-ride, he stays online — the same rule recomputeDriverVerification
    // applies when lapsed paperwork takes somebody off the road. Yanking a
    // captain offline with a rider in the car strands the rider, and the ride
    // cannot be re-dispatched anyway. He cannot pick up a NEW one: every
    // assignment path filters on suspendedAt being null, and that is true from
    // the moment this transaction commits.
    const midRide = driver.isOnline
        ? await prisma.booking.count({ where: { driverId: driver.id, status: { in: ACTIVE_STATUSES } } })
        : 0

    // One transaction, because a captain suspended with his offers still live is
    // the worse of the two halves failing: his notification page keeps showing
    // rides he cannot accept, and the bookings behind them sit held at `rcs`
    // waiting on an answer that can never come.
    const { updated, withdrawnOffers } = await prisma.$transaction(async (tx) => {
        const updated = await tx.driver.update({
            where: { id: driver.id },
            data: {
                suspendedAt: suspended ? new Date() : null,
                // Cleared when the suspension is lifted, for the same reason a
                // rejection reason is cleared on approval: a stale explanation under
                // an active account is what a screen eventually renders beside a
                // green tick.
                suspensionReason: suspended ? reason ?? null : null,
                ...(suspended && midRide === 0 ? { isOnline: false } : {}),
            },
            select: { id: true, name: true, suspendedAt: true, suspensionReason: true, isOnline: true },
        })

        // His spec: a suspended captain loses every pending scheduled offer, and
        // those rides restart assignment. Only on the way IN — lifting a
        // suspension must not restore them, because by then the sweep has offered
        // them to other drivers.
        //
        // Accepted offers are deliberately untouched. Those are assignments, not
        // offers: unpicking one means restoring vehicle capacity and re-dispatching
        // a booking that already has a driver, and doing it here would take a
        // scheduled ride off a captain hours before pickup with nothing arranged in
        // its place. A suspended captain keeps the rides he has already been given
        // until somebody moves them by hand — which is the manual re-assignment
        // that does not exist yet.
        const withdrawnOffers = suspended ? await withdrawOffersForDriver(driver.id, tx) : 0

        return { updated, withdrawnOffers }
    })

    if (suspended && midRide > 0) {
        console.log(`admin: suspended ${driver.id} but he is mid-ride — staying online until the ride ends`)
    }
    if (withdrawnOffers > 0) {
        console.log(`admin: withdrew ${withdrawnOffers} pending offer(s) from suspended driver ${driver.id}`)
    }

    return res.json({
        ...updated,
        changed: true,
        stillOnlineMidRide: suspended && midRide > 0,
        withdrawnOffers,
    })
})

/**
 * Move a captain into the RCS fleet, or back out to the partner pool.
 *
 * The second judgement on this router, and it sits beside suspension for the same
 * reason: nothing derives it. Verification falls out of a man's documents; which
 * side of the fleet he drives on is a decision somebody makes about him, and until
 * now the only way to record it was an UPDATE typed at the database by hand.
 *
 * WHAT THE GROUP DOES, and all it does, is order the queue. driverAssignment ranks
 * ride-now candidates by group before distance, and offerScheduledRide walks a
 * booking admin → rcs → partner. Promoting a captain means he is asked first;
 * demoting him means he is asked once the fleet has passed. It touches neither his
 * verification nor his suspension, and a promoted captain with lapsed paperwork is
 * still undispatchable — he is simply first in a queue he cannot be picked from.
 *
 * THE OWNER'S ROW IS NOT REACHABLE FROM HERE, in either direction. `admin` is one
 * row, and it is what the owner-first hold resolves to for the first 15–45 minutes
 * of every scheduled booking. Promoting a second captain into it would hand him
 * first refusal on all of that work; demoting the owner out of it would leave the
 * hold with nobody to offer to, and offerScheduledRide's empty-group fallback
 * deliberately covers only `rcs`, so those bookings would sit unoffered until the
 * hold expired on its own. The body cannot name the group (driverGroupSchema) and
 * this route refuses a driver already in it.
 *
 * PENDING OFFERS ARE LEFT ALONE, which is the opposite of what suspension does to
 * them, and the difference is the point. A suspended captain can never answer —
 * every accept path refuses him — so his offers are dead weight holding bookings
 * open. A demoted one can still answer: he was asked while he was in the fleet,
 * and withdrawing that takes a live candidate off a booking that is short of them.
 * RideOffer.group records the group each offer went out under, so the escalation
 * test keeps counting his row against `rcs` after he leaves it, which is the whole
 * reason that column is stored rather than re-derived at read time.
 */
adminRouter.patch('/drivers/:id/group', protect, protectAdmin, async (req, res) => {
    const parsedParams = rideParamsSchema.safeParse(req.params)
    if (!parsedParams.success) {
        return res.status(400).json({ error: 'Invalid driver id', issues: parsedParams.error.issues })
    }

    const parsedBody = driverGroupSchema.safeParse(req.body)
    if (!parsedBody.success) {
        return res.status(400).json({ error: 'Invalid request body', issues: parsedBody.error.issues })
    }
    const { group } = parsedBody.data

    const driver = await prisma.driver.findUnique({
        where: { id: parsedParams.data.id },
        select: { id: true, group: true },
    })
    if (!driver) return res.status(404).json({ error: 'Driver not found' })

    // 409 rather than a silent no-op: an admin who somehow got this far is asking
    // for something that will not happen, and a 200 saying "still admin" reads as
    // a change that did not take.
    if (driver.group === 'admin') {
        return res.status(409).json({
            error: "This is the owner's own driver row. Every scheduled ride is held for him before it reaches the fleet, so its group cannot be changed from the dashboard.",
            group: driver.group,
        })
    }

    // Idempotent by omission, exactly as suspension is: two admins looking at the
    // same screen is the usual cause, and the useful answer is the current state
    // rather than a 409 that makes one of them wonder whether it worked.
    if (driver.group === group) {
        return res.json({ id: driver.id, group: driver.group, changed: false })
    }

    const updated = await prisma.driver.update({
        where: { id: driver.id },
        data: { group },
        select: { id: true, name: true, group: true },
    })

    // No push. His badge changes the next time the app fetches /me, and there is
    // nothing here he has to DO — the one notification worth interrupting somebody
    // for is the one that changes what he can do, which is notifyDriverApproved.
    return res.json({ ...updated, changed: true })
})

export default adminRouter