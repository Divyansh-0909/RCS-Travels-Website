---
document_id: scheduled-rides
audience: rider-and-captain
status: operational-reference
verified_on: 2026-10-10
sources:
  - backend/routes/bookings.js
  - backend/services/bookingCreation.js
  - backend/services/scheduledPayments.js
  - backend/services/scheduledDeposit.js
  - backend/services/scheduledDepositLifecycle.js
  - backend/services/assignScheduledRides.js
  - backend/constants/dispatch.js
---
# Scheduled ride policy

## Scheduled pickup booking window

The website booking endpoint requires pickup more than 30 minutes ahead and no more than 7 days ahead. Exactly 30 minutes is rejected by the current server boundary. Use Ride Now for immediate travel where available. These limits do not guarantee vehicle availability.

## Scheduled customer advance

New scheduled rides normally collect a 10% advance through Razorpay, calculated on the final customer obligation after applicable discounts and reserved compensation. The backend rounds the advance to whole rupees and calculates the exact remainder. Successful capture confirms payment. A zero required advance can confirm without checkout. Historical bookings retain their recorded payment amounts.

## Scheduled final customer payment

After completion, pay the outstanding balance through the booking's available UPI or cash option. The advance is part of the fare and is credited toward the amount due. It is separate from a cancellation charge and from a captain wallet hold.

## Scheduled driver assignment

Driver details become available after acceptance and assignment; there is no guaranteed disclosure exactly one hour before pickup. A confirmed booking can still be awaiting a captain. The current scheduled sweep looks up to 6 hours ahead, retries every 5 minutes, and alerts the admin when a booking remains unfilled inside the last hour. Job timing is an operational cadence, not a promised pickup outcome.

## Scheduled offer priority

The initial owner-priority hold is 15 minutes if pickup is within 2 hours of confirmation and 45 minutes otherwise. After that hold, offers open to the RCS fleet. Partner escalation follows resolution of fleet offers, rather than a second fixed timer. An unanswered offer is not automatically a rejection.

## Scheduled captain acceptance deposit

Captains need a wallet hold of 10% of the authoritative booking fare to accept scheduled work. This is distinct from the customer's advance. Each original or replacement captain owns their own hold. Captain cancellation retains the hold while matching resumes. Completion or customer cancellation releases the booking's holds to their respective original owners. A hold is an operational reservation, not a responsibility penalty.

## Pending scheduled failure automation

**Pending:** do not promise an automatic cancellation, refund deadline, penalty, or compensation when replacement matching is exhausted or pickup is missed. Those terminal mappings remain unresolved/manual. Customers can use the supported cancellation and support flows.
