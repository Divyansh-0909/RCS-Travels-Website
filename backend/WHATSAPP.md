# WhatsApp ride booking

The deterministic Meta Cloud API flow is:

`menu → book → Ride Now/Schedule → pickup → destination → vehicle + Solo/Share → confirmation`

Pickup and destination accept either a WhatsApp location pin or a typed place.
Ride Now enters the existing assignment/pooling service immediately. Scheduled
rides create the existing 15% advance obligation and remain `payment_pending`;
the rider follows the authenticated tracking-page link to complete the existing
Razorpay Checkout. Capturing it changes the ride to `confirmed`, after which the
existing scheduled-offer sweep handles it. No second payment or dispatch system
is introduced.

## Meta setup

1. Add these backend secrets: `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, and
   `WHATSAPP_APP_SECRET`. `WHATSAPP_API_VERSION` optionally pins the Graph API
   version. The app secret is from **App settings → Basic**; the
   verify token is a random value chosen by us.
2. Deploy the migration with `npm run db:deploy`, then deploy the backend.
3. In **WhatsApp → Configuration**, set the callback URL to
   `https://<api-host>/webhooks/whatsapp`, enter the same verify token, and
   subscribe to the `messages` webhook field.
4. Ensure the permanent access token can send messages for the configured phone
   number. The normalized sender must exactly match `users.phone`; unknown
   numbers receive the configured website signup URL and no account is created.

## Lifecycle templates

Interactive replies are allowed during Meta's 24-hour customer-service window.
Scheduled assignment can happen after that window, so production should approve
four utility templates and set their names in the matching environment values:

- `WHATSAPP_TEMPLATE_DRIVER_ASSIGNED`: body variables driver name, vehicle,
  registration and tracking URL.
- `WHATSAPP_TEMPLATE_DRIVER_ARRIVED`: tracking URL.
- `WHATSAPP_TEMPLATE_RIDE_COMPLETED`: booking reference and fare.
- `WHATSAPP_TEMPLATE_POOL_JOINED`: tracking URL.

Without a configured template, the service falls back to a free-text message;
Meta may reject that fallback outside the 24-hour window.

## Local webhook

1. Run the database migration and backend: `npm run db:deploy`, then
   `npm run dev` from `backend`.
2. Expose port 5000 with an HTTPS tunnel, for example
   `cloudflared tunnel --url http://localhost:5000`.
3. Put the generated HTTPS URL plus `/webhooks/whatsapp` into Meta's callback
   configuration and use the local `WHATSAPP_VERIFY_TOKEN`.
4. Subscribe to `messages`, add your phone as a test recipient, and message the
   Meta test number. The same 10-digit phone must already exist in RCS Travels.

Delivery/status receipts are acknowledged but ignored. Each inbound Meta
Conversation state reuses the existing `whatsapp_sessions` table. Each inbound
message id is claimed in `whatsapp_inbound_messages`; processed duplicates do
not advance state, reply, or create another booking. Failed work is retryable,
and a stale processing claim can be recovered after one minute.

Meta delivers inbound messages inside the 24-hour customer-service window, so
the replies in this wizard may be free-form and interactive messages. Any future
business-initiated reminder outside that window needs an approved template.
