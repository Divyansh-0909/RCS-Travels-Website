---
document_id: fares-and-payments
audience: rider-and-captain
status: operational-reference
verified_on: 2026-10-10
sources:
  - backend/services/rideEstimate.js
  - backend/services/ridePricing.js
  - backend/services/fareQuote.js
  - backend/services/bookingCreation.js
  - backend/services/rideSettlement.js
  - backend/services/ridePayments.ts
---
# Fares and customer payment policy

## Authoritative fare

RCS Travels calculates the quote on the server using route, zone, vehicle, and selected options. Coupons and any existing authorized compensation can affect the customer obligation. Use the booking's actual quote and final balance; a FAQ cannot calculate a live fare from a single kilometre rate.

## Fare components

### Vehicle and route pricing

The pricing service supports hatchback, sedan, SUV, and premium SUV classes. Route-specific zone fares and distance/time formulas can apply. Availability and actual capacity depend on the selected vehicle. A requested safer alternate route currently adds ₹150 only when it is applied.

### Airport, toll, and luggage carrier charges

Applicable quoted tolls are added separately. The supported airport-pickup surcharge is ₹200 where the pricing branch applies. A requested luggage carrier costs ₹200 when base fare plus toll is below ₹2,000; at or above that threshold it is waived. These are conditional components, not charges on every booking. Review the actual quote.

### Pending additional charges

**Pending:** a universal waiting, parking, cleaning, damage, surge, tax, or invoice policy is not established here. The reviewed pricing path does not authorize a captain to invent additional charges. Final rules and any applicable legal requirements require confirmation.

## Customer payment methods

### Ride Now final payment

Ride Now has no advance. After completion, the rider uses the supported cash or Razorpay UPI flow. UPI availability depends on the captain's verified payout destination. Use the options and amount shown for that booking.

### Scheduled customer payment

Scheduled rides normally require a 10% Razorpay advance and collect the remainder after completion through an available UPI or cash option. The rider controls supported final settlement; a captain cannot override the authoritative payment status.

## Fare changes for unmatched sharing

A shared booking can fall back to the stored solo fare if no sharing group is matched at completion. Settlement recalculates the customer obligation and credits any advance already paid. Do not promise that every initially displayed sharing price is the final solo price.

## Payment errors and retries

If checkout creation fails, the scheduled booking can remain payment pending with a retry option. Confirm existing booking and payment status before paying again. Never provide OTPs, UPI PINs, or payment credentials to support or a captain. See [Refunds](refunds.md) for captured-payment issues.
