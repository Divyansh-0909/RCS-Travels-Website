export const LOYALTY_REQUIRED_RIDES = 20
export const LOYALTY_REWARD_RIDES = 3
export const loyaltyRewardsEarned = (before, after) =>
  (Math.floor(after / LOYALTY_REQUIRED_RIDES) - Math.floor(before / LOYALTY_REQUIRED_RIDES)) * LOYALTY_REWARD_RIDES
export const commissionWithReward = (normalCommission, remaining) => ({
  commission: normalCommission > 0 && remaining > 0 ? 0 : normalCommission,
  consumeReward: normalCommission > 0 && remaining > 0,
})
