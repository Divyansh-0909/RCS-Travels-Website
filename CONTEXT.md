# Confirmed marketplace model

Driver A posts an off-app booking and sets both fare and deposit. The minimum
deposit is ₹50 and it must be less than the fare. Driver B pays the deposit to
claim; it becomes held, and rider plus Driver A details are revealed only after
that succeeds. This deposit is separate from the scheduled-ride 15% acceptance
deposit.

Settlement occurs only after ride completion. Driver B's pre-fee amount is
`fare - deposit`; the platform takes 6% and B receives the remainder. Driver A's
pre-fee amount is the deposit; the platform takes 6% and A receives the
remainder.

If B cancels, the platform receives 12% of the deposit, B receives the rest,
and A receives nothing. If A cancels, B receives the full held deposit, no fee
is charged to B, and A receives nothing.

# Confirmed customer cancellation model

Ride Now has no prepaid cancellation charge. Scheduled rides collect a 15%
customer advance. Cancelling is free while no driver is assigned, the assigned
driver is more than 500 metres from pickup, or the driver's last platform
location is more than 30 seconds old. Once a fresh driver location is within
500 metres, the paid advance is retained and credited to the driver, even if
the driver has not tapped `reached`. A verified `reached` state remains
chargeable because it records that the same 500-metre pickup gate was passed.

The quote and settlement are server-authoritative. Every cancellation request
must include the amount the customer confirmed. If proximity changes before
submission, the server returns `CANCELLATION_AMOUNT_CHANGED` and the UI asks
again; it never silently takes a newly higher amount. Cancellation writes,
capacity restoration, offer withdrawal and wallet entries share a transaction.
Deterministic wallet event keys and guarded status updates make retries and
customer/driver cancellation races idempotent.

# Confirmed ride geofences

Arrival and OTP start require a fresh, non-mocked GPS fix with accuracy of 100
metres or better, no older than 30 seconds, within 500 metres of pickup. The
server enforces the rule even if a modified client enables its slider.

Completion within 500 metres of the booked drop is normal. From over 500 metres
through 2 kilometres, the driver selects a structured alternate-drop reason and
the customer confirms with their OTP. Beyond 2 kilometres, self-completion is
blocked and support is required. Disabled sliders show reduced opacity and a
distance/location hint.

# Confirmed driver cancellation and complaint model

Drivers may self-cancel only in `assigned` or `en_route`. Ride Now returns to
`pending` and immediately restarts matching; scheduled work returns to
`confirmed` and is re-offered. Each successful cancellation is recorded once.
In a rolling 30-day window, the third cancellation removes commission-free
benefits and blocks earning new ones for 30 days; the fifth suspends the driver,
takes them offline and withdraws pending offers.

Customer feedback is structured pills with no free text and one complaint row
per booking. A customer may update that row without incrementing the complaint
count again. Current reasons cover extra money, being asked to cancel, dangerous
driving, wrong car, driver/profile mismatch, rude or inappropriate behaviour,
and drop-off problems. Admin driver review shows the categories, complaint
count, rolling cancellation count, benefit restriction and suspension. Three
complaints create the configured wallet fine; five suspend the driver. Only an
admin can reinstate a suspended driver.
