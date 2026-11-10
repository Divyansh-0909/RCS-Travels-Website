---
document_id: cancellation-policy
audience: rider-and-captain
status: operational-reference
verified_on: 2026-10-10
sources:
  - backend/services/cancellationPolicy.js
  - backend/services/cancellationLocationEvidence.js
  - backend/services/customerCancellation.js
  - backend/services/driverRideCancellation.js
  - backend/routes/bookings.js
  - backend/routes/driver.ts
  - frontend/src/constants/cancellation.js
---
# Cancellation policy

## Customer cancellation eligibility

The supported customer cancellation states are pending, payment pending, confirmed, assigned, en route, and reached. Started or terminal rides cannot use ordinary self-cancellation; contact support for an ongoing-trip issue. The server checks the booking's current state.

## Ride Now cancellation charges

Ride Now has no prepaid customer cancellation charge and no customer advance to refund.

## Scheduled customer cancellation charges

### When scheduled cancellation is free

No charge applies without an assigned driver, without a paid scheduled advance, or when a listed valid rider reason is selected. Before verified arrival, no charge applies if the driver is farther than 500 metres from pickup or the location evidence fails the server's freshness and quality checks. Fresh pickup evidence uses an observation no older than 30 seconds with accuracy of 100 metres or better.

### When the assigned driver is near pickup

Without a valid rider reason, the scheduled cancellation charge is 10% of the final customer payable fare, capped at ₹100 and at the actual paid advance. It applies when the assigned driver's qualifying fresh location is within 500 metres, even before they tap arrived. A verified reached state also qualifies because arrival already passed the pickup gate. The retained charge is credited to the assigned driver; any refundable advance balance follows the refund flow.

### Scheduled cancellation calculation example

For a ₹2,000 customer payable fare with ₹200 advance paid, a chargeable cancellation retains ₹100 and refunds ₹100. If cancellation is fee-free, the refundable paid advance is ₹200. Use the live server quote for the actual booking.

## Valid customer cancellation reasons

The currently supported reasons waive the scheduled customer cancellation charge:

- Driver asked the customer to cancel.
- Driver is taking too long to arrive, shown as 10+ minutes.
- Driver is not moving toward pickup.
- Driver went to the wrong pickup location.
- Driver demands extra money.
- Wrong vehicle arrived.
- Driver is threatening, abusive, or harassing.
- A requested or confirmed luggage carrier is unavailable.

Select a truthful reason. An Other choice does not automatically waive the fee. Reason selection is separate from a reviewed finding of fault against a captain.

## Confirmation when the cancellation amount changes

The server requires the amount the customer confirmed. If the quote changes before submission, the application asks for confirmation again rather than silently charging a different amount.

## Captain cancellation and replacement

Captains can self-cancel assigned, en-route, or reached rides using a supported reason. Started rides require support. Ride Now returns to matching; a scheduled ride returns to confirmed and is re-offered. Captain cancellation does not itself end the customer's booking or immediately refund a scheduled advance. Existing captain acceptance holds remain until the booking ends.

## Pending driver-fault financial rules

**Pending:** failed-pickup penalties, next-booking concessions, and ordinary captain-fault cancellation amounts are not general automatic guarantees. Historical draft amounts must not be presented as active charges. Incident reports require review and authorized financial decisions. See [Complaints and account actions](complaints-and-account-actions.md).
