import { Prisma } from '@prisma/client'
import { prisma } from '../db/prisma.js'

const RETRY_AFTER_MS = 60_000

export async function claimWhatsAppInbound(message, db = prisma, now = new Date()) {
  try {
    await db.whatsAppInboundMessage.create({ data: { id: message.id, phone: message.from } })
    return true
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error

    const retry = await db.whatsAppInboundMessage.updateMany({
      where: {
        id: message.id,
        OR: [
          { status: 'failed' },
          { status: 'processing', receivedAt: { lt: new Date(now.getTime() - RETRY_AFTER_MS) } },
        ],
      },
      data: { status: 'processing', error: null, receivedAt: now, processedAt: null },
    })
    return retry.count === 1
  }
}

export const messagesFromWebhook = (body) => (body.entry ?? [])
  .flatMap((entry) => entry.changes ?? [])
  .flatMap((change) => change.value?.messages ?? [])
