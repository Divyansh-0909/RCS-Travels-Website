export function cancelledAdvanceSummary(disposition) {
  switch (disposition) {
    case 'refund_pending': return { title: 'Refund pending', message: 'Your advance refund has started. It has not been confirmed as processed.' };
    case 'partial_refund_pending': return { title: 'Partial refund pending', message: 'The remaining advance refund has started after the cancellation charge. It has not been confirmed as processed.' };
    case 'refunded': return { title: 'Advance refunded', message: 'The payment provider has confirmed your advance refund.' };
    case 'partially_refunded': return { title: 'Partial advance refunded', message: 'The payment provider has confirmed the remaining advance refund after the cancellation charge.' };
    case 'retained': return { title: 'Advance retained', message: 'The recorded cancellation settlement retains the advance.' };
    case null: return { title: 'No advance settlement recorded', message: 'There is no advance settlement recorded for this ride.' };
    default: return { title: 'Advance status unavailable', message: 'Refresh to check the latest saved payment status, or contact support.' };
  }
}
