// sendFCM and sendWhatsApp are STUBS — sendFCM fakes a driver's answer with a coin
// flip and sendWhatsApp only logs. Their real integrations land in Phase 6, and the
// free-text sendWhatsApp callers will each need an approved utility template by then
// (WhatsApp only allows free text inside a 24h reply window). sendOtpWhatsApp is
// real: it delivers via the Cloud API using the approved verification_otp template.
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// The 30s wait imitates a driver deciding; true means ACCEPTED, not delivered.
async function sendFCM(driverFcmToken, payload){
    console.log('FCM →', driverFcmToken, payload)
    // Skips the wait and the coin flip so the first eligible driver is assigned
    // deterministically. Dev only — set FCM_ALWAYS_ACCEPT=0 before deploying.
    if (process.env.FCM_ALWAYS_ACCEPT === '1') return true
    await delay(30000)
    return Math.round(Math.random()) === 1 ? true : false
}

function sendWhatsApp(phone, message){
    console.log(`Message to ${phone} : ${message}`)
}

// Authentication templates require the code twice: once for the body text and once
// for the copy-code button's url parameter. `phone` is the bare 10-digit number the
// routes validate; the 91 prefix matches the convention used for Clerk emails.
async function sendOtpWhatsApp(phone, code){
    const res = await fetch(
        `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: `91${phone}`,
                type: 'template',
                template: {
                    name: 'verification_otp',
                    language: { code: 'en_US' },
                    components: [
                        { type: 'body', parameters: [{ type: 'text', text: code }] },
                        { type: 'button', sub_type: 'url', index: '0',
                          parameters: [{ type: 'text', text: code }] },
                    ],
                },
            }),
        }
    )
    if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`)
}

export {sendFCM , sendWhatsApp, sendOtpWhatsApp}