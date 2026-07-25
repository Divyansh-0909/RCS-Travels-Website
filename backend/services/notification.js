const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function sendFCM(driverFcmToken, payload){
    console.log('FCM →', driverFcmToken, payload)
    // Testing short-circuit: skip the 30s wait + coin flip so the first eligible
    // driver is assigned deterministically. FCM_ALWAYS_ACCEPT=1 — never in production.
    if (process.env.FCM_ALWAYS_ACCEPT === '1') return true
    await delay(30000)
    return Math.round(Math.random()) === 1 ? true : false
}

function sendWhatsApp(phone, message){
    console.log(`Message to ${phone} : ${message}`)
}

export {sendFCM , sendWhatsApp}