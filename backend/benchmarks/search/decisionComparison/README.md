# Search decision comparison (experimental, development only)

This package is not imported by any runtime composition root. It implements the
documented TypeSafe System One, OpenAI Decisions and Cloudflare Clef REST shapes.
The existing Jev SDK adapter and Luna Responses fallback remain separate.

From `backend/`, after source changes and offline tests have finished:

```powershell
node --import tsx scripts/search-decision-pilot-prepare.mjs --revision=v4
node scripts/search-decision-account-check.mjs
node --import tsx scripts/search-decision-pilot.mjs --revision=v4
```

The last command is offline by default and writes truthful `NOT_RUN` receipts.
Artifacts use exclusive creation under
`output/search-v1-b1-comparison-2026-11-01/`; never overwrite a registration to
change its questions or selected cases. A new experiment needs a new identity.
`account-check` only makes documented read-only model-discovery GETs, never inference.
The November 1 artifacts already exist; these commands do not overwrite them.
Revision v2 superseded v1 before inference after an English contraction quote
regression fix. Revision v3 adds a pre-inference conditional-destination label
projection correction and explicit settled-correction routing instructions.
All original frozen truth remains unchanged. Prior registrations remain preserved;
their runners reject stale source hashes. Use v3 for the current sources.
V3/v4 artifacts are under `output/search-v1-b1-comparison-2026-11-02/`.
V4 preserves the approved v3 inputs/labels and records the owner's subsequent
free-quota-verification waiver. That waiver is not a verified free allocation.
Its distinct execution mode is `--live --owner-authorized-pilot --revision=v4`,
requiring `owner-authorized-pilot-v4.json` bound to the new plan and unchanged
approved label hash. It retains 72 calls/provider, zero retries and sequential
execution; known tariff must leave room for the next conservative reservation.
Missing usage, excess observed tariff, or a provider error stops that provider.
The owner did not specify a dollar allowance; registered tariff estimates are
agent-imposed operational stops, not guarantees about final billing. No credits
are purchased and no billing settings are changed. Actual invoice effects stay
unknown without account evidence, even when nominal token cost is measured.

The preregistration contains 24 cases and at most 72 inference calls per provider:
one common 26-question batch plus at most two existing-parser calls per case.
No Places or Luna calls occur, including for parser fallbacks. The Level 1 and
Level 2 costs remain separate; a redundant common-task batch is not charged to a
claimed production workflow. Unobserved fallback/Places costs remain unknown.

For an authorized live run, `--live` also requires an additive, independently
verified `verified-no-charge-allocation.json` receipt bound to the exact
`planHash`. Do not generate an approval or account receipt from assumptions.
Its required shape is:

```json
{
  "planHash": "<registered hash>",
  "checkedAt": "<verified account observation timestamp>",
  "expiresAt": "<allocation expiry>",
  "labelReview": {
    "ownerApproved": true,
    "labelArtifactHash": "<unchanged registered label artifact hash>",
    "receiptReference": "<actual owner review receipt for multilingual labels>"
  },
  "providers": {
    "jev": {
      "accountAccessVerified": true,
      "noAdditionalChargeVerified": true,
      "rateLimitsVerified": true,
      "overageDisabled": true,
      "remainingNoChargeUsd": 0,
      "maxRequests": 72,
      "evidenceReference": "<actual account credit/quota and overage-control evidence>"
    }
  }
}
```

The zero balance in this shape is illustrative and **does not pass** the gate.
Each provider needs its own verified allocation, with shared Cloudflare quota
reserved without double counting. The current 16 multilingual labels are frozen
development diagnostics, not human-approved labels; an owner review receipt is
required by the requested primary pilot contract. No such receipt is fabricated.

Live execution is sequential, zero-retry, source-hash checked, request-limited,
and durably claimed once per provider. Any provider error stops that provider.
Credentials come only from the existing environment or backend `.env`, stay in
transport headers, and are excluded from manifests/receipts. Unknown usage is
unknown cost; unreported truncation is not reported as zero truncation.

Official wire references and pricing are linked in the November 1 comparison
checkpoint. Fake test outputs verify protocols only and are never benchmark data.

The subsequent offline alignment work is `search-decision-common-v5-policy-aligned`.
Use `node --import tsx scripts/search-decision-contract-alignment.mjs --analyze`,
`--propose`, or `--verify` from `backend/` for its additive diagnostics/proposal.
It has no live mode, does not read credentials, and removes direct model
missing-field questions in favor of the existing deterministic application policy.
V4 results remain historical. Its registered source snapshot was archived before
these edits; the old live runner now rejects the changed source hashes. The v5
proposal requires policy decisions and new authorization before any inference.
