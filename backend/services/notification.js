// Both of these are STUBS. Nothing is delivered anywhere — sendFCM fakes a driver's
// answer with a coin flip and sendWhatsApp only logs, which is why OTPs show up in
// the backend console. Real integrations land in Phase 6.
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

export {sendFCM , sendWhatsApp}