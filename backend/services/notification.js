const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function sendFCM(driverFcmToken, payload){
    console.log('FCM →', driverFcmToken, payload)
    // Testing short-circuit: skip the 30s wait + coin flip and accept immediately,
    // so the first eligible driver is assigned deterministically. Enable with
    // FCM_ALWAYS_ACCEPT=1 in the backend env. Do NOT set this in production.
    if (process.env.FCM_ALWAYS_ACCEPT === '1') return true
    await delay(30000)
    return Math.round(Math.random()) === 1 ? true : false
}

function sendWhatsApp(phone, message){
    console.log(`Message to ${phone} : ${message}`)
}

export {sendFCM , sendWhatsApp}