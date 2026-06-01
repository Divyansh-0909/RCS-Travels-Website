import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { prisma } from './db/prisma.js'
import { clerkAuth } from './middleware/auth.js'
import fareRouter from './routes/fare.js'
import bookingsRouter from './routes/bookings.js'
import driverRouter from './routes/driver.js'
import startAssignmentJob from './services/assignScheduledRides.js'
import usersRouter from './routes/users.js'

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())
app.use(clerkAuth)

app.use('/api/fare', fareRouter)
app.use('/api/bookings', bookingsRouter)
app.use('/api/driver', driverRouter)
app.use('/api/users', usersRouter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, async () => {
  await prisma.$connect()
  startAssignmentJob()
  console.log(`Server running on port ${PORT}`)
})
