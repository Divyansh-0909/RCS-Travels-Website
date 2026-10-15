---
document_id: shared-and-outstation-rides
audience: rider-and-captain
status: operational-reference
verified_on: 2026-10-10
sources:
  - backend/services/ridePricing.js
  - backend/services/ridePooling.js
  - backend/services/rideSettlement.js
  - backend/routes/driver.ts
  - frontend/src/pages/HelpPage.jsx
---
# Shared and outstation ride policy

## Shared ride selection and matching

Sharing is an option where offered in the booking flow. Matching depends on compatible route and available capacity. Selecting sharing does not guarantee a co-rider, a specific companion, or a successful pooled assignment.

## Shared ride fare

The current fare card applies a 25% discount to the driving base, rounded to the nearest ₹10. Other quoted components are added separately. If no sharing group is matched at completion, settlement can use the stored solo fare and recalculate the outstanding amount. Check the final booking amount before paying.

## Shared captain acceptance

Additional shared pickup acceptance requires capacity and route checks. An offer can become unavailable if the pool moves on or the route can no longer be verified. Do not treat an old notification as a guaranteed available pickup.

## Outstation arrangements

The website Help page directs customers to arrange outstation trips with RCS Travels and describes daily pricing. Treat this as a support-arranged service description, not a universal executable tariff. Confirm itinerary, vehicle, days, pickup, quoted inclusions, and payment terms with support before relying on a price.

## Pending outstation-specific terms

**Pending:** this corpus does not establish universal kilometre allowances, overnight driver charges, lodging, state taxes, return-trip charges, or outstation cancellation exceptions. Obtain the actual agreed quotation. General booking, safety, and supported payment rules still apply where the trip uses the platform.
