import axios from 'axios'
import { getRazorpayXConfig } from '../config/razorpayX.js'

function sanitizeGatewayError(error, fallback) {
  const safe = new Error(fallback)
  safe.code = error?.response?.data?.error?.code ?? 'RAZORPAYX_GATEWAY_ERROR'
  safe.status = error?.response?.status ?? 500
  safe.description = error?.response?.data?.error?.description ?? fallback
  return safe
}

export function createRazorpayXGateway({ config = getRazorpayXConfig(), client } = {}) {
  const api = client ?? axios.create({
    baseURL: 'https://api.razorpay.com/v1',
    timeout: 15000,
    auth: { username: config.keyId, password: config.keySecret },
  })

  return {
    async createPayout({ amount, currency = 'INR', upiId, name, reference, idempotencyKey }) {
      try {
        const response = await api.post('/payouts', {
          account_number: config.accountNumber,
          amount,
          currency,
          mode: 'UPI',
          purpose: 'payout',
          queue_if_low_balance: false,
          reference_id: String(reference).slice(0, 40),
          narration: 'RCS captain payout',
          notes: { source: 'rcs_driver_wallet', payout_reference: String(reference).slice(0, 40) },
          fund_account: {
            account_type: 'vpa',
            vpa: { address: upiId },
            contact: { name, type: 'vendor', reference_id: String(reference).slice(0, 40) },
          },
        }, { headers: { 'X-Payout-Idempotency': idempotencyKey } })
        return response.data
      } catch (error) {
        throw sanitizeGatewayError(error, 'RazorpayX payout request failed; retry with the same idempotency key')
      }
    },

    async fetchPayout(payoutId) {
      try {
        const response = await api.get(`/payouts/${encodeURIComponent(payoutId)}`)
        return response.data
      } catch (error) {
        throw sanitizeGatewayError(error, 'Could not fetch RazorpayX payout status')
      }
    },
  }
}
