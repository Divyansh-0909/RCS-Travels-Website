// The documents a driver must produce before he can be approved, in the order
// the provider dictates them (and the order the onboarding screen asks for them).
//
// Every entry except the licence is a document about the CAR, not the person:
// this is a fleet of owner-drivers, and what the provider checks is that the
// vehicle is road-legal and insured. POLICE VERIFICATION IS DELIBERATELY ABSENT —
// it was on an earlier draft of this list and the provider removed it. Do not add
// it back without hearing that from him.
//
// `required: false` means the document only exists for some cars, not that it is
// nice-to-have: a CNG cylinder certificate is compulsory for a CNG car and
// meaningless for a petrol one, so it cannot be demanded of every driver. The
// admin reviewing the upload is the one who knows which car he is looking at.
//
// `owner` is what makes a captain able to keep two cars. 'driver' documents
// follow the MAN — uploaded once, valid whichever car he is in. 'vehicle'
// documents belong to one CAR and are uploaded again per car, because a second
// Innova is a second RC with its own number and its own expiry. The distinction
// was already here in prose ("every entry except the licence is about the CAR");
// this is the machine-readable version, and DriverDocument.vehicleId is written
// off it.
//
// Mirrored by the DriverDocumentType enum in prisma/schema.prisma — the keys are
// what crosses the wire and what is stored, so the two must agree.
export const DRIVER_DOCUMENTS = {
  // The captain himself, and the only file here a RIDER is ever shown — it is
  // what appears on the rider's screen when his car is assigned, so a passenger
  // waiting at night can tell whether the man who pulled up is the man the app
  // sent. That audience is exactly why it is not treated as a casual avatar: it
  // goes through the same sniff, the same re-encode and the same admin review as
  // the licence, and it is served as a short-lived signed URL rather than a
  // public one. Required, because an unidentifiable driver is the thing this is
  // for; no expiry, because a face does not lapse.
  profile_photo:    { label: 'Your photo',                 required: true,  expires: false, owner: 'driver'  },

  // Not on the provider's list, which is entirely about the vehicle. Kept because
  // it is the one document the DRIVER needs rather than the car, and no amount of
  // valid vehicle paperwork makes an unlicensed driver legal to send to a rider.
  dl:               { label: 'Driving licence',            required: true,  expires: true,  owner: 'driver'  },

  rc:               { label: 'RC (registration)',          required: true,  expires: true,  owner: 'vehicle' },
  insurance:        { label: 'Insurance',                  required: true,  expires: true,  owner: 'vehicle' },
  tax:              { label: 'Road tax',                   required: true,  expires: true,  owner: 'vehicle' },
  fitness:          { label: 'Fitness certificate',        required: true,  expires: true,  owner: 'vehicle' },
  permit_all_india: { label: 'All India permit',           required: true,  expires: true,  owner: 'vehicle' },
  // The annual authorisation that runs alongside an All India permit — a separate
  // slip with its own date, which is why it is a document and not a field on the
  // permit above.
  permit_one_year:  { label: 'One-year permit',            required: false, expires: true,  owner: 'vehicle' },
  cng_test:         { label: 'CNG cylinder test',          required: false, expires: true,  owner: 'vehicle' },
  // Two rows, not one: a document row holds a single file, and the provider asks
  // for both faces of the car. Photos of a car are a record of its condition on
  // the day it was onboarded, so nothing about them lapses.
  car_photo_front:  { label: 'Car photo (front)',          required: true,  expires: false, owner: 'vehicle' },
  car_photo_back:   { label: 'Car photo (back)',           required: true,  expires: false, owner: 'vehicle' },
}

export const DRIVER_DOCUMENT_TYPES = Object.keys(DRIVER_DOCUMENTS)

// What admin approval is measured against: a driver is approvable only once every
// one of these is uploaded AND approved. The optional two are reviewed the same
// way when present, they just cannot hold up an approval by their absence.
//
// STILL THE FULL LIST, across both owners. It is what "this captain is road
// legal" means, and the two lists below are the halves it splits into — a
// captain is approved when he holds all of DRIVER_OWNED and the car he is
// driving holds all of VEHICLE_OWNED.
export const REQUIRED_DRIVER_DOCUMENTS = DRIVER_DOCUMENT_TYPES
  .filter((t) => DRIVER_DOCUMENTS[t].required)

// The two halves, by who the document is about. Split rather than filtered at
// each call site because getting this wrong is silent in both directions: ask
// for a car document against a driver and it can never be satisfied, ask for a
// licence against a car and every car needs its own.
export const DRIVER_OWNED_DOCUMENTS = DRIVER_DOCUMENT_TYPES
  .filter((t) => DRIVER_DOCUMENTS[t].owner === 'driver')

export const VEHICLE_OWNED_DOCUMENTS = DRIVER_DOCUMENT_TYPES
  .filter((t) => DRIVER_DOCUMENTS[t].owner === 'vehicle')

export const REQUIRED_DRIVER_OWNED_DOCUMENTS = DRIVER_OWNED_DOCUMENTS
  .filter((t) => DRIVER_DOCUMENTS[t].required)

export const REQUIRED_VEHICLE_OWNED_DOCUMENTS = VEHICLE_OWNED_DOCUMENTS
  .filter((t) => DRIVER_DOCUMENTS[t].required)

/** Is this type about the car rather than the man? */
export const isVehicleDocument = (type) => DRIVER_DOCUMENTS[type]?.owner === 'vehicle'

// The types whose expiry date is worth storing — everything except the car photos.
// A lapsed document is what suspends a driver automatically, so an expiring type
// uploaded without a date is an incomplete upload, not a valid one.
export const EXPIRING_DRIVER_DOCUMENTS = DRIVER_DOCUMENT_TYPES
  .filter((t) => DRIVER_DOCUMENTS[t].expires)

// The types that carry a number printed on them — a licence number, a policy
// number, a permit number. Everything except the three photographs (the two of
// the car, and the one of the captain), which have nothing written on them.
//
// Derived from `expires` rather than declared separately because for this list
// the two coincide exactly: every document with an authority behind it has both
// a number and a validity date, and a photograph has neither. If a type ever
// needs one without the other, split this out into its own flag rather than
// adding an exception here.
export const NUMBERED_DRIVER_DOCUMENTS = EXPIRING_DRIVER_DOCUMENTS

// The one type a rider is shown. Named rather than string-matched at the four
// call sites that care — the pfp promotion, the rider-facing signed URL, the
// admin review screen and the app's own avatar row — because a literal
// 'profile_photo' scattered across a codebase is a rename waiting to go wrong.
export const PROFILE_PHOTO_TYPE = 'profile_photo'

export const documentLabelOf = (type) => DRIVER_DOCUMENTS[type]?.label ?? '—'
export const isDriverDocumentType = (type) => Object.hasOwn(DRIVER_DOCUMENTS, type)

// What a document may be, and how big. Mirrored by the captain app's
// src/lib/documentFile.ts, which compresses toward these numbers before it asks
// for a URL — and enforced three separate times, because each of the three can
// be bypassed on its own:
//
//   1. THE SIGNATURE ITSELF. The upload URL is minted with the content type and
//      an x-goog-content-length-range bound into it, and Google measures the
//      body against both. This is the only one a caller holding the signed URL
//      cannot talk his way past, and the only one that refuses the bytes BEFORE
//      they are transferred and stored rather than after. See lib/storage.js.
//      (It used to be the bucket's own allowedMimeTypes/fileSizeLimit under
//      Supabase Storage; GCS has no such bucket setting, so the same guarantee
//      is bought by signing the constraints instead.)
//   2. the upload-url endpoint, so a bad contentType is refused before a URL for
//      it exists rather than after the phone has spent the upload;
//   3. the confirm endpoint, which re-reads the stored object's REAL size and
//      mime type. What the app declared at step 2 is a claim, not a fact — a
//      signed URL is a bearer token and the thing that arrives through it need
//      not be the thing that was described.
export const DOCUMENT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

// The extension the stored object is keyed under. Storage serves by content-type
// header, not by suffix, so this is for humans reading the bucket and for the
// admin who downloads a file and wants it to open in something.
export const DOCUMENT_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
}

// Two ceilings, because the two formats arrive by completely different routes.
//
// An image has already been through the app's resize-and-compress step and lands
// at 200-500 KB; 5 MB is not a target, it is the point past which the file
// cannot plausibly have come from that step at all. A PDF is whatever the
// insurer's scanner produced and the app cannot re-encode it, so it gets the
// looser limit — an A4 policy at 300 dpi is the only document that legitimately
// gets near it.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_PDF_BYTES = 10 * 1024 * 1024

// The types that must be a photograph, not a scan. A PDF of a face is not a
// thing, and the profile photo in particular is rendered inline on a rider's
// screen beside a car registration — there is no viewer there and no reason to
// build one. Refused at the point a URL is asked for, so the phone never spends
// an upload discovering it.
export const IMAGE_ONLY_DOCUMENTS = ['profile_photo', 'car_photo_front', 'car_photo_back']

export const isImageOnly = (type) => IMAGE_ONLY_DOCUMENTS.includes(type)

/** The limit that applies to a given content type. */
export const maxBytesFor = (contentType) =>
  contentType === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES

// The bucket carries ONE limit for everything in it, so it has to be the looser
// of the two — the per-type numbers above are what the endpoints enforce. This
// is the backstop that catches a caller who skipped them entirely, which is why
// it is the larger value and not the smaller.
export const MAX_DOCUMENT_BYTES = MAX_PDF_BYTES
