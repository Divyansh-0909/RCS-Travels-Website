import { Router } from 'express'
import { getAuth } from '@clerk/express'
import { z } from 'zod'
import { protect } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import { createOrderForPayment, verifyCheckoutPayment, PaymentError, processRazorpayWebhook } from '../services/payments.js'

const paymentsRouter = Router()
const idSchema = z.uuid()
const verificationSchema = z.object({
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
}).strict()

const answerError = (res, error) => error instanceof PaymentError
  ? res.status(error.status).json({ error: error.message, code: error.code })
  : null

async function currentUser(req) {
  const { userId } = getAuth(req)
  return userId && prisma.user.findUnique({ where: { clerkId: userId }, select: { id: true } })
}

paymentsRouter.post('/:id/order', protect, async (req, res) => {
  const parsed = idSchema.safeParse(req.params.id)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payment id' })
  const user = await currentUser(req)
  if (!user) return res.status(401).json({ error: 'User not found' })
  try { return res.json(await createOrderForPayment({ paymentId: parsed.data, userId: user.id })) }
  catch (error) { if (answerError(res, error)) return; throw error }
})

paymentsRouter.post('/:id/verify', protect, async (req, res) => {
  const id = idSchema.safeParse(req.params.id)
  const body = verificationSchema.safeParse(req.body)
  if (!id.success || !body.success) return res.status(400).json({ error: 'Invalid verification request' })
  const user = await currentUser(req)
  if (!user) return res.status(401).json({ error: 'User not found' })
  try { return res.json(await verifyCheckoutPayment({ paymentId: id.data, userId: user.id,
    razorpayOrderId: body.data.razorpay_order_id, razorpayPaymentId: body.data.razorpay_payment_id,
    signature: body.data.razorpay_signature })) }
  catch (error) { if (answerError(res, error)) return; throw error }
})

paymentsRouter.get('/:id', protect, async (req, res) => {
  const id = idSchema.safeParse(req.params.id)
  if (!id.success) return res.status(400).json({ error: 'Invalid payment id' })
  const user = await currentUser(req)
  if (!user) return res.status(401).json({ error: 'User not found' })
  const payment = await prisma.payment.findFirst({ where: { id: id.data, userId: user.id }, select: {
    id: true, bookingId: true, purpose: true, status: true, amount: true, currency: true,
    razorpayOrderId: true, razorpayPaymentId: true, createdAt: true, updatedAt: true,
  } })
  if (!payment) return res.status(404).json({ error: 'Payment not found' })
  return res.json(payment)
})

export async function razorpayWebhookHandler(req, res, next) {
  try {
    const result = await processRazorpayWebhook({ rawBody: req.body,
      signature: req.get('x-razorpay-signature'), eventId: req.get('x-razorpay-event-id') })
    return res.json({ ok: true, ...result })
  } catch (error) {
    if (answerError(res, error)) return
    next(error)
  }
}

export default paymentsRouter
