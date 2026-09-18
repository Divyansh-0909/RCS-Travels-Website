import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { verifyDriverCheckoutToken } from '../services/driverCheckout.js'
import { PaymentError } from '../services/paymentErrors.js'

const router = Router()
const callback = 'rcscaptains://wallet/payment'

const html = (checkout) => {
  const payload = JSON.stringify(checkout).replace(/</g, '\\u003c')
  const callbackJson = JSON.stringify(callback)
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Clear wallet balance</title>
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f7f7f7;color:#121220;display:grid;min-height:100vh;place-items:center}.card{max-width:360px;margin:20px;padding:28px;border-radius:24px;background:#fff;box-shadow:0 12px 40px #00000012;text-align:center}.muted{color:#666}button{border:0;border-radius:14px;padding:14px 18px;background:#121220;color:#fff;font-weight:700;font-size:16px;width:100%}</style>
</head><body><main class="card"><h1>Clear wallet balance</h1><p class="muted">Secure payment is handled by Razorpay. Return to the RCS Captains app after payment.</p><button id="pay">Continue to payment</button><p id="status" class="muted"></p></main>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script><script>
const c=${payload};const callback=${callbackJson};const status=document.getElementById('status');
function go(params){location.href=callback+'?'+new URLSearchParams(params).toString()}
function openCheckout(){if(!window.Razorpay){status.textContent='Payment service did not load. Check your connection and try again.';return}
 const r=new Razorpay({key:c.keyId,order_id:c.orderId,amount:c.amount,currency:c.currency,name:'RCS Travels',description:'Clear captain wallet balance',handler:(x)=>go({status:'success',paymentId:c.paymentId,razorpay_order_id:x.razorpay_order_id,razorpay_payment_id:x.razorpay_payment_id,razorpay_signature:x.razorpay_signature}),modal:{ondismiss:()=>go({status:'cancelled',paymentId:c.paymentId})}});r.on('payment.failed',()=>{status.textContent='Payment failed. You can retry from Razorpay or return to the app.'});r.open()}
document.getElementById('pay').addEventListener('click',openCheckout);setTimeout(openCheckout,50);
</script></body></html>`
}

router.get('/checkout', async (req, res) => {
  try {
    const token = verifyDriverCheckoutToken(req.query.token)
    const payment = await prisma.payment.findFirst({
      where: { id: token.paymentId, driverId: { not: null }, userId: null, purpose: 'driver_debt_settlement' },
      select: { id: true, amount: true, currency: true, razorpayOrderId: true, status: true },
    })
    if (!payment || payment.razorpayOrderId !== token.orderId || payment.amount !== token.amount || payment.currency !== token.currency) {
      throw new PaymentError('PAYMENT_NOT_FOUND', 'Payment link no longer matches an active payment', 404)
    }
    if (!['order_created', 'authorized'].includes(payment.status)) {
      throw new PaymentError('PAYMENT_NOT_OPEN', 'This payment is no longer open', 409)
    }
    res.set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com; style-src 'unsafe-inline'; frame-src https://api.razorpay.com https://*.razorpay.com; connect-src https://api.razorpay.com https://*.razorpay.com; img-src data: https://*.razorpay.com",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    })
    return res.type('html').send(html(token))
  } catch (error) {
    const status = error instanceof PaymentError ? error.status : 500
    const message = error instanceof PaymentError ? error.message : 'Could not open payment checkout'
    return res.status(status).type('html').send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment unavailable</title><p>${message.replace(/[<>&]/g, '')}</p>`)
  }
})

export default router
