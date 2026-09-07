let loader
const loadCheckout = () => loader ??= new Promise((resolve, reject) => {
  if (window.Razorpay) return resolve()
  const script = document.createElement('script')
  script.src = 'https://checkout.razorpay.com/v1/checkout.js'
  script.onload = resolve
  script.onerror = () => {
    loader = null
    reject(new Error('Could not load Razorpay Checkout'))
  }
  document.head.appendChild(script)
})

export async function openRazorpayCheckout(checkout, { name = 'RCS Travels', description = 'Ride payment' } = {}) {
  await loadCheckout()
  return new Promise((resolve, reject) => {
    let failureMessage = null
    const instance = new window.Razorpay({ key: checkout.keyId, order_id: checkout.orderId,
      amount: checkout.amount, currency: checkout.currency, name, description,
      handler: resolve,
      // Razorpay lets a customer retry inside the same modal. Remember a failed
      // attempt, but keep the promise open so a later successful attempt can be
      // verified. If they close instead, the page receives the useful failure.
      modal: { ondismiss: () => reject(new Error(failureMessage || 'Payment cancelled')) },
    })
    instance.on('payment.failed', (event) => {
      failureMessage = event.error?.description || 'Payment failed'
    })
    instance.open()
  })
}
