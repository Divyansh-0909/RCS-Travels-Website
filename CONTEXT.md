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
