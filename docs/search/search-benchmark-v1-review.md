# Search Benchmark V1 review

The current **PROPOSED, unfrozen** dataset and readable review packet are in [benchmark-v1/review.md](benchmark-v1/review.md). Start with [the highlighted review subset](benchmark-v1/REVIEW_REQUIRED.md); [the manifest](benchmark-v1/manifest.json) records the current hash and counts. All 360 records need product-owner approval, including the 178 cases derived from frozen specification rules.

The dataset builder is [dataset.js](../../backend/benchmarks/search/dataset.js). There are 320 core records, 40 separately retained exploratory Hindi/Hinglish inputs, 48 core template families and eight exploratory grouping families. The proposed core split is 222 development / 98 held-out, with no family crossing splits. The controlled context is `2026-10-04T12:00:00+05:30`, `Asia/Kolkata`, capability `ride-search-s4`.

The 182 highlighted cases comprise 142 core judgment/ambiguity/unsupported cases and all 40 exploratory inputs. Twenty-one core records involve unresolved omitted-year, weekday, non-IST timezone, or SUV-family policy. Exploratory language semantics are also unreviewed. Resolved timestamps are deliberately not labelled, and language-specific expectations are not invented. The manifest shows the actual mutually exclusive cohort counts.

The proposed split uses `rcs-search-s5-family-split-2026-10-04` to SHA-256-rank actual template families within cohorts. Families remain intact. The dataset hash is an integrity identifier, not proof of human review or freezing. No final Search held-out inference or Search freeze has occurred.

Labels are outside `modelInput`, and all records retain `PROPOSED` / `UNREVIEWED_PROPOSED_SYNTHETIC`. `LABELLED` inside an expected field means a proposed expected value exists; it does **not** mean a human approved it. No Jev/Luna inference was used as ground truth. The standalone location rule follows S3: explicit active field wins; no active field requires target clarification. Named phrases are never treated as authoritative Google geography.

Regenerate the packet with `node scripts/search-s5-review.mjs` from `backend/`. Review corrections first update the authored templates/labels, then regenerate and validate the packet. The final held-out gate requires a matching dataset hash, reviewer identities, timestamp and receipt, plus reviewed provenance, approval and resolved disagreement for every core record. Proposed labels may be used only in explicitly marked development diagnostics. The metric calculator rejects unreviewed held-out labels even in diagnostic mode.
