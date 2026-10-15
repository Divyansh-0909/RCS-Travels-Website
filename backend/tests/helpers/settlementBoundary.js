export const settlementControl = Object.freeze({
  DIRECT_CASH_SETTLEMENT: 'DIRECT_CASH_SETTLEMENT',
  PLATFORM_CONTROLLED_SETTLEMENT: 'PLATFORM_CONTROLLED_SETTLEMENT',
})

const requireAmount = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be nonnegative integer paise`)
  return value
}

export function directCashSettlement({ rideId, grossDriverEarning }) {
  return {
    rideId,
    control: settlementControl.DIRECT_CASH_SETTLEMENT,
    grossDriverEarning: requireAmount(grossDriverEarning, 'Gross driver earning'),
    platformPayoutAmount: 0,
    providerPayoutId: null,
  }
}

export function platformControlledSettlement({ rideId, grossDriverEarning, platformPayoutAmount, providerPayoutId }) {
  if (!providerPayoutId) throw new TypeError('Platform-controlled settlement requires a provider payout ID')
  return {
    rideId,
    control: settlementControl.PLATFORM_CONTROLLED_SETTLEMENT,
    grossDriverEarning: requireAmount(grossDriverEarning, 'Gross driver earning'),
    platformPayoutAmount: requireAmount(platformPayoutAmount, 'Platform payout amount'),
    providerPayoutId,
  }
}
