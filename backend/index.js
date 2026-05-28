import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { prisma } from './db/prisma.js'

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, async () => {
  await prisma.$connect()
  console.log(`Server running on port ${PORT}`)
})
