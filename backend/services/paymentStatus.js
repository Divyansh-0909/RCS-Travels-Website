const TERMINAL_OR_REFUNDING = new Set(['refund_pending', 'refunded'])

export const canApplyGatewayFailure = current => !TERMINAL_OR_REFUNDING.has(current) && current !== 'captured'

export function statusAfterGatewayPayment(current, gatewayStatus) {
  if (!canApplyGatewayFailure(current)) return current
  if (gatewayStatus === 'captured') return 'captured'
  if (gatewayStatus === 'authorized' && ['order_created', 'authorized'].includes(current)) return 'authorized'
  return current
}
