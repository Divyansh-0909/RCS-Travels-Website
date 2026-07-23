# Running Costs — RCS Travels Platform

Last updated: 2026-07-23. All amounts in INR unless noted.

## Monthly (recurring)

| Service | Role | Cost |
|---|---|---|
| WhatsApp Cloud API | OTP + booking messages (starts at go-live) | ₹300–500 |
| Domain (₹800/yr) | Website address | ~₹65 |
| Spare SIM recharge | Keeps the WhatsApp business number's verification lifeline alive | ~₹30 |
| Render (free tier + UptimeRobot keep-alive ping) | Express backend | ₹0 |
| Supabase (free tier + daily keep-alive ping) | PostgreSQL database (replaces Neon) | ₹0 |
| Vercel | Frontend hosting | ₹0 |
| Clerk | Auth (free to 10,000 MAU) | ₹0 |
| Google Maps Platform | Fare distance lookups (self-capped at 10k calls/mo via `api_usage` table) | ₹0 |
| Firebase FCM | Driver push notifications | ₹0 |
| Cloudflare R2 | Driver document storage (free to 10 GB) | ₹0 |
| **Total** | | **~₹400–600 / month** |

## One-time

| Item | Cost | Notes |
|---|---|---|
| Google Cloud Console billing setup | ₹1,000 | Refundable verification charge — returned if the billing account/project is closed |
| Google Play developer account | ~₹2,200 ($25) | Non-refundable. Only needed if/when the driver app is published; sideloading the APK to drivers is free |

**First-year total: ~₹8,000–9,500** (₹1,000 of which is refundable).

## WhatsApp per-message costs (India, Cloud API)

| Message type | Cost | Used for |
|---|---|---|
| Authentication template | ~₹0.115 | Login OTP |
| Utility template | ~₹0.115 | Booking confirmed, driver assigned, admin alerts |
| Utility inside 24h service window | Free | Same messages when customer messaged us within 24h |
| Customer-initiated conversation (bot replies) | Free | WhatsApp booking bot |
| Marketing template | ~₹0.78 | NOT used — promo blasts would need a budget conversation first |

Rule of thumb: **~₹0.25–0.40 per booking** (2–3 outbound messages).

## Known future upgrades (not subscribed — deliberate)

| Trigger | Upgrade | Cost |
|---|---|---|
| Backend restarts/slowness hurt customers (OTP hangs, webhook misses) | Render Starter | ~₹600/mo ($7) |
| Vercel enforces its non-commercial Hobby ToS | Move frontend to Cloudflare Pages/Netlify (free) — do NOT pay Vercel Pro (₹1,700/mo) | ₹0 |
| Supabase 500 MB DB limit approached (years away; DB is ~40 MB with test data) | Supabase Pro | ~$25/mo |
| Clerk crosses 10,000 monthly active users | Clerk Pro | ~$25/mo |

## Design rules that keep the bill at ₹0 for infra

- `/health` (the UptimeRobot keep-alive target) must **never query the database**.
- Supabase free pauses a project after 7 days of zero activity — a **daily cron-job.org REST ping** (GET with `apikey` header) per project prevents this.
- Driver GPS is **one upserted row per driver**, never an append-only trail. Adding route-history logging would blow the DB free tier — needs retention limits + its own plan.
- Images/documents go to R2, never into Postgres.
- Google Routes calls stay behind the 10,000/month self-cap in the `api_usage` table; apply the same pattern to Places autocomplete when the pickup map is built.
