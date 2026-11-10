# RCS Travels — candidate retention schedule for review

22 October 2026 IST. Companion to the [approval packet](phase9d-1-retention-hold-policy-review-2026-10-22.md). **Every target below is a working recommendation, not an approved policy or a statement of a statutory period. Nothing is activated.** This supplies concrete review choices instead of treating unspecified durations as decisions.

Rajuddin is the proprietor and the placement/release authority. Divyansh Singh coordinates technical implementation. Qualified Indian counsel/CA must classify applicable legal minima, tax years, due dates, transport obligations, disputes and exceptions before the schedule can be finalized. Google/R2 setup and required data/backup residency remain unverified for production.

## Rules applying to every candidate

- A hold or uncertain hold/copy status blocks deletion. No automatic hold expiry.
- Apply the **latest applicable** approved purpose deadline, statutory minimum, dependent-record deadline and preservation duty. A missing classification/deadline means not eligible, not zero days.
- Separate payloads from identities/commitments, and operational data from necessary tax/accounting records. A shorter online-access window is not proof that restricted/archive copies were erased.
- Do not retire chain/deduplication identities before their dependent replay/verification protocol is approved. Do not delete WAL, provider versions or shared backup keys by ad hoc scripts.
- Minimize fields that are no longer required only after approving the field action and checking all linked copies. A hash is not automatically anonymous.
- Existing historical evidence remains preserved. These proposals do not authorize deleting this repository's artifacts or old backups.

## Concrete targets proposed to Rajuddin, counsel and CA

| ID | Candidate target | Start point and required exceptions |
| --- | --- | --- |
| 1 Booking/account/contact | Keep active-account service fields; review basic closed-account contact after **90 days**. Keep classified trip/invoice fields under the financial rule below. | Account closure and completion of open trips, refunds, complaints and verified rights requests; confirmed legal minima override. |
| 2 Captain identity/vehicle documents | Review abandoned/rejected uploads after **7 days** following reconciliation. Candidate approved/archived-document retention: **3 years after replacement/offboarding**. | Preserve the version in force for relevant rides; transport duties, financial evidence, claims and holds may require longer. Include soft-deleted generations and archived rows. |
| 3 Precise location/routes/device | Candidate raw-location window **30 days** after trip/safety closure; retain only approved derived fields afterward. | Counsel must reconcile each raw/derived class with applicable processing/security requirements; do not assume 30 days permits erasure. |
| 4 Incident/cancellation journals | Candidate **3 years** after final dispute/appeal closure. | Financial, transport, notice and litigation requirements may extend this; preserve original occurrence and approved dependencies. |
| 5 Support/appeal/review text | Candidate **12 months** after final closure for ordinary support text; incident-linked records follow category 4. | Redact unnecessary text where approved; external messaging and backup copies need their own acknowledgements. |
| 6 Minimized export snapshots | Candidate payload review after **90 days** from terminal state **and** closed review/appeal. | Preserve required commitments, uncertainty and all legal/hold exceptions. An ACK alone does not start expiry. |
| 7 Outbox identities/tombstones | Candidate review after **3 years**, with **no automatic identity deletion**. | Must also outlast all dependent replay/receipt obligations; protocol retirement needs separate verification. |
| 8 Transport receipts/receiver work | Candidate **3 years** after final linked-case closure. | Longer dependent-source/custodian/financial obligations win; payload minimization remains a separate field action. |
| 9 Broker requests/attempts/results | Candidate result/commitment retention **3 years** after final case closure; payload review at **90 days**. | UNKNOWN spending, disputes and late authenticated accounting must survive; category 10 may require longer. |
| 10 Usage/accounting/payment links | **Calendar/statutory expression**, not a fixed seconds TTL: latest applicable GST, income-tax, proceeding and hold deadline. | For GST records section 36 uses annual-return due date +72 months, with specified longer proceeding treatment. CA must confirm applicable 2026 income-tax book classes/deadlines and other minima. [Sources in packet](phase9d-1-retention-hold-policy-review-2026-10-22.md) |
| 11 Operations/recovery history | Candidate **1 year** for ordinary minimized technical history; incident-linked portions follow category 4. | Classified financial/idempotency dependencies and covered security/processing minima may extend this. |
| 12 Export queue/retries | Resolve delivery first; candidate archive retention **3 years** after linked-case closure. | No unresolved PENDING/REVIEW evidence is removed to reclaim capacity. Archive verification precedes any retirement. |
| 13 Committed lineage | Candidate **3 years**, or the longer required lifetime of linked evidence/financial records. | Require a reviewed archive/verification protocol; do not break source/head/sequence cross-checks. |
| 14 Independent events/receipts | At least the **longest approved period of all dependent source records**, with a candidate 3-year floor for nonfinancial cases. | Custodian separately acknowledges any lawful minimization/retirement; independence is not waived. |
| 15 Public signing-key epochs | Retain public verification/trust history while **any dependent receipt remains**. No automatic private-key destruction. | Manual signer/key-owner procedure must cover unsigned receipts, compromise history, backup recovery and held records. |
| 16 Denial observations | Candidate **365 days** of minimized security observations. | Incident holds and applicable legal minima override; actual administrator/log location must be verified. |
| 17 DB/service/security logs | Candidate **365 days** for classified security/processing logs; **14 days** for separately classified redacted debug logs only. | Debug classification cannot be used to discard required security/processing evidence. Applicable law and incidents determine minima. |
| 18 Evidence/replay/labels | Existing synthetic evidence: **no automatic deletion**, annual storage review. Future personal labels: candidate **12 months** after campaign/appeal closure. | Separate lawful collection/blind-review approval and hold policy needed before real labels are collected. |
| 19 WAL/index/TOAST/temp/replicas | **Dependency/capacity lifecycle**, not a customer-record age TTL. | Preserve required base-backup/WAL chains; let PostgreSQL own normal WAL/temp lifecycle. Vacuum is not physical erasure; verify replication/archives/restore quarantine. |
| 20 Backups/snapshots/provider copies | Candidate operational tiers: daily **30 days**, weekly **12 weeks**, monthly **12 months**, plus separately classified financial archives for their required term. | Preserve held/unknown-scope generations. Do not assume operational tiers satisfy tax-record minima or required India copies. No real backup deletion until the schedule and provider mechanisms are approved. |

## Approval choices to record

1. Rajuddin can accept, amend or reject each **candidate purpose/target**. Record the exact document version/hash and exceptions.
2. Counsel/CA confirm applicability and legal floors, including India-access/backup requirements where applicable, before approving a deletion eligibility calculation. The proposed targets do not override those floors.
3. Only after the complete copy inventory, authenticated authority, provider/backup controls and restore verification pass should production activation be considered separately.

Current decision: **periods proposed, not approved; no customer deletion, provider lifecycle change or production activation authorized by this document.**
