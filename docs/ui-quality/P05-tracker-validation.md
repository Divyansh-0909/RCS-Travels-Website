# P05 tracker validation

AUTHOR: CODEX | PHASE: P05 | VERSION: 1
CONTINUATION: Owner-requested connected Android follow-up
STATUS: OUTPUT_READY
REVIEW STATUS: AWAITING_REVIEW
Date: 23/10/2026, 3:33:49 pm (Asia/Kolkata)
Run: 968cf0bf-7d54-4e7d-b622-9ba86224340c:android-connected-2026-10-23

Schema: stable semantic ID; platform/persona; explicit parent; kind and actual route/alias or shared scope; concrete source/line/token; state/group; declared/unknown theme policy and basis; target devices; entry/reachability/preview actor and path; safe navigation steps; separate audit/dimensions/issues/severity/owner/implementation/verification/levels; inventory phase and exact review phase/date; evidence URLs; blocker and next action.

## Validated invariants

| Category | Entries |
|---|---:|
| rows | 347 |
| uniqueIds | 347 |
| duplicateIds | 0 |
| orphanParents | 0 |
| orphanIssues | 0 |
| missingRoutes | 0 |
| sourceTraces | 347 |
| roundTrip | true |

Tests: 41 pass / 1 existing platform skip / 0 fail. See P05-android-test-output.md, P05-android-device-verification.json and P05-android-viewer-verification.json.

The parser supports quoted commas/newlines/Unicode, stable round-trip serialization and the documented severity-column upgrade. Tests reject duplicate logical surfaces/IDs, missing parents/cycles/routes, orphan issues, invalid status vocabulary and stale code locators. Source/screenshot evidence alone cannot become functional verification. Tests retain exactly five deferred P03 failures, bounded P01/P04 verification, the +30px Home finding and no spoken-TalkBack claim. Altering a parent status never mutates children.

## Inventory kinds

| Category | Entries |
|---|---:|
| dialog | 42 |
| fixture | 54 |
| redirect | 3 |
| route | 43 |
| section | 6 |
| shared_surface | 20 |
| state_group | 147 |
| subscreen | 32 |

## Verification levels are independent of inventory

| Category | Entries |
|---|---:|
| FAIL | 14 |
| NOT_APPLICABLE | 3 |
| NOT_RUN | 324 |
| VERIFIED | 6 |

This is a source-discovered inventory and coverage-governance baseline. 254 website/native JavaScript/TypeScript files parsed with zero parser errors; all current router paths and eight mapped legal documents resolve in the tracker. Paths with record IDs/tokens are counted as templates, not as all possible records. 48 data-dependent navigation expressions remain explicitly listed in P05-source-discovery.json; their destinations are constrained by the registered route inventory, but runtime bindings still need review. 174 entries retain UNKNOWN theme policy, principally shared/grouped/fixture surfaces; no missing visual mode was invented. Conditional JSX, early returns, dialogs and related flags are scoped renderer groups rather than an exponential list of boolean combinations. These groups must be split into stable child cases when selected for a bounded audit. No parent status completes its children. No global UI-complete percentage is reported.

The phone reconnected for an explicitly requested P05 Android continuation. 7 actual native surfaces were positioned through read-only, foreground-package and fresh-fixture guarded ADB navigation; their hierarchy and screenshots are recorded in P05-android-device-verification.json. The desktop/mobile viewer displays fresh advancing actual-device frames, separates selected inventory metadata from the phone's actual foreground screen, and hides stale frames and restores fresh ones. These are navigation/reachability observations, not comprehensive screen audits. Existing audit, owner, implementation, verification statuses and historical review dates remain unchanged. Unpositioned states require their own fixture; spoken TalkBack, iOS, other devices and full business journeys remain NOT_RUN. The initial menu test assumed the displayed label was System; the actual UI says Use device setting. That failed attempt is retained, and the corrected assertion passed without a product change. Historical P02/P04 verification remains limited to its exact isolated package/device/states. No production acceptance, booking, payment, dispatch, real OTP or external communication occurred.

