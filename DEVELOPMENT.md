# Local development

`main` is production. Do feature work and everyday testing on `dev` (or a
feature branch based on `dev`), then merge tested changes into `main` only when
they are ready to deploy. This workspace deliberately refuses to start if it
cannot identify a dedicated development database and Clerk test application.

## Initial setup

1. Create a separate Supabase development project, or run a local PostgreSQL
   instance with PostGIS. It must not be the production project/database.
2. Create or select a Clerk **test** instance. Never put live Clerk keys in the
   development variables.
3. Copy the `.env.example` files in `backend`, `frontend`, and `driver-app` to
   `.env` in the same directories if those files do not already exist. Preserve
   any other local integration settings you need.
4. Add these values to the indicated files. Do not commit either `.env` file.

   `backend/.env`:

   ```dotenv
   DEVELOPMENT_DATABASE_URL=postgresql://...development database...
   # Optional direct/session connection for Prisma migrations. Defaults to the URL above.
   DEVELOPMENT_DIRECT_URL=postgresql://...development direct connection...
   # Optional when the ordinary CLERK_* values below are already test keys.
   DEVELOPMENT_CLERK_SECRET_KEY=sk_test_...
   DEVELOPMENT_CLERK_PUBLISHABLE_KEY=pk_test_...
   # Optional. Omit to intentionally reuse GOOGLE_MAPS_API_KEY from production.
   DEVELOPMENT_GOOGLE_MAPS_API_KEY=...

   # Optional: only needed to exercise payments/AI locally.
   DEVELOPMENT_RAZORPAY_KEY_ID=rzp_test_...
   DEVELOPMENT_RAZORPAY_KEY_SECRET=...
   DEVELOPMENT_RAZORPAY_WEBHOOK_SECRET=...
   DEVELOPMENT_OPENAI_API_KEY=...
   ```

   `frontend/.env`:

   ```dotenv
   # Optional when VITE_CLERK_PUBLISHABLE_KEY is already the matching test key.
   VITE_DEVELOPMENT_CLERK_PUBLISHABLE_KEY=pk_test_...
   # Optional. Omit to intentionally reuse VITE_GOOGLE_MAPS_API_KEY from production.
   VITE_DEVELOPMENT_GOOGLE_MAPS_API_KEY=...
   ```

   `driver-app/.env`:

   ```dotenv
   # Optional; otherwise the guarded runner injects backend's validated test key.
   EXPO_PUBLIC_DEVELOPMENT_CLERK_PUBLISHABLE_KEY=pk_test_...
   # The guarded runner replaces this with localhost:5000 at launch.
   EXPO_PUBLIC_API_BASE_URL=http://localhost:5000
   # Deliberately reuse the production Android Maps project in development.
   GOOGLE_MAPS_ANDROID_API_KEY=...
   EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID=...
   ```

   `DEVELOPMENT_DATABASE_URL` must point at a different database from
   `DATABASE_URL` (and likewise for the direct URLs). The checker recognizes
   Supabase pooler/direct forms and common local aliases; no static check can
   identify every custom DNS alias, so confirm the project/database name when
   copying the values. The
   frontend/backend publishable-key values and any driver override must be identical. The optional
   development-named Clerk values take precedence; otherwise the runner accepts
   the ordinary names only after proving they are test-mode keys. It always
   supplies the normal runtime names itself, so ordinary `DATABASE_URL`, API,
   CORS, and origin values cannot override this setup. Google Maps is the stated
   exception: the normal server/browser Maps keys are reused unless an optional
   development override is provided.
   The runner also blocks ordinary WhatsApp, Firebase, Razorpay, OpenAI, GCS,
   Cloud Tasks, and unrelated production credentials from entering the local
   backend. Google Maps is deliberately carried across as described above.
   Push notifications use the existing deterministic development stub. Add only
   the explicit development payment/AI values above when those paths need testing.

   Clerk test secret keys do not encode a public instance identifier, so the
   checker cannot prove that the secret and publishable key came from the same
   Clerk test instance. Copy both from the same Clerk dashboard instance. Running
   the seed verifies the backend key; completing one OTP login verifies the pair.
5. Install the existing package dependencies in each app if needed:

   ```powershell
   npm --prefix backend install
   npm --prefix frontend install
   npm --prefix driver-app install
   ```
6. Apply migrations and development seed data:

   ```powershell
   npm run dev:db:deploy
   npm run dev:db:seed
   ```
7. Start the surface you want to review:

   ```powershell
   npm run dev
   npm run dev:driver:web
   npm run dev:driver
   npm run dev:all
   ```

   `dev` starts the rider website and backend. `dev:driver:web` starts the
   captain web build and backend. `dev:driver` starts the native Expo development
   client in LAN mode and backend. `dev:all` starts the rider website, native
   captain app, and backend together. The rider website is
   `http://localhost:1574`; the captain/Metro server uses port 8082, and every
   local surface uses the API at port 5000. The
   native app rewrites localhost to Metro's LAN host, so the phone and computer
   must be on the same network and Windows Firewall must allow TCP 5000. A native
   development build must already be installed; this app does not use Expo Go.
   The runner sets backend `NODE_ENV=development`,
   `APP_ORIGIN=http://localhost:1574`, and local CORS origins. Stop both with
   `Ctrl+C`. Run `npm run dev:check` to validate configuration without starting
   anything.

   Android Maps configuration is compiled into the native APK; Metro cannot add
   or change it afterward. In the Expo/EAS project, open the `development`
   environment and set `GOOGLE_MAPS_ANDROID_API_KEY` to the same Android-restricted
   key used by production, set `EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID` to the production
   Map ID, and ensure the development environment has its required
   `GOOGLE_SERVICES_JSON` file variable. Then create/install a fresh development
   build with:

   ```powershell
   eas build --profile development --platform android
   ```

   This reuses the production Maps project only; the API, database, and Clerk
   configuration still remain development-only. A value in local
   `driver-app/.env` is also used by a local native prebuild, but cannot retrofit
   an APK that is already installed.

For the intended local OTP flows, sign in as rider `9876543210` or captain
`9800000001`; each six-digit login OTP is printed in the backend console. The
four-digit ride-start OTP is separate (the seeded booking uses `4242`). The
normal `npm run dev:db:seed` command seeds and links both test identities. Use
a Clerk test account/keys for all local authentication work.

## Preview and production safety

For shareable pre-production reviews, optionally connect the `dev` branch to a
Vercel preview frontend and a separate Cloud Run preview API. Give that preview
its own Supabase database and Clerk test instance, set the preview API's CORS
and `APP_ORIGIN` to the preview frontend URL, and set the preview frontend API
and Clerk test key accordingly. Do not reuse production service credentials,
webhook secrets, databases, or Clerk live keys.

Before merging `dev` into `main`, test the change locally and in the preview.
Only the production deployment configuration should receive production secrets
and the production database URL. The development commands never use the ordinary
`DATABASE_URL` and reject recognizable reuse. A separate development project is
still the primary protection because custom DNS aliases cannot all be identified
statically.
