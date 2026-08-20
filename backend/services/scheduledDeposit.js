export const SCHEDULED_ACCEPTANCE_DEPOSIT_PCT = 15
export const scheduledDepositFor = (fare) => Math.round((Math.max(0, fare) * SCHEDULED_ACCEPTANCE_DEPOSIT_PCT) / 100)
