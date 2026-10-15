# Recovered historical Product Spec V1 and verification matrix

Recovered on 9 October 2026 from the saved project chat. Original response: 2026-09-23T10:14:51.434Z; JSONL line 824; source SHA256 b4e627457c25815dc3a8f9d099d3f07fa8e899cf0ca4164880cb39c3fcfc7c4b. The next owner task P1-ORIGINAL explicitly adopts this frozen specification and matrix.

This is a historical source copy, not a new policy amendment or an assertion of completed product implementation. Original numeric candidates/configurable operational targets and limitations are preserved.

---

## A. Final contradiction check

No unresolved product contradiction remains. The final rules are internally compatible.

1. **Compensation, advance, coupons, and cancellations**

A separate compensation ledger supports all required behavior:

- Calculate ordinary ride economics first, including any normal coupon.
- Reserve compensation against the remaining customer obligation.
- Calculate the scheduled advance from the resulting amount the customer must pay.
- Consume compensation only when the ride completes.
- Release reserved compensation if the booking is cancelled, expires, payment fails, or otherwise does not complete.
- Never consume compensation to pay a cancellation charge.
- Multiple compensation entitlements are allocated oldest first and remain individually auditable.

Compensation therefore remains separate from coupons, refunds, and customer payments.

2. **Full next-driver settlement**

The accounting identity is valid:

```text
normal ride value
=
customer payment
+ ordinary coupon funding, if any
+ RCS compensation contribution
```

The driver’s gross earning and commission calculation remain exactly what they would have been without responsibility compensation.

For a cash ride using compensation, the customer gives the driver the reduced cash amount and RCS credits the driver with the compensation contribution. For a platform-paid ride, the payout includes both components.

The current implementation does not yet perform this complete settlement. In particular, the scheduled advance is collected but is not represented as part of the completing driver’s settlement in [rideSettlement.js](D:/Downloads/Repos/RCS-Travels-Website/backend/services/rideSettlement.js:66). This is an implementation gap.

3. **Liability collection separation**

The following remain separate:

- Gross ride earning.
- Commission.
- Driver-liability deduction.
- Net payout.
- Cash received directly.
- Strike/conduct record.
- Customer compensation.
- RCS temporary funding and later recovery.

A cash ride does not collect liability. A platform-controlled earning may collect it. Neither changes the original gross earning.

4. **Mandatory verified payout destination**

This does not conflict with customers choosing cash. The verified account is an operational eligibility and future-settlement requirement.

The current code does not enforce it at online, candidate, offer, or acceptance boundaries. Those are implementation gaps.

5. **Payout replacement**

Keeping Account A active while Account B is pending creates no product contradiction while A remains valid.

If A becomes compromised or unusable:

- It stops being considered a valid verified destination.
- New work may be blocked until a replacement is verified.
- Existing rides enter the approved safe recovery process.
- Outstanding liability remains attached to the driver’s persistent financial identity.

The current one-field payout model overwrites A immediately and clears verification in [driverFinance.js](D:/Downloads/Repos/RCS-Travels-Website/backend/services/driverFinance.js:68). That conflicts with the target architecture but does not invalidate the product rule.

6. **Liability evasion**

Current attack surfaces include:

- Self-service payout replacement.
- Admin verification changes.
- Account deletion while financial state remains.
- Re-registering as a new driver after deletion.
- Admin wallet adjustments and repairs.
- Payout changes while a payout batch is open.
- Social pressure on customers to choose cash.

The target invariant resolves the product question: liability follows the persistent driver financial identity and survives payout changes, account deactivation, deletion requests, and re-registration. Identity linking and enforcement remain engineering work.

7. **Appeal and review timing**

The 24-hour appeal rule is precise and internally consistent. A proposed operational review SLA of **two business days after the evidence bundle becomes review-ready** is retained as configurable operational policy.

Immediate customer recovery never waits for this SLA.

8. **Existing documentation conflicts**

Repository legal/catalog text still contains superseded cancellation and strike rules, including a fifth-cancellation suspension statement in [legal.json](D:/Downloads/Repos/RCS-Travels-Website/shared/i18n/locales/en/legal.json:352). This is a documentation migration requirement.

## B. Final updated decisions incorporated

### Compensation entitlement lifecycle

At `FINAL_UPHELD`, atomically create:

```text
driver liability =
min(10% of authoritative fare, ₹100)

customer compensation entitlement =
driver liability
```

The entitlement:

- Is available immediately.
- Is funded by RCS until driver recovery occurs.
- Does not expire in Product Spec V1.
- Is not a promotional coupon.
- Is not a refund.
- Is not funded by the next driver.
- Cannot be transferred or converted to cash under V1.
- Applies to the next eligible customer-booked RCS ride whose fare is locked after the entitlement becomes available.

### Compensation reservation and consumption

```text
AVAILABLE
↓ booking fare locked
RESERVED
↓ ride completes
CONSUMED
```

Alternative paths:

```text
RESERVED
↓ booking cancelled / payment fails / booking expires
AVAILABLE
```

Rules:

- Existing coupon rules run first.
- Compensation applies to the remaining customer fare obligation.
- Reservations may draw from multiple entitlements, oldest first.
- Every reservation records its entitlement allocations.
- Completion consumes only the amount actually used.
- Excess reservation returns to available.
- Cancellation releases the reservation in full.
- Compensation does not pay customer cancellation charges.
- A retry cannot reserve or consume twice.

For a scheduled ride:

```text
normal economics after ordinary coupon
− reserved responsibility compensation
=
customer payment obligation

scheduled advance =
10% of customer payment obligation
```

The completing driver’s economics continue to use the normal ride value before responsibility compensation.

### RCS funding and recovery

At entitlement creation:

```text
driver receivable                  ₹80
customer compensation obligation   ₹80
```

At consumption:

```text
RCS contribution to next ride      ₹50
remaining customer entitlement     ₹30
```

At collection from Driver A:

```text
driver receivable collected
↓
RCS recovery / restricted compensation funding
```

Collected money is not paid again to the next driver. It reimburses RCS or backs the customer’s still-unused entitlement.

### Scheduled advance and completing driver

The customer’s advance is part of the ride payment. It must ultimately belong to the driver who completes the ride, even if that driver differs from the first assigned driver.

Target settlement must reconcile:

```text
customer advance
+ customer final payment/cash
+ coupon reimbursement
+ RCS responsibility-compensation contribution
=
normal ride settlement sources
```

The replacement/completing driver’s settlement cannot omit the advance or inherit another driver’s liability.

### Appeal timing

- Appeal window: **24 continuous calendar hours**.
- Clock starts only after successful provisional-adverse-notice delivery is recorded.
- Failed delivery does not start the clock.
- An appeal submitted before the exact deadline is accepted.
- A normal appeal after the deadline is expired.
- Exceptional correction remains available for later proven errors.

### Review SLA

Initial operational configuration:

- Automated evidence/AI processing target: 15 minutes after required evidence is available.
- Admin review target: two business days.
- Appeal review target: two business days after appeal evidence is complete.

These are operational values and may be tuned without reopening product structure.

### Mandatory payout account

Every operational driver must have an active verified payout destination.

Without one, the driver cannot:

- Go online.
- Enter dispatch candidate sets.
- Receive new assignments.
- Accept Ride Now requests.
- Accept scheduled offers.

A driver may still inspect account history, resolve verification, appeal cases, or finish an already-started ride through the safe recovery flow.

### Payout replacement

Normal replacement:

```text
A = ACTIVE_VERIFIED
B = PENDING_VERIFICATION
↓
B verified
↓
B = ACTIVE_VERIFIED
A = RETIRED
```

Submitting B does not alter A.

Already-created payout and accepted-ride settlement records retain a versioned destination snapshot where safe. Provider execution must validate that the snapshot remains authorized and usable.

### Outstanding-liability lock

When finalized outstanding liability is greater than ₹0:

- Self-service active-account removal is blocked.
- Self-service replacement is blocked.
- Alternate endpoints cannot bypass the lock.
- Driver deletion or re-registration cannot detach the liability.
- Admin-assisted replacement remains available for a genuine account problem.
- Liability alone does not prevent work while a valid verified destination remains active.

### Exceptional reversal

A reversal:

- Preserves the original final decision.
- Creates a superseding correction.
- Cancels uncollected liability.
- Restores collected liability with corrective ledger entries.
- Reverses the incident strike.
- Leaves all issued and unused customer compensation intact.
- Makes RCS responsible for the resulting cost.

## C. Product freeze status

Product policy is now complete. Numeric verification candidates and the operational review SLA may change through verification without reopening Product Spec V1.

## D. Full verification matrix

Legend:

- **Method:** `UT` unit, `DB` database integration, `API` endpoint integration, `CON` concurrency, `CT` provider contract, `SIM` scenario simulator, `MON` production monitor.
- **Dependencies:** `T` controlled time, `Ext` external system, `Mock` external mocking acceptable, `Contract` provider contract test, `Sim` simulator needed, `Prod` production monitoring needed.
- Candidate values: fixed feasibility buffer 10m; proportional buffer 20%; uncertainty +5m up to 15m; location fresh ≤60s/moderate ≤120s/stale >120s; route cache 2m/5m; owner 20% capped 30m; RCS 30% capped 60m; collapse 60m; reconnect 3m; ETA +5m and +20%; near pickup 5m; progress 30%, minimum 3m, maximum 20m; monitoring T−60/T−30/T−15; reminders T−12h/T−30m.

| ID | Category / requirement and risk | Setup | Action | Expected outcome | Method | Existing coverage / missing coverage | Values and dependencies |
|---|---|---|---|---|---|---|---|
| VM-001 | 1. Scheduled booking bounds; invalid timing could create impossible rides | Customer has valid route/fare | Book at 29m, 30m, 7d, and beyond 7d | Only approved boundary values succeed | UT, API | WhatsApp bounds covered; website endpoint missing | T:Y · Ext:N · Mock:N · Contract:N · Sim:N · Prod:Y |
| VM-002 | 1. Advance arithmetic; wrong amount over/undercharges | ₹1,000, coupon variants and rounding fares | Create scheduled obligation | Advance is exactly 10% of post-coupon/post-compensation customer obligation | UT, DB | `scheduledCustomerPayments.test.js`; compensation missing | T:N · Ext:N · Sim:N · Prod:Y |
| VM-003 | 1. Payment/booking atomicity; captured money may lack booking state | Advance captured while confirmation fails/retries | Deliver capture twice and inject transaction failure | One confirmation or durable refund-required state; no duplicate money | DB, CON, CT | Payment/webhook tests partial | T:N · Ext:Razorpay · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-004 | 2. Feasibility at acceptance; physically impossible assignment | Driver ETA and remaining pickup time vary | Evaluate candidate at exact buffer boundaries | Accept only when ETA plus fixed, proportional and uncertainty buffers fit | UT, property | Missing | Fixed10 · Prop20% · Uncertainty5/cap15 · Ext:Routes · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-005 | 2. Unknown route/location must fail safely | Fresh, moderate, stale GPS; cached/missing route | Attempt eligibility/acceptance | Fresh normal; moderate conservative refresh; stale/unsupported waits | UT, DB, CT | Location freshness partial | GPS60/120 · Cache2/5 · Ext:GPS/Routes · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-006 | 3. Complete commitment chain; overlap can strand riders | Current, candidate, prior and next commitments | Insert candidate ride into schedule | Whole chain including reposition and buffers remains feasible | UT, property | Pooling only; temporal chain missing | T:Y · Ext:Routes · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-007 | 3. Sharing and time feasibility remain separate | Sharing-compatible route but impossible timing | Evaluate assignment | Rejected for time despite spatial compatibility | UT, DB | `ridePooling.test.js` spatial only | T:Y · Ext:Routes · Mock:Y · Sim:N · Prod:Y |
| VM-008 | 4. Stable assignment-cycle deadlines; recomputation changes priority unfairly | Book 6h, 3h, 90m before pickup | Start/retry worker repeatedly | `assignmentCycleStartedAt`, `ownerUntil`, `rcsUntil`, `allDriversAt` stay fixed | UT, DB, CON | Legacy dispatch timing only | Owner20%/30m · RCS30%/60m · T:Y · Sim:N · Prod:Y |
| VM-009 | 5. Short-notice priority collapse; staged waits can make pickup impossible | Book at 45m and 60m boundary | Start assignment | All eligible categories open immediately at approved threshold | UT, DB | Missing | Collapse60m · T:Y · Sim:N · Prod:Y |
| VM-010 | 6. Offer escalation; unresolved old offers must not stop later groups | Owner offer pending beyond owner window | Advance clock into RCS/all-driver windows | Later groups receive offers; earlier offer remains but must revalidate | DB, CON | `dispatch.test.js` currently encodes blocking behavior | T:Y · Ext:Push · Mock:Y · Sim:Y · Prod:Y |
| VM-011 | 6. Offer lifecycle and first-accept-wins | Multiple groups and competing pending offers | Reject, expire, withdraw, then concurrent accepts | Exactly one winner; all competing offers withdrawn; no lost capacity | DB, API, CON | Critical transaction guards partial; full scheduled flow missing | T:Y · Ext:Push · Mock:Y · Sim:N · Prod:Y |
| VM-012 | 7. Acceptance-time revalidation; stale offers can become impossible | Offer was valid, then location/commitment/account changes | Driver accepts old offer | All eligibility, feasibility, capacity, online and payout checks rerun | API, DB, CON | Capacity/pooling partial; time/payout missing | T:Y · Ext:Routes · Mock:Y · Sim:N · Prod:Y |
| VM-013 | 8. Scheduled online requirement | Accepted driver approaches `max(assignedAt,T−30m)` | Stay offline, reconnect, cross deadline | Warnings/evidence follow policy; no premature blame | UT, DB, SIM | General online readiness only | Lead30m · T:Y · Ext:Push/WA · Mock:Y · Sim:Y · Prod:Y |
| VM-014 | 8/27. Verified payout eligibility | Driver approved but no verified payout account | Go online, enter candidates, accept both ride types | Every new-work boundary blocks consistently | API, DB | Final-payment UPI tests only | T:N · Ext:Payout verification · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-015 | 9. Connectivity recovery; unknown must not become fault | Driver loses connection temporarily after acceptance | Wait 2m, 3m, beyond 3m and reconnect | Grace applied; evidence preserved; uncertainty escalates without automatic fault | UT, DB, SIM | Missing | Reconnect3m · T:Y · Ext:Connectivity · Mock:Y · Sim:Y · Prod:Y |
| VM-016 | 10. ETA deterioration | ETA examples: absolute only, proportional only, both, neither | Update ETA history | Material only when +5m and +20%; near-pickup branch handled at 5m | UT, property, SIM | Missing | Abs5m · Prop20% · Near5m · Ext:Routes · Mock:Y · Contract:Y · Sim:Y · Prod:Y |
| VM-017 | 11. Reminder scheduling | Booking ≥24h ahead and short-notice variants | Advance through reminder times with duplicate worker ticks | App+WhatsApp sends once at eligible T−12h and T−30m | DB, CON, CT | Template tests only; timing missing | T−12h/T−30m · T:Y · Ext:WA/Push · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-018 | 12. Unassigned customer cancellation | No driver assigned | Customer cancels | No driver charge/credit; customer advance handled by ride policy | DB, API | Cancellation partial | T:Y · Ext:Razorpay · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-019 | 12. Customer qualifying late cancellation | Assigned driver operationally committed/at pickup | Cancel with waived and non-waived reasons | Correct 10% cap ₹100 charge/refund; assigned driver gets applicable amount once | UT, DB, CON | `cancellationPolicy`, `criticalRideTransactions` partial | T:Y · Ext:Razorpay · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-020 | 13. Driver cancellation more than 1h before pickup | Feasible accepted ride, cancellation at T−61m | Driver cancels | ₹0 liability, no strike, redispatch begins | DB, API | Existing tests encode conflicting strike behavior | T:Y · Ext:N · Sim:N · Prod:Y |
| VM-021 | 13. Driver cancellation within 1h | Feasible assignment with varying progress/reasons | Cancel before/after commitment threshold | Responsibility case created; no immediate punishment; progress evidence correct | UT, DB, property | Missing | Progress30%/min3/max20 · Near5m · T:Y · Ext:Routes · Mock:Y · Sim:Y · Prod:Y |
| VM-022 | 14. Failed pickup classification | Driver, platform, waived and uncertain evidence bundles | Trigger pickup failure | Correct classification path; only final driver-caused case can create liability/strike | DB, AI fixture | Missing | T:Y · Ext:GPS/Routes/AI · Mock:Y · Contract:Y · Sim:Y · Prod:Y |
| VM-023 | 15. Customer replacement request | Driver exceeds frozen pickup deadline + grace | Request another driver | Same booking identity; old offers withdrawn; capacity restored; scheduled policy restarts | DB, API, CON | `driverDelay.test.js` and cancellation race partial | T:Y · Ext:Push/WA · Mock:Y · Sim:Y · Prod:Y |
| VM-024 | 15. Replacement-driver protection | Driver A causes failure; Driver B accepts | Complete replacement ride | Driver B receives full independent economics | DB, ledger integration | Missing | T:Y · Ext:Payments · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-025 | 16. Later pickup | No feasible original-time replacement | Offer later pickup and customer chooses accept/decline | Accepted time persists and redispatches, or customer receives approved refund | DB, API, SIM | Missing | T:Y · Ext:Routes/notifications · Mock:Y · Sim:Y · Prod:Y |
| VM-026 | 17. Deterministic evidence | Facts contain stale/missing/conflicting fields | Build case evidence bundle twice | Same normalized facts, provenance, timestamps and explicit unknowns | UT, DB | Missing | T:Y · Ext:GPS/Routes/WX · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-027 | 18. AI structured output | Valid, malformed and fact-inventing outputs | Run schema/parser | Valid result accepted; malformed/invented facts rejected or marked inference | UT, AI contract | Vehicle classifier pattern only | T:N · Ext:AI · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-028 | 18/19. Missing evidence gate — Scenario J | AI says `DRIVER_CAUSED`, mandatory evidence absent | Run deterministic policy | `NEEDS_ADMIN_REVIEW`; no money/strike moves | UT, DB | Missing | T:N · Ext:AI mocked · Mock:Y · Contract:N · Sim:N · Prod:Y |
| VM-029 | 19. Auto waive/uphold gates | Clear platform, clear waiver, clear allowed driver case, ambiguous case | Evaluate policy | Only allowlisted/evidenced cases auto-resolve; ambiguity escalates | UT, decision table | Missing | T:N · Ext:N · Sim:N · Prod:Y |
| VM-030 | 20. Appeal timing — Scenario I | Successful notice at a known instant | Appeal at 23h, 24h boundary, 25h; repeat failed delivery | Before deadline accepted; after expired; failed delivery starts no clock | UT, DB, API | Missing | Appeal24h · T:Y · Ext:Notification delivery · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-031 | 20. Whole-case appeal review | Original evidence plus new driver evidence | Re-run AI and deterministic policy | Entire case reconsidered; contradictory/uncertain result goes admin | AI fixture, DB | Missing | SLA2 business days · T:Y · Ext:AI · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-032 | 21. Strike policy | Final Level 0/1/2 cases at thresholds | Finalize cases and retry | Only Level 2 adds one strike; 5 upheld →7-day block; 7 upheld →indefinite | DB, CON | Current `conductStrikes` tests conflict | T:Y · Ext:N · Sim:N · Prod:Y |
| VM-033 | 22. Liability formula/final gate | ₹800, ₹1,500 and unresolved cases | Provisional and final transitions | ₹80/₹100 only after final; one liability per incident | UT, DB, CON | Missing | T:Y · Ext:N · Sim:N · Prod:Y |
| VM-034 | 22. Liability does not block work | Finalized liability with valid payout destination and no strike block | Go online and accept | Work remains allowed; collection occurs only through eligible payout | API, DB | Missing; legacy balance semantics conflict | T:N · Ext:N · Sim:N · Prod:Y |
| VM-035 | 23. Compensation creation | Final Level 1/2 and waived cases | Finalize repeatedly | Equal entitlement created once only for `FINAL_UPHELD` | DB, CON | Missing | T:N · Ext:N · Sim:N · Prod:Y |
| VM-036 | 24. RCS-fronted compensation — Scenarios A/K | Driver liability uncollected; customer books next ride | Reserve and complete ride | Compensation usable; RCS funds it; receivable remains | DB, ledger integration | Missing | T:Y · Ext:Payments · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-037 | 25. Partial consumption — Scenario B | ₹80 entitlement; ₹50 eligible fare | Reserve and complete | Customer pays ₹0; ₹50 consumed; ₹30 remains | UT, DB | Missing | T:N · Ext:N · Sim:N · Prod:Y |
| VM-038 | 25. Cancel compensation booking — Scenario C | Compensation reserved on next booking | Cancel/payment fail/expire | Reservation released; no entitlement value lost | DB, CON | Missing | T:Y · Ext:Razorpay for refund · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-039 | 25. Coupons and multiple balances | Coupon plus two compensation entitlements | Price, reserve, complete | Existing coupon economics first; compensation allocations FIFO and separate | UT, property, DB | Coupon tests reusable; compensation missing | T:N · Ext:N · Sim:N · Prod:Y |
| VM-040 | 26. Cash liability carry-forward | Driver A owes ₹100 and completes consecutive cash rides | Record cash settlements | Liability remains ₹100; gross cash economics unchanged | DB | Cash settlement exists; liability missing | T:N · Ext:N · Sim:N · Prod:Y |
| VM-041 | 26. Platform recovery — Scenario D | Liability ₹100; controlled earnings ₹60 then ₹100 | Execute payouts | Deduct ₹60 then ₹40; gross preserved; no overcollection | DB, CON, CT | Payout foundation only | T:N · Ext:RazorpayX · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-042 | 27. Mandatory UPI — Scenario G | No verified destination, then verification succeeds | Online/dispatch/accept before and after | Blocked everywhere before; permitted after verification | API, DB | Missing | T:N · Ext:Verification provider/admin · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-043 | 28. Normal replacement — Scenario H | A verified; submit B | Verify B while rides/payouts exist | A stays active until atomic promotion; accepted ride retains option | DB, API, CON, CT | Current behavior conflicts | T:Y · Ext:RazorpayX · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-044 | 28. Genuine account failure — Scenario F | Liability exists; A reported unusable | Admin replaces and verifies B | A safely disabled; B activated; liability and history preserved | DB, API, CT | Missing | T:Y · Ext:RazorpayX · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-045 | 29. Liability change lock — Scenario E | Outstanding finalized liability | Try self-service replacement/removal | Rejected; liability unchanged; audit event recorded | API, DB | Missing | T:N · Ext:N · Sim:N · Prod:Y |
| VM-046 | 29. Accepted ride payment-option preservation | Accepted ride bound to valid A; driver submits B | Poll status/create UPI order | Existing ride retains valid versioned configuration | API, DB, CT | Existing test currently expects refund after verification disappears | T:Y · Ext:Razorpay · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-047 | 29. Deletion/recreation evasion | Liability/open payout on old driver identity | Delete and register again | Deletion restricted or financial identity relinked; liability survives | API, DB, security | Missing | T:N · Ext:Clerk · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-048 | 30. Ledger idempotency | Duplicate finalization, compensation, collection and webhook jobs | Run concurrently/retry | One business entry per deterministic event; balances reconcile | DB, CON | Wallet/payment keys reusable; new ledgers missing | T:N · Ext:Payments mocked · Mock:Y · Sim:N · Prod:Y |
| VM-049 | 30. Final-state/model immutability | Final case plus later differing model output | Re-run analysis and finalizer | Analysis may be stored, but final state/money/strike remain unchanged | DB, AI fixture, CON | Missing | T:N · Ext:AI · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-050 | 31. Exceptional reversal — Scenario L | Final upheld; compensation partly/fully used; liability partly collected | Authorize correction twice | Driver restored once; strike reversed; customer keeps entitlement; RCS absorbs | DB, CON | Payout reversal pattern only | T:Y · Ext:Payout provider optional · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-051 | 32. Checkpoints and reconciliation | Active ride/case/ledger records with injected stuck states | Run T−60/T−30/T−15 and reconciliation jobs | Alerts once; stale states detected; no automatic blame | DB, MON | Job registry only | Monitor60/30/15 · T:Y · Ext:WA/Push · Mock:Y · Contract:Y · Sim:N · Prod:Y |
| VM-052 | Full Scenario A | Driver A failure → final → ₹80 comp → ₹400 ride with Driver B → later A payout | Execute entire deterministic chain | Customer pays ₹320; B settles on ₹400; A later repays ₹80 to RCS | DB E2E, CON; SIM presentation later | Missing | T:Y · Ext:Razorpay/RazorpayX/AI · Mock:Y · Contract:Y · Sim:Optional · Prod:Y |

## E. Existing tests that can be reused

Useful foundations include:

- Scheduled advance arithmetic and payment transitions: [scheduledCustomerPayments.test.js](D:/Downloads/Repos/RCS-Travels-Website/backend/tests/scheduledCustomerPayments.test.js:6).
- Payment, webhook, duplicate delivery, and refunds: [payments.test.js](D:/Downloads/Repos/RCS-Travels-Website/backend/tests/payments.test.js:68).
- Final cash/UPI settlement and payout-verification races: [ridePayments.test.js](D:/Downloads/Repos/RCS-Travels-Website/backend/tests/ridePayments.test.js:159).
- Current dispatch escalation logic: [dispatch.test.js](D:/Downloads/Repos/RCS-Travels-Website/backend/tests/dispatch.test.js:26).
- Pooling geometry, capacity, and route ordering: [ridePooling.test.js](D:/Downloads/Repos/RCS-Travels-Website/backend/tests/ridePooling.test.js:117).
- Online/location readiness: [driverAvailability.test.js](D:/Downloads/Repos/RCS-Travels-Website/backend/tests/driverAvailability.test.js:9).
- Cancellation races and once-only capacity/wallet effects: [criticalRideTransactions.test.js](D:/Downloads/Repos/RCS-Travels-Website/backend/tests/criticalRideTransactions.test.js:113).
- Customer cancellation percentage, cap, and waivers: [cancellationPolicy.test.js](D:/Downloads/Repos/RCS-Travels-Website/backend/tests/cancellationPolicy.test.js:17).
- Delay boundary behavior: [driverDelay.test.js](D:/Downloads/Repos/RCS-Travels-Website/backend/tests/driverDelay.test.js:13).
- Wallet idempotency keys and accounting derivation: [walletMoney.test.js](D:/Downloads/Repos/RCS-Travels-Website/backend/tests/walletMoney.test.js:68).
- Job authentication and registry behavior: [internalJobs.test.js](D:/Downloads/Repos/RCS-Travels-Website/backend/tests/internalJobs.test.js:69).
- Structured AI parsing patterns: [classifyVehicle.test.js](D:/Downloads/Repos/RCS-Travels-Website/backend/tests/classifyVehicle.test.js:25).

Some existing tests deliberately encode superseded behavior:

- Three-strike/three-day blocking in [conductStrikes.test.js](D:/Downloads/Repos/RCS-Travels-Website/backend/tests/conductStrikes.test.js:38).
- Scheduled acceptance deposit expectations in [walletMoney.test.js](D:/Downloads/Repos/RCS-Travels-Website/backend/tests/walletMoney.test.js:134).
- Immediate payout-UPI replacement behavior and capture refund assumptions in [ridePayments.test.js](D:/Downloads/Repos/RCS-Travels-Website/backend/tests/ridePayments.test.js:239).

These become migration tests or must be replaced when production implementation begins.

## F. Missing verification infrastructure

Required before implementing the full behavior:

1. **Controlled clock**

   Must control booking, assignment, offer, reminder, ETA, appeal, and review deadlines without wall-clock waiting.

2. **Scheduled-ride fixture builder**

   Creates customers, drivers, vehicles, locations, payout accounts, bookings, offers, commitments, payments, and assignment-cycle snapshots.

3. **Isolated database integration harness**

   Supports transactions, rollback, concurrent workers, unique-key races, and retry injection.

4. **Routing/GPS/weather evidence adapters**

   Deterministic fixtures for fresh, stale, inaccurate, unavailable, and contradictory evidence.

5. **Payment and payout provider fakes**

   Razorpay and RazorpayX behavior for capture, duplicate webhooks, partial refunds, payout failures, reversals, and idempotency.

6. **Notification delivery sink**

   Records push/WhatsApp success and failure so the 24-hour appeal clock can be tested from successful delivery.

7. **Responsibility-case fixture engine**

   Produces immutable evidence bundles, analysis runs, policy versions, appeals, and final decisions.

8. **AI analyst contract harness**

   Tests structured schema, missing evidence, fabricated facts, disagreement, malformed results, model versioning, and deterministic policy rejection.

9. **Financial invariant checker**

   Reconciles customer obligation, advance, final payment, coupons, compensation contribution, driver gross, commission, liability deduction, payout, and RCS funding.

10. **Concurrency/idempotency runner**

   Replays jobs, webhooks, finalization, compensation reservation, payout deduction, and correction simultaneously.

11. **Provider contract suite**

   Confirms Razorpay/RazorpayX idempotency, destination snapshots, replacement-account behavior, refund reconciliation, and payout reversal semantics.

12. **Production reconciliation readers**

   Read-only checks for stuck payments, unmatched compensation, liability overcollection, payout drift, and case-state anomalies.

## G. Scenarios requiring simulator

Most financial and adjudication rules should use deterministic unit and database integration tests.

A scenario simulator is justified for:

- Assignment stages evolving across hours while drivers move, accept other work, go offline, and reconnect.
- Full current/prior/candidate/next commitment feasibility with changing traffic.
- ETA deterioration and near-pickup behavior using evolving route data.
- Customer replacement, multiple competing drivers, later pickup, and delayed notifications.
- Mobile connectivity loss combined with warnings, retries, and GPS recovery.
- A complete customer → dispatch → driver → recovery → adjudication timeline shown across actors.

The required financial Scenarios B–L do not inherently require a simulator. They should first be deterministic integration and concurrency tests. Scenario A can also be automated as an integration chain; the simulator would provide an understandable visual replay later.

## H. Production monitoring requirements

Production monitoring remains necessary for behavior that mocks cannot prove:

- Scheduled assignment job heartbeat, duration, and missed executions.
- Bookings approaching T−60/T−30/T−15 without feasible assignment.
- Assignment-stage timing and category escalation.
- Offer delivery, expiry, acceptance, and stale-offer rejection.
- GPS freshness and routing-provider availability.
- Driver online and payout-verification eligibility drift.
- Reminder and provisional-decision notice delivery.
- Appeal deadlines and overdue admin-review queues.
- AI schema failures, unsupported facts, confidence distribution, and model-version drift.
- Compensation issued, reserved, consumed, released, and unreconciled.
- RCS-fronted compensation versus responsible-driver recovery.
- Liability balances, partial collections, and overcollection attempts.
- Cash-heavy behavior after liability finalization.
- Payout-account changes, failed replacement verification, and deletion/re-registration attempts.
- Gross earning, commission, liability deduction, and net payout reconciliation.
- Refunds left without a gateway identifier.
- Duplicate case, liability, compensation, strike, or correction attempts.
- Exceptional reversals and unreconciled corrective entries.

## I. Recommended order to build verification infrastructure

1. Controlled clock and scheduled-ride fixture builder.
2. Isolated database integration and concurrency harness.
3. Financial invariant checker and ledger fixtures.
4. Payment/payout fakes and provider contract suite.
5. Routing, GPS, connectivity, weather, and notification adapters.
6. Responsibility evidence-bundle builder.
7. AI structured-output and deterministic-policy harness.
8. Appeal/finalization/idempotency test framework.
9. Production reconciliation queries and invariant monitors.
10. Multi-actor scenario simulator for the limited scenarios identified above.

No production code, tests, or simulator were modified or created in this step.

PRODUCT SPEC V1 FROZEN: YES

REMAINING PRODUCT DECISIONS:
None. Numeric verification candidates and the operational review SLA remain configurable.

READY TO BUILD VERIFICATION INFRASTRUCTURE: YES

READY TO MODIFY PRODUCTION BEHAVIOR: NO