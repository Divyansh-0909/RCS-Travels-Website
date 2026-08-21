import { Router } from 'express'
import crypto from 'node:crypto'
import { messagesFromWebhook, processWhatsAppMessage } from '../services/whatsappBooking.js'

const whatsappRouter = Router()

export function validWhatsAppSignature(rawBody, supplied, secret) {
  if (!secret || !Buffer.isBuffer(rawBody)) return false
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`
  return typeof supplied === 'string' && supplied.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
}

export const validWhatsAppChallenge = (query, verifyToken) =>
  query['hub.mode'] === 'subscribe' && Boolean(verifyToken) && query['hub.verify_token'] === verifyToken

whatsappRouter.get('/', (req, res) => {
  if (validWhatsAppChallenge(req.query, process.env.WHATSAPP_VERIFY_TOKEN))
    return res.status(200).send(req.query['hub.challenge'])
  return res.sendStatus(403)
})

whatsappRouter.post('/', async (req, res) => {
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret) return res.status(503).json({ error: 'WhatsApp webhook is not configured' })
  if (!validWhatsAppSignature(req.body, req.get('x-hub-signature-256'), secret)) return res.sendStatus(401)

  let body
  try { body = JSON.parse(req.body.toString('utf8')) } catch { return res.sendStatus(400) }
  const messages = messagesFromWebhook(body)
  // Wait before acknowledging: Cloud Run may suspend CPU as soon as the response
  // leaves, which would otherwise strand a half-written conversation.
  // A single webhook can contain consecutive messages from one conversation;
  // preserve their order so “pickup, destination” cannot race each other.
  const results = []
  for (const message of messages) {
    try { await processWhatsAppMessage(message); results.push({ status: 'fulfilled' }) }
    catch (reason) { results.push({ status: 'rejected', reason }) }
  }
  for (const result of results) if (result.status === 'rejected') console.error('WhatsApp message failed:', result.reason)
  if (results.some(result => result.status === 'rejected')) return res.sendStatus(500)
  return res.sendStatus(200)
})

export default whatsappRouter
