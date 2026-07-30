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
// Mirrored by the DriverDocumentType enum in prisma/schema.prisma — the keys are
// what crosses the wire and what is stored, so the two must agree.
export const DRIVER_DOCUMENTS = {
  // Not on the provider's list, which is entirely about the vehicle. Kept because
  // it is the one document the DRIVER needs rather than the car, and no amount of
  // valid vehicle paperwork makes an unlicensed driver legal to send to a rider.
  dl:               { label: 'Driving licence',            required: true,  expires: true  },

  rc:               { label: 'RC (registration)',          required: true,  expires: true  },
  insurance:        { label: 'Insurance',                  required: true,  expires: true  },
  tax:              { label: 'Road tax',                   required: true,  expires: true  },
  fitness:          { label: 'Fitness certificate',        required: true,  expires: true  },
  permit_all_india: { label: 'All India permit',           required: true,  expires: true  },
  // The annual authorisation that runs alongside an All India permit — a separate
  // slip with its own date, which is why it is a document and not a field on the
  // permit above.
  permit_one_year:  { label: 'One-year permit',            required: false, expires: true  },
  cng_test:         { label: 'CNG cylinder test',          required: false, expires: true  },
  // Two rows, not one: a document row holds a single file, and the provider asks
  // for both faces of the car. Photos of a car are a record of its condition on
  // the day it was onboarded, so nothing about them lapses.
  car_photo_front:  { label: 'Car photo (front)',          required: true,  expires: false },
  car_photo_back:   { label: 'Car photo (back)',           required: true,  expires: false },
}

export const DRIVER_DOCUMENT_TYPES = Object.keys(DRIVER_DOCUMENTS)

// What admin approval is measured against: a driver is approvable only once every
// one of these is uploaded AND approved. The optional two are reviewed the same
// way when present, they just cannot hold up an approval by their absence.
export const REQUIRED_DRIVER_DOCUMENTS = DRIVER_DOCUMENT_TYPES
  .filter((t) => DRIVER_DOCUMENTS[t].required)

// The types whose expiry date is worth storing — everything except the car photos.
// A lapsed document is what suspends a driver automatically, so an expiring type
// uploaded without a date is an incomplete upload, not a valid one.
export const EXPIRING_DRIVER_DOCUMENTS = DRIVER_DOCUMENT_TYPES
  .filter((t) => DRIVER_DOCUMENTS[t].expires)

export const documentLabelOf = (type) => DRIVER_DOCUMENTS[type]?.label ?? '—'
export const isDriverDocumentType = (type) => Object.hasOwn(DRIVER_DOCUMENTS, type)
