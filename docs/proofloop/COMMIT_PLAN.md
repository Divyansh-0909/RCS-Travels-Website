# Proposed evidence migration commit plan

16 October 2026. **No commits or push performed.** Target branch: `codex/proofloop-evidence-migration-20261016`; parent/source baseline: `2ff51e7d9dade932cd21dfe5d836488d4b9a700a`.

The exact ignored-file allowlist is [SAFE_GIT_PATHS.txt](SAFE_GIT_PATHS.txt); individual hashes and grouped paths are in [commit-plan.json](commit-plan.json). These paths are **not staged**. Explicit user review/approval is required before force-adding any of them.

First proposed commit: `docs: inventory Proofloop cloud migration and evidence transfer requirements`, containing only `docs/proofloop/` migration metadata/documentation and `tools/proofloop/verify_migration.py`. Its final staged path list is recorded separately after preparation.

| Following proposed evidence commit | Individual ignored files | Bytes |
| --- | ---: | ---: |
| `evidence: preserve Clerk session revocation` | 107 | 1.52 MiB |
| `evidence: preserve Phase 9A/9B lifecycle replay UI/native` | 690 | 11.21 MiB |
| `evidence: preserve Phase 9C adversarial/application verification` | 1462 | 41.77 MiB |
| `evidence: preserve Phase 9D-1 SQL certification` | 100 | 1.51 MiB |
| `evidence: preserve Phase 9D-1 broker recovery` | 434 | 8.99 MiB |
| `evidence: preserve Phase 9D-1 containment and readiness` | 384 | 4.91 MiB |
| `evidence: preserve Phase 9D-1 custody closure` | 99 | 1.55 MiB |
| `evidence: preserve Phase 9D-1 independent custody` | 123 | 2.21 MiB |
| `evidence: preserve Phase 9D-1 outbox` | 262 | 4.89 MiB |
| `evidence: preserve Phase 9D-1 transport` | 135 | 2.01 MiB |
| `evidence: preserve Planning and documentation` | 13 | 0.97 MiB |
| `evidence: preserve Project-wide applicability and future architecture` | 16 | 0.16 MiB |
| `evidence: preserve Project-wide supporting Search/provider evidence` | 1030 | 7.21 MiB |
| `evidence: preserve Responsibility Phases 1-8 / frozen Jev V5` | 2257 | 15.21 MiB |
| `evidence: preserve Responsibility historical phase audit` | 47 | 0.55 MiB |

Total ignored SAFE_GIT proposal: **7,159 files / 104.67 MiB**.

The 19 pre-existing live source paths, all PRIVATE_ARTIFACT/LARGE_ARTIFACT payloads, excluded/generated output and the independent cloud implementation commit are outside this commit plan. No new `.gitignore` exception is proposed; the `/output/` protection remains.

Before each approved group: recheck original dirty hashes, verify each allowlisted file still matches its index SHA-256, stage only those individual paths with `core.autocrlf=false`, compare staged blob bytes, review names/sizes/secrets and run `git diff --cached --check`. Preserve an immutable evidence file if it has old whitespace; report that finding instead of reformatting its historical bytes.

Push requires explicit approval and must target the separate migration branch. Do not merge, reset, clean, rebase or force-push. Later apply only the reviewed evidence commits to the cloud branch after checking conflicts; never replace the cloud continuation with the older source checkout.

Additional proposed source-preservation commit: `wip: preserve local custody continuation as an unapplied source snapshot`. It contains only `docs/proofloop/local-continuation-20261016.tar.gz` and `docs/proofloop/local-continuation-manifest.json` (19 original files, 93,090 bytes before compression). Their live paths remain unstaged, and no cloud source is overwritten or merged. The documentation commit excludes these two files so the source snapshot remains a separate reviewable commit.

The exact documentation commit has 21 paths (the preparation path list minus the two source-snapshot files), enumerated in `commit-plan.json.documentation_commit`. The snapshot commit has the other two paths. After approval, commit only each group’s explicit paths so other staged groups and the live user edits remain separate. For immutable CRLF evidence, recognize CRLF with `core.whitespace=cr-at-eol`; report findings by filename/count and never dump raw secret-bearing text or reformat historical evidence.
