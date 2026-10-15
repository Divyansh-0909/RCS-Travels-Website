---
document_id: driver-wallet-and-payouts
audience: captain
status: operational-reference
verified_on: 2026-10-10
sources:
  - backend/services/commission.js
  - backend/services/rideSettlement.js
  - backend/services/driverFinance.js
  - backend/services/driverPayouts.js
  - backend/services/scheduledDepositLifecycle.js
  - docs/benchmarks/phase9-financial-lifecycle-checkpoint-2026-10-09.md
---
# Captain wallet, commission, and payout policy

## Commission on completed platform rides

### Commission floor and rate

The current owner-approved base rate is 0% below ₹800 of payable driving fare after coupon, and 10% at or above ₹800. The commission amount is rounded to whole rupees. Eligible commission-free rewards can waive otherwise payable commission. Do not use the superseded 5% rate.

### Pass-through charges and commission

Commission excludes quoted toll, parking where supplied, airport access, and carrier pass-through components. The safer-route surcharge remains part of driving fare. The threshold is tested after coupon on this driving-fare base, not simply on total booking fare.

## Captain wallet settlement

Completion settles applicable commission, coupon reimbursement, and scheduled advance allocations through the wallet. Cash already received directly is distinct from platform-collected UPI earnings. Use the wallet statement and booking payment view to understand actual entries; the headline fare is not necessarily withdrawable wallet balance.

## Scheduled wallet reservations

A 10% acceptance hold requires sufficient available wallet balance. Each captain's hold remains attached to its owner until the booking completes or the customer cancels. Captain cancellation and replacement do not transfer or immediately release that hold. See [Scheduled rides](scheduled-rides.md).

## Wallet debt repayment

The captain finance service provides a debt-repayment flow when the wallet has a negative balance. Repayment is distinct from the rider fare. The actual debt and supported payable amount come from the server, not from a FAQ estimate.

## Payout eligibility and processing

### Verified destination and available balance

The current payout batch service requires a verified UPI payout account, positive available wallet balance of at least ₹1, and no existing pending or processing payout for that captain. It checks the destination and available balance again before provider execution. A changed account or reduced balance can prevent execution.

### Pending payout service schedule

**Pending:** the presence of admin payout batches does not establish a public daily, weekly, instant, or on-demand settlement promise. Provider processing can be pending or fail. Contact support for the actual payout status or disputed entries.

## Responsibility deductions

An incident, complaint, or model recommendation does not itself authorize a wallet penalty. Separately authorized finalized liabilities have controlled recovery paths; do not describe all earnings as automatically subject to an AI decision. Tax, withholding, final contract, and regulatory fare-share terms remain subject to approval.
