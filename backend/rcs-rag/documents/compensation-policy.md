---
document_id: compensation-policy
audience: rider-and-captain
status: operational-reference-with-pending-award-policy
verified_on: 2026-10-10
sources:
  - backend/services/responsibilityCompensation.js
  - backend/services/responsibilityFinancialMath.js
  - backend/services/bookingCreation.js
  - backend/services/customerCancellation.js
  - backend/services/rideSettlement.js
  - docs/benchmarks/phase9-financial-lifecycle-checkpoint-2026-10-09.md
---
# Compensation and booking credit policy

## Existing authorized compensation

The booking and settlement services can use a customer's existing compensation entitlement. The availability of that machinery does not establish an entitlement for every complaint or delayed ride. A FAQ or AI recommendation cannot award compensation or authorize a financial consequence.

## Applying compensation to a booking

### Coupon and compensation order

The service applies the ordinary coupon first, then reserves available compensation against the remaining ride obligation. Neither adjustment can make the payable obligation negative. Scheduled advances are calculated from the resulting obligation. Check the actual booking amount and account record; a requested credit is not an available entitlement.

### Compensation reservation and completion

Reserved compensation is attached to the booking so the same balance is not available for simultaneous reuse. Supported completion consumes the applicable reservation once and includes its funding in normal driver settlement. Compensation is distinct from a cash refund, a monthly coupon, and a captain's scheduled acceptance deposit.

## Compensation when the customer cancels

Customer cancellation releases reserved compensation rather than using it to pay the cancellation charge. A paid scheduled advance still follows the separate refund calculation. Do not subtract a cancellation charge from reserved compensation or describe a released credit as a bank refund.

## Pending compensation awards and penalties

**Pending:** universal award amounts, expiry, transferability, cash redemption, award deadlines, and automatic missed-pickup or replacement-failure compensation are not established as live guarantees. Historical financial formulas or synthetic test fixtures do not authorize a new real award. Unsupported incident outcomes require human review and approved policy scope.

## Compensation disputes

Contact support if an existing credit appears missing, incorrectly reserved, or incorrectly consumed. Provide the booking reference and issue through the private support channel. The FAQ corpus cannot determine your actual credit balance or review outcome.
