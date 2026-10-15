---
document_id: driver-policy
audience: captain
status: operational-reference-with-draft-expectations
verified_on: 2026-10-10
sources:
  - frontend/src/constants/legal.js
  - backend/routes/driver.ts
  - backend/services/driverRideCancellation.js
  - backend/services/driverCancellations.js
  - backend/services/rideGeofence.ts
---
# Captain service policy

## Draft captain conduct expectations

**Draft service expectations:** use your own approved account and the vehicle approved for the trip. Keep licence, vehicle documents, contact information, and location accurate. Drive safely, respect passengers, and collect only the authorized amount. Do not demand undisclosed money, ask a rider to cancel to avoid platform rules, impersonate another captain, or misrepresent the vehicle. Final legal contract terms still require approval.

## Ride acceptance and service

Use the supported offer acceptance flow. Acceptance depends on account eligibility, vehicle compatibility, available capacity, and any required scheduled wallet hold. Once accepted, proceed to the correct pickup and keep trip status accurate. An offer is not an assigned ride until acceptance succeeds.

## Arrival and trip start

Arrival and OTP start require qualifying fresh location within 500 metres of pickup. The location must meet the server's accuracy, age, and authenticity checks. A disabled action is not permission to bypass these checks. Customer confirmation codes must only be used for their intended trip action.

## Captain cancellation reasons

### Supported cancellation reasons

The backend accepts rider requested cancellation, rider unreachable, rider no-show after 30 minutes, road or vehicle issue, threatening rider, abusive rider, carrier not requested, and Other. Other requires an explanation. Use a truthful reason; it is recorded for review rather than automatically proving fault.

### Rider no-show waiting period

For the rider no-show reason, first mark arrival successfully. The server requires 30 minutes after recorded arrival before accepting that reason. General self-cancellation is limited to assigned, en-route, or reached rides. Contact support once the trip has started.

## Captain cancellation consequences

A successful cancellation restores capacity and reopens matching or scheduled offers. It records an incident requiring admin review. That record does not by itself authorize an automatic fine, strike, or block. Scheduled acceptance deposits remain held until booking completion or customer cancellation and return to their original owners.

## Captain payment and eligibility policies

See [Verification](driver-verification-policy.md), [Wallet and payouts](driver-wallet-and-payouts.md), [Rewards](coupons-and-rewards.md), and [Safety](safety-policy.md).
