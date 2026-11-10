# Driver Payments

Payment and cancellation rules currently supported for drivers.

## What this page covers

This page describes payment-related rules currently supported in the driver app. It does not create a driver marketplace deposit, a 12% fee or a 10% fee; those are not live terms for driver-partners.

## Ride fares

Drivers must use the fare and payment status shown or authorised for the booking and must not impose an undisclosed off-platform surcharge. The rider controls final settlement through the supported UPI or cash flow; the driver app shows the resulting payment status and does not require the driver to confirm the rider's payment method. [TO CONFIRM: fare calculation, toll/parking/waiting handling, cash/online payment methods and any permitted adjustments.]

## Scheduled rides

A customer currently pays a 10% Razorpay advance for a scheduled ride. After completion, the remaining fare can be settled through Razorpay UPI or cash, and the service records the authoritative result against the booking.

## Customer cancellation

If a scheduled-rider cancellation fee applies, the server limits it to 10% of the applicable fare capped at ₹100. Listed valid rider reasons waive the fee, and any balance of the 10% advance is refunded. Drivers must not ask customers to cancel or make off-platform changes to that result.

## Driver-fault cancellation and failed pickup

A driver must use the supported cancellation flow and give the truthful reason when unable to serve an accepted booking. Valid reasons are listed in the Driver Terms and remain subject to review where needed.

[TO IMPLEMENT BEFORE LAUNCH: the supplied UP-rule research supports a ₹100 driver penalty and an equivalent ₹100 rider concession on the next booking when an accepted driver has not reported within 10 minutes after the expected reporting time. The rider's paid advance is refunded separately. This financial penalty/concession flow is not yet implemented.]

[TO CONFIRM: the exact amount for an ordinary driver cancellation after acceptance without a valid reason. Draft material used 10% of fare capped at ₹100; available reporting on the final rules clearly supports the flat ₹100 failed-pickup case but does not resolve every ordinary-cancellation case.]

## Driver earnings and deductions

[TO CONFIRM: driver settlement timing, payment method, commission/service-fee terms, cancellation allocation, taxes/TDS/GST, adjustments and any UP fare-share compliance. Do not claim the reported 80%/60% minimum split unless verified.]

## Corrections and disputes

If a booking’s payment, cancellation, settlement or status looks wrong, contact support with the booking reference and relevant payment details. We should correct verified calculation or processing errors and provide a review route for disputed deductions.