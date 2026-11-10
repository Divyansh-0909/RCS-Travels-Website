---
document_id: booking-policy
audience: rider
status: operational-reference
verified_on: 2026-10-10
sources:
  - backend/routes/bookings.js
  - backend/services/bookingCreation.js
  - backend/services/fareQuote.js
  - frontend/src/constants/legal.js
---
# Booking policy

## How to request an RCS Travels ride

### Website and WhatsApp bookings

Choose pickup, destination, vehicle class, and any available sharing or luggage-carrier option. Choose Ride Now or a scheduled pickup. Website and WhatsApp bookings use the backend booking and quote services. Provide accurate passenger and trip details.

### Fare confirmation

Review the fare and selected options before confirming. The server verifies the quote and calculates the payable amount. A request does not guarantee a driver or successful pickup. Use the booking's actual status for confirmation and assignment.

## Ride Now bookings

Ride Now starts in matching. No customer advance is collected. Driver availability and operational eligibility affect assignment. Pay the final amount through the booking's supported payment options after completion.

## Scheduled booking confirmation

Scheduled rides normally require a 10% customer advance. A booking awaiting that payment is not yet payment-confirmed. Successful payment confirmation changes it to confirmed. If discounts or existing compensation reduce the required advance to zero, the backend can confirm without checkout. Confirmed does not mean a driver has accepted.

## Duplicate and overlapping requests

The booking service checks existing active work and rejects overlapping requests under its trip/time rules. If a booking already exists, check it before creating another request or repeating payment.

## Tracking and trip changes

Use the booking tracking page for status and assigned-driver information. Arrival, start, cancellation, completion, and settlement follow server checks. Do not assume a changed destination, vehicle, or pickup time is approved without an updated booking or support confirmation.

## Related booking policies

See [Scheduled rides](scheduled-rides.md), [Fares and payments](fares-and-payments.md), [Cancellation](cancellation-policy.md), and [Shared and outstation rides](shared-and-outstation-rides.md).
