import { processRazorpayXPayoutWebhook } from '../services/razorpayXPayoutWebhook.js'
import { PaymentError } from '../services/paymentErrors.js'

export function createRazorpayXWebhookHandler(processWebhook = processRazorpayXPayoutWebhook) {
  return async function razorpayXWebhookHandler(req, res, next) {
    try {
      const result = await processWebhook({
        rawBody: req.body,
        signature: req.get('x-razorpay-signature'),
        eventId: req.get('x-razorpay-event-id'),
      })
      return res.json({ ok: true, ...result })
    } catch (error) {
      if (error instanceof PaymentError) {
        return res.status(error.status).json({ error: error.message, code: error.code })
      }
      return next(error)
    }
  }
}

export const razorpayXWebhookHandler = createRazorpayXWebhookHandler()
