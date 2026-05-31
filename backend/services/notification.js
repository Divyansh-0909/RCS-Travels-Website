const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function sendFCM(driverFcmToken, payload){
    console.log('FCM →', driverFcmToken, payload)
    await delay(30000)
    return Math.round(Math.random()) === 1 ? true : false
}

function sendWhatsApp(phone, message){
    console.log(`Message to ${phone} : ${message}`)
}

export {sendFCM , sendWhatsApp}