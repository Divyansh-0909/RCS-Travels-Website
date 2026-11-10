# RCS Travels — retention and hold approval packet

22 October 2026 IST. **Draft for Rajuddin's review; production deletion disabled.** The owner's answers confirm Rajuddin is the legal proprietor and may both place and release legal holds, RCS Travels is GST-registered, and no current legal notice is reported. Those answers do not approve retention periods or establish that no dispute, tax inquiry or other preservation duty can exist.

## 1. Decisions already assigned

| Responsibility | Assigned authority | Activation state |
| --- | --- | --- |
| Legal proprietor / final policy approver | **Rajuddin**, sole proprietor trading as RCS Travels | Named by owner; final schedule approval pending |
| Place a hold | **Rajuddin** | Named authority confirmed; deployed authenticated account binding pending |
| Release a hold | **Rajuddin** | Named authority confirmed; each release needs its own recorded decision |
| Technical implementation, first response, backup key | **Divyansh Singh** | May implement/observe/escalate; cannot approve proprietor-only hold release |
| Independent custodian | **Rajuddin** (earlier records use Rajjudin) | Final separate administration/access handoff still unverified |
| Alert delivery | rcstravels.support@gmail.com → rcstravels.business@gmail.com | Google verification/test delivery pending |

## 2. Concrete hold procedure proposed for approval

1. A preservation request, dispute, incident, tax inquiry or legal notice may trigger review. A formal court notice is not the only reason to preserve records. Rajuddin records a reference and the hash/location of the approval document; avoid customer details in operational logs.
2. Identify the scope and related SQL rows, original journals, driver document archives, every relevant object generation, logs and backup copies. Unknown scope/copy coverage blocks automated minimization; FK navigation alone is not completeness proof.
3. Record the proprietor decision in the current authoritative ledger **before** propagation. Use a unique operation, hold ID and expected epoch. The technical responder then obtains acknowledgements from each required system. Pending acknowledgements remain visible; they are not success.
4. Preserve all held copies. A late hold after one copy was purged stops further automated work, preserves remaining copies and requires manual review. It does not recover erased bytes.
5. Several holds may overlap. Releasing one does not release another. No hold expires automatically; a proposed **30-day review reminder** is an operational recommendation, not expiry or permission to delete.
6. Only Rajuddin may approve release, identifying the particular hold and its current epoch with a new decision reference. The responder cannot release a hold by changing an observation or retrying another operation UUID.
7. Release returns records to **review required**. It does not itself authorize deletion, restart a partially completed deletion or expose restored traffic. Refresh copy inventory, reconcile other holds/retention duties and obtain the required policy decision first.
8. Backups remain encrypted. Preserve the whole backup generation if it contains held records or its scope is unknown. Do not destroy a shared decryption key to erase one record while other held/recoverable records depend on it. Restores stay quarantined until checked against the **current** authority; a restored old ledger is not its own authority.
9. The technical responder escalates partial propagation, missing generations, stale manifests, deletion conflicts and unavailable authority to Rajuddin. Actual external alert delivery remains pending; durable local records are not a delivered email.

**Requested sign-off:** Rajuddin may approve this procedure separately from the category periods below. No database installation, provider hold change, lifecycle rule, production deletion or legal-compliance certification follows automatically from that sign-off.

## 3. Legal-source review and financial-record floor

This is an engineering worksheet for proprietor/counsel/CA review, not a legal opinion.

- **GST:** Section 36 requires covered books/records to remain for at least **72 months from the annual-return due date** for the relevant year. Specified appeals/investigations/proceedings can extend retention until a year after final disposal, where later. It is not a blanket 72-month TTL for all personal data. [CBIC section 36](https://taxinformation.cbic.gov.in/content-page/explore-act/1000306/1000001)
- **Income tax:** The Income-tax Act 2025 commenced on 1 April 2026. Rule 46 of the notified 2026 Rules addresses section 62 books, including electronic access/India backup requirements, seven-tax-year retention for the specified books/documents, and reopened-assessment preservation. The CA must confirm applicability, transitional years and exact record classes; the older 1962-rule assumption must not silently determine the current schedule. [Amended Act](https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf), [notified Rules, Rule 46](https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-03/En-Notified-IT-Rules-2026-20-03-2026.pdf)
- **Security logs:** CERT-In's directions specify rolling 180-day ICT-log retention for covered entities and Indian-jurisdiction preservation. Relevant applicability, log classes and incident-response duties need confirmed operating arrangements. This is not permission to retain every raw customer payload as a log. [CERT-In directions](https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf)
- **DPDP:** Commencement is phased. Rules 3, 5–16, 22–23 are in the eighteen-month group; future Rules 6/8 include one-year retention provisions requiring classification before short deletion periods are chosen. Do not describe every substantive obligation as already commenced on 22 October 2026. [Act commencement](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf), [Rules](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)
- The previously unverified DPDP corrigendum is now read: G.S.R. 892(E), notification 10 December / Gazette issue 11 December 2025, makes the listed textual and schedule corrections. It does not supply a new general retention duration. [Official corrigendum](https://www.meity.gov.in/static/uploads/2025/12/3c7ebbae0e5456f493f486e6845df86b.pdf)

**Proposed financial eligibility expression, not activated:** retain each classified book/supporting record until the latest applicable GST deadline, income-tax deadline, proceeding/hold deadline and other confirmed duty. Missing annual-return due dates, tax-year classification, legal minima or hold status mean **not eligible**, rather than a default fixed number of days. Production provider/backup residency is not approved merely because a location hint says Asia-Pacific.

## 4. Twenty-category schedule awaiting approval

The [source-bound copy worksheet](../../output/phase9d-retention-integration-2026-10-22/policy-proposed.json) accounts for all 51 current application tables and the pipeline/provider candidates. These are lifecycle recommendations; **all production deletion periods remain unset**. The existing 7/90/30-day proposals in older documents are not silently adopted.

| ID / category | Proposed lifecycle / trigger | Decision still needed |
| --- | --- | --- |
| 1 Booking/account/contact | Separate active-service contact from statutory trip/invoice fields; review after account/trip closure | Field-level minimum/maximum periods; dispute exceptions |
| 2 Captain identity/vehicle documents | Active and archived document rows plus all GCS generations; review on replacement/offboarding | Transport/state duties, archived evidence period, object/soft-delete handling |
| 3 Location/routes/device | Minimize precision and access where useful; review after trip/safety need ends | Approved raw/derived-field periods and applicable legal minima |
| 4 Incident/cancellation journals | Preserve original occurrence through review/appeal/hold; do not infer expiry from capture | Case closure trigger, required evidence and archival rules |
| 5 Support/appeal/review text | Restrict raw text; review after final challenge resolution | Redaction, provider copies and exception period |
| 6 Minimized snapshots/export payloads | Use existing terminal cleanup only within approved scope; bind hold checks | Short-lived input policy reconciled with duties/appeals |
| 7 Source outbox identities/tombstones | Retain deduplication/receipt commitments after payload cleanup | Linkability review and safe identity retirement |
| 8 Transport receipts/receiver work | Reconcile source, receiver and custody before retirement | Matching cross-system periods and receipts |
| 9 Broker requests/attempts/results | Preserve uncertainty and advisory-result commitments; terminal minimization remains distinct | Final review/appeal period and accountable late responses |
| 10 Usage/accounting/payment links | Apply classified statutory financial floors and holds | CA-approved tax classes/deadlines and provider obligations |
| 11 Operations/recovery history | Minimized actor/operation history; preserve STOP/idempotency evidence | Logging classification and archive period |
| 12 Export queue/retries | ACK/REVIEW are delivery states, not retention expiry | Hold-aware archive/retirement procedure |
| 13 Committed lineage | Retain source/sequence/head commitments and temporal meaning | Archival/verification protocol and lawful erasure treatment |
| 14 Independent events/receipts | Independently controlled minimized record with retained proof | Custodian policy and coordinated exception/erasure handling |
| 15 Signing-key epochs | Keep verification material while dependent receipts remain | Private-key recovery/destruction and public trust-history schedule |
| 16 Denial observations | Minimized incident/security observations | Covered log period, observation-loss handling and escalation |
| 17 DB/service/security logs | Approved bounded rotation/archive with incident holds | Applicable minima, India-preserved copy and verified alert destination |
| 18 Evidence/replay/labels | Preserve historical source epochs; separate synthetic from future personal labels | Campaign periods, lawful collection and blind-review approvals |
| 19 WAL/index/TOAST/temp/replicas | Treat as residual copies; maintenance is not sanitization | Slot/archive/temp/replica limits and restore controls |
| 20 Backups/snapshots/provider copies | Unique encrypted generations, hold index, current-authority restore quarantine | Rolling schedule, India/other required locations, residual erasure and off-host acceptance |

## 5. Completion state and approvals

**Engineering prepared/tested:** read-only union of reviewed FK/logical references, archived object references, explicit proprietor-only hold/release ledger, overlapping-hold and local-row fences, provider read-only inventory adapters, encrypted backup scope index and current-authority restore check. Test evidence and limitations are in the [integration checkpoint](phase9d-1-retention-integration-checkpoint-2026-10-22.md).

**Not yet approved/verified:** category-specific durations and field actions, qualified counsel/CA review, authenticated production proprietor account binding, complete JSON/pseudonym/provider-copy coverage, live Google/R2 metadata/hold/restore tests and independently administered custody. No provider settings or customer records are changed by this packet. Google/R2 remain pending as instructed.

Approval record to complete: proprietor name **Rajuddin**; procedure version **1**; approved sections; decision reference/date; counsel/CA references for relevant periods; exact approved document hash; exceptions. Until recorded, procedure sign-off is **PENDING** and category schedule sign-off is **PENDING**. Production remains **OFF**.
