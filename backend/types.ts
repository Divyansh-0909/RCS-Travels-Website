import {z} from 'zod';
import { isDriverDocumentType } from './constants/driverDocuments.js';
import {BookingStatus, BookingSource, CancelledBy, VerificationStatus, VehicleClass, DriverDocumentType,DriverGroup } from '@prisma/client';
import type { Booking, Driver, User } from '@prisma/client';

// One car, as the app describes it. Shared by signup — which creates the driver
// and his first car in one call — and by "add another car" later, because they
// are the same three facts and a captain adding his second Innova should not be
// asked for them in a different shape.
const vehicleInputSchema = z.object({
  vehicleClass: z.enum(VehicleClass),
  // Indian plates run to 10-11 characters ("DL01AB1234", "UP16 AB 1234"). The
  // lower bound is deliberately loose — older and out-of-state formats vary more
  // than any regex worth maintaining, and the admin reviewing the RC is the
  // check that actually matters.
  vehicleNumber: z.string().trim().min(4).max(16),
  // What a rider reads to spot the car at the kerb, which is why it is asked for
  // rather than offered: "a white Innova Crysta" picks a car out of a queue of
  // six and "a white SUV" does not.
  //
  // The COLUMN stays nullable. Every car added before this was required has a
  // null model and must keep working — this is a rule about what a captain may
  // submit from here on, not a claim about what is already stored.
  vehicleModel: z.string().trim().min(2).max(60),
})

const driverAccountInformationSchema = vehicleInputSchema.extend({
  name: z.string().trim().min(2).max(80),
})

const addVehicleSchema = vehicleInputSchema

// Which car he is switching to. A body rather than a path parameter because the
// resource being changed is the DRIVER's active car, not the vehicle — the
// vehicle itself is untouched by a switch.
const activeVehicleSchema = z.object({
  vehicleId: z.uuid(),
})

// The contentType list is duplicated from constants/driverDocuments.js rather
// than imported: z.enum needs a literal tuple to give the parsed value a union
// type, and a value read out of a .js constants file arrives as string[]. The
// two must stay in step — the constants file is the one the bucket is built from.
const documentContentType = z.enum([
    'image/jpeg',
    'image/png',
    'application/pdf',
])

// z.enum over the Prisma enum, refined against the constants file. Both, because
// they guarantee different things: the enum is what gives the parsed value a
// literal union type at compile time, and isDriverDocumentType is what catches
// the two lists having drifted apart at runtime.
//
// They can drift. constants/driverDocuments.js carries the label, the required
// flag and the expiry flag for each type, and schema.prisma carries the enum;
// adding a type to one and not the other produces a value that validates here
// and then has no label, no expiry rule and no place in the required list.
const driverDocumentType = z.enum(DriverDocumentType).refine(isDriverDocumentType, {
    message: 'Unknown document type — the schema enum and DRIVER_DOCUMENTS disagree',
})

// Asking for somewhere to put a document. One request per screenful, not per
// file, because a captain uploading his papers picks several before he taps
// anything and a round trip each would be several seconds of nothing happening.
//
// `.max(10)` is the whole document list (see DRIVER_DOCUMENTS) and no more: this
// endpoint mints bearer tokens, so an unbounded array is an unbounded number of
// writable URLs from one authenticated call.
// The car every vehicle-owned document in the batch is about. Optional on the
// wire and resolved server-side to the captain's ACTIVE car when absent, because
// that is what an app uploading from the checklist of the car it is showing
// means — but sendable explicitly, so a captain can photograph the papers of the
// Innova in his yard while driving the Dzire.
//
// Ignored for the two person-owned types whatever it says. See vehicleIdForType.
const documentVehicleId = z.uuid().optional()

const UploadUrlRequest = z.object({
    vehicleId: documentVehicleId,
    documents: z.array(
        z.object({
            type: driverDocumentType,
            contentType: documentContentType,
        })
    ).min(1).max(11)
        // One URL per type per request. Two entries for the same type would sign
        // two paths and only one of them could ever become the DriverDocument row
        // — the other is an orphaned object nothing will ever collect.
        .refine(
            (documents) => new Set(documents.map((d) => d.type)).size === documents.length,
            { message: 'Each document type may appear only once per request' },
        ),
})

// Telling the server the upload landed. The app cannot write DriverDocument
// itself, and this endpoint does not take the app's word for what is at `path`
// — it re-reads the object out of Storage before it writes the row.
const ConfirmDocumentsRequest = z.object({
    vehicleId: documentVehicleId,
    documents: z.array(
        z.object({
            type: driverDocumentType,
            // Exactly what the upload-url response handed back. Checked against
            // the driver's own prefix server-side; nothing here can be trusted to
            // point at an object this driver is allowed to claim.
            path: z.string().trim().min(1).max(300),
            // As printed on the document. Null for the car photos, which have no
            // number — hence optional rather than a minimum length.
            number: z.string().trim().min(1).max(60).optional(),
            // Required by the server for every type that can lapse; the schema
            // cannot express that because which types those are lives in
            // constants/driverDocuments.js.
            expiresAt: z.iso.date().optional(),
        })
    ).min(1).max(11),
})

// An admin's verdict on one document. `pending` is deliberately absent: this is
// the act of reviewing, and "I reviewed it and it is unreviewed" is not a state
// anybody can mean. A document returns to pending only by being re-uploaded.
const reviewDocumentSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  // Shown to the driver verbatim, so it has to say something he can act on —
  // "photo is blurry", "the licence has expired". Required on a rejection for
  // exactly that reason: a rejection with no reason is a document the driver
  // will upload again unchanged.
  rejectionReason: z.string().trim().min(3).max(500).optional(),
}).refine((body) => body.status !== 'rejected' || Boolean(body.rejectionReason), {
  message: 'A rejection needs a reason — the driver is shown it',
  path: ['rejectionReason'],
});

// Stopping a captain, and letting him back on.
//
// Two operations behind one shape because they are one decision with a boolean
// in it, and splitting them into /suspend and /unsuspend would mean a client
// that can call the second without being able to express the first.
const suspendDriverSchema = z.object({
  suspended: z.boolean(),
  // Required to suspend, for the same reason a rejection needs one: the captain
  // is SHOWN this. requireApprovedDriver hands it back on every refused request,
  // so it is the only explanation he ever gets for an app that has stopped
  // working — "asking riders for extra cash on 12 Aug" rather than a locked door.
  //
  // It is also the audit trail. Whether a suspension was fair is a question that
  // gets asked weeks later, by which time nobody remembers, and `isActive: false`
  // with no reason is indistinguishable from an admin misclick.
  reason: z.string().trim().min(3).max(500).optional(),
}).refine((body) => !body.suspended || Boolean(body.reason), {
  message: 'A suspension needs a reason — the captain is shown it, and it is the only record of why',
  path: ['reason'],
});

// Which side of the fleet a captain drives on.
//
// `admin` IS DELIBERATELY MISSING from this enum rather than merely refused by the
// route. It is exactly one row — the owner's — and it is what the owner-first hold
// on every scheduled booking resolves to (eligibleGroup, constants/dispatch.js).
// Handing it to a second captain would give him first refusal on the whole fleet's
// work, and a body that cannot express the value is one no future caller can talk
// the route into. The route refuses to move a driver already in it, separately.
const driverGroupSchema = z.object({
  group: z.enum(['rcs', 'partner']),
});

const locationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

const bookingListQuerySchema = z.object({
  id: z.string().optional(),
  search: z.string().trim().min(2).optional(),
  status: z.enum(BookingStatus).optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  customerPhone: z.string().trim().optional(),
  customerName: z.string().trim().optional(),
  driverName: z.string().trim().optional(),
  vehicleClass: z.enum(VehicleClass).optional(),
  source: z.enum(BookingSource).optional(),
  isOutstation: z
    .enum(["true", "false"])
    .transform(value => value === "true")
    .optional(),
  cancelledBy: z.enum(CancelledBy).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const myBookingsQuerySchema = z.object({
  search: z.string().trim().min(2).optional(),
  status: z.enum(BookingStatus).optional(),
  vehicleClass: z.enum(VehicleClass).optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

const driverListQuerySchema = z.object({
  search: z.string().trim().min(2).optional(),
  driverName: z.string().trim().optional(),
  driverPhone: z.string().trim().optional(),
  vehicleClass: z.enum(VehicleClass).optional(),
  vehicleNumber: z.string().trim().optional(),
  verificationStatus: z.enum(VerificationStatus).optional(),
  // The whole enum here, `admin` included — unlike driverGroupSchema, which is a
  // WRITE and must not be able to name the owner's group. Reading the list back
  // filtered to one row is harmless, and "show me the owner's row" is a question
  // an admin has as much reason to ask as any other.
  group: z.enum(DriverGroup).optional(),
  isOnline: z
    .enum(["true", "false"])
    .transform(value => value === "true")
    .optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const rideParamsSchema = z.object({
  id: z.uuid(),
});

// The captain app's ride list asks for one of two boards, never both: the work
// ahead of him, or the work behind him. They differ in status set, sort order and
// size, so a single unscoped list would have to return everything and let a phone
// sort it — which is the one place this app cannot afford to be lazy.
const driverRidesQuerySchema = z.object({
  scope: z.enum(['upcoming', 'history']).default('upcoming'),
  // History alone is paged. `upcoming` is bounded by how many rides one captain can
  // hold at once, which is single digits; history grows for the life of the account.
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(30),
});

const driverOnlineSchema = z.object({
  isOnline: z.boolean(),
});

const fcmTokenSchema = z.object({
  fcmToken: z.string().trim().min(1).max(4096),
});

const rideStatusSchema = z.object({
  // Must stay in step with RIDE_TRANSITIONS in routes/driver.ts — that table is
  // what decides which of these is legal from where, and a value accepted here
  // with no entry there reaches `legalFrom.includes(...)` as undefined.
  to: z.enum(['en_route', 'reached', 'started', 'completed']),
  otp: z.string().trim().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

const userListQuerySchema = z.object({
  search: z.string().trim().min(2).optional(),
  userName: z.string().trim().optional(),
  userPhone: z.string().trim().optional(),
  gender: z.string().trim().optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});


const fareAmount = z.number().int().positive().max(100000);

const zoneFares = z.object({
  hatchback: fareAmount,
  sedan: fareAmount,
  suv: fareAmount,
}).partial();

const position = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

const linearRing = z.array(position).min(4).max(2000);

const fareZoneFeature = z.object({
  type: z.literal('Feature'),
  properties: z.object({
    name: z.string().trim().min(1).max(120),
    priority: z.number().int().min(0).max(100).default(0),
    fares: zoneFares.default({}),
    toll: z.number().int().min(0).max(100000).optional(),
    notes: z.string().max(2000).optional(),
  }),
  geometry: z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(linearRing).min(1),
  }),
});

const fareZoneCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(fareZoneFeature).min(1).max(500),
});

export {locationSchema, bookingListQuerySchema,driverListQuerySchema,myBookingsQuerySchema,userListQuerySchema,fareZoneCollectionSchema}
export {reviewDocumentSchema, suspendDriverSchema, driverGroupSchema}
export {rideParamsSchema, driverOnlineSchema, fcmTokenSchema, rideStatusSchema, driverRidesQuerySchema, driverAccountInformationSchema, UploadUrlRequest, ConfirmDocumentsRequest}
export {addVehicleSchema, activeVehicleSchema}