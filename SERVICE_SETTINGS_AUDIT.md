# Clerk and Vercel service-settings audit

Audit date: 13 September 2026

This is a read-only audit of the project-associated Clerk and Vercel configuration. Existing working-tree changes were preserved. No users, sessions, customer records, billing, signup, login, or mutation endpoints were accessed.

## Repository and credential inventory

- `backend/.env` contains a `CLERK_SECRET_KEY` classified internally as `sk_test_*`; its value was never printed. The Clerk API calls below therefore verify the associated development instance only.
- `frontend/.env` contains a `VITE_CLERK_PUBLISHABLE_KEY` classified as `pk_test_*`.
- `driver-app/.env` contains `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` classified as `pk_live_*`; `driver-app/.env.local` contains a test publishable key. Values were not printed.
- Vercel CLI 54.9.1 is installed and authenticated. `VERCEL_TOKEN` is absent from the process environment; the CLI's existing account authentication was used without exposing its credential.
- No `.vercel/project.json` exists at the repository root or under `frontend/`. No link command was run because it would write local project-link configuration.

## Clerk settings verified

The official Clerk Backend API was called with `GET` requests using the existing backend test secret. Every Clerk observation in this section is limited to that development instance. Responses were reduced to non-secret settings metadata before being recorded here.

| API read | Result |
| --- | --- |
| `GET /v1/instance` | HTTP 200. Instance environment is `development`; browser `allowed_origins` is `null`; `allowed_subdomains` is empty; subdomain allowlist is disabled. |
| `GET /v1/instance/protect` | HTTP 200. Protect rules, Specter, bypassed checks, verified checks, and exempt checks are all disabled. |
| `GET /v1/instance/communication` | HTTP 200. 222 country codes are blocked; India (`IN`) is included. The complete country list was intentionally omitted. |
| `GET /v1/instance/oauth_application_settings` | HTTP 200. Dynamic OAuth client registration is disabled; OIDC sign-out is disabled; audience claims are disabled; PKCE is not required; client-ID metadata documents are not advertised and are not configured as pre-registered-only or implicitly blocked. |
| `GET /v1/instance/organization_settings` | HTTP 200. Organizations are disabled; verified domains are disabled; organization selection is not forced; organization slugs are disabled; the returned default organization creation setting has `enabled: true` but is inactive while organizations are disabled. |
| `GET /v1/instance/restrictions` | HTTP 405. The current official API reference documents restrictions as PATCH-only, so allowlist, blocklist, disposable-email blocking, email-subaddress blocking, and Gmail-dot behavior were not verified. |

The Clerk SDK/API documentation used for endpoint selection is [Clerk Backend API reference](https://clerk.com/docs/reference/backend-api/2026-05-12), [Instance get](https://clerk.com/docs/reference/backend/instance/get), [Instance protect](https://clerk.com/docs/reference/backend/instance/get-protect), and [Instance organization settings](https://clerk.com/docs/reference/backend/instance/get-organization-settings).

### Clerk interpretation and limitations

The credential pairing is internally consistent for local development: the backend secret and website publishable key are test-mode, and the API identifies the instance as `development`. This does not establish that the deployed backend or website use the same instance. The driver dotenv files contain a live/test split that needs deployment-environment confirmation.

Protect checks being disabled and PKCE not being required are configuration observations, not demonstrated vulnerabilities in this application. The application uses a custom WhatsApp OTP flow, and the Clerk OAuth provider features relevant to those settings may be unused. The blocked-country result applies to Clerk communication settings only; it does not establish that WhatsApp delivery to India is blocked.

The API reads above do not verify dashboard controls that have no safe GET endpoint in the available Backend API surface, including sign-up factors and password settings, session lifetime and multi-session policy, JWT templates, redirect URLs, allowed domains, webhooks, API-key inventory, and dashboard members/roles. No user or session list was queried to investigate those areas.

## Vercel settings verified

The authenticated Vercel CLI read account project metadata and inspected the named project:

- Project: `rcs-travels-website` in the authenticated account scope.
- Project ID was returned by the CLI and intentionally omitted here because it is not needed for the findings.
- Latest production URL: `https://www.rcstravels.co.in`.
- Root directory: `frontend`.
- Framework preset: Vite.
- Build command: `npm run build` or `vite build`.
- Output directory: `dist`.
- Node.js version: `24.x`.
- Repository configuration contains the SPA rewrite in [`frontend/vercel.json`](frontend/vercel.json). No Vercel project-link file is present.
- Git production branch: `main`, from the GitHub repository `RCS-Travels-Website`.
- Deployment protection metadata: SSO protection is configured with deployment type `all_except_custom_domains`. Separate `protection`, `passwordProtection`, and `trustedIps` fields were absent from the project metadata response; their effective dashboard state was not inferred from absence.
- Project targets returned by the API are `production` and `preview`.
- Three verified project domains were returned: `rcstravels.co.in` redirects to `www.rcstravels.co.in`; `www.rcstravels.co.in` is active; and `rcs-travels-website.vercel.app` is active.
- Three Vercel environment-variable metadata records were returned, all typed `sensitive`: `VITE_GOOGLE_MAPS_API_KEY` for preview/production, `VITE_API_BASE_URL` for preview/production, and `VITE_CLERK_PUBLISHABLE_KEY` for preview/production. The API response included a value field even with `decrypt=false`; no value was read, decrypted, printed, or prefix-classified.

The following Vercel settings were not verified:

- Development environment-variable names and presence; no development-target records were returned.
- Whether the deployed Clerk publishable key matches the backend Clerk instance.
- Deployment protection details beyond the returned SSO setting, preview protection, trusted IPs, security headers, custom-domain protection behavior, and project members/roles.
- The Clerk key prefix configured in Vercel. Only the key name and presence were verified; the value was deliberately not inspected.

`vercel project inspect rcs-travels-website` and authenticated Vercel API GET requests succeeded. A temporary project link was created outside the repository and removed after the reads. No deployment, environment-variable value, or project setting was changed.

## Follow-up items

1. Confirm in the Clerk Dashboard that production uses a production instance and that the website, backend, and driver deployment keys are paired to the intended environments.
2. Review the Clerk dashboard-only controls listed above, especially sign-up factors, session policy, redirect URLs, JWT templates, and webhook signing configuration.
3. Record only boolean/key-name metadata for future Vercel environment checks. Confirm that production protection and domain settings match the intended public site.

This audit does not claim that unqueried settings are secure or that the deployed services match local dotenv files.
