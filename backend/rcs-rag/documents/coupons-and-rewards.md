---
document_id: coupons-and-rewards
audience: rider-and-captain
status: operational-reference
verified_on: 2026-10-10
sources:
  - backend/services/coupons.js
  - backend/services/loyalty.js
  - backend/services/bookingCreation.js
  - backend/services/rideSettlement.js
---
# Customer coupons and captain rewards

## Monthly customer coupon eligibility

The coupon service sums customer payment on completed rides for its monthly period. Cancelled rides do not count. It chooses the highest applicable tier rather than adding tiers together.

### Monthly customer coupon tiers

| Completed-ride customer payment in the period | Coupon amount |
| --- | --- |
| ₹2,000 to below ₹2,500 | ₹100 |
| ₹2,500 to below ₹5,000 | ₹200 |
| ₹5,000 or more | ₹500 |

Below ₹2,000, no coupon is issued by these tiers. The current previous-month issuance job uses UTC calendar-month boundaries. Coupon receipt depends on issuance and the actual account record; do not infer an available coupon from an unverified spending claim.

## Coupon application

Apply an available coupon through the supported booking flow. The server verifies and redeems it. A coupon cannot make the customer obligation negative. Coupons affect the commission floor after applicable driving-fare calculation, and completed-ride settlement reimburses the captain's coupon amount through the wallet.

## Captain loyalty reward earning

The current reward service grants 3 commission-free rides for every 20 completed rides, unless a stored benefit restriction applies. Cancelled rides do not increase the completion count. Existing account eligibility and reward balance determine actual availability.

## Captain loyalty reward use

A reward is consumed only when ordinary commission would be greater than zero. A naturally commission-free ride below the commission floor does not use a reward. When eligible, a reward waives commission for that completed ride.

## Pending promotion and restriction terms

**Pending:** universal coupon expiry, transferability, stacking, cash conversion, or cancellation restoration rules are not established by these sources. Do not promise them. Historical cancellation-count text does not establish a current automatic benefit-removal action; new incident records require review. Check live coupon and reward records or ask support.
