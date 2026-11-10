# ux-flow-audit

AUTHOR: CODEX
PHASE: P01
DATE: 21 October 2026 (Asia/Kolkata)
EVIDENCE SNAPSHOT: 2026-10-21T07:44:01.427Z
GIT BASE: 2ff51e7d9dade932cd21dfe5d836488d4b9a700a

Rider entrypoints: Home hero/navbar lead toward the existing city booking flow; repeated entrypoints can be useful on a long page and are not automatically duplicate features. Outstation explicitly sells a different day-priced, return-inclusive service arranged by phone/WhatsApp. Its separate route, content and contact flow must remain intact; do not fabricate online outstation dispatch to make the UI look complete.

Booking → vehicle selection → tracking, scheduled/ride-now payment and cancellation remain backed by their existing contracts. P01 inspected synthetic preview states only and did not create bookings, send notifications, accept rides, process payments or mutate customer data. Critical rider/backend journeys are NOT RUN in this phase. Existing backend suite timeout and typecheck failures are separate from a browser fixture pass.

Settings: actual notification switches now expose their visible translated names. Keyboard operation, loading disablement, failed-save rollback and safe fixture reload persistence passed. Mobile AccountLayout intentionally shows either the section list or content, while desktop shows both; this difference is retained. API/database persistence is not proven by the fixture. Saved-place editing/removal and safety sharing behavior were preserved and require broader authenticated fixture coverage.

Captain: native routes and state-specific HomeGate variants are listed in the registry. Existing verified/assigned-work gates intentionally differ for new work and already assigned rides; they must not be flattened by a visual cleanup. Native verification: FAILED: Isolated native startup/journey verification — accept-failure-and-retry Maestro exit 1 — failed assertion: "Controlled acceptance outage. Please retry." is visible. Evidence: P01-native-verification.json. USB keep-awake remains enabled at the owner’s request. No app-wide device visual approval is claimed. Admin: a synthetic dashboard preview was captured; authorization, finance actions and dispute review were not executed. Future work must reuse isolated real-backend and native harnesses rather than add production auth bypasses.

Priorities: keyboard/accessible names and concise error feedback first; then contrast/target size and role-specific journey tests; only then review larger information-architecture changes with the owner. No new feature, deleted workflow or product-policy decision was introduced.
