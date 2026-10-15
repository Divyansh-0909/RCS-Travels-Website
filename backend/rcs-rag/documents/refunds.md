---
document_id: refunds
audience: rider-and-captain
status: operational-reference
verified_on: 2026-10-10
sources:
  - backend/routes/bookings.js
  - backend/services/payments.js
  - backend/services/refundProviderState.js
  - backend/services/ridePayments.ts
  - backend/services/scheduledDepositLifecycle.js
  - frontend/src/constants/legal.js
---
# Refund policy

## Scheduled customer advance refunds

### Fee-free customer cancellation refund

When a captured scheduled advance is eligible for refund and the customer cancels with no cancellation charge, the paid advance is sent through the full-refund flow. No unpaid amount is refunded. Refer to [Cancellation](cancellation-policy.md) for eligibility.

### Charged customer cancellation refund

When a cancellation charge applies, only the calculated charge is retained. The remaining paid advance follows the partial-refund flow. The charge cannot exceed ₹100 or the paid advance. If the whole advance is retained as the applicable charge, there is no refundable balance.

### Captain cancellation while replacement is sought

Captain cancellation reopens the existing booking rather than ending it. The customer's scheduled advance remains with that booking while matching resumes. Do not promise an immediate refund merely because the assigned captain changed. Customer cancellation follows the ordinary refund rules.

## Ride Now refunds

Ride Now does not collect an advance, so cancelling before the trip creates no prepaid cancellation refund. A disputed payment after completion requires the supported payment review process; it is not covered by an automatic scheduled-advance refund.

## Final payment problems

The current final-payment service has refund paths for a captured UPI payment arriving after cash was recorded, or when the required verified captain payout destination is unavailable at capture. Whether a refund is due depends on the actual payment records. Report an incorrect or duplicate payment to support; do not assume every reported issue automatically qualifies.

## Refund status and timing

### Pending and completed refunds

Initiating a refund is different from completing it. A provider pending acknowledgement does not mean money has returned. The system waits for processed confirmation; a failed or unknown outcome requires reconciliation or review. Repeated requests or callbacks should not create another refund for the same operation.

### Pending refund service targets

**Pending:** no approved universal refund-initiation or bank-credit deadline is established by this corpus. Processing depends on provider and banking outcomes. Check the actual payment status or contact support rather than promising a fixed number of days.

## Captain wallet hold returns

A scheduled acceptance hold returns to its original captain when the booking completes or the customer cancels. This is a wallet reservation release, distinct from a customer Razorpay refund. A replacement captain does not receive another captain's held deposit.

## Complaints and compensation refunds

A complaint or AI recommendation is not automatic refund or compensation authorization. Existing authorized compensation and reviewed financial decisions follow their own controls. Preserve any unresolved dispute for human review.
