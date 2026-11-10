# Proofloop Git and cloud evidence migration

Prepared 16 October 2026, Asia/Kolkata. **Preparation only: no migration commit or push is authorized yet.** Proofloop stays inside the RCS Travels repository. This package inventories historical bytes and proposes a transfer; it does not complete Phase 9D-1 or change production authority.

## Branch custody and conflict boundary

| Item | Inspected identity |
| --- | --- |
| Repository / origin | `https://github.com/Divyansh-0909/RCS-Travels-Website.git` |
| Original local branch | `wip/proofloop-9d1-custody-handoff` |
| Original and current local HEAD | `2ff51e7d9dade932cd21dfe5d836488d4b9a700a` |
| Separate migration branch | `codex/proofloop-evidence-migration-20261016` |
| Independent cloud branch | `work/phase9d1-custody-closure` |
| Inspected cloud HEAD | `8cb24fd359ecd17573897fab5fb702daa7e3aef3` |

The local HEAD exactly matches the previously pushed handoff. The cloud commit's parent is that same handoff and it changes 37 paths. The original local tree contains 10 tracked modifications and 9 untracked continuation files. They were carried into the migration branch; their live paths remain outside the evidence commits. An unapplied exact-byte snapshot is preserved in [local-continuation-20261016.tar.gz](local-continuation-20261016.tar.gz), with [its hash manifest](local-continuation-manifest.json), so Cloud can compare all 19 files without retrieving them again from the laptop. [branch-state.json](branch-state.json) records original path hashes and the exact cloud/local path sets.

Four local edits overlap cloud changes:

- `backend/tests/phase9dCustodyClosureTransport.test.js`
- `tools/phase9d/closure-capsule.mjs`
- `tools/phase9d/closure-ingress.mjs`
- `tools/phase9d/closure-run.mjs`

The remote `dev` also pointed to the cloud commit when remote heads were inspected; the local `dev` remains the older application baseline. Do not select a baseline by branch name alone. A read-only inspection fetched the cloud branch into a remote-tracking reference; no cloud source was checked out or merged. Future integration should apply the approved evidence-only commits to the cloud branch after reviewing the diff, preserving both source epochs and both uncommitted/committed continuations.

## Package entry points

- [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md): counts, six recovered baselines, classification/transfer rules and links to the complete machine index.
- [PHASE_REQUIREMENTS.md](PHASE_REQUIREMENTS.md): current and future phase-to-evidence requirements and production boundaries.
- [evidence-index.jsonl](evidence-index.jsonl.gz): individual relevant files, exact historical paths, byte sizes, SHA-256 hashes, Git status, classification, referencing manifests/tests, availability and future use.
- [reference-issues.json](reference-issues.json.gz): unresolved references and historical identity discrepancies. A source-epoch change is distinct from an absent payload or an artifact hash mismatch.
- [excluded-output.jsonl](excluded-output.jsonl.gz) and [excluded-trees.json](excluded-trees.json): optional/unselected output and generated/link boundaries. These are not transfer-ready payload allowlists and are not deletion instructions.
- [documentation-map.json](documentation-map.json): Proofloop-related documentation inspected during reference discovery.
- [source-baseline-verification.json](source-baseline-verification.json): local and cloud checks of accepted Clerk/V5/custody identities.
- [COMMIT_PLAN.md](COMMIT_PLAN.md): exact proposed grouped commits and the reviewable ignored-file allowlist.

## Classification and transfer policy

| Class | Handling |
| --- | --- |
| A â€” SAFE_GIT | Reviewed source/documentation/manifests or synthetic evidence. Existing tracked source stays as-is. Only exact new evidence paths on the reviewed allowlist may be added after approval. |
| B â€” PRIVATE_ARTIFACT | Sensitive or conservatively flagged raw evidence: credentials/tokens/private key material, identity/PII concerns, private configuration, or opaque archives whose contents are not cleared. Keep original bytes in encrypted controlled storage with narrowly scoped access. Never Git. |
| C â€” LARGE_ARTIFACT | Bulky accepted coverage/counters, mutation or replay/trace output. Store content-addressed outside Git. The bounded content scan is not security clearance: use controlled encrypted storage until full review. |
| D â€” GENERATED_REBUILDABLE | Dependency/build/install/instrumentation trees or unselected generated output. Rebuild from checked-in recipes/lockfiles. A fresh result has a new epoch and cannot replace an old acceptance proof. |
| E â€” MISSING | Referenced but not found locally. Resolve the specific reference or retain an explicit unavailable status. Cloud-only output requires export from the cloud workspace. |
| F â€” NOT_NEEDED | Unrelated output or non-required scratch/design artifacts. Leave local; do not transfer indiscriminately. |

Content rule scans are conservative triage, not a guarantee that arbitrary historical transcripts contain no personal information. Safe evidence proposed for Git is small enough for full-file rule scanning. Private flags are retained as category names only; the index never copies matched secret values. Large/opaque payloads have full-file SHA-256 hashes but do not receive SAFE_GIT clearance from a prefix scan. No existing evidence is redacted, normalized, rewritten or deleted.

## Historical byte integrity

All six inputs reported unavailable by the cloud baseline helper were recovered at their original paths. The immutable V5 freeze hash recomputes to `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`. All 3 accepted authentication source identities, all 22 frozen V5 identities and all 28 accepted custody identities match both local files and the inspected cloud commit.

Other historical manifests describe older source epochs. A current source mismatch is retained as drift, not edited away or automatically treated as corrupt evidence. For an actual artifact hash mismatch, recover the original bytes or mark that proof unavailable. Do not edit a manifest to make its hash agree with a replacement file.

Use `git -c core.autocrlf=false add` for any later approved evidence staging. Compare staged Git blobs with the reviewed SHA-256 values; line-ending changes would alter the historical file identity. Preserve Windows paths embedded inside old reports; mapping them for analysis must not rewrite the original report. Fresh cloud verification creates new provenance.

## External artifact package requirements

No external artifact destination has been selected or written. Before laptop-independent continuation, the owner must select a private durable store and arrange an authorized upload of the PRIVATE_ARTIFACT and LARGE_ARTIFACT payloads identified by the index. Git alone is insufficient.

Each bundle should retain repository-relative paths and contain an external transport manifest with original file size/SHA-256, bundle size/hash, source epoch and classification. Encrypt private or uncleared payloads before upload. Keep encryption keys and store credentials outside Git and outside the archive being unlocked; use account-scoped access or short-lived credentials rather than credentials in repository documents. Verify bundle and per-file hashes after download. Preserve failed/interrupted receipts alongside successful ones, without relabelling them.

Cloud restoration must validate archive member paths before extraction, reject traversal and unsafe links, and restore only into the intended workspace/artifact mount. Use explicit per-file mappings if a controlled mount is required. Do not put a real `.env`, signing private key or auth token into a source checkout merely to satisfy a path reference. Existing historical private keys are not needed to verify signatures against public keys and should not be imported into live services; newly authorized disposable executions should create fresh credentials and a new epoch. Private historical material should be exposed only if its specific forensic/test use requires it.

The cloud report references its own ignored raw output/delivery/preservation directories. They are not contained in the fetched cloud source commit and are not available on this laptop. Preserve/export those separately from their originating cloud workspace if they must survive that workspace's lifecycle. The laptop migration must not pretend it has read them.

## Review and execution sequence

1. Review the exact per-file classifications, unresolved-reference dispositions and [COMMIT_PLAN.md](COMMIT_PLAN.md). Confirm that any remaining private/large transfer requirements have an external route.
2. Approve individual ignored SAFE_GIT paths on the allowlist before any force-add. No ignored directory may be force-added wholesale. The current preparation stages only reviewed migration documents and the read-only hash verifier.
3. After approval, recheck branch/HEAD, original uncommitted file hashes, evidence size/SHA-256 and staged paths; create the proposed grouped local commits. No current continuation source should enter those commits accidentally.
4. Push only after explicit approval, to the separate migration branch. Do not reset, clean, rebase, merge or force-push. Integrate into the current cloud branch deliberately afterward; do not replace it with this older source baseline.
5. Restore approved Git/external files at original paths. Run `python tools/proofloop/verify_migration.py` for the six baselines. `--classification SAFE_GIT`, `PRIVATE_ARTIFACT` or `LARGE_ARTIFACT` verifies an explicitly restored category without executing tests or modifying evidence.
6. Reconcile actual remaining historical/reference gaps and current source epochs before choosing a verification run. Run the appropriate current tests later under the authorized isolated implementation task; this migration preparation does not run backend, Docker, native, mutation or expensive regeneration suites.

## Scope retained

Migration makes existing evidence portable; it does not make an unavailable dependency available until its actual bytes transfer. It does not convert old passes into current-tree certification, repair failures, or create new approval/label/deployment evidence. Phase 9D-1 remains PARTIAL; Phase 9D-2, project-wide implementation and public generalization remain NOT_STARTED. Production readiness is NO, deployment is NOT_AUTHORIZED, and production shadow, auto-adjudication, consequences and Search rollout remain OFF.
