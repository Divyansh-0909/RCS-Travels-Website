# Indian-source and product review

Review date: 1 November 2026, Asia/Calcutta. This record distinguishes verified
text, incomplete retrieval, product observations and proposed commitments.
It does not provide a complete current-law opinion across all pickup states.

## Verified source findings

- The [DPDP Act](https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf)
  defines children as under 18, addresses consent/withdrawal and individual
  rights, and must be read with commencement. The
  [commencement notification](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf)
  specifies immediate, one-year and eighteen-month phases. The
  [final 2025 Rules](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf),
  rule 1, likewise stage commencement. Consequently the candidates do not say
  every DPDP duty is currently operative. This is a commencement observation,
  not proof that the system meets any applicable requirement.
- The Government's [10 September 2026 consumer-affairs announcement](https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=2308759&lang=2&reg=48)
  says the amended e-commerce rules commence on 1 January 2027. It describes
  complaint copies, NCH convergence and transparency/dark-pattern requirements.
  The full amendment Gazette still needs clause-level inspection. Do not turn
  that alert into a statement that all new rules already apply, that all rules
  fit this proprietorship without analysis, or that RCS is a convergence partner.
- The [13 March UP consultation](https://upidadv.up.gov.in/upload/PublicationRequest/183241/SachivalyaLKO130326Notification639090236220551079.pdf)
  opens by inviting objections. It is a draft, so cannot establish a final
  operative penalty or exemption. Final-state-source reconciliation is open.
- The official [Delhi scheme publication page](https://transport.delhi.gov.in/transport/delhi-motor-vehicle-aggregator-and-delivery-service-provider-scheme-2023-0)
  was located. The [Haryana May 2026 notification entry](https://haryanatransport.gov.in/en/content/aggregator-policy-transport-department-notification-no-13920166ti-dated-21st-may-2026)
  was located but full retrieval failed. Neither establishes that the owner
  operates in that jurisdiction or satisfies its conditions.

## Incomplete primary retrieval

Some direct India Code, consumer rules, SPDI and CERT-In pages timed out or
returned an index/error page. `data/sources.json` records those limits rather
than claiming full-text verification. Search snippets and an official index
are navigation, not a complete rule check. The proposed complaint service
standard is identified as a proposal; no tax rate, numerical retention period
or legal exemption was inferred from inaccessible text.

## Current code observations

These are repository observations, not production verification:

| Subject | Exact source inspected | Consequence for wording |
| --- | --- | --- |
| Customer advance | `backend/services/scheduledPayments.js:14` and financial maths | 10% with rounding; credits can reduce required checkout to zero. |
| Cancellation amount | `backend/services/cancellationPolicy.js:21` | Cap at 10%, Rs 100 and advance paid; valid reasons waive it. |
| Proximity evidence | `backend/services/cancellationLocationEvidence.js:23` | Fresh near-pickup or verified arrived state; do not universally waive a verified-arrival fee just because current location is stale. |
| Captain cancellation | `backend/services/driverRideCancellation.js:6` | Assigned/en-route/arrived supported; returns booking to replacement, not automatic rider refund. |
| Commission | `backend/services/commission.js:3` | 10% eligible post-coupon driving fare at/above Rs 800, with specified pass-through exclusions. |
| Captain scheduled hold | `backend/services/scheduledDeposit.js:1`; `scheduledDepositLifecycle.js:15` | 10% hold; existing holds can survive captain cancellation until the booking terminates. |
| Customer deletion | `backend/routes/users.js:311` | Clears listed profile identifiers and saved places, not all linked records. |
| Captain deletion | `backend/routes/driver.ts:423` | Clears live identifiers/current location; related ride, finance and document history can remain. |
| Payouts | `backend/services/driverPayouts.js:52`; `driverFinance.js:23` | Available balance and verified UPI are distinct from completed provider payout. A provider service in code is not proof of activation. |
| Captain location | `driver-app/src/hooks/useDriverLocation.ts:153` | Background permission/task code exists; native-device execution not observed here. |

Earlier documentation can be stale: the inspected code now has captain
reason-aware cancellation and newer responsibility/notice/appeal services.
Their existence does not verify every operational deadline, sanction or native
flow. Historical findings are retained for reconciliation, not silently closed.

## Clause-to-evidence map

| Candidate | Main basis | Remaining material limits |
| --- | --- | --- |
| 01 Rider Terms | Owner-confirmed identity; booking/payment code; conservative contractual choices | Adult-account policy adoption; full territorial and product alignment. |
| 02 Rider Privacy | Profile/schema/deletion/location/share behaviour; phased DPDP sources | Retention, actual vendor geography and consent/request controls. |
| 03 Refunds | Cancellation, scheduled payment and rematching code | State remedies, terminal missed pickup, provider timing. |
| 04 Rider Grievance | Confirmed contact; proposed service standards; consumer amendment alert | Staffing, full rule scope, complaint records and adoption. |
| 05 Captain Terms | Current cancellation, eligibility and support model | Accepted contract version, operating requirements, current notice/appeal implementation. |
| 06 Captain Privacy | Captain deletion/location/document/payment fields; privacy sources | Retention, provider cleanup, native behaviour and actual processing inventory. |
| 07 Captain Payments | Commission/hold/wallet/payment/payout code | Settlement schedule, provider activation, taxes and mandatory fare conditions. |
| 08 Captain Grievance | Confirmed contact; proposed review standards | Operations, in-app deadlines and legally required procedures. |

The first page of every candidate explicitly says it is not adopted/in effect.
Removing that sentence is not the act of resolving these findings. The
workbench's quotation/text checks cannot give a legal opinion; their precise
limits are included in each response and in README.md.
