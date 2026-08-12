# RCS Travels — Project Context

> A single source of truth for understanding this codebase. Read this first.
> For the phased build plan and future ideas, see [ROADMAP.txt](ROADMAP.txt).
> Status reflects the **actual code** as of 9 August 2026, verified against the
> source rather than against intentions. Where something is specified but not
> built, it says so.

---

## 1. What this is

**RCS Travels** is a full-stack **cab-booking platform** for a small local cab operator in
Delhi-NCR (owner referred to as "Raju"), serving Shiv Nadar University and the surrounding
region. It is **not** a generic Uber clone — it is built around a specific operating model:

- **Pay the driver directly.** No in-app payments, no card or wallet screens for riders, no
  in-app toll handling. Tolls on per-km-priced routes settle with the driver, which the
  booking screen says outright.
- **Scheduling-first.** The primary flow books a ride up to 7 days ahead; on-spot ("now")
  rides are secondary and subject to availability.
- **WhatsApp is a first-class channel** — OTP login is delivered over it today, and customer
  notifications and a booking bot are planned. The owner is not tech-savvy, so WhatsApp is
  the low-friction surface.
- **Fares come from a hand-drawn zone map** of NCR, falling back to a curve fitted to the
  provider's rate card. Trips that never touch campus are priced against the market instead.
- **Solo vs. sharing.** A rider books a whole vehicle or a single seat.

Three apps exist. The **customer website** and its backend are built and deployed. The
**admin dashboard** lives inside the same React app and is read-only apart from the fare-zone
editor. The **driver app** (Expo / React Native) is substantially built — around 40 source
files and 13 backend endpoints — but **no real captain can log into it yet**; see §12.

---

## 2. Tech stack

### Frontend (`frontend/`)
- **React 18.3** + **Vite 6** (ES Modules, mostly `.jsx`; `.tsx` where types earn their keep —
  `AdminDashboard`, `Chips`, `types/enums`).
- **Tailwind CSS v4** (via `@tailwindcss/vite`). NOTE: v4 utilities use independent `scale` /
  `translate` / `rotate` CSS properties rather than the `transform` shorthand, so keyframe
  `transform` animations compose cleanly with positioning utilities. This is relied on
  throughout the animations.
- **React Router 6.28** (`createBrowserRouter`), using the stable `viewTransition` option.
- **Clerk** (`@clerk/clerk-react`) for auth/session.
- **Zustand 5** for client state (`useData`), persisted to localStorage under `rcs-data` via
  `partialize` — see §7 for which keys survive a reload.
- **Radix UI**, **@mdi/react**, **react-day-picker** + **date-fns** for the date/time picker,
  **@lottiefiles/dotlottie-react** for the success/error marks.
- **i18next / react-i18next** installed for future Hindi support — **not wired up**. The
  language setting persists and changes nothing.

### Driver app (`driver-app/`)
- **Expo SDK 55** + **React Native 0.83**, TypeScript, run through **expo-dev-client** (not
  Expo Go — FCM and background location both require a dev build).
- **NativeWind 4** over Tailwind 3, sharing a theme built by `shared/theme/build-css.cjs`.
- **`@clerk/clerk-expo`** for sessions, **expo-secure-store** for the token.
- **expo-location**, **expo-notifications**, **expo-task-manager** for GPS and push.
- **react-router-native** for navigation, **Zustand 5** for state,
  **react-native-reanimated 4** for motion.
- Read `driver-app/AGENTS.md` before touching it: Expo 55 changed enough that the versioned
  docs at `https://docs.expo.dev/versions/v55.0.0/` are the only reliable reference.

### Backend (`backend/`)
- **Node 24 + Express 5.2** (ES Modules, `type: "module"`). Mixed `.js` and `.ts`, run through
  **`tsx`** **in every environment including production** — `tsconfig.json` is `noEmit`, so the
  `.ts` routes are type-stripped at runtime and there is no build output. The container's
  entrypoint is `node --import tsx index.js`; `npm run typecheck` is the only thing that ever
  type-checks them.
- **Prisma 7.8** with the **`@prisma/adapter-pg`** driver adapter over **`pg`**. The pool is
  capped at `DATABASE_POOL_MAX` (default 5) because on Cloud Run the default 10 is *per
  instance* — see `db/prisma.js`.
- **PostgreSQL** (Supabase, free tier).
- **Supabase Storage** for driver documents — one private `driver-documents` bucket, reached
  only through `lib/storage.js` (see §3). Being migrated to Google Cloud Storage.
- **Clerk** (`@clerk/express`) — `clerkMiddleware()` globally, `protect` on protected routes,
  `protectAdmin` for the dashboard.
- **zod** for query-parameter validation on the list endpoints (`types.ts`).
- **express-rate-limit** on the unauthenticated Google-proxy and fare endpoints.
- **pdfkit** for the account-data download.
- **sharp** re-encodes every uploaded image from decoded pixels — the scanner's strongest
  check, because nothing that was not image data survives it.
- **google-auth-library** verifies the OIDC tokens Cloud Scheduler presents to `/internal`.
- **firebase-admin** is now **used** — `sendPush` genuinely delivers. `sendFCM` (the
  driver-accepted-the-ride coin flip) and `sendWhatsApp` remain stubs; see §12.
- **`multer`** and **`@aws-sdk/client-s3`** are installed and **never imported anywhere**.
  Document upload went to Supabase Storage instead, so both are dead dependencies.

### Deployment

**Mid-migration: Render → Google Cloud Run.** Both are live and serving the same database.

- Frontend → **Vercel**, at `https://www.rcstravels.co.in`.
- Backend, current production → **Render** (free tier, kept awake by an uptime ping to
  `/health`, which runs `select 1` so Supabase does not pause either).
- Backend, migration target → **Google Cloud Run**, `asia-south1` (Mumbai, same city as the
  Supabase region `aws-1-ap-south-1`). Project `project-0c9e66c4-03f9-4cc0-b53`, service
  `rcs-api`, `min-instances=0`, `max-instances=4`. Nothing points at it yet.
- Database → **Supabase PostgreSQL**. Driver app → **Expo EAS**.
- Secrets live in **Google Secret Manager**, mounted as env vars (`backend/scripts/push-secrets.ps1`).
  Images build in **Cloud Build** → **Artifact Registry**. The background sweeps are driven by
  **Cloud Scheduler**, not timers — see §5 and `lib/jobs.js`.
- The full runbook is `backend/DEPLOY.md`; the reasoning is `decisions/cloud-run-migration.md`.

---

## 3. Repository layout

```
RCS-Travels-Website/
├── CONTEXT.md            ← this file
├── ROADMAP.txt           ← phased plan + backlog
├── COSTS.md              running-cost model
├── System-Design.txt     Phase-2-Approach.txt
├── tools/zone-editor.html            browser tool for drawing/pricing fare zones
├── shared/theme/                     one theme source, built into web + native CSS
├── decisions/            walkthroughs of why things are shaped as they are (gitignored)
├── backend/
│   ├── index.js                       Express entry; mounts routers, starts jobs in dev
│   ├── types.ts                       zod query schemas + shared API types
│   ├── Dockerfile                     two-stage; node:24-slim, CMD node --import tsx
│   ├── .dockerignore .gcloudignore    correctness files, not size ones — see DEPLOY.md
│   ├── DEPLOY.md                      the Cloud Run runbook
│   ├── cleanup-policy.json            Artifact Registry retention (keep 3, drop >30d)
│   ├── middleware/
│   │   ├── auth.js                     clerkAuth, protect, protectAdmin
│   │   ├── internalAuth.js             OIDC verification for /internal — fails closed
│   │   ├── rateLimit.js                per-IP limits for Google/fare routes
│   │   └── errorHandler.js
│   ├── db/prisma.js , lib/prisma.js    Prisma client (pg adapter, pool capped)
│   ├── lib/
│   │   ├── storage.js                  THE object-storage seam — 7 ops, no vendor above it
│   │   ├── supabase.js                 the Storage client behind storage.js (server-only key)
│   │   ├── jobs.js                     job registry + JOBS_MODE (timers vs Cloud Scheduler)
│   │   ├── firebase.js                 messaging() for sendPush
│   │   └── bookingReference.js , phone.js
│   ├── constants/
│   │   ├── vehicles.js                 VehicleClass set + seatsOf()
│   │   ├── driverDocuments.js          the 11 document types, driver- vs vehicle-owned
│   │   └── dispatch.js                 owner hold, escalation, sweep horizon
│   ├── prisma/
│   │   ├── schema.prisma               18 models, 11 enums
│   │   ├── migrations/                 35 migrations, all applied
│   │   ├── seed.js , seed-captain.js , seed-captain-rides.js
│   │   └── clean-bookings.js , clean-seed-data.js
│   ├── data/
│   │   ├── zones.geojson               45 hand-drawn NCR fare zones + per-class prices
│   │   └── shady-zones.geojson         2 avoided-road corridors
│   ├── scripts/
│   │   ├── free-port.js                frees the port before dev (NOT used in the container)
│   │   ├── setup-storage.js            creates the private driver-documents bucket
│   │   ├── push-secrets.ps1            .env.production → Secret Manager, values never printed
│   │   ├── normalize-driver-phones.js
│   │   └── check-shady-zones.js        routes campus → every zone, reports crossings
│   ├── tests/                          node:test — run with `npm test`
│   │   ├── documentPolicy.test.js      the rules that decide who may drive
│   │   ├── documentConcurrency.test.js needs Postgres, gated behind an env var
│   │   ├── documentFile.test.js        magic bytes, re-encode, PDF active content
│   │   └── internalJobs.test.js        the gate on /internal
│   ├── routes/
│   │   ├── hybridAuth.js               POST /api/auth/send-otp, /verify-otp
│   │   ├── users.js                    me, recent + saved places, gender/DOB/emergency,
│   │   │                               data download, account delete
│   │   ├── fare.js                     POST /api/fare/estimate
│   │   ├── bookings.js                 create / :id/status / cancel / my-bookings
│   │   ├── driver.ts                   21 endpoints — see §8
│   │   ├── admin.ts                    lists + zones + document review — see §8
│   │   ├── internal.js                 POST /internal/jobs/:name — Cloud Scheduler only
│   │   └── googleAPI.js                autocomplete / details / reverse-geocode proxies
│   └── services/
│       ├── rideEstimate.js             zone → formula, or market; Routes API + usage cap
│       ├── fareZones.js                point-in-polygon matching, border blending, DB load
│       ├── fareQuote.js                HMAC-signs each estimate
│       ├── safeRoute.js                alternative-route classifier over shady polygons
│       ├── geo.js                      kmBetween, pointInRing, decodePolyline, kmPointToPath
│       ├── driverAssignment.js         ride-now matching (rings + groups + fairness + claim)
│       ├── scheduledOffers.js          persisted RideOffer creation / withdrawal
│       ├── assignScheduledRides.js     the dispatch sweep (5 min)
│       ├── driverVehicles.js           add / remove / switch a captain's cars
│       ├── driverDocuments.js          document LIFECYCLE — slots, expiry, verification
│       ├── documentScan.js             document FILE checks — magic bytes, sharp, PDF tokens
│       ├── documentNotifications.js    submitted / approved / rejected / expiring pushes
│       ├── driverPhoto.js              signed avatar URLs (rider-facing, short TTL)
│       ├── commission.js               5% ≥ ₹800, pass-through stripping
│       └── notification.js             sendOtpWhatsApp + sendPush REAL; sendFCM/sendWhatsApp STUBS
├── frontend/src/
│   ├── main.jsx                        router + ClerkProvider + ThemeProvider + boundaries
│   ├── App.jsx                         "/" → NavBar + OnBoarding + marketing + Footer
│   ├── api/api.js                      thin fetch wrapper, one fn per endpoint
│   ├── constants/                      fares, statusLabels, support, legal, pageMeta
│   ├── hooks/                          useData, useApi, useViewNavigate, useIsMobile,
│   │                                   useExitAnim, useRefreshNotice
│   ├── components/                     ProtectedRoute, ErrorBoundary, PageMeta, RideDetails,
│   │                                   skeletons, illustrations, ui/
│   └── pages/                          OnBoarding, VehicleSelect, TrackingPage, Login,
│                                       SignUp, ManageAccount, Settings, Safety, Help,
│                                       Legal, Outstation, AdminDashboard, EditFares,
│                                       NotFound, DevPreview, marketing sections
└── driver-app/src/
    ├── App.tsx , AuthLayout.tsx , main.tsx
    ├── components/                     AppBar (+Scrim, +Visibility), OnlineToggle, AppText,
    │                                   ui/ (RideCard, RideRow, EarningsPanel, WalletCard,
    │                                   MonthEarningsCard, ScheduledRide, JoinFleetCard,
    │                                   MarketPromo, AccountRow, Button, Input)
    └── pages/                          Login, Signup, OnBoarding, Home, Rides, RideDetail,
                                        Notifications, Account, Available, Post
```

---

## 4. Data model (`backend/prisma/schema.prisma`)

**18 models, 11 enums.** 35 migrations, all applied. The 8 Aug migration
(`20260807222544_driver_groups_offers_wallet_reviews`) is the large one — it added driver
groups, suspension, the wallet ledger, offers, reviews, flags and coupons in a single
additive pass.

**Enums:** `BookingStatus` (pending, confirmed, assigned, en_route, reached, started,
completed, cancelled, **no_driver**), `BookingSource` (website | whatsapp | admin),
`CancelledBy` (user | driver | admin), `VerificationStatus` (pending | approved | rejected),
`DriverDocumentType` (11 types), `DriverGroup` (admin | rcs | partner), `ScanStatus` (pending |
scanning | clean | failed — the FILE verdict, never to be confused with the admin's `status`),
`WalletEntryType` (7 types), `PaymentMethod` (wallet | cash | upi), `OfferStatus` (pending |
accepted | rejected | withdrawn), `VehicleClass` (hatchback | sedan | suv | suv_premium).

### Live — read and written by running code

- **User** — `clerkId` and `phone` unique, `name`, `whatsappNumber`, `bookingCode` (a stable
  4-digit code generated once at signup — it lives on the user, not the ride), optional
  `gender`, `dob`, `emergencyContact`, `deletedAt`.
- **SavedPlace** — label + address + optional coords, capped at 12 per user. Home and Work are
  fixed slots; the booking form suggests saved places above recents.
- **Driver** — `name`, `phone`, `vehicleClass`, `vehicleCapacity` (Int: seats *currently free*,
  the live availability counter), `vehicleNumber`, `vehicleModel`, `isActive`, `isOnline`,
  `fcmToken`, `pfpUrl`, `verificationStatus`, `group` (defaults `partner`), `suspendedAt` +
  `suspensionReason`, `walletBalance`, `activeVehicleId`, `lastOfferedAt` + `lastAssignedAt`
  (the ride-now fairness key). Eligibility index is
  `[isOnline, isActive, verificationStatus, vehicleClass, group]`.
  `clerkId` is nullable but **is written**, once, by `POST /api/driver/me` from the verified
  Clerk session. The four `vehicle*` columns are denormalised from the active `Vehicle` — see
  the schema comment; only signup and `services/driverVehicles.js` write them.
- **Vehicle** — a captain's cars, one row each: `class`, `number`, `model`, `capacity`,
  `verificationStatus`. `Driver.activeVehicleId` says which he is driving now. This is what
  makes "a driver *is* a car" false, and why document ownership splits between the man and the
  car — see `decisions/multi-vehicle.md`.
- **DriverDocument** — one row per **owner** per type per slot. `@@unique([ownerId, type,
  isReplacement])`, where `ownerId` is the car for vehicle-owned types and the driver for his
  own. **Two live rows per type, not one**: a renewal lands in the replacement slot beside the
  document it will replace, so an early renewal never takes an approved captain off the road.
  Carries two independent verdicts — `scanStatus` (the FILE: pending → scanning → clean |
  failed) and `status` (the ADMIN: pending → approved | rejected). Neither implies the other.
  Plus `fileUrl` (a storage path, not a URL), `number`, `expiresAt`, `fileHash`,
  `expiryWarnedDays` + `expiryWarnedAt` (which make the reminder sweep idempotent).
  `backend/constants/driverDocuments.js` is the single source of the 11 types. No police
  verification — dropped from the provider's list on purpose.
- **DriverDocumentArchive** — superseded document rows, kept for the audit trail behind a
  disputed suspension.
- **DriverLocation** — one row per driver, `latitude`/`longitude`/`bearing`/`speedKmh`,
  upserted by `POST /api/driver/location`. `bearing` + `speedKmh` exist to allow client-side
  dead reckoning between the customer's 5-second polls; **the customer side does not use them
  yet.**
- **Booking** — the core record: `userId`, optional `driverId`, pickup/drop address + coords,
  `vehicleClass`, `scheduledAt` (null = on-spot), `isOutstation`, `preferSafeRoute` +
  `safeWaypointLat`/`Lng`, `needsCarrier`, `distanceKm`, `fare`, `rideFare`,
  `commissionPct`/`commissionAmt`, `status`, the lifecycle stamps (`confirmedAt`, `reachedAt`,
  `startedAt`, `completedAt` and their distances), cancellation fields, `source`, `sharing`,
  `shareGroupId`, `pickupOrder`, `adminAlertedAt`.
- **RideOffer** — one scheduled-ride offer to one driver. `@@unique([bookingId, driverId])` is
  what makes the forever-running 5-minute sweep idempotent. `group` records which priority
  band it went out to.
- **FareZoneSet** — single row (`id = 1`) holding the live GeoJSON rate card as jsonb, plus
  `updatedBy`. The git file seeds it; an admin save takes over permanently.
- **ApiUsage** — monthly external-call counter (`service`, `month` "YYYY-MM", `count`).
- **OtpVerification** — one row per phone: `otpHash`, `expiresAt`, `used`.

### Schema-only — migrated, but no code reads or writes them

- **DriverReview** — unique on `bookingId`, rating 1-5 (enforced in the route, not the DB).
  Averages are derived rather than cached on `Driver`.
- **OverchargeFlag** — unique on `bookingId`, snapshots `fareAtFlag` because `Booking.fare`
  can still move.
- **WalletEntry** — append-only ledger with a **signed** `amount`, so the balance is a plain
  sum. `Driver.walletBalance` is a cache of it and must be written in the same transaction.
- **Coupon** — a row per issued coupon. `@@unique([userId, earnedFor])` stops one month
  issuing two; the unique `bookingId` stops the same ₹100 being spent twice.
- **WhatsappSession** — booking-bot conversation state.

### Dead

- **FareTable** — seeded by `seed.js` and **never queried by any pricing code**.
  `rideEstimate.js` has exactly three sources and none of them is this table. Either wire it
  in between zone and formula, or delete the model and its seed. Also see §12.

**Vehicles are a class, not a seat count.** `[hatchback, sedan, suv, suv_premium]`, defined once
in `backend/constants/vehicles.js` and mirrored in the frontend. Seats are a property of the
class (4, 4, 6, 6), so `vehicleCapacity` is measured against `seatsOf(vehicleClass)`. The
booking screen groups them under two rider-facing categories — **Cab Economy** (hatchback,
sedan) and **Cab XL** (SUV, premium SUV) — but the class is what gets priced, matched and
stored. There is no "ANY" option.

---

## 5. Key business rules

### Booking modes

- **Scheduled** (primary): `scheduledAt` set, **≥30 min** and **≤7 days** out, else 422.
  Created immediately as `confirmed` with the fare locked; **no driver assigned yet**. The
  sweep offers it closer to pickup.
- **On-spot** (secondary): `scheduledAt` null. The row is created **`pending`** and
  `startAssignment()` fires **detached**, so the response returns at once and the client can
  show "Requesting a ride" and poll. A search that reaches nobody ends at **`no_driver`** — a
  terminal status deliberately kept out of `ACTIVE_STATUSES` so the rider can retry
  immediately. Failed bookings stay in ride history on purpose.
- **Crash guard:** `GET /:id/status` lazily expires any `pending` row older than
  `ASSIGNMENT_DEADLINE_MS` (5 min). No scheduler needed — the poll that just arrived is the
  only thing waiting on the answer.
- **Duplicate guard:** a create is rejected (409) if the user has an active booking within
  15 minutes of the requested time, or on the same pickup+drop pair.

### Fare (`services/rideEstimate.js`, `services/fareZones.js`)

Everything prices **one number — the hatchback** — and the other three classes are modifiers
on it (`CLASS_FROM_HATCHBACK`): sedan **+₹100**, SUV **×1.6** (both the provider's own rules),
premium SUV **×2.75** (fitted to four Innova Crysta quotes, Aug 2026). Modifiers apply *at the
source that answered*, then round back onto that source's grid (₹50 for campus, ₹10 for
market), so a rider can never be quoted a sedan from one source and an SUV from another.

**The trip splits on whether either endpoint is within 1.5 km of campus** (`isNearCampus`,
surveyed SNU centre). That gate exists because the rate card is anchored at campus: zones are
drawn around the far endpoint and carry no origin, so left ungated they priced trips that never
touch campus — IGI → Connaught Place, 16 km, came back at the campus-to-CP price for a 55 km
run.

**Campus-anchored** → `zone`, then `formula`:
1. **Zone** — the endpoint *away* from campus is matched against 45 polygons in
   `data/zones.geojson` (or the `fare_zone_set` row, once an admin has saved). Highest
   `priority` wins, so exception zones override the broad areas containing them. When the top
   two are within 1 priority and disagree on price, that reads as an accidental border overlap
   rather than a carve-out, and the **midpoint** is charged.
2. **Formula** — a power law fitted to the same card, `36.7·km^0.897`, floor ₹400, rounded to
   ₹50. Beyond 56 km a flat ₹16/km takes over from the curve's own value there. Two bands get
   +₹50 (20-25 km, 49-52 km), with the curve clamped to its running maximum so leaving a band
   can't make a longer trip cost less.

**Off-corridor** → `per_km` (market), `{ pickup: 60, perKm: 4.7, perMin: 5.3, minimum: 130 }`,
fitted by least squares to 11 Uber and Rapido quotes on six NCR routes and set 12% above the
pooled fit. The weighting is time-heavy on purpose: the market prices on time, so a per-km-heavy
card would overcharge every expressway trip by nearly 40%. Without a duration from Routes the
time term is dropped rather than estimated.

Distance, duration and polyline come from the **Google Routes API**, counted against a
**10,000 calls/month** cap in `ApiUsage` (503 past it). Metrics are best-effort — zone fares
still price without them; distance-priced sources drop out.

**Add-ons.** Sharing takes **25%** off the base only (`SHARING_DISCOUNT_PCT` — **ours, not the
provider's, still unconfirmed**). Toll, carrier, airport fee and the safer-route surcharge are
all added **after** the discount, because they are costs of the trip rather than of the seat.
The roof carrier is ₹200, waived once `base + toll` reaches ₹2000 — tested on those two alone,
so neither the sharing discount nor the safe-route fee can tip a fare over the line.
**Airport pickup** adds ₹200, off-corridor trips only, within 2.5 km of IGI T3.

**The client never names a price.** `/api/fare/estimate` returns its `fares` with a `quote` —
the same numbers HMAC-signed (`fareQuote.js`, `FARE_QUOTE_SECRET`, 10-min TTL, verified with
`timingSafeEqual`). `POST /api/bookings` requires it and reads the fare, the pass-through
charges, the distance and the safer-route decision out of it, after checking the quote was
issued for this route (addresses, and coords to 1e-6° when it was priced with any). The body's
`fare` survives only as a cross-check; a mismatch is refused with `code: "FARE_QUOTE"`.
Signing happens inside `getRideEstimate` rather than in the route, so an estimate cannot leave
unsigned. In production a missing `FARE_QUOTE_SECRET` is fatal at boot.

### Safer route (`services/safeRoute.js`) — **live**

Google has no notion of a "shady" road, so the ground is marked instead of the road.
`data/shady-zones.geojson` holds **2 corridors** (Greater Noida east, Dadri–Bisrakh), which is
what makes the feature active: `hasShadyZones()` gates whether alternatives are even requested.

The estimate asks Routes for alternatives, decodes each, and measures how far each runs inside
a corridor — sampled every **50 m** so a sparse motorway polyline can't slip through, with a
**400 m** threshold so clipping a corner doesn't count. Primary clean → nothing offered.
Primary shady → the **fastest** clean alternative wins (duration is what the rider feels;
distance breaks ties). The winner reduces to **one coordinate** — the point furthest from the
primary path, since a midpoint sits on shared road and forces nothing — stored on the booking
as `safeWaypointLat`/`Lng` because a Maps nav link takes coordinates.

If every alternative is shady, the zone's own optional `fallback` point is forced and the
result re-verified. **Neither drawn corridor has a `fallback`, so that branch is unreachable
today.**

Charge and route come from **one** flag (`applied`): the ₹150 is charged only when a safer
route was actually found and taken, and the toggle is hidden entirely when there is nothing to
offer. The fare also reads distance from the chosen route, so the longer highway is priced as
the longer drive it is, with the flat ₹150 on top.

### Cancellation

Free while `pending`/`confirmed`/`assigned`/`en_route`; **35%** once the driver has `reached`
the pickup. A `started` ride can't be self-cancelled. The status endpoint returns the live
`cancellationCharge` from the same helper the cancel endpoint uses, so the warning and the
charge cannot drift. Cancelling restores capacity (solo back to full, sharing +1 capped) and
withdraws the booking's pending offers **in the same transaction**.

### Commission (`services/commission.js`)

**5% on fares ≥ ₹800**, stored on the booking. `rideFareOf` strips pass-through money first —
toll, parking, airport fee, carrier — because commission is a cut of the driving, not of money
crossing the driver's hands. The safer-route surcharge is deliberately **not** stripped: that
one buys a longer drive, which is the driver's own work.

### Driver assignment — ride-now (`services/driverAssignment.js`)

- Expanding **bounding-box → Haversine** search, radius 20→80 km in 10 km steps, re-checking
  booking status between rings so an expired or cancelled ride stops paging drivers.
- Filters on `isActive`, `isOnline`, `verificationStatus = approved`, `suspendedAt: null`, and
  `vehicleClass` matched **exactly** — never widened, since the rider was quoted for that car.
- Sorted by **`GROUP_RANK` (admin → rcs → partner) first, then distance**, ties to the senior
  driver. Ranking happens **within a ring**, not across the whole sweep — walking all three
  groups out to 80 km first would send a ride 60 km to Raju instead of 5 km to a partner.
- Offers are **sequential** — one FCM per candidate, awaiting each answer — which is why one
  ring can take minutes and why the search runs detached.
- `claimBookingForDriver` is the **only** way a booking gets assigned — every accept path calls
  it. One transaction, two conditional updates: a **status-guarded** booking write (stops two
  drivers taking one ride) and a **capacity-guarded** driver write (stops one driver taking two
  rides — those claims touch different rows, so nothing else makes them contend). Reads before
  the call are early-outs for a clean error message, never the check that decides.
- **Capacity:** solo takes the whole vehicle (`vehicleCapacity = 0`); sharing consumes one seat.
  Always written **relative** (`decrement`/`increment`) with the limit in the `WHERE`, never as
  arithmetic on a value read earlier in the request.
- Nobody found: on-spot → `no_driver`; scheduled → stays `confirmed`, admin alerted once.

### Driver assignment — scheduled (`services/scheduledOffers.js`, `constants/dispatch.js`)

Scheduled rides do **not** use the synchronous path. A scheduled offer is a **row**, created by
the sweep, answered later through the app, and left `pending` on the driver's notification page
in between — because a push that is never tapped is simply gone, and a row is not.

- **Offers go to a whole group at once**, not one driver at a time. First accept wins through
  the same status-guarded claim, and every competing offer is withdrawn in the same breath.
- **Online status is not in the query.** Offline drivers receive scheduled offers by design;
  the accept endpoint is what refuses them, with code `OFFLINE`, so the app can show "Go Online
  to Accept" rather than hiding the ride. **Reject works offline on purpose** — a driver who
  knows he can't do Tuesday 6am shouldn't have to go online to say so.
- **Owner hold:** Raju alone is offered the ride for **15 min** if pickup is within 2 h, else
  **45 min**, measured from confirmation (`ownerHoldMinutes`).
- **Escalation rcs → partner happens when every rcs offer has come back rejected**, not on a
  timer. An unanswered offer is not a rejection.
- Idempotent by construction: `@@unique([bookingId, driverId])` plus an
  `offers: { none: { bookingId } }` filter mean a re-run creates nothing, which matters because
  the sweep runs forever and two sweeps can overlap.
- FCM is fire-and-forget; a dead token still leaves the row on the driver's page.

### The sweeps (`lib/jobs.js`)

Three of them, and **how they are triggered depends on `JOBS_MODE`**, not on the code:

| Job name | Body | Cadence |
|---|---|---|
| `dispatch` | `sweepScheduledRides` — offer unfilled scheduled bookings | 5 min |
| `document-scan` | `sweepDocumentScans` — settle documents nothing recorded a verdict for | 5 min |
| `document-expiry` | `sweepDocumentExpiry` — lapse expired papers, send 30/7/1-day reminders | 60 min |

`interval` (the default, and what Render uses) starts them on `setInterval` at boot.
`scheduler` starts no timers and expects Cloud Scheduler to `POST /internal/jobs/:name`.
**This exists because a timer cannot work on Cloud Run**: between requests the CPU is throttled
to near zero, so the event loop stops spinning and the deadline passes unobserved — scheduled
rides would silently stop being offered with nothing logged and `/health` still green. There is
one implementation of each sweep and it cannot tell which trigger called it.

`dispatch` picks `confirmed` bookings with `scheduledAt` inside **6 hours**
(`ASSIGNMENT_HORIZON_H`) and offers them. `Booking.adminAlertedAt` is stamped **before** the
send and guarded on still being null, so the T−1h WhatsApp to the admin fires **once** rather
than twelve times. Overlapping runs are refused per process — but the real safety is in the
database (`claimDocument`'s conditional UPDATE, the unique on `RideOffer`, the `adminAlertedAt`
guard), which is why Render and Cloud Run can both sweep the same rows during the migration
without stepping on each other.

`runJob` deliberately does **not** catch. Cloud Scheduler retries on 5xx, so "does this throw"
is really "should a failed pass retry immediately", and the three already disagree: dispatch
and expiry swallow (the next tick is soon enough), document-scan throws (a captain is watching
a "Checking…" screen).

### Decided, not built

Ride acceptance deposit, overcharge flags → fines → suspension, coupons, ratings, round trips,
the driver marketplace, payments and monthly accounts. Schema exists for most of it; no code
touches any of it. Full detail in ROADMAP blocks 7 and 9-12.

---

## 6. Auth model (hybrid WhatsApp-OTP + Clerk)

No password, no Clerk-hosted UI.

1. `POST /api/auth/send-otp { phone }` → backend stores `otpHash` with a 5-min expiry and
   **sends the code over the WhatsApp Cloud API** using the approved `verification_otp`
   template (`sendOtpWhatsApp`). This path is **real, not a stub**. In dev the OTP is also
   logged to the backend console.
2. `POST /api/auth/verify-otp { phone, otp }` → verifies, burns the OTP, finds or creates a
   Clerk user keyed by a **synthetic email** `91{phone}@rcs-travels.com`, returns a **Clerk
   sign-in ticket** (60s expiry).
3. Frontend completes the session with `signIn.create({ strategy: "ticket", ticket })`.
4. `GET /api/users/me`: 404 → new user → `/signup`; found → `/book`.

Because the phone is encoded in that email, the backend always derives it from the verified
session and **never trusts a phone sent by the client**. Signup collects the **name first**, so
the DB user is created in the same step as verification — no post-OTP screen to abandon into a
profile-less session.

`hybridAuth.js` gates on audience: when a driver signs in, it checks a `Driver` row exists
before sending an OTP. That gate is the only thing stopping a rider's number signing into the
captain app — **do not loosen it to unblock testing, seed a Driver row instead.**

`protectAdmin` checks `req.auth.sessionClaims.metadata.role === "admin"`. It is **flat**: all
three admins are identical to it, and it is not a dispatch concept. Dispatch priority lives on
`Driver.group`.

---

## 7. Frontend state & navigation

**`useData` (Zustand, localStorage `rcs-data`).** **Persisted:** `phone`, `language`,
`recentPlaces`, and the ride form — `pickupLocation`, `dropLocation`, `pickupCoords`,
`dropCoords` (addresses and coords must travel together or a reload would rebook from fallback
anchors) plus `distanceKm`, `durationMin`, `routePolyline`, `fareSource` so tracking still draws
the real road route after a reload. `/book` wipes the metrics on mount so a new booking can't
inherit the old route. **Not persisted:** `bookingId`, `status`, `safeRoute`, `sharing`, `fare` —
a per-trip choice belongs to the trip.

**Routes (`main.jsx`)** — all wrapped in a pathless `PageMeta` layout route that sets each
page's title and description, with a `RouteErrorBoundary` as its `errorElement` (a data router
swallows throws from its own routes, so this is the boundary that actually fires):

| Path | Element | Guard |
|------|---------|-------|
| `/` | `App` → NavBar + OnBoarding + marketing + Footer | public |
| `/login`, `/signup` | `LoginPage`, `SignUpPage` | public |
| `/help` | `HelpPage` | public |
| `/outstation` | `Outstation` | public, indexable |
| legal paths (`constants/legal.js`) | `LegalPage` | public, one route per document |
| `/book` | `VehicleSelect` | `ProtectedRoute` |
| **`/booking/:id`** | `TrackingPage` | `ProtectedRoute` |
| `/manage-account` | `ManageAccount` | `ProtectedRoute` |
| `/settings`, `/safety` | `SettingsPage`, `SafetyPage` | `ProtectedRoute` |
| `/dashboard` | `AdminDashboard` | `ProtectedRoute requireAdmin` |
| `/dev`, `/dev/:view` | `DevPreview` | dev builds only |
| `*` | `NotFound` | catch-all, inside PageMeta so a typo isn't served as the home page |

`/booking/:id` is **restored** — `TrackingPage` takes the param as its source of truth and falls
back to the store only where there is no param (the `/dev` previews). `ErrorBoundary` is
**active** around the router, with `RideCancelledToast` and `RefreshNotice` mounted globally.

**Navigation uses `useViewNavigate`**, a `useNavigate` wrapper passing `{ viewTransition: true }`
so the browser's View Transitions API animates page changes (CSS in `index.css` under
`::view-transition-old/new(root)`).

---

## 8. API surface

**Auth** — `POST /api/auth/send-otp`, `/verify-otp`

**Users** — `GET /me`, `GET /me/recent-places`, `GET|PUT /me/saved-places`,
`DELETE /me/saved-places/:id`, `GET /me/download` (PDF), `DELETE /me`,
`POST /me/updateGender | updateEmergencyContact | updateDOB`, `POST /me`

**Fare** — `POST /api/fare/estimate`

**Bookings** — `POST /`, `GET /:id/status`, `POST /cancel`, `GET /my-bookings`

**Driver** (21) —
*Account:* `POST /me` (**signup — writes `clerkId` from the session; this is what links a
captain to his Clerk identity**), `GET /me`
*Vehicles:* `GET|POST /me/vehicles`, `PATCH /me/active-vehicle`, `DELETE /me/vehicles/:id`
*Documents:* `POST /me/documents/upload-url`, `POST /me/documents` (confirm), `GET /me/documents`
*Working:* `PATCH /online`, `POST /location`, `POST /fcm-token`, `GET /upcoming-ride`
*Rides:* `GET /rides`, `GET /rides/:id`, `PATCH /rides/:id/status`, `PATCH /rides/:id/accept`,
`PATCH /rides/:id/decline`
*Offers:* `GET /offers`, `PATCH /offers/:id/accept`, `PATCH /offers/:id/reject`

`requireApprovedDriver` gates every one of these except `POST /me`, `GET /me` and the document
routes — the ones that have to work *before* he is approved, since they are how he becomes
approved. It refuses a suspended driver with the reason.

**Admin** (7) — `GET /booking`, `GET /driver`, `GET /user` (zod-validated filters),
`GET|PUT /zones` (the fare-zone editor), `GET /drivers/:id/documents` (short-lived signed URLs,
**null for anything not `clean`** — `signedDocumentUrl` fails closed), `PATCH /documents/:id`
(approve / reject with a reason).

**Internal** — `GET /internal/jobs`, `POST /internal/jobs/:name` for
`dispatch | document-scan | document-expiry`. Mounted **before** `clerkAuth` because the caller
presents a Google OIDC token, not a Clerk session. Authenticated by
`middleware/internalAuth.js`, which verifies the token's audience *and* the calling service
account, and answers 503 rather than allowing anything if either is unconfigured.

**Google proxies** — `GET /autocomplete`, `/details/:placeId`, `/reverse-geocode`, all cached
in-process and rate-limited so the API key never reaches the browser.

---

## 9. Design system & animation conventions

- **Dark, premium aesthetic.** Custom CSS variables for backgrounds (`--background`,
  `--background-primary`, `--background-muted`) and text. Brand primary blue `#243AFB`. PP Mori.
  The **driver app inverts this** — white page, dark floating chrome.
- **A shared layout + type scale** runs across the booking flow (OnBoarding, VehicleSelect,
  TrackingPage, RideDetails): a real **377px** desktop content column — OnBoarding's effective
  control width — reached as a width rather than a transform, so type stays honest at both
  breakpoints. Spacing tokens (`PAIR` / `GROUP` / `STACK`) express the vertical rhythm.
- **`BackgroundPanel`** is the core surface: bottom-anchored on mobile, full-height on desktop,
  owning its own enter/exit animation via a `show` prop — it stays mounted through the exit
  then unmounts. Panels slide in and out from the right.
- **`ErrorPanel`** wraps `BackgroundPanel`, shown on `!!error`, with a `lastError` latch so the
  message stays readable while animating out.
- **`useExitAnim(open, duration)`** is the shared mounted/closing pattern for every dropdown,
  drawer and panel. `BackgroundPanel` has the same logic inline.
- **Custom animations** in `index.css` (`@layer base`): `panel-transition(-out)`,
  `dropdown-reveal/collapse`, `datetime-bloom/wilt`, `sheet-in/out` + `backdrop-in`,
  `fade-swap`, `loading-bar`, `illus-fade`, `skeleton-sheen`.
- **The map is a singleton** (`ui/GoogleMap.jsx`) with module-level overlay registries
  (`ui/mapOverlays.jsx`), because overlays outlive any one component — a StrictMode remount or
  a page change must still be able to find and clear them.
- **House rules (from CLAUDE.md):** no default Tailwind blue/indigo as primary; no
  `transition-all`; animate only `transform`/`opacity`; layered tinted shadows. The
  `frontend-design` skill must be invoked before writing frontend code.

---

## 10. Status — what's DONE / PARTIAL / LEFT

### Done

- **Backend foundation** — Express, Clerk middleware, Prisma + Supabase, 18 models with
  justified indexes, `/health` (runs `select 1`), per-IP rate limiting, zod-validated lists.
- **Auth** — WhatsApp-OTP over the real Cloud API → Clerk ticket, profile fields, PDF data
  download, account deletion.
- **Fare** — the campus/off-corridor split, zone matching with border blending, the fitted
  curve, the market rate, Routes with a monthly cap, signed quotes end to end.
- **Safer route** — classifier, 2 drawn corridors, divergence waypoint, single-flag charge.
- **Booking backend** — create (scheduled + detached on-spot), `:id/status` with lazy expiry
  and live cancellation quote, cancel with capacity restore and offer withdrawal,
  `my-bookings` with search/filter/pagination.
- **Dispatch** — ride-now rings with group priority and guarded claim; persisted scheduled
  offers with group broadcast, first-accept-wins, owner hold and rejection-based escalation;
  the 5-minute sweep with a running guard and a once-only admin alert.
- **Driver backend** — 21 endpoints including signup (which writes `clerkId` and so closes the
  old "no captain can use the app" blocker), multi-vehicle management, GPS upsert, online
  toggle, FCM token, the full ride lifecycle and offer accept/reject, behind an approval +
  suspension gate that deliberately lets the pre-approval routes through.
- **Driver documents, end to end** — signed direct-to-storage upload with server-composed
  paths, a confirm endpoint that re-reads the object's real first bytes before writing a row,
  an asynchronous scanner (magic bytes → sharp re-encode → PDF active-content scan) with a
  bounded retry sweep, admin review with fail-closed signed URLs, replacement slots so an early
  renewal never takes an approved captain off the road, and expiry + reminder sweeps.
- **Multi-vehicle captains** — a `Vehicle` table with `activeVehicleId`, document ownership
  split between the man and each car, and per-car verification.
- **Dispatch fairness** — `last_offered_at` / `last_assigned_at` so ride-now stops handing every
  booking to whoever parks nearest the gate.
- **Cloud Run migration, phases 1–2** — background sweeps moved off `setInterval` onto Cloud
  Scheduler + authenticated `/internal` endpoints; the backend containerised and deployed to
  Cloud Run alongside Render, with secrets in Secret Manager. `lib/storage.js` extracted so the
  Supabase → GCS swap is one file. See `decisions/cloud-run-migration.md`.
- **Customer frontend** — the whole funnel: OnBoarding, Login/SignUp, VehicleSelect (fare
  cards, solo/share, safer-route toggle, pin-confirm map, searching/confirmed/no-driver
  panels), TrackingPage on `/booking/:id`, RideDetails, ManageAccount, Settings, Safety, Help,
  Legal, Outstation, the marketing homepage, and `DevPreview`.
- **Admin** — bookings/drivers/users tables with filters and skeletons, plus `EditFares` saving
  the live zone rate card to the database.
- **Driver app** — Expo shell, auth screens, AppBar with scrim and visibility, online toggle,
  Home, Rides, RideDetail, Notifications, Account, and marketplace screens (Available, Post).

### Partial

- **`TrackingPage` driver card** — polls correctly, but `driverCard` and `driverRow` still
  render hardcoded text ("Driver name", "UP 16 AB 1234"), and aren't gated on `driver` being
  non-null, so an unassigned booking shows a driver who doesn't exist.
- **`ThemeToggle.jsx`** renders `null` by design; the site follows the OS theme.
- **Driver marketplace screens** exist in the app with **no backend at all**.
- **Local-only UI** — see §13.

### Left to build, in priority order

1. **Finish the Cloud Run migration** — run the functional checklist against Cloud Run, cut
   Vercel and the Expo app over, retire Render, then Supabase Storage → GCS and Cloud Tasks
   for individual scans. Put a custom domain (`api.rcstravels.co.in`) in front of Cloud Run
   *before* cutting over: `EXPO_PUBLIC_API_BASE_URL` is inlined into the app bundle at build
   time, so a bare `run.app` URL would make every future move an app release.
2. **Rotate every production credential** once that is done — see the top of ROADMAP for why
   and in what order.
3. **The remaining admin mutations** — approve / reject / deactivate a *driver*, and manual
   re-assignment. Document review exists (`PATCH /admin/documents/:id`); driver-level
   approval still does not, so nothing can move a captain to `approved`.
4. **Real FCM** — `sendFCM` is a coin flip, so every accept path is untested against a real
   device. `sendPush` is real, so the plumbing exists; what is missing is making assignment
   event-driven rather than waiting 30s for a boolean a push can never return.
5. **Real `sendWhatsApp`** — still a `console.log`, so the T−1h "nobody accepted this booking"
   alert to Raju goes nowhere. Needs approved utility templates.
5. **Live tracking** — the driver marker and dead reckoning on the customer side.
   `POST /driver/location` already stores bearing and speed, so this is client-side work.
6. **Sharing pool** — see §12; the corridor pass cannot run.
7. **The accountability layer** — wallet, deposit, flags, fines, suspension mutations,
   coupons, ratings. Schema migrated, no code.
8. **Round trips**, then the marketplace backend, payments, outstation.
9. **Polish** — i18next Hindi wiring, and the optimizations in ROADMAP.

---

## 11. Running locally

**Backend** (`backend/`): `.env` needs `DATABASE_URL`, `CLERK_SECRET_KEY`,
`GOOGLE_MAPS_API_KEY`, `ADMIN_PHONE`. Optionally `DIRECT_URL` (migrations need a direct or
session connection, not the transaction pooler), `CORS_ORIGINS`, `FCM_ALWAYS_ACCEPT`,
`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `DATABASE_POOL_MAX`.

`SUPABASE_URL` + `SUPABASE_SECRET_KEY` are needed for anything touching documents — without
them those routes answer 503 in dev, and the server **refuses to boot** in production.
`FARE_QUOTE_SECRET` is likewise fatal in production and a throwaway per-process key in dev.
`INTERNAL_JOBS_SECRET` (any long random string) lets you curl `/internal/jobs/:name` locally;
it is unreachable when `NODE_ENV=production`, enforced in code.

`JOBS_MODE` defaults to `interval` — the in-process timers, which is what you want locally and
on Render. Only the Cloud Run image sets `scheduler`. An unrecognised value refuses to boot,
because every forgiving reading of a typo ends at "silently run no sweeps at all".

```
npm install
npm run db:generate
npm run db:migrate
npm run db:seed          # npm run db:clean resets bookings to the seed
npm run storage:setup    # once, after setting SUPABASE_* — creates the private bucket
npm run dev              # tsx watch → http://localhost:5000 ; GET /health
npm run typecheck
npm test                 # node:test; documentConcurrency needs a database
```

**Frontend** (`frontend/`): `.env` needs `VITE_CLERK_PUBLISHABLE_KEY`,
`VITE_GOOGLE_MAPS_API_KEY`, optional `VITE_API_BASE_URL` (defaults to `http://localhost:5000`).

```
npm install && npm run dev     # vite → http://localhost:1574
```

**Driver app** (`driver-app/`): needs `EXPO_PUBLIC_API_BASE_URL` and a Clerk publishable key
set through EAS environments, **not** a `.env` — EAS archives from the repo root, so the root
`.gitignore` excludes it and a negation in `.easignore` cannot beat a parent rule.

```
npm install && npm start       # expo start --dev-client
```

Dev login: enter a phone on `/login` and read the OTP from the backend terminal. Visit `/dev`
for an index of every booking-flow screen, rendered with a mock booking and no backend needed.

---

## 12. Known bugs and gotchas

- **`FareTable` is dead data.** Seeded on every `db:seed`, queried by nothing. CONTEXT's own
  earlier versions and ROADMAP both describe a `zone → FareTable → formula` chain that the code
  does not implement.
- **Quoted per-class zone fares are dead too.** `zones.geojson` stores hatchback, sedan, suv
  and suv_premium for all 45 zones, and `matchZone` even blends all four at a border — but
  `hatchbackFrom('zone')` reads only `zone.fares.hatchback` and derives the rest from the
  multiplier. A price the provider quoted for a specific car loses to the multiplier every
  time: IGI stores the Ertiga at 2400, the app charges 1400×1.6 = 2250. The fix is small but
  reprices sedan and Ertiga across every zone at once, so confirm the stored numbers first.
- **The sharing-assignment pass is dead code.** `driverAssignment.js` filters candidates on
  `loc.sharing === true`, but `DriverLocation` has no `sharing` column — the filter is always
  empty, the 45° corridor check never runs, and sharing riders each start a *fresh* trip
  instead of pooling. `inSameDirectionCorridor` is written and unreachable.
- **`sendFCM` and `sendWhatsApp` are stubs.** `sendFCM` waits 30s and returns a coin flip (or
  always true with `FCM_ALWAYS_ACCEPT=1`); `sendWhatsApp` only logs. `sendOtpWhatsApp` is real.
  So in dev, driver assignment "succeeds" randomly.
- **Neither drawn shady corridor has a `fallback`**, so the forced-waypoint branch of
  `fetchRouteOptions` can never fire. The main path works.
- **`TrackingPage` shows a hardcoded driver** on any booking that reaches the live panel.
- **`multer` and `@aws-sdk/client-s3` are unused** — document upload moved to Supabase Storage.
  Remove both.
- **Rate-limiter counters live in process memory**, so a cold start resets them — on Render's
  free tier and, worse, on Cloud Run, where `min-instances=0` means the counters are per
  instance *and* per cold start. The Google Console quota is the real ceiling.
- **The OTP is a login, and it used to be printed.** WhatsApp delivery had been commented out
  for local convenience with a `console.log` standing in, and that shipped — so for a period
  `send-otp` answered ok while sending nothing, and the code sat in the server log where anyone
  with log access could read it. Fixed: production sends and never logs, dev logs and never
  sends, keyed on `NODE_ENV` rather than on a comment somebody has to remember to restore.
- **Testing against Cloud Run writes to the production database** with live Clerk keys. There
  is no staging database. `npm run db:clean` afterwards.
- **One phone number does three jobs** — public support line, `ADMIN_PHONE` for the T−1h
  escalation, and Raju's own login. Keep `ADMIN_PHONE` its own env var; dispatch priority must
  read `Driver.group` and never a phone number.
- **Nothing sets a non-default `Driver.group`**, so every driver is `partner` and the priority
  ordering is a no-op until Raju's row is seeded as `admin` and his fleet as `rcs`.

### Fixed since the last revision of this file

**A captain can now use the driver app.** `POST /api/driver/me` creates the row with
`clerkId` taken off the verified session, so the linkage this file called "the single blocker
on the whole driver app" is closed. Signup also creates his first `Vehicle` in the same
transaction, because a captain row with no car is a state no screen knows how to render.

**An early renewal no longer takes an approved captain off the road.** The unique key is
`@@unique([ownerId, type, isReplacement])`, so a renewal lands in a second slot beside the
document it will replace instead of overwriting it. This was the top `IMPORTANT` item in
ROADMAP and is resolved.

**The OTP is delivered again** — see above.

`/booking/:id` is restored; `ErrorBoundary` is active; the sweep horizon is 6 h rather than 12;
the overlapping-`setInterval` defect is closed by a `running` guard; the repeating T−1h admin
alert fires once; `driver.ts` accept shares `claimBookingForDriver` with the assignment engine.

Both accept paths and the assignment engine now claim the booking **and** the seats in one
transaction, so one driver accepting two rides at once can no longer double-book the car or
drive a sharing vehicle to −1 seats. The capacity **restore** paths (ride completed, booking
cancelled) got the same treatment: the "don't exceed full" cap moved from an `if` over a stale
read into the `WHERE`, and completion's status transition and seat give-back now share a
transaction so a crash between them can't leave the vehicle permanently a seat short.

---

## 13. Local-only UI (not wired to a backend)

These controls exist and look real, but hold local React state. They reset on reload and change
nothing server-side.

**Settings** (`pages/SettingsPage.jsx`)
- [ ] Notification toggles — whatsapp / push / promotions, local `notifs` state. Needs
      preference columns and a GET/PUT.
- [x] **Saved places — now wired** to the `saved_places` table via `/api/users/me/saved-places`
      (GET/PUT/DELETE, capped at 12).
- [~] Language — persists to the store and survives reload, but **isn't connected to i18next**,
      so switching it changes nothing.

**Safety** (`pages/SafetyPage.jsx`)
- [ ] "Share my live location" — local `autoShare` state. Needs a preference field and the
      actual share-on-start behaviour.
- [ ] Helpline number is a placeholder.
- [x] Emergency contact — genuinely wired to `updateEmergencyContact`.

**Manage Account** (`pages/ManageAccount.jsx`)
- [ ] "What drivers see" (Privacy & Data) — placeholder lists. Reconcile with the real driver
      payload; today only `customerPhone` and the trip locations are sent.

---

*Keep this file updated as features land — especially §10, §12 and §13. When a stub is replaced
with a real integration or a page moves from partial to done, reflect it here.*
