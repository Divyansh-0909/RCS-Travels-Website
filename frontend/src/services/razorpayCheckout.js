let loader
const loadCheckout = () => loader ??= new Promise((resolve, reject) => {
  if (window.Razorpay) return resolve()
  const script = document.createElement('script')
  script.src = 'https://checkout.razorpay.com/v1/checkout.js'
  script.onload = resolve
  script.onerror = () => reject(new Error('Could not load Razorpay Checkout'))
  document.head.appendChild(script)
})

export async function openRazorpayCheckout(checkout, { name = 'RCS Travels', description = 'Ride payment' } = {}) {
  await loadCheckout()
  return new Promise((resolve, reject) => {
    const instance = new window.Razorpay({ key: checkout.keyId, order_id: checkout.orderId,
      amount: checkout.amount, currency: checkout.currency, name, description,
      handler: resolve, modal: { ondismiss: () => reject(new Error('Payment cancelled')) } })
    instance.on('payment.failed', (event) => reject(new Error(event.error?.description || 'Payment failed')))
    instance.open()
  })
}
