# RCS Travels — Project Context

> A single source of truth for understanding this codebase. Read this first.
> For the phased build plan and future ideas, see [ROADMAP.txt](ROADMAP.txt).
> Status reflects the **actual code** as of June 2026, not just intentions.

---

## 1. What this is

**RCS Travels** is a full-stack **cab-booking platform** for a small/local cab operator in the
Delhi-NCR region (owner referred to as "Raju"). It is **not** a generic Uber clone — it is built
around a specific operating model:

- **Pay the driver directly.** No in-app payments, no card/wallet screens, no in-app toll handling.
  Tolls for non-fixed destinations are paid to the driver separately (shown as a note on the UI).
- **Scheduling-first.** The primary flow is booking a ride up to 7 days in advance; on-spot ("now")
  rides are secondary and subject to availability.
- **WhatsApp is a first-class channel** — for OTP login, customer notifications, and (planned) a
  booking bot. The owner is not tech-savvy, so WhatsApp is the low-friction surface.
- **Fixed-fare table for known NCR destinations**, falling back to per-km pricing via Google Routes
  for anything else.
- **Solo vs. Sharing rides.** A customer can book a whole vehicle (solo) or a shared seat.

Three apps are envisioned: the **customer website** (this repo, being built now), an **admin
dashboard** (not started), and a **driver mobile app** (Expo, not started). Only the customer
website and its backend exist today.

---

## 2. Tech stack

### Frontend (`frontend/`)
- **React 18.3** + **Vite 6** (ES Modules, `.jsx`).
- **Tailwind CSS v4** (via `@tailwindcss/vite`). NOTE: v4 utilities use independent `scale` /
  `translate` / `rotate` CSS properties (not the `transform` shorthand), so keyframe `transform`
  animations compose cleanly with positioning utilities. This is relied on throughout the animations.
- **React Router 6.28** (`createBrowserRouter`), using the stable `viewTransition` navigate option.
- **Clerk** (`@clerk/clerk-react`) for auth/session.
- **Zustand 5** for client state (`useData`) — **not persisted** (in-memory; lost on refresh).
- **Radix UI**, **@mdi/react** (Material Design Icons), **react-day-picker** + **date-fns** for the
  date/time picker.
- **i18next / react-i18next** installed for future multi-language (Hindi) — **not wired up yet**.

### Backend (`backend/`)
- **Node + Express 4.21** (ES Modules, `type: "module"`).
- **Prisma 7.8** ORM with the **`@prisma/adapter-pg`** driver adapter over **`pg`**.
- **PostgreSQL** (Neon, serverless).
- **Clerk** (`@clerk/express`) — `clerkMiddleware()` globally, `requireAuth()` on protected routes.
- **firebase-admin** (for FCM push to drivers) and **multer** + **@aws-sdk/client-s3** (for driver
  document uploads) are installed but **not yet used** — placeholders for later phases.

### Deployment (planned — see [project_deployment](.) memory)
- Frontend → **Vercel**. Backend → **Render** (free tier, kept alive via a cron pinging `/health`).
  Database → **Neon PostgreSQL**. Driver app → **Expo EAS** (later).

---

## 3. Repository layout

```
RCS-Travels-Website/
├── CONTEXT.md            ← this file
├── ROADMAP.txt           ← phased plan + backlog of ideas
├── backend/
│   ├── index.js                       Express app entry; mounts routers, starts assignment job
│   ├── middleware/auth.js              clerkAuth, protect (requireAuth), protectAdmin (role check)
│   ├── db/prisma.js , lib/prisma.js    Prisma client (pg adapter)
│   ├── prisma/schema.prisma            data model (8 models, 4 enums)
│   ├── prisma/seed.js                  DB seed
│   ├── routes/
│   │   ├── hybridAuth.js               POST /api/auth/send-otp, /verify-otp  (WhatsApp-OTP→Clerk)
│   │   ├── users.js                    GET/POST /api/users/me
│   │   ├── fare.js                     POST /api/fare/estimate
│   │   ├── bookings.js                 create / status / cancel / my-bookings / admin list
│   │   └── driver.js                   PATCH /api/driver/rides/:id/accept | /decline
│   └── services/
│       ├── fares.js                    fixed table → Google Routes fallback + monthly usage cap
│       ├── driverAssignment.js         nearest-driver matching (Haversine + sharing corridor)
│       ├── assignScheduledRides.js     setInterval job, runs every 5 min
│       └── notification.js             sendFCM / sendWhatsApp  ← STUBBED (console.log)
└── frontend/
    └── src/
        ├── main.jsx                    router + ClerkProvider + ThemeProvider
        ├── App.jsx                     "/" → OnBoarding + NavBar
        ├── api/api.js                  thin fetch wrapper, one fn per endpoint
        ├── hooks/
        │   ├── useData.js              Zustand store (booking draft + session bits)
        │   ├── useApi.js               binds Clerk getToken to each api.js call
        │   └── useViewNavigate.js      navigate() wrapper that enables View Transitions
        ├── context/ThemeContext.jsx    dark/light (ThemeToggle incomplete)
        ├── components/
        │   ├── ProtectedRoute.jsx      Clerk gate → redirects to /login?redirect=
        │   ├── ErrorBoundary.jsx , LoadingScreen.jsx
        │   ├── RideDetails.jsx         ride-details sub-panel (extracted from TrackingPage)
        │   ├── illustrations/          inline SVG illustrations (radar, en-route, whatsapp, map)
        │   └── ui/                      Button, Input, NavBar, BackgroundPanel, ErrorPanel,
        │                               DateTimeSelector
        └── pages/
            ├── OnBoarding.jsx          landing/booking form (timing, pickup, drop)
            ├── LoginPage.jsx           phone → OTP → /book or /signup
            ├── SignUpPage.jsx          phone → OTP → username → /book
            ├── VehicleSelect.jsx       vehicle + fare + confirm + searching/confirmed panels
            └── TrackingPage.jsx        "driver arriving" status screen (in progress)
```

---

## 4. Data model (`backend/prisma/schema.prisma`)

**Enums:** `BookingStatus` (pending → confirmed → assigned → en_route → reached → started →
completed, plus cancelled), `BookingSource` (website | whatsapp | admin), `CancelledBy`
(user | driver | admin), `VerificationStatus` (pending | approved | rejected).

**Models:**
- **User** — `clerkId` (unique), `phone` (unique), `name`, `whatsappNumber`. One-to-many `bookings`.
- **Driver** — `name`, `phone`, `vehicleType` (Int: number of seats), `vehicleCapacity` (Int: seats
  currently free — the live availability counter), `vehicleNumber`, `isActive`, `isOnline`,
  `fcmToken`, `dlDocUrl`/`aadharDocUrl`, `verificationStatus`. Has one `DriverLocation`.
- **DriverLocation** — one row per driver, `latitude`/`longitude`/`bearing`/`speedKmh`, upserted (per
  the design) every 4s while online. `bearing`+`speedKmh` enable client-side **dead reckoning**
  between the customer's 5-second status polls.
- **Booking** — the core record: `bookingCode` (6-digit unique, doubles as the start OTP), `userId`,
  optional `driverId`, pickup/drop address + lat/lng, `vehicleType`, `scheduledAt` (null = on-spot),
  `isOutstation`, `distanceKm`, `fare`, `commissionPct`/`commissionAmt`, `status`, `confirmedAt`,
  cancellation fields, `source`, `sharing` (bool), `shareGroupId`, `pickupOrder`.
- **FareTable** — fixed NCR pricing, unique on (`destinationName`, `vehicleType`).
- **ApiUsage** — monthly external-API call counter (`service`, `month` "YYYY-MM", `count`) to stay
  under free limits.
- **OtpVerification** — one row per phone: `otpHash`, `expiresAt`, `used`. Backs the WhatsApp OTP.
- **WhatsappSession** — in-progress WhatsApp booking-bot conversation state (`step`, `data` JSON,
  `language`). For the future WhatsApp bot; nothing writes it yet.

**Vehicle types are integers = seat counts:** `4`, `6`, and `1` is a special **"ANY"** marker (book
the cheapest available 4- or 6-seater; priced at the 4-seater rate). Valid set: `[4, 6, 1]`.

---

## 5. Key business rules

**Booking modes**
- **Scheduled** (primary): `scheduledAt` set, must be **≥30 min** and **≤7 days** out (else 422).
  Created immediately as `confirmed` with fare locked and code issued; **driver not assigned yet**.
  A background job assigns a driver closer to pickup time.
- **On-spot** (secondary): `scheduledAt` null. Tries to assign a driver **immediately** on creation.
  If none available → **HTTP 503 and the booking row is deleted** (not persisted).

**Fare** (`services/fares.js`)
- If the drop matches an active `FareTable` row for that vehicle type → return the fixed fare.
- Else call **Google Routes API** (`computeRoutes`, distance only) and price at per-km rate
  (`{4: 14, 6: 18, 1: 14}` ₹/km), incrementing `ApiUsage`; hard cap **10,000 calls/month** → 503.
- Commission: 10% only when fare ≥ ₹1000, else 0 (stored on the booking).

**Driver assignment** (`services/driverAssignment.js`)
- Expanding **bounding-box → Haversine** search: radius grows 20→80 km in 10 km steps.
- Filters drivers: `isActive` + `isOnline` + `verificationStatus = approved`, matching `vehicleType`
  (or any of 4/6 when the request is type `1`/ANY). Sorted by distance, ties broken by driver seniority.
- **Sharing rides** additionally require the driver's current active drop to be in the **same
  directional corridor** (bearing within 45°) as the new drop, and a free seat.
- Sends an **FCM** offer to the driver and waits for accept; on accept, updates booking → `assigned`
  and decrements capacity.
- **Capacity model (important):** a **solo** ride takes the whole vehicle out of the pool
  (`vehicleCapacity = 0`); a **sharing** ride consumes **one seat** (`-1`). On **cancel**, solo
  restores capacity to full (`= vehicleType`), sharing returns one seat (`+1`, capped at full).
- No driver found: on-spot → 503; scheduled → stays `confirmed`, admin alerted via WhatsApp.

**Scheduled assignment job** (`services/assignScheduledRides.js`)
- `setInterval` every **5 minutes**: picks `confirmed` bookings with `scheduledAt` within the next
  **12 hours** and runs `getDriver` on each. If still unassigned and pickup is within the next hour,
  WhatsApps `ADMIN_PHONE` to assign manually.

---

## 6. Auth model (hybrid WhatsApp-OTP + Clerk)

There is **no password and no Clerk-hosted UI**. Flow:
1. Frontend `POST /api/auth/send-otp { phone }` → backend stores `otpHash` (5-min expiry) and
   (eventually) WhatsApps the code. **In dev the OTP is `console.log`ged** by the backend.
2. Frontend `POST /api/auth/verify-otp { phone, otp }` → backend verifies, then finds/creates a Clerk
   user keyed by a **fake email** `91{phone}@rcs-travels.com`, and returns a **Clerk sign-in ticket**.
3. Frontend completes the session with `signIn.create({ strategy: "ticket", ticket })`.
4. `GET /api/users/me`: 404 → new user → `/signup` (collect username); found → `/book`.
- Phone is always derived from the verified Clerk email, **never trusted from form input**.
- `protectAdmin` checks `req.auth.sessionClaims.metadata.role === "admin"` (Raju to be made admin in
  Clerk dashboard).

---

## 7. Frontend state & navigation

**`useData` (Zustand, in-memory):** holds the booking draft and a few session values — `phone`,
`pickupLocation`, `dropLocation`, `scheduledTime`, `fare`, `vehicleType` (default 4), `bookingId`,
`bookingCode`, `username`, `sharing` (default true). **Not persisted**, so a hard refresh on
`/book` or `/booking/...` loses the in-progress booking context.

**Routes (`main.jsx`):**
| Path | Element | Guard |
|------|---------|-------|
| `/` | `App` → `OnBoarding` + `NavBar` | public |
| `/login` | `LoginPage` | public |
| `/signup` | `SignUpPage` | public |
| `/book` | `VehicleSelect` | `ProtectedRoute` |
| `/booking/test` | `TrackingPage` | `ProtectedRoute` |

> NOTE: the tracking route is currently hard-coded to **`/booking/test`** (the real
> `"/booking/:id"` line is commented out) so the half-built `TrackingPage` can be viewed in
> isolation. VehicleSelect still navigates to `/booking/${bookingId}` after assignment, which won't
> match until the param route is restored.

**Navigation uses `useViewNavigate`** — a `useNavigate` wrapper that passes `{ viewTransition: true }`
so the browser's native **View Transitions API** animates page changes (CSS in `index.css` under
`::view-transition-old/new(root)`).

---

## 8. Design system & animation conventions

- **Dark, premium aesthetic.** Custom CSS variables for backgrounds (`--background`,
  `--background-primary`, `--background-muted`) and text. Brand primary blue `#243AFB`. Poppins font.
- **`BackgroundPanel`** is the core surface: a bottom-anchored (mobile) / full-height (desktop) panel
  that **owns its own enter/exit animation** via a `show` prop — it stays mounted through the exit
  animation (`animate-panel-transition-out`) then unmounts. Panels slide in/out from the **right**.
- **`ErrorPanel`** wraps `BackgroundPanel`, shown on `!!error`, with a `lastError` latch so the
  message stays readable while animating out.
- **Custom animations** in `index.css` (`@layer base`): `panel-transition(-out)`,
  `dropdown-reveal/collapse`, `datetime-bloom/wilt`, `fade-swap`, `loading-bar`, `illus-fade`. The
  `useExitAnim(open, duration)` hook (in OnBoarding) is the reusable mounted/closing pattern for
  dropdowns; `BackgroundPanel` has the same logic inline.
- **House rules (from CLAUDE.md):** no default Tailwind blue/indigo as primary; no `transition-all`;
  animate only `transform`/`opacity`; layered tinted shadows; pair display + sans fonts. The
  `frontend-design` skill must be invoked before writing frontend code.

---

## 9. Status — what's DONE / IN PROGRESS / LEFT

### ✅ Done (built and wired)
- **Backend foundation:** Express app, Clerk middleware, Prisma + Neon, schema with all 8 models,
  `/health`.
- **Auth backend:** WhatsApp-OTP → Clerk-ticket flow (`hybridAuth.js`), `users.js` me/create.
- **Fare backend:** fixed-table + Google Routes fallback, monthly usage cap. **Google Routes is the
  one external API actually wired and working.**
- **Booking backend:** create (scheduled + on-spot), `:id/status` polling endpoint, cancel (with the
  solo/sharing capacity restore), `my-bookings`, admin list (`/admin/all`).
- **Driver assignment engine:** nearest-driver matching with Haversine, expanding radius, sharing
  directional corridor, capacity decrement; the 5-min scheduled-assignment job.
- **Driver accept/decline endpoints.**
- **Customer front end — booking funnel:** OnBoarding (timing/pickup/drop with scheduled date-time
  picker), LoginPage and SignUpPage (full phone→OTP→session flows), VehicleSelect (vehicle choice,
  fare preview, solo/share toggle, confirm, and the searching / confirmed / no-driver panels with
  polished animations).
- **Shared UI kit:** Button, Input, BackgroundPanel, ErrorPanel, DateTimeSelector, NavBar,
  ProtectedRoute, View-Transition navigation.

### 🚧 In progress
- **`TrackingPage.jsx`** — currently a **static "driver arriving" mock** (placeholder OTP "1 2 3 4 5
  6", "Driver name", "Car name", hard-coded `pickupTime`/`pickupDistance`). It is **not yet
  status-driven** and **does not poll** `GET /api/bookings/:id/status`. Mounted at the temporary
  `/booking/test` route.
- **`RideDetails.jsx`** — just extracted from TrackingPage as the "ride details" sub-panel. **It is
  broken:** it references `useData`, `useApi`, `Icon`, `mdiKeyboardBackspace`, `Button`, `navigate`,
  `dashedLine`, `arrow`, `waLogo`, `pickupLocation`, `dropLocation` **without importing them**, and
  `handleCancel` checks `prop.bookingId` (never passed) — it will throw on render. Needs imports +
  prop wiring before use.
- **`ThemeToggle.jsx` / appearance setting** — incomplete (noted in ROADMAP).

### ⬜ Left to build (priority order — see ROADMAP "WORK PRIORITY")
**1. Finish pages + backend ride lifecycle (critical path):**
   - Make `TrackingPage` a real **status-driven screen** that polls and swaps UI by `booking.status`:
     `assigned/en_route` → "Driver on the way" (driver card, ETA, live map, call/cancel);
     `reached` → "Driver arrived" (show start-OTP = `bookingCode`); `started` → "On trip";
     `completed` → "Trip complete" + final fare. Restore the `/booking/:id` param route.
   - **Backend lifecycle endpoints** to advance `en_route / reached / started / completed` (today the
     status enum is unused past `assigned`/`cancelled`; `driver.js` only has accept/decline).
   - **Driver-location write endpoint** (`POST /api/driver/location`) — nothing populates
     `DriverLocation` yet, so there is no live position to poll/track.
   - **Fare finalization** on completion (no final-amount logic beyond the original fare).
   - **Pin-point pickup on a map** (OnBoarding uses plain text inputs; no Places autocomplete / map).
   - **My Trips / ride history page** (backend `my-bookings` exists, no UI consumes it).
   - **Profile / Account page**, **rating/feedback** (no rating field in schema yet).

**2. Link real external services (the "go-live" layer — not needed to build):**
   - **WhatsApp Cloud API** — replace the `notification.js` `sendWhatsApp` stub (currently
     `console.log`) for OTP + customer updates.
   - **FCM** — replace the `sendFCM` stub (currently `await delay(30s)` then random true/false) so
     real driver devices receive ride offers.
   - Google Routes is already live; add IP restriction on the key after deploying to Render.

**3. Admin dashboard** (web — same React app or a separate admin area; not started)

   Purpose: **visibility + driver management**. Assignment is automatic, so the admin only
   *intervenes* when it fails. The backend list endpoint already exists
   (`GET /api/bookings/admin/all`, gated by `protectAdmin`); everything else here is to build.

   Pages / screens:
   - **`/admin/bookings`** — a live table of all bookings (status, customer, driver, pickup/drop,
     fare, scheduled time). Filter by status/date (the endpoint already supports `status`, `date`,
     `page`, `limit`). **Manual re-assign** control as a fallback for when no driver auto-accepted
     (e.g. a scheduled ride the 5-min job couldn't fill). Lets the admin watch the full loop:
     *customer books → system auto-assigns → customer sees driver*, stepping in only on failure.
   - **`/admin/drivers`** — list all drivers; **approve / reject pending verifications**; deactivate
     (soft-remove) any driver.

   Driver verification flow this dashboard drives:
   - Driver self-registers (phone OTP) and uploads **DL + Aadhaar** → `verificationStatus = pending`
     (schema fields `dlDocUrl`, `aadharDocUrl` already exist; document **upload to S3** via the
     installed `multer` + `@aws-sdk/client-s3` is not wired yet).
   - Admin reviews the documents → **approve** sets `verificationStatus = approved` and
     `isActive = true`; **reject** sets `verificationStatus = rejected`.
   - Only `approved` drivers can go online and receive rides — this is already enforced everywhere
     in `driverAssignment.js` and `driver.js` (`verificationStatus !== 'approved'` → 403).

   Backend to add: admin endpoints for **list/approve/reject/deactivate drivers**, and a
   **manual-assign** endpoint for bookings. Access is already protected by `protectAdmin`
   (`req.auth.sessionClaims.metadata.role === "admin"`); Raju must be given the `admin` role in the
   Clerk dashboard.

**4. Driver mobile app** (Expo / React Native, separate `driver-app/` folder at repo root; not started)

   Purpose: let an approved driver receive and complete rides, and broadcast live GPS. This is the
   missing half of the ride loop — today there is **no producer** for `DriverLocation` rows or for
   the `en_route/reached/started/completed` transitions, which is why the customer TrackingPage has
   nothing real to poll.

   Screens (ROADMAP priority order):
   1. **Register / Login** — phone OTP (same hybrid Clerk-ticket flow as the customer site).
   2. **Onboarding / verification** — upload DL + Aadhaar, submit for review; show a
      "Pending approval" screen until an admin approves (`verificationStatus`).
   3. **Home** — **Go Online / Go Offline** toggle (only enabled once `approved`); flips
      `Driver.isOnline`.
   4. **Incoming ride** — accept / decline with a **30-second timer** → calls the existing
      `PATCH /api/driver/rides/:id/accept | /decline`. (Backlog idea: shorten 30s → 20s.) The offer
      itself arrives as an **FCM push** (today stubbed in `notification.js`).
   5. **Active ride** — **"Reached Pickup" → "Start Ride" → "Complete Ride"** buttons that advance
      the booking through `en_route → reached → started → completed`. **These lifecycle endpoints
      don't exist yet** (`driver.js` only has accept/decline) — they must be built alongside this
      screen, together with fare finalization on completion.

   GPS broadcasting (the heart of live tracking):
   - When the driver goes **Online**, the app `POST`s to **`/api/driver/location`** every **4
     seconds** (this write endpoint is **not implemented yet**). Payload includes computed
     **`bearing` + `speedKmh`** (derived from the last two positions). Going **Offline** stops the
     broadcast. Each post **upserts** the driver's single `DriverLocation` row.
   - **Dead reckoning (client-side, on the customer TrackingPage):** because the customer only polls
     status every ~5s, between polls the page predicts the driver's position from the last known
     `lat/lng`, `bearing`, and `speedKmh`:
     ```
     predictedLat = lat + (speedKmh/3600 × Δt) × cos(bearing × π/180) / 111
     predictedLng = lng + (speedKmh/3600 × Δt) × sin(bearing × π/180) / (111 × cos(lat × π/180))
     ```
     where `Δt` = seconds since the last known update; when the next poll arrives, snap to the real
     position. This keeps the on-map car moving smoothly instead of teleporting every 5s.

   Setup note: scaffold a **new Expo project** in `driver-app/`; ship later via **Expo EAS**. It
   reuses the same backend and Clerk project as the customer site.

**5. Optimizations (last):** extract shared components while building (not as a separate pass), DB
   index/query tuning on the assignment bounding-box query once there's real driver volume, i18next
   Hindi support, homepage.

**Smaller backlog (from ROADMAP.txt — not yet scheduled into the phases above):**
   - **Customer UX:** "Tolls payable to driver separately" note on non-fixed destinations; let
     selected users see their ride status; a **NavBar notification bell** (scheduled-ride
     assigned/unassigned, driver-needs-admin-approval); if a **non-shared** ride goes unassigned to
     the end, notify the customer and offer to make it shared.
   - **Optional profile fields:** gender, email, emergency contact, DOB (all optional).
   - **Accessibility "simple mode":** auto-simplify the UI for users aged ≥ 60, plus a manual
     toggle in settings for anyone.
   - **Appearance:** finish `ThemeToggle.jsx` and add an Appearance option in profile.
   - **API hardening:** per-key call-count restriction + rate limiting on Maps and all external
     APIs; enable **Places API (New)** alongside Routes API; after deploying to Render, lock the
     Google key to the server's outbound IP.
   - **Tuning knobs:** try shortening the driver ride-offer timeout from 30s → 20s.
   - **Ops one-offs:** assign the **admin role to Raju** in the Clerk dashboard.
   - **Cancellation policy:** `/my-bookings` cancel should warn about a **35% charge** if the driver
     has already reached pickup (schema has `cancellationCharge`; not enforced yet).
   - **WhatsApp booking bot:** the `WhatsappSession` model exists for a future conversational
     booking flow over WhatsApp; nothing reads/writes it yet.
   - **TypeScript migration:** codebase is intentionally plain JS/ESM now; convert `.js`→`.ts` /
     `.jsx`→`.tsx` incrementally once the system works.

### ⚠️ Known gaps / gotchas for anyone working here
- **Everything runs end-to-end on stubs.** `sendFCM` returns random success after a 30s delay;
  `sendWhatsApp` only logs. The only live external call is the Google Routes fare lookup. So in dev,
  driver assignment "succeeds" randomly and OTPs appear in the **backend console**.
- **Zustand store is not persisted** — refreshing `/book` or `/booking/...` drops the booking draft.
- **`/booking/:id` is temporarily `/booking/test`** in `main.jsx`; restore the param route when
  TrackingPage is wired to real data.
- **`RideDetails.jsx` will crash** until its missing imports/props are added (see In Progress).
- **`ErrorBoundary` is commented out** around the router in `main.jsx`.

---

## 10. Running locally

**Backend** (`backend/`): needs `.env` with `DATABASE_URL` (Neon), `CLERK_SECRET_KEY`,
`GOOGLE_MAPS_API_KEY`, `ADMIN_PHONE`.
```
npm install
npm run db:generate    # prisma generate
npm run db:migrate     # create tables
npm run db:seed        # optional seed
npm run dev            # nodemon → http://localhost:5000 ; GET /health → { status: "ok" }
```

**Frontend** (`frontend/`): needs `.env` with `VITE_CLERK_PUBLISHABLE_KEY` (and optional
`VITE_API_URL`, defaults to `http://localhost:5000`).
```
npm install
npm run dev            # vite → http://localhost:1574
```

Dev login: enter a phone on `/login`, then read the OTP from the **backend terminal** (it's logged,
not sent). Protected pages require a completed Clerk session.

---

*Keep this file updated as features land — especially the §9 status section. When a stub is replaced
with a real integration or a page moves from "in progress" to "done", reflect it here.*
