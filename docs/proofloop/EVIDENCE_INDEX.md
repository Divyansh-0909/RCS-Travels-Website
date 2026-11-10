# Proofloop evidence index

16 October 2026. This is a migration inventory, not an acceptance certificate.

The complete per-file index is [evidence-index.jsonl](evidence-index.jsonl.gz). Every available relevant file has its original repository-relative path, phase/component, purpose, exact size and SHA-256, tracked/ignored status, classification, referencing manifest/test, availability, transfer method and future use. Missing files use null size/hash; directory exclusions are boundaries, not fictional file hashes.

## Classification totals

| Class | Files | Total bytes | Already tracked | Ignored | Untracked |
| --- | ---: | ---: | ---: | ---: | ---: |
| GENERATED_REBUILDABLE | 294 | 475.25 MiB | 0 | 75 | 0 |
| LARGE_ARTIFACT | 8,549 | 5910.69 MiB | 0 | 8,549 | 0 |
| MISSING | 180 | 0.00 MiB | 0 | 0 | 0 |
| NOT_NEEDED | 6 | 0.01 MiB | 0 | 3 | 0 |
| PRIVATE_ARTIFACT | 1,123 | 60.20 MiB | 9 | 1,113 | 0 |
| SAFE_GIT | 9,038 | 160.19 MiB | 1,869 | 7,159 | 10 |

Only **7,159 ignored SAFE_GIT files / 104.67 MiB** are proposed as new historical Git evidence. Existing tracked source is inventoried but not restaged. The local continuation edits remain outside the evidence plan.

## Six recovered cloud baselines

| Original path | Bytes | SHA-256 | Class |
| --- | ---: | --- | --- |
| `output/session-revocation-2026-10-12/manifest.json` | 24,361 | `13b77d527076c3293ae9e5fc4a8493d3eb0cdead5f883d8333b9ae3482130a94` | SAFE_GIT |
| `output/responsibility-v5-freeze-2026-10-08/freeze-manifest.json` | 17,277 | `db5cc243d7ceeffc0e71bca33f4ac71c6d8b8b55220aca690ef82fb4183085e9` | SAFE_GIT |
| `output/phase9c-adversarial-2026-10-11/execution-manifest.json` | 629,064 | `713414e09744040a5291781e7ddfea7f7b87efb4bea03868a0bcd408bac544bb` | SAFE_GIT |
| `output/phase9d-audit-custody-2026-10-14/manifest.json` | 43,243 | `5b14a6b9dda1781abfdc906a6b0d3fbbd7c0f0c326db02f33e2f677ed1eeec28` | SAFE_GIT |
| `output/phase9d-audit-custody-2026-10-14/audit-coverage-matrix-current.json` | 24,419 | `58d323144e41bf4c9a9e5545ca4a62d6d76c1a7f839b18ce3488ae92c9479e8a` | SAFE_GIT |
| `output/phase9d-audit-custody-2026-10-14/readiness-gates.json` | 93,786 | `39561946059e5ff3287bb3ce39d36404791af535d7afca13857ec24a9b734209` | SAFE_GIT |

All six are AVAILABLE locally. The immutable V5 freeze and the 3/22/28 accepted source identity sets were verified against both local and cloud source bytes; see [source-baseline-verification.json](source-baseline-verification.json). Their dependent evidence still follows its own classification and availability.

## Required transfer review

- [SAFE_GIT_PATHS.txt](SAFE_GIT_PATHS.txt): exact ignored paths requiring explicit review before any force-add.
- [PRIVATE_ARTIFACT_PATHS.jsonl](PRIVATE_ARTIFACT_PATHS.jsonl): encrypted controlled storage; original bytes, no Git.
- [LARGE_ARTIFACT_PATHS.jsonl](LARGE_ARTIFACT_PATHS.jsonl): external content-addressed payloads, controlled until full security review.
- [reference-issues.json](reference-issues.json.gz): missing references and source/artifact identity discrepancies; do not rewrite immutable files to clear them.
- [excluded-output.jsonl](excluded-output.jsonl.gz): unselected optional/rebuildable/not-needed output with sizes and reasons; metadata-only, not a reviewed transfer list.
- [excluded-trees.json](excluded-trees.json): generated dependencies/build/instrumentation trees and link boundaries; descendants are not individually inventoried unless referenced.
- [documentation-map.json](documentation-map.json): inspected Proofloop documentation and headings.

## Unresolved references

| Disposition | Unique paths |
| --- | ---: |
| CLOUD_ONLY_NOT_LOCAL | 5 |
| EXTERNAL_ORIGINAL_HISTORY_UNAVAILABLE | 174 |
| INCOMPLETE_COMPARATOR_OUTPUT_NOT_PRODUCED | 1 |

Historical artifact hash discrepancies affect **1 paths**; source-epoch drift affects **210 paths**. These counts are distinct from missing paths and from the verified accepted identity sets.

Literal dependency discovery is conservative: code/negative-fixture/obsolete-path references require contextual disposition and are not all execution blockers. Cloud-only paths are locally unavailable, not evidence that the cloud has lost them. No unresolved-reference or complete-test-portability claim is made until the required payloads and actual blockers are resolved.

## Per-phase inventory counts

| Component | Available / missing entries |
| --- | ---: |
| Clerk session revocation | GENERATED_REBUILDABLE: 8, LARGE_ARTIFACT: 8, PRIVATE_ARTIFACT: 1, SAFE_GIT: 121 |
| Cloud continuation evidence (remote workspace only) | MISSING: 3 |
| Existing application/source dependency | GENERATED_REBUILDABLE: 73, LARGE_ARTIFACT: 62, NOT_NEEDED: 3, PRIVATE_ARTIFACT: 6, SAFE_GIT: 920 |
| Historical original raw coverage | LARGE_ARTIFACT: 1,285 |
| Historical raw coverage / dependency recovery | LARGE_ARTIFACT: 2,202 |
| Historical verification raw reports | LARGE_ARTIFACT: 1,384 |
| Migration verification utility | SAFE_GIT: 1 |
| Phase 9A/9B lifecycle replay UI/native | GENERATED_REBUILDABLE: 92, LARGE_ARTIFACT: 666, PRIVATE_ARTIFACT: 13, SAFE_GIT: 829 |
| Phase 9C adversarial/application verification | GENERATED_REBUILDABLE: 108, LARGE_ARTIFACT: 331, PRIVATE_ARTIFACT: 31, SAFE_GIT: 1,517 |
| Phase 9D-1 SQL certification | LARGE_ARTIFACT: 2, SAFE_GIT: 102 |
| Phase 9D-1 broker recovery | GENERATED_REBUILDABLE: 9, LARGE_ARTIFACT: 182, PRIVATE_ARTIFACT: 26, SAFE_GIT: 465 |
| Phase 9D-1 containment and readiness | GENERATED_REBUILDABLE: 2, LARGE_ARTIFACT: 694, PRIVATE_ARTIFACT: 28, SAFE_GIT: 463 |
| Phase 9D-1 custody closure | LARGE_ARTIFACT: 15, MISSING: 2, SAFE_GIT: 133 |
| Phase 9D-1 independent custody | GENERATED_REBUILDABLE: 1, LARGE_ARTIFACT: 239, SAFE_GIT: 154 |
| Phase 9D-1 outbox | LARGE_ARTIFACT: 439, SAFE_GIT: 277 |
| Phase 9D-1 transport | GENERATED_REBUILDABLE: 1, LARGE_ARTIFACT: 727, SAFE_GIT: 164 |
| Planning and documentation | LARGE_ARTIFACT: 1, SAFE_GIT: 104 |
| Project-wide applicability and future architecture | LARGE_ARTIFACT: 12, SAFE_GIT: 32 |
| Project-wide supporting Search/provider evidence | LARGE_ARTIFACT: 42, PRIVATE_ARTIFACT: 1,017, SAFE_GIT: 1,268 |
| Responsibility Phases 1-8 / frozen Jev V5 | LARGE_ARTIFACT: 254, MISSING: 1, NOT_NEEDED: 3, SAFE_GIT: 2,440 |
| Responsibility historical phase audit | LARGE_ARTIFACT: 4, SAFE_GIT: 48 |
| Responsibility original authorization/history | MISSING: 174, PRIVATE_ARTIFACT: 1 |

The crawl follows manifest file/hash records, source identities, explicit evidence directories, source/documentation literals, saved inputs, selected/raw reports, failure receipts and synthetic caches. Generic source/output roots do not pull entire directory trees into the transfer proposal. Dynamic runtime paths, external services and excluded link targets remain explicit inspection boundaries.

A full-file hash does not establish that a file is safe for Git. Small SAFE_GIT candidates received full-content rule scans; secret/capability/identity concerns are withheld conservatively. Large/opaque payloads are not cleared by a bounded scan. No raw content, credential value, token or private key is copied into this metadata index.

See [CLOUD_MIGRATION.md](CLOUD_MIGRATION.md) for transfer/restoration and approval requirements and [PHASE_REQUIREMENTS.md](PHASE_REQUIREMENTS.md) for current/future use.

## Final contextual reference review

See [REFERENCE_REVIEW.md](REFERENCE_REVIEW.md). The compressed full literal discovery is [reference-discovery.json.gz](reference-discovery.json.gz); exact original-counter/retention path resolutions are in [dependency-aliases.json](dependency-aliases.json). The reference-discovery sidecar retains the initial conservative crawl, while reference-issues records the contextual result.

Source files containing current credentials are not transfer requirements. Existing tracked files are inventory-only and never restaged by the evidence plan. External original histories use an explicit bundle alias plus their original absolute path; they are not falsely represented as repository-relative files.

The `.gz` files contain compressed migration metadata, readable with Python standard-library `gzip` and `json`. Per-file hashes refer to the untouched historical file bytes, not to compressed metadata.

The 19 pre-existing local source edits are also preserved in a reviewed, unapplied [source archive](local-continuation-20261016.tar.gz) with [per-file hashes](local-continuation-manifest.json). The archive is source preservation, not runtime evidence or authorization to apply the changes to Cloud.
