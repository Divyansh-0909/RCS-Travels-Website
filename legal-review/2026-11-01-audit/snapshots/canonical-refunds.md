# Refunds & Cancellation

The scheduled-ride advance and server-authoritative cancellation rule.

## Ride Now

Ride Now is paid after the trip through Razorpay UPI or cash. There is no prepaid Ride Now cancellation amount to refund.

## Scheduled-ride advance

Scheduled rides currently collect a 10% Razorpay advance. The advance remains part of the fare; it is not itself the cancellation fee. The server calculates any cancellation fee and the refund balance, and the app shows the result for confirmation.

## When cancellation is free

No scheduled-ride cancellation fee applies when no driver is assigned, the driver has no fresh platform location, the driver’s fresh location is farther than 500 metres from pickup, the driver cancels, or one of the listed valid reasons applies. In those cases, any paid advance is refunded.

- Driver asked me to cancel

- Driver is taking too long to arrive (10+ min)

- Driver is not moving toward pickup

- Driver went to the wrong pickup location

- Driver demands extra money

- Wrong vehicle arrived

- Driver is threatening, abusive, or harassing

- Requested / confirmed luggage carrier is unavailable

## When a cancellation fee applies

If the assigned driver is near pickup and none of the listed valid reasons applies, the fee is 10% of the applicable fare capped at ₹100. Only that amount is retained from the paid advance; the remaining advance is refunded. The server’s location, booking status and selected cancellation reason decide the final quote.

## When the driver is at fault

If the driver cancels or the booking is otherwise cancelled because of a confirmed driver-fault reason, the rider cancellation fee does not apply and any paid scheduled advance is refunded.

[TO IMPLEMENT BEFORE LAUNCH: where an accepted driver has not reported within 10 minutes after the expected reporting time, the supplied UP-rule research supports a separate ₹100 driver penalty and an equivalent ₹100 concession on the rider's next booking. That concession is separate from refunding the rider's paid advance and is not yet implemented in the product.]

[TO CONFIRM: the exact financial consequence for an ordinary driver cancellation without a valid reason remains unresolved in the available final-rule material; do not state a fixed amount until confirmed.]

## Refund processing

Where a refund is due, we initiate it through the applicable payment flow. The time for the amount to appear can also depend on Razorpay, the bank, card network or payment method. [TO CONFIRM: refund-initiation target and the customer-facing settlement window the business can reliably support.]

## Payment issues

If proximity or status changes before cancellation is submitted, the server may return a changed amount and will request confirmation. For an incorrect charge, duplicate payment, failed payment or refund issue, contact support with booking details and the payment reference.

## Your legal rights

This policy does not reduce any refund, compensation or consumer remedy available under applicable law. If a statutory rule gives you a better outcome than this draft operational policy, the statutory rule controls.