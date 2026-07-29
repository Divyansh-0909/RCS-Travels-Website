# RCS Travels — Project Context

> A single source of truth for understanding this codebase. Read this first.
> For the phased build plan and future ideas, see [ROADMAP.txt](ROADMAP.txt).
> Status reflects the **actual code** as of July 2026, not just intentions.

---

## 1. What this is

**RCS Travels** is a full-stack **cab-booking platform** for a small/local cab operator in the
Delhi-NCR region (owner referred to as "Raju"), serving a university campus (Shiv Nadar) and the
surrounding NCR. It is **not** a generic Uber clone — it is built around a specific operating model:

- **Pay the driver directly.** No in-app payments, no card/wallet screens, no in-app toll handling.
  Tolls on per-km-priced routes are paid to the driver separately (shown as a note on the UI).
- **Scheduling-first.** The primary flow is booking a ride up to 7 days in advance; on-spot ("now")
  rides are secondary and subject to availability.
- **WhatsApp is a first-class channel** — for OTP login, customer notifications, and (planned) a
  booking bot. The owner is not tech-savvy, so WhatsApp is the low-friction surface.
- **Fares come from a hand-drawn zone map** of NCR, falling back to a fixed destination table and
  then to a per-km formula fitted to the provider's rate card.
- **Solo vs. Sharing rides.** A customer can book a whole vehicle (solo) or a shared seat.

Three apps are envisioned. The **customer website** and its backend are built. The **admin
dashboard** exists as a read-only view inside the same React app. The **driver mobile app** (Expo)
has not been started — which is why half the ride lifecycle has no producer.

---

## 2. Tech stack

### Frontend (`frontend/`)
- **React 18.3** + **Vite 6** (ES Modules, mostly `.jsx`; `.tsx` where types earn their keep —
  `AdminDashboard`, `Chips`, `types/enums`).
- **Tailwind CSS v4** (via `@tailwindcss/vite`). NOTE: v4 utilities use independent `scale` /
  `translate` / `rotate` CSS properties (not the `transform` shorthand), so keyframe `transform`
  animations compose cleanly with positioning utilities. This is relied on throughout the animations.
- **React Router 6.28** (`createBrowserRouter`), using the stable `viewTransition` navigate option.
- **Clerk** (`@clerk/clerk-react`) for auth/session.
- **Zustand 5** for client state (`useData`), **persisted to localStorage** under key `rcs-data`
  via `partialize` — see §7 for exactly which keys survive a reload.
- **Radix UI**, **@mdi/react** (Material Design Icons), **react-day-picker** + **date-fns** for the
  date/time picker, **@lottiefiles/dotlottie-react** for the success/error marks.
- **i18next / react-i18next** installed for future multi-language (Hindi) — **not wired up yet**.
  The language setting persists but changes nothing.

### Backend (`backend/`)
- **Node + Express 5.2** (ES Modules, `type: "module"`). Mixed `.js` and `.ts`, run through
  **`tsx`** in dev and plain `node` in prod, so TypeScript files are type-checked (`npm run
  typecheck`) but never separately built.
- **Prisma 7.8** ORM with the **`@prisma/adapter-pg`** driver adapter over **`pg`**.
- **PostgreSQL** (Supabase, free tier).
- **Clerk** (`@clerk/express`) — `clerkMiddleware()` globally, `requireAuth()` on protected routes.
- **zod** for query-parameter validation on the list endpoints (`types.ts`).
- **express-rate-limit** on the unauthenticated Google-proxy and fare endpoints.
- **pdfkit** for the account-data download.
- **firebase-admin** (FCM push to drivers) and **multer** + **@aws-sdk/client-s3** (driver document
  uploads) are installed but **not yet used** — placeholders for later phases.

### Deployment (planned)
- Frontend → **Vercel**. Backend → **Render** (free tier, kept alive via a cron pinging `/health`,
  which runs a `select 1` so Supabase doesn't pause either). Database → **Supabase PostgreSQL**.
  Driver app → **Expo EAS** (later). See ROADMAP for the pre- and post-deploy checklists.

---

## 3. Repository layout

```
RCS-Travels-Website/
├── CONTEXT.md            ← this file
├── ROADMAP.txt           ← phased plan + backlog of ideas
├── tools/zone-editor.html            browser tool for drawing/pricing fare zones
├── backend/
│   ├── index.js                       Express app entry; mounts routers, starts assignment job
│   ├── types.ts                       zod query schemas + shared API types
│   ├── middleware/
│   │   ├── auth.js                     clerkAuth, protect (requireAuth), protectAdmin (role check)
│   │   ├── rateLimit.js                per-IP limits for the unauthenticated Google/fare routes
│   │   └── errorHandler.js
│   ├── db/prisma.js , lib/prisma.js    Prisma client (pg adapter)
│   ├── prisma/
│   │   ├── schema.prisma               data model (8 models, 4 enums)
│   │   ├── seed.js , clean-bookings.js
│   ├── data/zones.geojson              hand-drawn NCR fare zones + per-class prices
│   ├── scripts/free-port.js            frees the port before dev/start
│   ├── routes/
│   │   ├── hybridAuth.js               POST /api/auth/send-otp, /verify-otp  (WhatsApp-OTP→Clerk)
│   │   ├── users.js                    me, recent-places, gender/DOB/emergency, download, delete
│   │   ├── fare.js                     POST /api/fare/estimate
│   │   ├── bookings.js                 create / status / cancel / my-bookings
│   │   ├── driver.js                   PATCH /api/driver/rides/:id/accept | /decline
│   │   ├── admin.ts                    GET /api/admin/booking | /driver | /user   (read-only)
│   │   └── googleAPI.js                autocomplete / place details / reverse-geocode proxies
│   └── services/
│       ├── rideEstimate.js             zones → fixed table → per-km formula; Routes API + usage cap
│       ├── fareZones.js                point-in-polygon zone matching, border blending
│       ├── driverAssignment.js         nearest-driver matching (Haversine + sharing corridor)
│       ├── assignScheduledRides.js     setInterval job, runs every 5 min
│       └── notification.js             sendFCM / sendWhatsApp  ← BOTH STUBBED (console.log)
└── frontend/
    └── src/
        ├── main.jsx                    router + ClerkProvider + ThemeProvider
        ├── App.jsx                     "/" → NavBar + OnBoarding + marketing sections + Footer
        ├── api/api.js                  thin fetch wrapper, one fn per endpoint
        ├── constants/                  fares (surcharge), statusLabels, support contact details
        ├── types/enums.ts              frontend mirror of the Prisma enums
        ├── hooks/
        │   ├── useData.js              Zustand store (booking draft + session bits), persisted
        │   ├── useApi.js               binds Clerk getToken to each api.js call
        │   ├── useViewNavigate.js      navigate() wrapper that enables View Transitions
        │   ├── useIsMobile.js          live <640px check for behaviour CSS can't express
        │   └── useExitAnim.js          keeps a panel mounted through its closing animation
        ├── context/ThemeContext.jsx    dark/light (ThemeToggle renders null by design)
        ├── components/
        │   ├── ProtectedRoute.jsx      Clerk gate → redirects to /login?redirect=
        │   ├── ErrorBoundary.jsx       ← currently commented out in main.jsx
        │   ├── RideDetails.jsx         ride-details sub-panel (shared by /book and tracking)
        │   ├── *Skeleton.jsx           tracking / ride-history / admin first-load placeholders
        │   ├── illustrations/          inline SVG + Lottie illustrations
        │   └── ui/                     Button, Input, NavBar, BackgroundPanel, ErrorPanel,
        │                               DateTimeSelector, GoogleMap, mapOverlays, RoutePanel,
        │                               NoticePill, Chips, Skeleton, Toggle, …
        └── pages/
            ├── OnBoarding.jsx          landing/booking form (timing, pickup, drop, autocomplete)
            ├── HowItWorks / Services / AboutUs / WhyUs   marketing sections of "/"
            ├── LoginPage.jsx           phone → OTP → /book or /signup
            ├── SignUpPage.jsx          name → phone → OTP → /book
            ├── VehicleSelect.jsx       vehicle + fare + pin-confirm + searching/confirmed panels
            ├── TrackingPage.jsx        status-driven ride screen, polls every 5s
            ├── ManageAccount.jsx       profile, ride history, privacy & data
            ├── SettingsPage / SafetyPage / HelpPage
            ├── AdminDashboard.tsx      bookings / drivers / users tables (read-only)
            └── DevPreview.jsx          dev-only harness for previewing any screen without a backend
```

---

## 4. Data model (`backend/prisma/schema.prisma`)

**Enums:** `BookingStatus` (pending, confirmed, assigned, en_route, reached, started, completed,
cancelled, **no_driver**), `BookingSource` (website | whatsapp | admin), `CancelledBy`
(user | driver | admin), `VerificationStatus` (pending | approved | rejected).

**Models (8):**
- **User** — `clerkId` (unique), `phone` (unique), `name`, `whatsappNumber`, `bookingCode`
  (**stable 4-digit code generated once at signup — it lives on the user, not the ride**), optional
  `gender`, `dob`, `emergencyContact`, `deletedAt`. One-to-many `bookings`.
- **Driver** — `name`, `phone`, `vehicleClass` (VehicleClass enum — the car itself; its seat count
  comes from `constants/vehicles.js`), `vehicleCapacity` (Int: seats
  currently free — the live availability counter), `vehicleNumber`, `isActive`, `isOnline`,
  `fcmToken`, `dlDocUrl`/`aadharDocUrl`, `verificationStatus`. Has one `DriverLocation`.
- **DriverLocation** — one row per driver, `latitude`/`longitude`/`bearing`/`speedKmh`, designed to
  be upserted every 4s while online. `bearing`+`speedKmh` enable client-side **dead reckoning**
  between the customer's 5-second status polls. **Nothing writes this table yet.**
- **Booking** — the core record: `userId`, optional `driverId`, pickup/drop address + lat/lng,
  `vehicleClass`, `scheduledAt` (null = on-spot), `isOutstation`, `preferSafeRoute`, `distanceKm`,
  `fare`, `commissionPct`/`commissionAmt`, `status`, `confirmedAt`, `cancellationCharge` and the
  other cancellation fields, `source`, `sharing` (bool), `shareGroupId`, `pickupOrder`.
- **FareTable** — fixed NCR pricing, unique on (`destinationName`, `vehicleClass`). Only the two
  base classes are stored; `sedan` and `suv_premium` are derived from their sibling in
  `rideEstimate` (`DERIVED_CLASS`), so a destination needs no extra rows to gain them.
- **ApiUsage** — monthly external-API call counter (`service`, `month` "YYYY-MM", `count`).
- **OtpVerification** — one row per phone: `otpHash`, `expiresAt`, `used`. Backs the WhatsApp OTP.
- **WhatsappSession** — in-progress WhatsApp booking-bot conversation state. Nothing reads or
  writes it yet.

Every index in the schema is justified by a named call site in a comment above it — read those
before adding more.

**Vehicles are a class enum, not a seat count.** Valid set: `[hatchback, sedan, suv, suv_premium]`,
defined once in `backend/constants/vehicles.js` and mirrored in `frontend/src/constants/vehicles.js`.
Seats are a property of the class (4, 4, 6, 6), so `vehicleCapacity` is measured against
`seatsOf(vehicleClass)`. The booking screen groups them under two rider-facing **categories** —
**Cab Economy** (hatchback, sedan) and **Cab XL** (SUV, premium SUV) — but the class is what gets
priced, matched to a driver and stored. There is no "ANY" option: the old `vehicleType 1` was
removed along with the integer scheme, and every ride now names the car it booked.

`hatchback`, `sedan` and `suv` are priced from the zone/fixed/formula/market cards directly.
`suv_premium` has no rate data anywhere and is always derived — `suv × PREMIUM_SUV_MULTIPLIER`
(**placeholder 1.15, needs provider confirmation**) at whichever source priced the SUV.

---

## 5. Key business rules

**Booking modes**
- **Scheduled** (primary): `scheduledAt` set, must be **≥30 min** and **≤7 days** out (else 422).
  Created immediately as `confirmed` with fare locked; **driver not assigned yet**. A background
  job assigns closer to pickup time.
- **On-spot** (secondary): `scheduledAt` null. The row is created as **`pending`** and
  `startAssignment()` is fired **detached** — the response returns immediately so the client can
  show "Requesting a ride" and poll. A search that reaches nobody ends at **`no_driver`**, a
  terminal status deliberately excluded from `ACTIVE_STATUSES` so the rider can retry at once.
  Failed bookings persist in ride history on purpose.
- **Crash guard:** `GET /:id/status` lazily expires any `pending` row older than
  `ASSIGNMENT_DEADLINE_MS` (5 min), so a restart mid-search can't strand a booking. No scheduler
  needed — the poll that just arrived is the only thing waiting on the answer.

**Duplicate guard:** a create is rejected (409) if the user has an active booking within 15 minutes
of the requested time, or an active booking on the same pickup+drop pair.

**Fare** (`services/rideEstimate.js`, `services/fareZones.js`) — resolved **per vehicle class**, in
order:
1. **Zone** — the drop point (or the pickup, for trips *back* to campus) is matched against
   hand-drawn polygons in `data/zones.geojson`. Highest `priority` wins so exception zones override
   the broad areas containing them; two same-priority zones disagreeing on price means an accidental
   border overlap, and the midpoint is charged.
2. **FareTable** — fixed price for an exact destination name.
3. **Per-km formula** — a power law fitted to the provider's rate card
   (hatchback ≈ `36.7·km^0.897`, suv ≈ 1.6×, sedan +₹100), with a flat ₹16/km beyond 56 km and two
   distance bands bumped ₹50. Floor of ₹400, rounded to ₹50.

Distance/duration/polyline come from the **Google Routes API**, counted against a **10,000
calls/month** cap in `ApiUsage` (503 past it). Metrics are best-effort: zone and fixed-table fares
still price without them, only formula-priced types drop out.

- **Sharing** takes 25% off (`SHARING_DISCOUNT_PCT`) — **this number is ours, not the provider's,
  and still needs confirming.**
- **Safer route** adds a flat ₹150 (`SAFE_ROUTE_SURCHARGE`, mirrored in `frontend/src/constants/
  fares.js`), applied *after* the sharing discount because it's a flat road cost. It is meant to
  force the route through a lit-highway waypoint — but `SAFE_WAYPOINT` is **still null**, so today
  it charges the surcharge and changes nothing about the road. Do not ship it as-is.
- **Commission:** 10% only when fare ≥ ₹1000, else 0 (stored on the booking).

**Cancellation** — free while `pending`/`confirmed`/`assigned`/`en_route`; **35%** once the driver
has `reached` the pickup (that driver turned down other rides and spent the fuel). A ride already
`started` can't be self-cancelled. The status endpoint returns the live `cancellationCharge` from
the same helper the cancel endpoint uses, so the warning and the charge can never drift apart.
Cancelling restores driver capacity: solo back to full, sharing +1 seat capped at full.

**Driver assignment** (`services/driverAssignment.js`)
- Expanding **bounding-box → Haversine** search: radius grows 20→80 km in 10 km steps, re-checking
  the booking's status between rings so an expired or cancelled ride stops pinging drivers.
- Filters drivers: `isActive` + `isOnline` + `verificationStatus = approved`, matching `vehicleClass`
  **exactly** — never widened, since the rider was quoted for that specific car. Sorted by distance,
  ties broken by seniority.
- Offers are **sequential** — one FCM per candidate, awaiting each answer — which is why a single
  ring can take minutes and why the whole search runs detached.
- `claimBooking` takes the booking with a **status-guarded `updateMany`** before decrementing
  capacity, so a search still in flight can never overwrite a booking that has moved on, and a lost
  claim can't leak a seat.
- **Capacity model:** a **solo** ride takes the whole vehicle (`vehicleCapacity = 0`); a **sharing**
  ride consumes **one seat** (`-1`).
- No driver found: on-spot → `no_driver`; scheduled → stays `confirmed`, admin alerted via WhatsApp.

**Scheduled assignment job** (`services/assignScheduledRides.js`)
- `setInterval` every **5 minutes**: picks `confirmed` bookings with `scheduledAt` within the next
  **12 hours** and runs `getDriver` on each; WhatsApps `ADMIN_PHONE` if one is still unfilled inside
  the last hour. Both the 12-hour window and the overlapping-interval problem are known defects —
  see §11 and ROADMAP.

---

## 6. Auth model (hybrid WhatsApp-OTP + Clerk)

There is **no password and no Clerk-hosted UI**. Flow:
1. Frontend `POST /api/auth/send-otp { phone }` → backend stores `otpHash` (5-min expiry) and
   (eventually) WhatsApps the code. **In dev the OTP is `console.log`ged** by the backend.
2. Frontend `POST /api/auth/verify-otp { phone, otp }` → backend verifies, burns the OTP, then
   finds/creates a Clerk user keyed by a **fake email** `91{phone}@rcs-travels.com`, and returns a
   **Clerk sign-in ticket** (60s expiry).
3. Frontend completes the session with `signIn.create({ strategy: "ticket", ticket })`.
4. `GET /api/users/me`: 404 → new user → `/signup`; found → `/book`.
- Because the phone is encoded in that email, the backend always derives it from the verified
  session and **never trusts a phone sent by the client**.
- Signup collects the **name first**, so the DB user is created in the same step as OTP
  verification — there's no post-OTP screen to abandon into a profile-less session.
- `protectAdmin` checks `req.auth.sessionClaims.metadata.role === "admin"` (Raju still needs the
  `admin` role set in the Clerk dashboard).

---

## 7. Frontend state & navigation

**`useData` (Zustand, localStorage key `rcs-data`)** holds the booking draft and session values.
**Persisted:** `phone`, `language`, `recentPlaces`, and the ride form — `pickupLocation`,
`dropLocation`, `pickupCoords`, `dropCoords` (addresses and coords must travel together or a reload
would rebook from fallback anchors) plus `distanceKm`, `durationMin`, `routePolyline`, `fareSource`
so tracking still draws the real road route after a reload. `/book` wipes the metrics on mount so a
new booking can't inherit the old route. **Not persisted:** `bookingId`, `status`, `safeRoute`,
`sharing`, `fare` and the rest — a per-trip choice belongs to the trip, not the account.

**Routes (`main.jsx`):**
| Path | Element | Guard |
|------|---------|-------|
| `/` | `App` → NavBar + OnBoarding + marketing sections + Footer | public |
| `/login` | `LoginPage` | public |
| `/signup` | `SignUpPage` | public |
| `/help` | `HelpPage` | public |
| `/book` | `VehicleSelect` | `ProtectedRoute` |
| `/booking/test` | `TrackingPage` | `ProtectedRoute` |
| `/manage-account` | `ManageAccount` | `ProtectedRoute` |
| `/settings` | `SettingsPage` | `ProtectedRoute` |
| `/safety` | `SafetyPage` | `ProtectedRoute` |
| `/dashboard` | `AdminDashboard` | `ProtectedRoute requireAdmin` |
| `/dev`, `/dev/:view` | `DevPreview` | dev builds only |

> **NOTE:** the tracking route is still pinned to the literal **`/booking/test`** — the real
> `"/booking/:id"` line is commented out, and `VehicleSelect` navigates to the literal too.
> `TrackingPage` reads its booking id from the store rather than the URL, so restoring the param
> route means changing all three together. Until then a booking can't be opened from a link.

**Navigation uses `useViewNavigate`** — a `useNavigate` wrapper that passes `{ viewTransition: true }`
so the browser's native **View Transitions API** animates page changes (CSS in `index.css` under
`::view-transition-old/new(root)`).

---

## 8. Design system & animation conventions

- **Dark, premium aesthetic.** Custom CSS variables for backgrounds (`--background`,
  `--background-primary`, `--background-muted`) and text. Brand primary blue `#243AFB`. PP Mori.
- **A shared layout + type scale** runs across the booking flow (OnBoarding, VehicleSelect,
  TrackingPage, RideDetails): a real **377px** desktop content column — OnBoarding's effective
  control width — reached as a width rather than a transform, so type stays honest at both
  breakpoints. Spacing tokens (`PAIR` / `GROUP` / `STACK`) express the vertical rhythm.
- **`BackgroundPanel`** is the core surface: a bottom-anchored (mobile) / full-height (desktop) panel
  that **owns its own enter/exit animation** via a `show` prop — it stays mounted through the exit
  animation then unmounts. Panels slide in/out from the **right**.
- **`ErrorPanel`** wraps `BackgroundPanel`, shown on `!!error`, with a `lastError` latch so the
  message stays readable while animating out.
- **`useExitAnim(open, duration)`** (`hooks/useExitAnim.js`) is the shared mounted/closing pattern
  for every dropdown, drawer and panel. `BackgroundPanel` has the same logic inline.
- **Custom animations** in `index.css` (`@layer base`): `panel-transition(-out)`,
  `dropdown-reveal/collapse`, `datetime-bloom/wilt`, `sheet-in/out` + `backdrop-in` (the mobile nav
  drawer), `fade-swap`, `loading-bar`, `illus-fade`, `skeleton-sheen`.
- **The map is a singleton** (`ui/GoogleMap.jsx`) with module-level overlay registries
  (`ui/mapOverlays.jsx`), because overlays outlive any one component — a StrictMode remount or a
  page change must still be able to find and clear them.
- **House rules (from CLAUDE.md):** no default Tailwind blue/indigo as primary; no `transition-all`;
  animate only `transform`/`opacity`; layered tinted shadows. The `frontend-design` skill must be
  invoked before writing frontend code.

---

## 9. Status — what's DONE / IN PROGRESS / LEFT

### ✅ Done (built and wired)
- **Backend foundation:** Express app, Clerk middleware, Prisma + Supabase Postgres, 8 models with
  justified indexes, `/health` (runs `select 1`), per-IP rate limiting, zod-validated list queries.
- **Auth backend:** WhatsApp-OTP → Clerk-ticket flow, `users.js` me/create plus profile fields,
  account data download (PDF) and account deletion.
- **Fare backend:** zone matching over a hand-drawn GeoJSON map, fixed table, per-km formula, Routes
  API with a monthly usage cap, safe-route surcharge plumbing.
- **Google proxies:** autocomplete, place details, reverse-geocode — all cached in-process and
  rate-limited, so the API key never reaches the browser.
- **Booking backend:** create (scheduled + on-spot with detached assignment), `:id/status` polling
  with lazy expiry and live cancellation quote, cancel with capacity restore, `my-bookings` with
  search/filter/pagination.
- **Driver assignment engine:** nearest-driver matching, expanding radius, guarded claim, capacity
  decrement; the 5-min scheduled-assignment job.
- **Admin backend (read-only):** booking / driver / user lists with the full filter set.
- **Customer front end:** the whole booking funnel — OnBoarding (autocomplete, recents, scheduling),
  Login and SignUp, VehicleSelect (fare cards, solo/share, safer-route toggle, pin-confirm on a map,
  searching / confirmed / no-driver panels), **TrackingPage (status-driven, polls every 5s)**,
  RideDetails, ManageAccount (profile, ride history, privacy), Settings, Safety, Help, and the
  marketing homepage (How it works, Services, About, Why us, CTA, Footer).
- **Admin dashboard UI:** bookings / drivers / users tables with filters, chips and skeletons.
- **Shared UI kit** and the `DevPreview` harness for reviewing any screen without a backend.

### 🚧 Partial / placeholder
- **`TrackingPage` driver card** — the page polls correctly, but `driverCard` and `driverRow` render
  **hardcoded** text ("Driver name", "UP 16 AB 1234"). The `driver` object from the status endpoint
  is only used for the map puck. They also aren't gated on `driver` being non-null, so an unassigned
  booking shows a driver who doesn't exist.
- **`ThemeToggle.jsx`** renders `null` by design — the site follows the OS theme and there's no
  manual override yet.
- **Local-only UI** — see §12.

### ⬜ Left to build (priority order — see ROADMAP "WORK PRIORITY")

**1. Restore the real tracking route** — `/booking/:id` + `useParams`, and the two hard-coded
   `navigate('/booking/test')` calls in VehicleSelect.

**2. Driver-side backend** (the missing half of the ride loop). Today `driver.js` has only
   accept/decline, and **nothing creates a `Driver` row or writes `DriverLocation` at all**:
   - `POST /api/driver/location` (4s GPS upsert with bearing + speedKmh)
   - lifecycle transitions `en_route → reached → started → completed`, plus fare finalization
   - online/offline toggle, FCM token registration, `GET /api/driver/me` for the approval screen
   - driver registration + DL/Aadhaar upload (multer + S3 are installed, unused)

**3. Admin mutations** — approve / reject / deactivate a driver, and manual booking re-assignment.
   These gate the driver app: only `approved` drivers can go online, and nothing can approve one.

**4. Driver mobile app** (Expo, separate `driver-app/` at repo root; not started) — register/login,
   document upload + pending-approval screen, go online/offline, incoming ride with a 30s timer,
   active-ride lifecycle buttons, and GPS broadcasting. Dead reckoning on the customer side:
   ```
   predictedLat = lat + (speedKmh/3600 × Δt) × cos(bearing × π/180) / 111
   predictedLng = lng + (speedKmh/3600 × Δt) × sin(bearing × π/180) / (111 × cos(lat × π/180))
   ```

**5. Link real external services** — WhatsApp Cloud API for OTP + customer updates, FCM for real
   driver devices. Google Routes/Places are already live.

**6. Polish** — Legal page (the nav links to `/`), i18next Hindi wiring, rating/feedback (no schema
   field yet), and the optimizations in ROADMAP.

---

## 10. Running locally

**Backend** (`backend/`): needs `.env` with `DATABASE_URL` (Supabase Postgres), `CLERK_SECRET_KEY`,
`GOOGLE_MAPS_API_KEY`, `ADMIN_PHONE`. Optionally `DIRECT_URL` (migrations need a direct/session
connection, not the transaction pooler), `CORS_ORIGINS`, `FCM_ALWAYS_ACCEPT`.
```
npm install
npm run db:generate    # prisma generate
npm run db:migrate     # create tables
npm run db:seed        # optional seed   (npm run db:clean resets bookings to the seed)
npm run dev            # tsx watch → http://localhost:5000 ; GET /health → { status: "ok" }
npm run typecheck      # tsc --noEmit over the .ts files
```

**Frontend** (`frontend/`): needs `.env` with `VITE_CLERK_PUBLISHABLE_KEY`,
`VITE_GOOGLE_MAPS_API_KEY`, and optional `VITE_API_BASE_URL` (defaults to `http://localhost:5000`).
```
npm install
npm run dev            # vite → http://localhost:1574
```

Dev login: enter a phone on `/login`, then read the OTP from the **backend terminal** (it's logged,
not sent). Visit **`/dev`** for an index of every booking-flow screen, rendered with a mock booking
and no backend or Clerk session required.

---

## 11. Known bugs and gotchas

- **Everything runs end-to-end on stubs.** `sendFCM` waits 30s and returns a coin flip (or always
  true with `FCM_ALWAYS_ACCEPT=1`); `sendWhatsApp` only logs. The only live external calls are the
  Google Routes/Places ones. So in dev, driver assignment "succeeds" randomly and OTPs appear in the
  backend console.
- **The sharing-assignment pass is dead code.** `driverAssignment.js` filters candidates on
  `loc.sharing === true`, but `DriverLocation` has no `sharing` column — the filter is always false,
  the 45° corridor check never runs, and sharing riders each start a *fresh* shared trip instead of
  pooling into an existing one.
- **`driver.js` accept diverges from `getDriver`** on the same transition: it writes `assigned` with
  an unguarded `update` (no status guard, unlike `claimBooking`) and never decrements
  `vehicleCapacity`. Harmless until a real driver app calls it.
- **`GET /api/bookings/admin/all` is unused** — the dashboard reads `/api/admin/booking`.
- **The scheduled job's window is 12h, not the 60min it was specified as**, so a ride booked half a
  day out gets a full driver sweep every 5 minutes for nothing; and its `setInterval` doesn't wait
  for the previous run, so two sweeps can double-notify the same driver. Both are invisible while
  FCM is stubbed.
- **`SAFE_WAYPOINT` is null** — the safer-route toggle charges ₹150 and changes no road path.
- **`/booking/:id` is pinned to `/booking/test`** in `main.jsx` and VehicleSelect.
- **`ErrorBoundary` is commented out** around the router in `main.jsx`.
- **Rate-limiter counters live in process memory**, so Render's free tier resets them on every cold
  start. The Google Console quota is the real ceiling.

---

## 12. Local-only UI (not wired to a backend)

These controls exist and look real, but hold local React state. They reset on reload and change
nothing server-side. Each needs an endpoint + persistence before it counts.

  **Settings** (`pages/SettingsPage.jsx`)
  - [ ] Notification toggles — whatsapp / push / promotions. Needs preference columns + GET/PUT.
  - [ ] Saved places — Home / Work / custom. Needs a table (or JSON column) + CRUD.
  - [~] Language — persists to the store and survives reload, but **isn't connected to i18next**, so
        switching it doesn't change the app language.

  **Safety** (`pages/SafetyPage.jsx`)
  - [ ] "Share my live location" toggle — needs a preference field and the actual share-on-start
        behaviour on the tracking side.
  - [x] Emergency contact — genuinely wired to `updateEmergencyContact` (listed for contrast).

  **Manage Account** (`pages/ManageAccount.jsx`)
  - [ ] "What drivers see" panel (Privacy & Data) — placeholder lists. Reconcile with the real
        driver payload once the driver-facing route exists (today only `customerPhone` and the trip
        locations are sent).

---

*Keep this file updated as features land — especially §9, §11 and §12. When a stub is replaced with
a real integration or a page moves from partial to done, reflect it here.*
