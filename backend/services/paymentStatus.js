const TERMINAL_OR_REFUNDING = new Set(['refund_pending', 'refunded'])

export function statusAfterGatewayPayment(current, gatewayStatus) {
  if (TERMINAL_OR_REFUNDING.has(current) || current === 'captured') return current
  if (gatewayStatus === 'captured') return 'captured'
  if (gatewayStatus === 'authorized' && ['order_created', 'authorized'].includes(current)) return 'authorized'
  return current
}
