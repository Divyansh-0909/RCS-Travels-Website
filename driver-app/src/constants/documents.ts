// Mirrors backend/constants/driverDocuments.js. The server is the authority on
// all of it — it re-reads every uploaded object's real size and mime type before
// it writes a DriverDocument row — and these exist so the phone fails BEFORE it
// spends a captain's data on an upload that was always going to be rejected.
//
// If you change a number here, change it there and re-run `npm run storage:setup`
// in backend/, because the bucket carries its own copy of the limit and that is
// the one a client holding a signed URL cannot argue with.

export const DOCUMENT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;

export type DocumentContentType = (typeof DOCUMENT_CONTENT_TYPES)[number];

// Two ceilings, because the two formats arrive by completely different routes.
// An image has been through the resize-and-compress step below and lands at
// 200-500 KB, so 5 MB is not a target — it is the point past which the file
// cannot have come from that step at all. A PDF is whatever the insurer's
// scanner produced and nothing here can re-encode it, so it gets the looser one.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** The limit that applies to a given content type. */
export const maxBytesFor = (contentType: string) =>
  contentType === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;

// The longest edge a document photo is resized to. A licence, an RC or an
// insurance page is read by a human on an admin screen, and 1600px across is
// already more than a 13" laptop will ever show of it — past that the extra
// pixels only cost the captain upload time on a 4G connection at a taxi stand.
//
// Small print (a policy number in 6pt) is the thing this must not destroy, which
// is why the cap is 1600 and not the 1024 that would be plenty for a face shot.
export const MAX_IMAGE_EDGE = 1600;

// What a resized photo is compressed toward. Not a hard limit — the ladder below
// stops as soon as it is met, and the last rung is accepted whatever it weighs,
// because a legible 900 KB licence beats a 400 KB one nobody can read.
export const TARGET_IMAGE_BYTES = 700 * 1024;

// Tried in order. 0.7 is the working figure and lands most 1600px document
// photos between 200 and 500 KB; the lower rungs exist for the pathological case
// — a dense, high-contrast A4 scan photographed edge to edge, where JPEG has a
// great deal of detail to keep.
export const IMAGE_QUALITY_LADDER = [0.7, 0.55, 0.4] as const;

// Every document type the provider asks for, in the order the onboarding screen
// asks for them. Mirrors DRIVER_DOCUMENTS on the server and the
// DriverDocumentType enum in schema.prisma — the keys are what crosses the wire.
// The types that must be a photograph, not a scan. Mirrors IMAGE_ONLY_DOCUMENTS
// on the server, which refuses a PDF for these at both gates — the picker just
// stops offering an option that would be rejected.
export const IMAGE_ONLY_DOCUMENTS = ['profile_photo', 'car_photo_front', 'car_photo_back'];

export const isImageOnly = (type: string) => IMAGE_ONLY_DOCUMENTS.includes(type);

// `owner` is what lets a captain keep two cars. 'driver' documents follow the
// MAN — uploaded once, valid whichever car he is in. 'vehicle' documents belong
// to one CAR and are uploaded again per car, because a second Innova is a second
// RC with its own number and its own expiry date.
export const DRIVER_DOCUMENTS = {
  // The captain himself — the one file a RIDER is shown, and the reason it is
  // reviewed like paperwork rather than treated as an avatar.
  profile_photo: { label: 'Your photo', required: true, expires: false, owner: 'driver' },
  dl: { label: 'Driving licence', required: true, expires: true, owner: 'driver' },
  rc: { label: 'RC (registration)', required: true, expires: true, owner: 'vehicle' },
  insurance: { label: 'Insurance', required: true, expires: true, owner: 'vehicle' },
  tax: { label: 'Road tax', required: true, expires: true, owner: 'vehicle' },
  fitness: { label: 'Fitness certificate', required: true, expires: true, owner: 'vehicle' },
  permit_all_india: { label: 'All India permit', required: true, expires: true, owner: 'vehicle' },
  permit_one_year: { label: 'One-year permit', required: false, expires: true, owner: 'vehicle' },
  cng_test: { label: 'CNG cylinder test', required: false, expires: true, owner: 'vehicle' },
  car_photo_front: { label: 'Car photo (front)', required: true, expires: false, owner: 'vehicle' },
  car_photo_back: { label: 'Car photo (back)', required: true, expires: false, owner: 'vehicle' },
} as const;

export type DriverDocumentType = keyof typeof DRIVER_DOCUMENTS;

export type DocumentOwner = 'driver' | 'vehicle';

export const DRIVER_DOCUMENT_TYPES = Object.keys(DRIVER_DOCUMENTS) as DriverDocumentType[];

export const documentLabelOf = (type: DriverDocumentType) => DRIVER_DOCUMENTS[type].label;

export const isVehicleDocument = (type: DriverDocumentType) =>
  DRIVER_DOCUMENTS[type].owner === 'vehicle';

// What a rider is shown, and what the vehicle list labels each car with.
export const VEHICLE_CLASS_LABELS: Record<string, string> = {
  hatchback: 'Hatchback',
  sedan: 'Sedan',
  suv: 'SUV',
  suv_premium: 'Premium SUV',
};

export const vehicleClassLabel = (cls: string) => VEHICLE_CLASS_LABELS[cls] ?? cls;
