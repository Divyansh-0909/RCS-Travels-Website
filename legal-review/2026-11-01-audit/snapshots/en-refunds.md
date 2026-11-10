# Refunds & Cancellation

The scheduled-ride advance and server-authoritative cancellation rule.

## Ride Now

Ride Now is paid at the end of the trip to the driver. There is no prepaid Ride Now cancellation amount to refund.

## Scheduled-ride advance

Scheduled rides currently collect a 10% Razorpay advance. The server calculates the cancellation quote and settlement; the app shows that result for your confirmation.

## When the advance is not retained

Cancellation is free when no driver is assigned, the driver has no fresh platform location, the driver’s fresh location is farther than 500 metres from pickup, or the driver cancels. Any paid advance follows the booking’s refund flow.

## When the advance is retained

The current product retains the paid advance once an assigned driver’s fresh location is within 500 metres of pickup, or the booking reaches the corresponding arrival status. The server’s location and status record decide the quote.

## Before publication

When a cancellation fee applies near pickup, it is 10% of the fare capped at ₹100. Listed valid reasons waive the fee. Only the fee is retained and the remaining advance is refunded.

## Refund processing

Where a refund is due, we initiate it through the applicable payment flow. The time for the amount to appear can also depend on Razorpay, the bank, card network or payment method. [TO CONFIRM: refund-initiation target and the customer-facing settlement window the business can reliably support.]

## Payment issues

If proximity or status changes before cancellation is submitted, the server may return a changed amount and will request confirmation. For an incorrect charge, duplicate payment, failed payment or refund issue, contact support with booking details and the payment reference.

## Your legal rights

This policy does not reduce any refund, compensation or consumer remedy available under applicable law. If a statutory rule gives you a better outcome than this draft operational policy, the statutory rule controls.