---
document_id: safety-policy
audience: rider-and-captain
status: operational-reference-with-draft-expectations
verified_on: 2026-10-10
sources:
  - backend/services/rideGeofence.ts
  - backend/routes/driver.ts
  - frontend/src/constants/legal.js
---
# Ride safety policy

## Immediate danger and emergencies

The draft service guidance says to contact 112 or the appropriate public emergency service first when there is immediate danger, then report the incident to RCS Travels when safe. RCS Travels is not an emergency-response service. Do not wait for chatbot or support replies during an emergency.

## Draft respectful travel expectations

**Draft service expectations:** follow road-safety, seatbelt, vehicle-capacity, and lawful luggage rules. Do not carry dangerous or unlawful items. Avoid threats, harassment, abuse, discrimination, and dangerous driving. Verify the assigned captain and vehicle, and report mismatches or extra-money demands.

## Pickup arrival and OTP start geofence

Arrival and OTP start require a fresh, non-mocked GPS fix within 500 metres of pickup, with accuracy of 100 metres or better and age no more than 30 seconds. The server enforces this gate. Poor, stale, or missing evidence can prevent the action. A visible map pin alone does not prove the action is eligible.

## Drop-off and completion geofence

### Normal completion near the booked drop

Completion within 500 metres of the booked drop uses the normal supported flow, subject to the other trip checks.

### Alternate drop up to 2 kilometres away

Beyond 500 metres and through 2 kilometres, completion requires a supported alternate-drop reason and customer OTP confirmation. Reasons include customer-requested early drop, inaccessible drop, road/security restriction, and incorrect drop pin.

### Drop beyond the support boundary

Beyond 2 kilometres, ordinary self-completion is blocked and support is required. Do not advise falsifying GPS or using a customer's OTP to bypass a location or safety check.

## Incident reporting and pending safety commitments

Report accidents, threats, dangerous driving, or serious disputes to support when safe. **Pending:** this corpus does not establish a verified 24-hour control room, panic-button response time, live emergency monitoring, training certification, or insurance-cover amount. Do not turn those draft requirements into active guarantees.
