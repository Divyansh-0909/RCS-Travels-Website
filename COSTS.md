# Running Costs — RCS Travels Platform

Last updated: 2026-07-30. All amounts in INR unless noted.

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
| Supabase Storage | Driver documents (free to 1 GB — see below; replaces the planned R2) | ₹0 |
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

## Driver documents (Supabase Storage, free tier = 1 GB + 5 GB egress/month)

Eight compulsory files per driver — DL, RC, insurance, road tax, fitness, All India permit,
and the two car photos — plus up to two conditional ones (one-year permit, CNG cylinder test).
Call it **8–10 files per driver**. Everything below follows from what those files weigh:

| Upload handling | Per file | Per driver | Drivers before 1 GB |
|---|---|---|---|
| Straight off the camera | ~2.5 MB | ~20–25 MB | **~40** |
| Compressed on device (recommended: long edge 1600px, JPEG q75) | ~400 KB | ~3–4 MB | **~250** |

At 3 drivers today, and a fleet realistically in the tens, **compressed uploads keep this at ₹0
indefinitely**. Uncompressed, a fleet of 40 exhausts the free tier — that is the entire risk here,
and it is settled in the upload code, not in a plan.

Egress is a non-issue: an admin reviewing one driver's full set pulls ~4 MB, so the 5 GB/month
allowance is ~1,250 reviews. Nobody reads these except at approval and renewal.

Beyond the free tier the marginal price is **~$0.021/GB/month (~₹1.80)** — about **₹0.007 per
driver per month** compressed. Supabase Pro ($25/mo, ~₹2,150) includes 100 GB, which is ~25,000
drivers' worth; storage will therefore never be what triggers that upgrade. The 500 MB database
limit gets there first.

**Renewals are the slow leak.** Insurance, tax, fitness and the permits all lapse yearly, so
roughly six files per driver are replaced every year. The `[driverId, type]` unique key replaces
the row, but the old object survives in the bucket unless the upload path deletes it — left
alone, that is ~2.4 MB per driver per year of files nobody can reach.

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
- Images/documents go to Supabase Storage (private bucket, signed URLs), never into Postgres.
- **Compress every document upload on the device before it leaves it.** The whole free tier
  turns on this one decision — see the driver-document table above.
- Replacing a renewed document must **delete the old object**, not just overwrite the row. The
  `[driverId, type]` unique key replaces the database row for free; the storage bucket keeps the
  old file forever unless something removes it.
- Google Routes calls stay behind the 10,000/month self-cap in the `api_usage` table; apply the same pattern to Places autocomplete when the pickup map is built.
