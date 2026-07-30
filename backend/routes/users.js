import { Router } from 'express'
import { protect } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import { clerkClient } from '@clerk/express'
import crypto from 'crypto'
import { ACTIVE_STATUSES } from './bookings.js'
import PDFDocument from "pdfkit";
import { labelOf } from '../constants/vehicles.js'

const usersRouter = Router()

const generateBookingCode = () => String(crypto.randomInt(0, 10000)).padStart(4, '0')

usersRouter.get('/me', protect, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
  if (!user) return res.status(404).json({ error: 'User has not signed up' })

  const { id, phone, name, bookingCode, gender, dob, emergencyContact } = user
  return res.json({ id, phone, name, bookingCode, gender, dob, emergencyContact })
})

// Recents derived from booking history, in the frontend's local shape so the
// client can merge the lists.
usersRouter.get('/me/recent-places', protect, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
  if (!user) return res.status(404).json({ error: 'User has not signed up' })

  const bookings = await prisma.booking.findMany({
    where: { userId: user.id, status: { not: 'cancelled' } },
    select: {
      pickupAddress: true, pickupLat: true, pickupLng: true,
      dropAddress: true, dropLat: true, dropLng: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const places = new Map()
  for (const b of bookings) {
    const stops = [
      { label: b.pickupAddress, lat: b.pickupLat, lng: b.pickupLng },
      { label: b.dropAddress, lat: b.dropLat, lng: b.dropLng },
    ]
    for (const stop of stops) {
      if (!stop.label) continue
      const at = b.createdAt.getTime()
      const existing = places.get(stop.label)
      if (existing) {
        existing.count += 1
        existing.lastUsedAt = Math.max(existing.lastUsedAt, at)
        // bookings iterate newest-first, so the first coords seen stay (latest)
      } else {
        places.set(stop.label, { label: stop.label, count: 1, lastUsedAt: at, lat: stop.lat ?? null, lng: stop.lng ?? null })
      }
    }
  }

  return res.json({ places: [...places.values()] })
})

// ─── Saved places — Home / Work / custom rows managed from Settings ──────────

const SAVED_PLACE_CAP = 12
const savedPlaceShape = { id: true, label: true, address: true, lat: true, lng: true }

usersRouter.get('/me/saved-places', protect, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
  if (!user) return res.status(404).json({ error: 'User has not signed up' })

  const places = await prisma.savedPlace.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: savedPlaceShape,
  })
  return res.json({ places })
})

// Upsert: with an id it updates that row (own rows only), without one it
// creates. One route because the Settings form doesn't care which it was.
usersRouter.put('/me/saved-places', protect, async (req, res) => {
  const { id, label, address, lat, lng } = req.body
  const cleanLabel = String(label ?? '').trim()
  const cleanAddress = String(address ?? '').trim()
  if (!cleanLabel || cleanLabel.length > 40)
    return res.status(400).json({ error: 'Label must be 1–40 characters' })
  if (!cleanAddress || cleanAddress.length > 200)
    return res.status(400).json({ error: 'Address must be 1–200 characters' })
  const coords = {
    lat: typeof lat === 'number' && Number.isFinite(lat) ? lat : null,
    lng: typeof lng === 'number' && Number.isFinite(lng) ? lng : null,
  }

  const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
  if (!user) return res.status(404).json({ error: 'User has not signed up' })

  if (id) {
    // Scoped find first so one user can't update another's row by id.
    const existing = await prisma.savedPlace.findFirst({ where: { id: String(id), userId: user.id }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Saved place not found' })
    const place = await prisma.savedPlace.update({
      where: { id: existing.id },
      data: { label: cleanLabel, address: cleanAddress, ...coords },
      select: savedPlaceShape,
    })
    return res.json({ place })
  }

  const count = await prisma.savedPlace.count({ where: { userId: user.id } })
  if (count >= SAVED_PLACE_CAP)
    return res.status(400).json({ error: `You can save up to ${SAVED_PLACE_CAP} places` })

  const place = await prisma.savedPlace.create({
    data: { userId: user.id, label: cleanLabel, address: cleanAddress, ...coords },
    select: savedPlaceShape,
  })
  return res.json({ place })
})

usersRouter.delete('/me/saved-places/:id', protect, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
  if (!user) return res.status(404).json({ error: 'User has not signed up' })

  // deleteMany so the userId scope rides along; count 0 = not yours / gone.
  const { count } = await prisma.savedPlace.deleteMany({ where: { id: req.params.id, userId: user.id } })
  if (!count) return res.status(404).json({ error: 'Saved place not found' })
  return res.json({ ok: true })
})

usersRouter.get('/me/download', protect, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
  if (!user) return res.status(404).json({ error: 'User has not signed up' })


  const doc = new PDFDocument({
    margin: 50,
    size: "A4",
  });

  res.setHeader(
    "Content-Disposition",
    'attachment; filename="Account-Information.pdf"'
  );

  res.setHeader("Content-Type", "application/pdf");

  doc.pipe(res);

  doc
    .fontSize(24)
    .text("Account Information", {
      align: "center",
    });

  doc.moveDown(2);

  doc.fontSize(18).text("Profile");
  doc.moveDown();

  doc.fontSize(12);
  doc.text(`Name: ${user.name ?? "—"}`);
  doc.text(`Phone Number: ${user.phone ?? "—"}`);
  doc.text(`DOB: ${user.dob ?? "—"}`);
  doc.text(`Gender: ${user.gender ?? "—"}`);
  doc.text(`Emergency Contact: ${user.emergencyContact ?? "—"}`);
  doc.text(`Joined: ${user.createdAt.toDateString()}`);

  const bookings = await prisma.booking.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  })

  doc.moveDown(2)
  doc.fontSize(18).text("Ride History")
  doc.moveDown()
  doc.fontSize(12)

  if (bookings.length === 0) {
    doc.fillColor("#666").text("No rides yet.").fillColor("black")
  } else {
    bookings.forEach((b, i) => {
      const when = new Date(b.scheduledAt ?? b.createdAt).toLocaleString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
      const vehicle = labelOf(b.vehicleClass)

      doc.font("Helvetica-Bold").text(`${when}   ·   ${b.status}`)
      doc.font("Helvetica")
      doc.text(`From:  ${b.pickupAddress}`)
      doc.text(`To:    ${b.dropAddress}`)
      doc.text(`${vehicle}    Fare: INR ${b.fare}`)
      if (b.cancellationCharge) doc.text(`Cancellation charge: INR ${b.cancellationCharge}`)
      if (i < bookings.length - 1) doc.moveDown()
    })
  }

  doc.end()   // required; without it the response never finishes
})

usersRouter.delete('/me', protect, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { clerkId: req.auth.userId } })
  if (!user) return res.status(404).json({ error: 'User has not signed up' })

  // Don't let someone delete their account while a ride is still live
  const liveBooking = await prisma.booking.findFirst({
    where: { userId: user.id, status: { in: ACTIVE_STATUSES } },
    select: { id: true },
  })
  if (liveBooking)
    return res.status(409).json({ error: 'You have an active ride. Cancel or complete it before deleting your account.' })

  // Saved addresses are personal data — erased with the rest of the profile.
  await prisma.savedPlace.deleteMany({ where: { userId: user.id } })

  const sentinel = `deleted:${user.id}`
  await prisma.user.update({
    where: { id: user.id },
    data: {
      deletedAt: new Date(),
      name: null,
      gender: null,
      dob: null,
      emergencyContact: null,
      whatsappNumber: null,
      phone: sentinel,
      clerkId: sentinel,
      bookingCode: sentinel,
    },
  })

  try {
    await clerkClient.users.deleteUser(req.auth.userId)
  } catch (e) {
    console.error('Clerk user cleanup failed after account deletion:', e)
  }

  return res.json({ ok: true })
})

usersRouter.post('/me/updateGender', protect, async (req, res) => {
  const { gender } = req.body;

  try {
    await prisma.user.update({
      where: {
        clerkId: req.auth.userId,
      },
      data: {
        gender,
      },
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(404).json({ error: "User not found" });
  }
});

usersRouter.post('/me/updateEmergencyContact', protect, async (req, res) => {
  const { emergencyContact } = req.body;

  // Stored as a string (10-digit numbers overflow a 4-byte int), matching `phone`.
  if (!/^\d{10}$/.test(String(emergencyContact ?? '')))
    return res.status(400).json({ error: "Emergency contact must be a 10-digit number" });

  try {
    await prisma.user.update({
      where: { clerkId: req.auth.userId },
      data: { emergencyContact: String(emergencyContact) },
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(404).json({ error: "User not found" });
  }
});

usersRouter.post('/me/updateDOB', protect, async (req, res) => {
  const { dob } = req.body;

  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(dob ?? '')))
    return res.status(400).json({ error: "DOB must be in DD/MM/YYYY format" });

  try {
    await prisma.user.update({
      where: { clerkId: req.auth.userId },
      data: { dob },
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(404).json({ error: "User not found" });
  }
});

usersRouter.post('/me', protect, async (req, res) => {
  const { name } = req.body

  if (!name || typeof name !== 'string' || name.trim().length < 2)
    return res.status(400).json({ error: 'name must be at least 2 characters' })

  // Phone is encoded in the fake Clerk email: 91{10-digit-phone}@rcs-travels.com
  const clerkUser = await clerkClient.users.getUser(req.auth.userId)
  const email = clerkUser.emailAddresses[0]?.emailAddress
  const phone = email?.replace('@rcs-travels.com', '').replace(/^91/, '')

  if (!phone)
    return res.status(400).json({ error: 'Could not resolve phone from account' })

  // The booking code is only ever set on create (it must stay stable for the life
  // of the account), but a create can still collide with an existing code, so we
  // retry with a fresh code on a booking_code unique violation.
  let lastConflict = null

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const user = await prisma.user.upsert({
        where: { clerkId: req.auth.userId },
        update: { name: name.trim(), phone },
        create: { clerkId: req.auth.userId, name: name.trim(), phone, bookingCode: generateBookingCode() },
      })

      return res.json({ id: user.id, name: user.name, phone: user.phone, bookingCode: user.bookingCode })
    } catch (e) {
      // P2002 = unique constraint violation. `phone`, `clerkId` and `booking_code`
      // are unique on User. A booking_code clash just needs a fresh code + retry;
      // a clerk_id clash means two concurrent requests both took the create path,
      // and retrying lands on the update path now that the row exists; a phone
      // clash means the derived phone is tied to another account. `name` is not
      // unique, so it can never be the constraint that failed here.
      if (e.code === 'P2002') {
        const target = String(e.meta?.target)
        if (target.includes('booking_code') || target.includes('clerk_id')) {
          lastConflict = target
          continue
        }
        if (target.includes('phone'))
          return res.status(409).json({ error: 'That phone number is already linked to another account' })
        return res.status(409).json({ error: 'Could not save profile' })
      }
      throw e
    }
  }

  console.error(`POST /me gave up after 5 attempts, last unique conflict on: ${lastConflict}`)

  return res.status(500).json({ error: 'Could not save profile' })
})

export default usersRouter