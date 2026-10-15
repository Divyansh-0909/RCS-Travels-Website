# Uniform human session revocation checkpoint

12 October 2026 IST. **VERIFIED at the backend request-admission boundary for all discovered human actors.** Every admitted protected request now requires a fresh, active, matching Clerk session. Production deployment is not authorized. Capacity and broader historical database expectations remain rollout gates.

Evidence is in [`output/session-revocation-2026-10-12/`](../../output/session-revocation-2026-10-12/), with selected executions and artifact hashes in the [verification manifest](../../output/session-revocation-2026-10-12/manifest.json). This remediation does not expand Responsibility authority or replace the [previous Phase 9C checkpoint](phase9c-adversarial-checkpoint-2026-10-12.md).

## Before and after, with real signed tokens

The earlier Phase 9C development-instance customer test measured HTTP 200 immediately after revocation, followed by 401 after the token's actual 60-second expiry. Before this change, `protect` checked only `getAuth(req).userId`; admin and captain routes shared that same offline boundary. Earlier live revocation was measured for the customer, not separately for the other actors.

The final current-auth-source live run is `live-1791814364543-19b0ac24-d6ff-4abc-bfd4-3e0572639fbe/report.json`.

| Actor and actual application route | Active session | Exact same JWT after confirmed revocation | Token still valid for | New session | SDK current-session logout |
| --- | --- | --- | --- | --- | --- |
| Customer, `GET /api/users/me` | 200 | 401 | 57.794 seconds | 200 | Provider `removed`, original replacement JWT 401 |
| Captain, `GET /api/driver/me/wallet` | 200 | 401 | 58.379 seconds | 200 | Provider `removed`, original replacement JWT 401 |
| Admin, `GET /api/admin/zones` | 200 | 401 | 57.530 seconds | 200 | Provider `removed`, original replacement JWT 401 |

All three JWTs had actual 60-second lifetimes. The production guard received the SDK's cryptographically verified identity before asking for that exact session; parent-side SDK confirmation also observed `revoked`. The same token variable was reused, without minting a replacement for the denial probe. No JWT, sign-in ticket or secret key is retained in the report.

The parent verified the selected instance's `environment_type === development`, created only uniquely marked reserved test-email users, and ownership-verified and deleted all three. Real secret material stayed in the parent; supported `createClerkClient(...).sessions.getSession()` results reached the fenced database child over IPC. The child had public verification material, read-only application routes and financial-consequence denial triggers. Its financial snapshot remained unchanged. No instance settings, webhook configuration, production accounts, payment provider or model calls changed.

Earlier all-role runs also passed. The final report records the actual source epoch; earlier reports are not relabelled as executions of later changes. A retained final trial passed the customer's revocation check but failed during subsequent SDK logout; the successful retry captures the intended session ID before logout and records provider HTTP statuses. This failed trial is excluded from the final all-role PASS.

## Shared implementation and route coverage

The critical scope is `backend/middleware/auth.js`, `backend/middleware/liveSession.js` and `shared/auth/signOutCurrentSession.mjs`.

1. Clerk middleware verifies the signature, token times and configured audience/authorized parties. `CLERK_AUTHORIZED_PARTIES` defaults to `CORS_ORIGINS`, then the local Vite origins when unset. Native tokens without an `azp` claim remain supported. `CLERK_AUDIENCE` is optional and must match the instance's configured session-token audience when applicable.
2. The shared guard requires nonempty user identity, session identity, matching verified `sub`/`sid`, and an issuer matching the configured publishable key's instance.
3. The installed supported `clerkClient.sessions.getSession(sessionId)` runs afresh for each request. Only `active` with matching session ID and user ID continues.
4. Existing role, booking, financial and ownership checks then run. `protectAdmin` also invokes the common guard when used alone.

Only duplicate guards on the **same Express request object** reuse a result through a private WeakSet. There is no positive cache, single-flight reuse or active-session cache across requests. No request header/body session ID is trusted. No deprecated `verifySession()` is used.

[`route-inventory.json`](../../output/session-revocation-2026-10-12/route-inventory.json) enumerates every method/path, actual middleware, source file/line and source hash. The runtime route-stack regression checks the actual middleware functions; the inventory also rejects unclassified route files consuming `getAuth` or `req.auth`.

| Surface | Protected routes | Middleware |
| --- | ---: | --- |
| Customer account | 14 | `protect` |
| Bookings and shared payment surfaces | 18 | `protect`, existing payment limiter where applicable |
| Captain, including location, offers, wallet, documents and appeals | 32 | `protect` |
| Admin and Responsibility admin | 25 | `protect`, `protectAdmin` |
| Fare estimate with a private coupon | 1 conditional route | `protectCoupon` → `protect` |

**89 fully protected routes plus one conditional coupon route.** `index.js` additionally mounts `protect` over `/api/bookings`, `/api/driver`, `/api/users`, `/api/admin` and `/api/payments` before their routers. New routes in those namespaces inherit the boundary even if a per-route guard is forgotten. The permanent admin inventory test also requires the admin role guard. Ordinary anonymous fare estimation stays public.

The discovered human actors are customers, captains and dashboard administrators, including accounts that hold both customer and captain records. Captain dispatch groups `admin`/`rcs`/`partner` remain existing business classifications; an owner captain's group is not a substitute for the dashboard's verified admin role.

The inventory separately records these independent boundaries: raw-body Razorpay/RazorpayX signatures, Meta WhatsApp signatures/challenge, Google OIDC internal jobs, scoped HMAC captain checkout links, public ride-share capabilities, OTP/ticket issuance, public Google address proxies and health. Signed hooks and internal jobs are mounted before Clerk and retain their own authorization. Existing unsigned-webhook and worker regressions pass. Share/checkout capabilities intentionally have their own expiry and may outlive a human session.

No application WebSocket or SSE human-authenticated connection was found in the inspected backend/client surfaces. Website tracking and native offers use ordinary protected polling. The native background location task obtains a token from the same Clerk SDK instance and posts to protected `/api/driver/location`; it receives the same live check. Server jobs and provider callbacks use independent event/job authority rather than replaying a human JWT.

## Denials, service failures and logout

Inactive statuses (`revoked`, `ended`, `expired`, `removed`, `replaced`, `pending`, `abandoned` and unknown), absent/mismatched identity and provider 404 return 401 `AUTH_REQUIRED`. Invalid signatures, expiration, issuer, audience and authorized parties are rejected. Malformed JWT decode exceptions and expired-cookie states without an SDK Auth object also return JSON 401 instead of an Express 500 or redirect.

Clerk timeout, 429, 5xx, network or credential/configuration failure returns controlled 503 `AUTH_UNAVAILABLE`, with `Retry-After: 1`. Errors are not returned verbatim. There is no JWT-only fallback and no application retry loop. Existing upstream abuse limiters can reject a request earlier with 429; such a request never reaches a business handler or authorizes an action.

The status lookup's **caller deadline is 2.5 seconds**. The installed Clerk SDK offers no AbortSignal argument for `getSession`; its underlying request may continue after the caller's deadline. At most 100 lookups can remain outstanding per process, including timed-out lookups. Their slots release only when the SDK settles. Saturation denies with 503. This bounds work accumulation but a stalled transport can leave a process saturated until transport settlement/restart. This is an explicit availability limitation, not cancellation of the underlying SDK network operation.

Wrong admin role remains 403. A real active foreign customer's booking read returns 403 with unchanged financial state. Some existing payment ownership queries deliberately return 404 to conceal foreign resources; their existing privacy contract was preserved.

Customer/admin website logout, captain account logout and captain onboarding logout now pass the captured current session ID to Clerk's `signOut({ sessionId })`. They await provider completion and preserve existing UI failure handling. Missing current-session identity cannot broaden into sign-out of all client sessions. Unit tests preserve another device's session and propagate provider failure. No server session-management endpoint, forced logout of existing users or all-device revocation was added.

Ordinary token expiry, ending/removing the current session, revoking a particular session, replacement, all-session termination and user deletion are distinct provider operations. The backend rule handles all of them through verified identity plus authoritative active status, without introducing an all-session operation into current-device logout. Deterministic tests cover replacement and a new active session; live tests observe current-session removal after logout.

## Authorization time and races

The authorization linearization point is receipt and validation of the fresh matching active-session response **at request admission**. A new admitted request after authoritative inactive state is reflected cannot enter its protected handler. Simultaneous requests each query independently. A duplicate submission after revocation is denied before a writer; the real customer write and disposable customer/captain/admin state checks confirm unchanged persisted state after rejection.

Provider propagation and the time between provider observation, response receipt and business execution remain outside an atomic cross-system guarantee. Logout during an API call, a request waiting on a database lock, or a long-running request already admitted does **not** automatically cancel that request. Provider-confirmed revocation affects subsequent admission. A session replacement during navigation causes the old session to fail and the new matching active session to work.

Irreversible actions deserve a narrower additional check if dispatch-time revocation is required. In particular `driverPayouts.js:181` reads the payout destination/balance before external dispatch, and `:228` iterates a batch after the route was authorized. This change does not add a check before each payout, transaction commit or administrative decision. A later dispatch check would reduce the in-flight window but still could not atomically serialize Clerk revocation with an external payment operation. Such a change needs explicit service authorization context and idempotency/lock regression proof; financial authority and worker behavior were preserved here. The guaranteed contract is request admission, not cancellation at commit time.

## Actual performance and provider limits

The final live run executed **18 online guard lookups** across the three synthetic login/read/revoke/re-login/logout sequences, including automatic website profile reads. Four explicit protected probes per role account for 12; six additional website profile calls account for the rest. The child also observed public/unmounted read probes, which are not counted as status lookups. The runner made 19 other recorded Backend API calls plus six explicit session confirmations: 43 Backend API calls total for that test sequence. This is measured test traffic, not a complete booking journey or production workload.

Provider lookup latency for the final sample: minimum **339 ms**, median **354 ms**, sample p95/maximum **1,178 ms**, n=18. The earlier clean repeat had median 340 ms and sample p95/maximum 378 ms. IPC/HTTP/handler overhead is additional; these figures isolate the live SDK lookup duration. Deterministic tests exercise a full 2.5-second caller timeout, 100 stalled lookups, recovery after settlement and ten simultaneous real HTTP requests without cross-request cache reuse. The physical reconnect test recorded 29 protected API requests across two groups, using a deterministic provider.

[Clerk's current limits](https://clerk.com/docs/guides/how-clerk-works/system-limits) are per instance/secret key: **100 Backend API requests per 10 seconds for development**, **1,000 per 10 seconds for production**, including GETs. Session lookups use the general limit. This is nominally 10/100 requests per second before other Backend API traffic and burst effects; replicas share the provider budget.

Source-grounded traffic exposures: online offers poll every 2 seconds (`useOffers.tsx:87`), website active tracking every 5 seconds (`trackingPoll.js:4`), and foreground location fixes can arrive every 4 seconds (`useDriverLocation.ts:47`). Location sends require 20 metres of movement or a two-minute idle heartbeat and never queue overlapping fixes (`locationTask.ts:69,210`). A moving captain can therefore offer roughly 0.75 protected requests/second before screen actions, profile refreshes and riders; 100 such captains alone can offer roughly 75 Backend API requests/second. This is a workload estimate, not measured production capacity; latency/backoff and movement change actual rates.

There is no evidence authorizing a weaker revocation guarantee. No positive cache or webhook-only substitute was introduced. If capacity becomes unacceptable, an alternative must prove authoritative local revocation consistency for **every** termination path, authenticated ordered delivery, synchronous application-logout recording, outage denial and provider/operator revocation propagation. Asynchronous webhooks alone do not supply that guarantee. Production-scale journey/load/availability measurement remains incomplete.

## Executed tests and source epochs

| Check | Actual accepted result |
| --- | --- |
| Scoped auth/HTTP/logout/security | **34/34 PASS**; final coverage run `coverage-1791813858573-a4a56e71-dd3d-41c2-b03d-2682aca2c8f0.json` |
| Full backend | **1,777/1,777 PASS**, no skips; `full-1791814033850-58737bbc-1904-4895-ad13-06d0abef56bf.json`; all suites, process concurrency 4 |
| New disposable PostGIS revocation/foreign ownership | **5/5 PASS**; `db-1791814166737-5cb45d93-249e-4334-8ce1-ca2d8a5dac40.json` |
| Existing Phase 9 cross/review/appeal DB regressions | **3/3 PASS**; `cross-1791814191458-d31b71b4-19ae-40fa-9aed-7a00c1632e13.json` |
| Broader disposable DB suite | **54/58 PASS, 4 failures retained**, `all-db.log` |
| Actual development Clerk/browser SDK | **3 actor groups PASS** in final run, exact unexpired JWT denial, new login, current-session SDK logout and owned-user cleanup |
| Physical Android reconnect | **2/2 groups PASS**, `native-1791813598579-e4a55d5a-d0ef-4425-882b-0fc043baa634/report.json`; original signed session 401, new active session profile 200 |
| Website units/build | **57/57 PASS**, build PASS |
| Captain units/lint | **12/12 PASS**, lint zero errors / seven existing warnings |
| Backend typecheck / scoped lint / Git diff check | **PASS** |
| Critical coverage | **100% statements, branches, functions and lines**; 108/108 statement/line counters, 76/76 branch counters, 7/7 function counters |
| Structural maxima | Cyclomatic **11**, cognitive **6**, Halstead Difficulty **17.6**, CRAP **11**, largest critical source **68 LOC** |
| Mutation, final source | **152 mutants: 146 Killed, 5 Timeout, 1 equivalent Survived; zero meaningful survivors**; `mutation-round3.json` |

The five mutation timeouts remove middleware continuation or timeout rejection and cause a request/test to hang; they are detected timeout outcomes, not survivors. The one survivor changes the terminal-dollar stripping regex from `/\$$/` to `/\$/`; valid Clerk publishable-key payloads contain that dollar only at the hostname terminator, so it is equivalent on supported input. The anchored implementation remains. Earlier mutation rounds and the interrupted inefficient full-router-import run are retained. Raw coverage is retained alongside the scoped report; counters were not edited to manufacture full coverage.

The four broader DB failures are two Phase 5 assertions plus a Phase 7 child and its parent. They expect `PROVISIONAL_AUTO_UPHELD` where current service execution persists `NEEDS_ADMIN_REVIEW`. These are direct adjudication-service fixtures, not Clerk route failures. Their expectations/authority were not changed to pass this authentication task. A later full backend trial timed out in the existing separated-development audit under heavy concurrent verification; its six failed tests and original source epoch remain retained. Bounded-concurrency full runs then passed all 1,777 tests.

The first new PostGIS test attempted to read an incident before creating its cancellation lineage; its failed log remains `db-initial.log`, and the permanent corrected test uses the existing incident-with-replacement fixture. Earlier malformed-token/cookie and mutation test gaps were corrected and are permanently covered. Initial live browser startup, native bundle transport and intermittent SDK logout failures remain separate failed receipts; none is counted as a successful assertion.

The physical run uses the preceding bearer-auth source epoch `dc16291...`; the final `02e507e...` correction additionally catches missing cookie Auth objects. The native receipt is not rehashed as a new execution. Its bearer session behavior is supported by current-source unit/DB/all-role live tests. Both selected physical screenshots were inspected: the revoked backend profile leaves the existing document-gate screen, and the new active profile restores the online home. This does not certify a new native sign-in-error screen, real GPS/background collection, map gestures, safe areas or keyboards.

## Rollout recommendation and preservation

The shared request-admission remediation is reviewable and verified. **Do not deploy unconditionally.** Before an explicitly authorized staged canary, reconcile the four historical DB expectations, measure complete customer/captain/admin journey traffic at expected peak, reserve provider budget across replicas, validate production keys/audience/website authorized parties, and approve the in-flight financial policy.

Canary monitoring must distinguish Clerk lookup 429, 5xx/network/deadline and local outstanding-cap saturation; track lookup latency, active/mismatch/inactive results, HTTP authentication 401/403/503 and existing API 429 rates. Alert on 503/429 spikes and latency approaching 2.5 seconds. Measure legitimate active users denied by SDK/party/issuer configuration separately from confirmed revoked sessions. Use status/cause counters and synthetic probes rather than logging tokens, keys, customer data or session identifiers. This checkpoint specifies the monitoring gate; it does not claim a deployed collector or measured production SLO. An outage keeps all protected human actions closed, while independent signed workers/provider callbacks retain their own authorization.

Frozen V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`; a read-only integrity check matched **all 22 source identities** (`frozen-v5-preservation.json`). The held-out Jev benchmark was not rerun. No commission, deposit ownership, financial idempotency, booking/cancellation authorization, signed webhook verification, Responsibility authority or production switch changed. Unrelated dirty-tree edits were preserved. No commit, production deployment or instance-setting change was performed.

Temporary public configuration files were removed on each live run. Automatic approval review rejected recursive cleanup of owned Vite cache directories with the reason “blocked by policy”; remaining caches are documented, and no permission to bypass that rejection was inferred.

```text
UNIFORM HUMAN SESSION REVOCATION: VERIFIED (request admission)
CUSTOMER PROTECTED ROUTES: VERIFIED
CAPTAIN PROTECTED ROUTES: VERIFIED
ADMIN PROTECTED ROUTES: VERIFIED
LIVE CLERK REVOCATION TEST: PASS
AUTH SERVICE OUTAGE FAIL-CLOSED: PASS
PERFORMANCE/RATE-LIMIT REVIEW: PARTIAL (live sample and limit review complete; production load/journeys incomplete)
PRODUCTION DEPLOYMENT: NOT AUTHORIZED
RESPONSIBILITY PHASE 9C: COMPLETE FOR PREVIOUSLY APPROVED ISOLATED SCOPE
RESPONSIBILITY PHASE 9D: NOT STARTED
PRODUCTION SHADOW: OFF
AUTO-ADJUDICATION: OFF
PRODUCTION CONSEQUENCES: OFF
SEARCH ROLLOUT: OFF
```

Current provider references: [supported `getSession`](https://clerk.com/docs/reference/backend/sessions/get-session), [Backend Session identity/status](https://clerk.com/docs/reference/backend/types/backend-session), [Backend API limits](https://clerk.com/docs/guides/how-clerk-works/system-limits). Reproduce with `node tools/session-revocation/run.mjs unit|coverage|full|db|cross`, the scoped lint/Stryker configs, and the separately authorized development-only `tools/session-revocation/live.mjs`. The physical runner is `node backend/tests/run-phase9-cross-db.js sessionNative` and requires the prepared unlocked USB test device.
