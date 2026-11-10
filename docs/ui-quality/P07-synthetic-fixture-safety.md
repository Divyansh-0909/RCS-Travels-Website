# P07 — synthetic fixture safety

29 October 2026 IST. **APPROVAL_REQUIRED. Audit complete within the stated fixture scope; product fixes NOT_CHANGED.**

Approved prompt: [handoff document](https://docs.google.com/document/d/1mfFSj9kbob7mAE5CuUW9aR1LBnoHjVS0vb6w91KvzJ8). [Drive evidence folder](https://drive.google.com/drive/folders/1qP4Ig18YTCtjqNGqbXWoSPbrEoTW30lz). Local raw evidence: `output/handoff/P07-2026-10-29/`. This is P07, separate from the earlier unnumbered consistency work.

## Actual renderer and synthetic boundary

The Vite fixture imports the real frontend/src route and the actual CustomerPaymentPanel/RideSettlementPanel for presentation references. It does not recreate customer screens in the review HTML. The /booking/p07-… path hydrates from a finite local read-only response catalogue; synthetic identifiers, names, phone strings, amounts, times and coordinates are not customer/captain data. The dev-only auth helper supplies only a local actor. No .env, production credentials, real authentication bypass or deployed route was changed.

All /api non-GET requests return a deliberate409 after a short delay; successful payment/order/refund/cancel writes are impossible in this fixture. A denied POST is used to test failure feedback. “Zero external writes” does not mean zero local POST attempts: selected functional/transition/matrix logs contain **2 local mutating attempts**, all fixture-denied. Additional fixture-safety test POSTs also receive409. No checkout/order/payment/ledger is created or altered, and GET sequences may change presentation only. Fixture tests prove an assigned row is unchanged after denied cash/order/cancel attempts.

The selected combined logs also contain126 POSTs to the isolated fixture-auth helper; these are local synthetic auth setup, not customer/financial writes or denied API operations. The browser harness blocks any non-loopback host. Selected combined logs record0 attempted non-loopback requests reaching its route layer. CSP also blocks prohibited external/Maps requests before that layer; the renderer shows Map unavailable. No blocked-request count is invented from that message. Final supplemental contacts have external[]. CSP permits connect-src self (plus its own development WebSocket), frame-src none and blocks form actions; real provider frames cannot load. The preview uses a Vite-only transform to intercept window.location.href contact assignments; original product files remain unchanged. window.open/share/clipboard/geolocation and external link intents are intercepted. Existing review bridge and P07 prelude have separate safe intent arrays; the supplemental test checks both rather than assuming only one recorder.

The finite /__review/p07?case=… allowlist rejects constructor/__proto__/external/path cases; unknown non-synthetic booking reads return404. Reviewer4317 host-checks loopback, rejects every non-GET method with405 and has no dispatcher. No document watcher was started. Drive uploads/document append are the explicitly requested handoff publication, not an external customer action.

## Explicit limitations

Mocked status and paid/refund states demonstrate actual presentation and update handling only. They do not prove a provider charge/refund, independent payment verification, booking authority, receipt validity, fare math, financial policy, database, dispatch, maps or real back-end integration. Provider busy/failed/cancelled/paid presentation references use imported components with labelled synthetic props/callbacks. No force-success handler was added to product code. Initial loading and permission-denied branches are deterministic fixture observations; no real user session or deployed permissions are exercised.

Build, browser scripts, test logs, fixtures and hashes are retained. Source-preservation.json verifies304 recorded frontend/driver/shared inputs and existing owner registries unchanged; permitted metadata edits are separately identified. Evidence snapshots contain synthetic data. No screenshot or fixture should be passed off as production or native-device acceptance.

Item 03 Account backdrop repair remains accepted and unchanged. Item 12 remains OWNER_VISUAL_REVIEW_PENDING / ON HOLD at the owner’s request; no choice or standard is inferred. P03 Home/Outstation KEEP CURRENT, P04 native results, P06 fixes and approved input/button/focus/spacing choices are preserved. No P08, Android, provider operation, commit, push, merge or deployment.
