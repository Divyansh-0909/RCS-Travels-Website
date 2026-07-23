# Cab Service Platform — Complete Project Context

## Project Overview

This project is a full-stack cab booking and fleet management platform built for a local cab service business.

The system includes:

1. Customer booking website
2. Driver mobile app (Android only initially)
3. Admin dashboard
4. Real-time ride tracking
5. WhatsApp integration
6. OTP authentication
7. Fare management
8. Driver assignment system
9. Multi-language support

The goal is to build a practical production-ready MVP optimized for:

- Low operational cost
- Simplicity
- Reliability
- Fast development
- Scalability later if needed

The expected scale initially is approximately 10–30 rides/day.

The architecture intentionally avoids unnecessary complexity like heavy WebSocket infrastructure.
Polling + FCM push notifications are sufficient for the initial scale.

---

# Tech Stack

## Frontend (Customer Website + Admin Dashboard)

- React + Vite
- React Router v6
- Tailwind CSS
- Axios / Fetch
- Google Maps JavaScript SDK
- Clerk React SDK
- i18next (multi-language)

## Backend

- Node.js
- Express.js
- Clerk Express SDK
- Firebase Admin SDK (FCM)
- Axios / node-fetch
- Meta WhatsApp Cloud API integration

## Database / Storage

- Supabase PostgreSQL
- Cloudflare R2 (documents/files)
- Upstash Redis (optional)

## Deployment

- Vercel → frontend
- Railway → backend
- Expo EAS → driver app later

## External Services

- Google Maps Platform
- Firebase Cloud Messaging
- Meta WhatsApp Cloud API
- MSG91 / 2Factor OTP

---

# System Architecture

## Client Layer

### Customer Booking Website
Built with React + Vite.

Responsibilities:
- Booking rides
- Viewing ride status
- Fare estimation
- Viewing booking history
- Tracking driver live location
- Managing profile
- Multi-language support

### Driver App
Built using Expo React Native.

Responsibilities:
- Go online/offline
- Receive ride requests
- Broadcast GPS location
- Update ride statuses
- Navigation
- View earnings/history

### Admin Dashboard
Built with React + Vite.

Responsibilities:
- Fleet monitoring
- Assigning drivers
- Driver management
- Revenue tracking
- Pricing management
- Booking management

### WhatsApp Bot
Uses Meta WhatsApp Cloud API.

Responsibilities:
- Booking creation
- Notifications
- Customer communication

---

## API Layer

Single Express backend serving:

- Website
- Driver app
- Admin dashboard
- WhatsApp webhook

Core API components:

- REST APIs
- Clerk auth middleware
- FCM notification service
- WhatsApp webhook handler
- Fare calculation engine
- Driver assignment logic

---

## Service Layer

### Booking Service
Responsible for:
- Creating bookings
- Updating booking statuses
- Booking validation
- Booking code generation

### Fare Calculator
Supports:
- NCR fixed pricing
- Outstation pricing
- Toll charges
- Vehicle-based pricing

### Driver Assignment
Responsible for:
- Selecting available drivers
- Sending notifications
- Handling accept/decline
- Reassignment logic

### Notification Service
Handles:
- FCM push notifications
- WhatsApp messages
- SMS OTP notifications

### Commission Calculator
Handles:
- Commission percentage
- Driver payouts
- Revenue reports

### i18n Service
Supports:
- English
- Hindi
- Hinglish

### Cancellation Handler
Handles:
- Free cancellation logic
- Cancellation charges
- Driver reached pickup conditions

---

# Real-Time System Design

The system deliberately avoids complex WebSocket infrastructure initially.

## Driver GPS Updates

Driver app broadcasts GPS every 4 seconds:

POST /api/driver/location

Backend performs UPSERT into:

driver_locations

Only one row exists per driver.

---

## Customer Tracking

Customer tracking page polls every 5 seconds:

GET /api/driver/:id/location

Returns latest driver location.

This is sufficient for:
- Smooth map updates
- Low server cost
- Simplicity

---

## Admin Fleet Map

Admin dashboard polls every 8 seconds:

GET /api/admin/fleet-map

Returns:
- All online drivers
- Current coordinates
- Driver status

---

## Booking Status Updates

Customer booking page polls:

GET /api/bookings/:id/status

Polling interval: 5 seconds.

Status transitions:

pending → assigned → en_route → reached → started → completed

---

## True Real-Time Features

The ONLY true real-time infrastructure initially is:

### Firebase Cloud Messaging

Used for:
- Incoming ride alerts
- High-priority notifications
- Instant driver requests

---

# Customer Website Pages

## Homepage (/)

Sections:

- Hero section
- “Book a Ride” CTA
- Vehicle pricing
- Trust indicators
- 24/7 messaging
- No-surprise pricing messaging
- Language switcher

---

## Booking Page (/book)

Booking flow:

1. Pickup location
2. Drop location
3. Date/time
4. Vehicle type
5. Fare preview
6. Confirm booking

Features:

- Google Places autocomplete
- Dynamic fare calculation
- Fixed pricing for NCR
- Per-km pricing for outstation

---

## Booking Confirmed Page (/booking/:id)

Displays:

- Booking ID
- Driver info
- Fare breakdown
- Booking status
- Live driver tracking map

Statuses:

- Pending
- Assigned
- En Route
- Reached
- Ride Started
- Completed

---

## My Bookings (/my-bookings)

Features:

- Past rides
- Upcoming rides
- Ride details
- Cancellation
- Rebooking

Cancellation logic:

If driver already reached pickup:
- 35% cancellation charge warning

---

## Login/Register (/login)

Authentication method:

WhatsApp OTP + Clerk hybrid.
- OTP delivered via WhatsApp Cloud API (free, no per-SMS cost)
- Clerk used for session management only (email-based, invisible to user)
- Fake deterministic email derived from phone: 91{phone}@rcs-travels.com
- Clerk user created/found via Admin SDK on backend after OTP verified
- Backend returns a Clerk sign-in ticket; frontend completes session via ticket strategy

Flow:

1. Enter phone number
2. Receive OTP on WhatsApp
3. Verify OTP → backend issues Clerk sign-in ticket
4. Frontend calls signIn.create({ strategy: "ticket", ticket })
5. Clerk session established — all existing useAuth() / getToken() work normally

No passwords. No SMS charges.

---

## Fare Estimator (/fare)

Standalone fare calculator.

Features:

- Estimate ride cost
- Select vehicle type
- Fixed + dynamic pricing
- Same logic as booking flow

---

## Contact/Help (/help)

Includes:

- WhatsApp link
- Phone number
- FAQ
- Cancellation policy
- Multi-language support

---

# Driver App Screens

## Login Screen

Features:

- Phone OTP login
- Driver accounts pre-created by admin
- Language selection

Drivers cannot self-register.

---

## Home / Status Screen

Main driver dashboard.

Features:

- Go Online button
- Go Offline button
- Ride stats
- Earnings summary
- Current status

When online:
- GPS broadcast begins

When offline:
- GPS broadcast stops

---

## Incoming Ride Request

Full-screen notification.

Shows:

- Customer name
- Pickup location
- Drop location
- Fare estimate
- Distance to pickup

Features:

- 30-second timer
- Accept button
- Decline button
- Works even on lock screen

---

## Active Ride Screen

Features:

- Google Maps navigation
- Ride actions
- Customer details

Status actions:

1. Reached Pickup
2. Ride Started
3. Ride Completed

All updates sync in real time.

---

## My Rides / History

Displays:

- Completed rides
- Ride history
- Earnings
- Filters by date

---

## Upcoming Scheduled Rides

Shows future rides assigned to driver.

Important for:
- Airport bookings
- Early morning bookings

---

## Profile & Documents

Displays:

- Driver photo
- Vehicle details
- DL/RC documents
- Verification status

---

## Settings

Features:

- Language selection
- Notification toggle
- Dark mode
- Logout

---

# Admin Dashboard Pages

## Live Fleet Map (/admin)

Displays:

- All online drivers
- Live GPS markers
- Active bookings
- Route lines

Driver color coding:

- Green → available
- Yellow → on ride
- Red → offline

---

## All Bookings (/admin/bookings)

Features:

- Booking table
- Filters
- Booking details
- Assign driver
- Export CSV

---

## Driver Management (/admin/drivers)

Features:

- Add/remove drivers
- Upload documents
- Activate/deactivate drivers
- View ride history
- Earnings tracking

---

## Revenue & Commission (/admin/revenue)

Features:

- Daily revenue
- Weekly revenue
- Monthly revenue
- Driver payouts
- Commission tracking

Highlight rides above ₹1000.

---

## Settings (/admin/settings)

Configurable values:

- Fixed fare routes
- Per-km pricing
- Vehicle types
- Commission percentage
- Cancellation policy

---

# Database Schema

## users

Purpose:
Customer accounts.

Columns:

- id (uuid)
- clerk_id
- phone
- name
- whatsapp_number
- created_at

---

## drivers

Purpose:
Driver accounts.

Columns:

- id
- clerk_id
- name
- phone
- vehicle_type
- vehicle_number
- is_active
- is_online
- fcm_token
- dl_doc_url
- rc_doc_url
- is_verified

---

## driver_locations

Purpose:
Live GPS cache.

Columns:

- driver_id
- latitude
- longitude
- updated_at

Notes:

- One row per driver
- UPSERT strategy
- Updated every 4 seconds

---

## bookings

Purpose:
Core booking table.

Columns:

- id
- booking_code
- user_id
- driver_id
- customer_phone
- pickup_address
- pickup_lat
- pickup_lng
- drop_address
- drop_lat
- drop_lng
- vehicle_type
- scheduled_at
- is_outstation
- distance_km
- base_fare
- toll_charges
- total_fare
- commission_pct
- commission_amt
- status
- cancelled_by
- cancellation_charge
- source
- created_at
- completed_at

---

## fare_table

Purpose:
Fixed NCR pricing.

Columns:

- id
- destination_name
- vehicle_type
- fixed_fare
- is_active

---

## otp_verifications

Purpose:
Temporary OTP store for WhatsApp OTP auth.

Columns:

- phone (unique, overwritten on each new OTP request)
- otp_hash (bcrypt hash of the 6-digit OTP)
- expires_at (5 minutes from creation)
- used (boolean, marked true after successful verify)

Notes:

- One row per phone — upsert on each send-otp request
- Deleted or invalidated after successful verification
- Rate limiting enforced at API level

---

## whatsapp_sessions

Purpose:
Track bot booking flows.

Columns:

- phone
- step
- data
- language
- updated_at

---

# Booking Flow

## Step 1
Customer opens booking page.

Google Places autocomplete initializes.

---

## Step 2
Customer fills booking form.

Fields:
- Pickup
- Drop
- Date
- Time
- Vehicle type

---

## Step 3
Fare calculated.

Endpoint:

POST /api/fare/estimate

Logic:

IF drop exists in fare_table:
- Use fixed fare

ELSE:
- Use Google Distance Matrix
- Calculate per-km fare

---

## Step 4
Customer confirms booking.

Fare breakdown shown before confirmation.

---

## Step 5
Auth check.

If user not logged in:
- Open Clerk OTP modal

---

## Step 6
Booking created.

Endpoint:

POST /api/bookings

Actions:

- Insert booking row
- Generate booking code
- Calculate commission
- Notify admin

---

## Step 7
Admin notified.

Methods:

- Dashboard update
- WhatsApp notification

---

## Step 8
Customer redirected to tracking page.

Polling begins.

---

## Step 9
Admin assigns driver.

Endpoint:

PATCH /api/admin/bookings/:id/assign

---

## Step 10
Driver receives FCM push notification.

Driver can:
- Accept
- Decline

---

## Step 11
Customer sees assigned driver.

Tracking activates.

---

# Ride Lifecycle

## Driver Goes Online

Driver app starts GPS broadcasting.

Endpoint:

POST /api/driver/location

---

## Driver Navigates to Pickup

Customer tracking page shows live movement.

---

## Driver Marks “Reached Pickup”

Effects:

- Booking status updated
- Customer notified
- Cancellation fee becomes active

---

## Driver Starts Ride

Status:
started

Tracking updates continue.

---

## Driver Completes Ride

Status:
completed

Effects:

- Revenue calculated
- Driver payout calculated
- Booking archived

---

# Cancellation Logic

## Free Cancellation

Allowed when status is:

- pending
- assigned
- en_route

---

## Chargeable Cancellation

If status = reached:

- Apply 35% cancellation charge

Store charge in:

cancellation_charge

---

# API Endpoints

# Auth

POST /api/auth/send-otp      ← generate OTP, send via WhatsApp, store hash with 5-min expiry
POST /api/auth/verify-otp    ← verify OTP → find/create Clerk user → return sign-in ticket
POST /api/auth/driver-login

---

# Bookings

POST /api/bookings
GET /api/bookings/:id
GET /api/bookings/my
PATCH /api/bookings/:id/cancel
GET /api/bookings/:id/status

---

# Driver APIs

POST /api/driver/location
PATCH /api/driver/status
GET /api/driver/rides
PATCH /api/driver/rides/:id/accept
PATCH /api/driver/rides/:id/decline
PATCH /api/driver/rides/:id/status
PATCH /api/driver/fcm-token

---

# Admin APIs

GET /api/admin/bookings
PATCH /api/admin/bookings/:id/assign
GET /api/admin/drivers
POST /api/admin/drivers
PATCH /api/admin/drivers/:id
GET /api/admin/revenue
GET /api/admin/fleet-map

---

# Utility APIs

POST /api/fare/estimate
POST /api/whatsapp/webhook
GET /api/whatsapp/webhook
GET /api/driver/:id/location

---

# Authentication Strategy

## Customers

WhatsApp OTP + Clerk hybrid.

- OTP generated on backend, sent free via WhatsApp Cloud API
- OTP stored as bcrypt hash in otp_verifications table (expires in 5 min)
- On verify: backend finds/creates Clerk user using fake email 91{phone}@rcs-travels.com
- Backend returns Clerk sign-in ticket (signInToken via Admin SDK)
- Frontend completes session: signIn.create({ strategy: "ticket", ticket })
- All downstream auth (useAuth, getToken, protect middleware) unchanged

Identity: Phone number. No passwords. No SMS cost.

---

## Drivers

Driver accounts created manually by admin.

Drivers login using:
- Phone OTP

Driver access restricted.

---

## Admin

Protected admin routes.

Only approved admin accounts allowed.

---

# Multi-Language Support

Supported languages:

- English
- Hindi
- Hinglish

Use i18next.

Translation targets:

- Customer website
- Driver app
- WhatsApp messages

---

# File Storage

Use Cloudflare R2 for:

- Driver documents
- Images
- RC uploads
- DL uploads

---

# Notification System

## Firebase Cloud Messaging

Used for:

- Incoming rides
- Ride updates
- Status changes
- Important alerts

---

## WhatsApp Notifications

Examples:

- Booking confirmed
- Driver assigned
- Ride completed
- Thank-you message

---

# Business Rules

## Commission Rules

If fare < ₹1000:
- Commission = 0%

If fare >= ₹1000:
- Commission = 5–10%

---

## GPS Rules

When driver offline:
- Stop GPS updates

If GPS stale > 10 seconds:
- Consider driver offline

---

## Driver Assignment Rules

Only assign:

- Active drivers
- Verified drivers
- Online drivers

---

# Important Architectural Decisions

## Why No WebSockets Initially?

Because:

- Low ride volume
- Polling is simpler
- Lower server cost
- Easier deployment
- Easier debugging

Upgrade to WebSockets only when scaling past ~100 concurrent live rides.

---

## Why Single Backend?

Advantages:

- Simpler architecture
- Faster development
- Easier deployment
- Easier debugging
- Lower maintenance

---

## Why Polling?

5-second polling provides:

- Good UX
- Near real-time feel
- Low complexity
- Stable infrastructure

---

# Suggested Folder Structure

## Frontend

src/
├── pages/
├── components/
├── layouts/
├── hooks/
├── services/
├── lib/
├── context/
├── routes/
├── i18n/
├── styles/
└── utils/

---

## Backend

src/
├── routes/
├── controllers/
├── services/
├── middleware/
├── db/
├── utils/
├── config/
├── jobs/
├── validators/
└── integrations/

---

# Initial MVP Priorities

Build in this order:

1. Database schema
2. Backend APIs
3. Customer booking flow
4. Admin booking management
5. Driver app basic flow
6. GPS tracking
7. Notifications
8. WhatsApp integration
9. Revenue dashboard
10. Advanced analytics

---

# Future Scaling Ideas

Potential future upgrades:

- WebSockets
- Auto driver assignment
- Surge pricing
- Payment gateway
- Wallet system
- Coupons
- Subscription rides
- Ride sharing
- AI dispatch optimization
- Heatmaps
- Route optimization
- Driver ratings
- Customer reviews

---

# Development Philosophy

This project prioritizes:

- Shipping fast
- Simplicity
- Maintainability
- Real business practicality
- Cost efficiency

Avoid overengineering.

The system should remain understandable by a small development team.

Focus on:

- Clean APIs
- Predictable state
- Stable database structure
- Clear business logic
- Modular services
- Reusable UI

---

# Important Notes For Claude Code

When generating code for this project:

1. Prefer simple scalable solutions.
2. Avoid unnecessary abstractions.
3. Use modular architecture.
4. Keep APIs RESTful.
5. Use TypeScript where possible.
6. Use reusable service layers.
7. Keep database queries optimized.
8. Use polling instead of WebSockets unless specifically requested.
9. Mobile-first responsive UI.
10. Production-grade error handling.
11. Use environment variables for all secrets.
12. Validate all API inputs.
13. Keep UI modern and minimal.
14. Use Tailwind best practices.
15. Structure code for maintainability.

---

# End Goal

A reliable production-ready cab booking platform for local operations with:

- Customer booking experience
- Real-time driver tracking
- Driver management
- Revenue tracking
- WhatsApp support
- OTP auth
- Multi-language support
- Simple scalable architecture

