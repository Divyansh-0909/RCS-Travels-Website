import axios from 'axios';
import { createRequire } from 'node:module';

// Replace external provider transport only. Protected routes, pricing, payment,
// cancellation, ledger and responsibility services execute their actual code.
export function installBrowserPaymentProvider(provider) {
  const adapter = async config => {
    const url = new URL(config.url, config.baseURL);
    if (url.hostname !== 'api.razorpay.com') throw new Error('Unexpected provider transport');
    const path = url.pathname.replace(/^\/v1/, '');
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    let data;
    if (/^\/payments\/[^/]+$/.test(path) && config.method === 'get') data = await provider.gateway.fetchPayment(path.split('/')[2]);
    else if (path === '/orders' && config.method === 'post') data = await provider.gateway.createOrder(body);
    else if (path === '/orders' && config.method === 'get') data = { items: await provider.gateway.findOrdersByReceipt(config.params.receipt) };
    else if (/^\/payments\/[^/]+\/refund$/.test(path) && config.method === 'post') data = await provider.gateway.createRefund(path.split('/')[2],
      { ...body, idempotencyKey: config.headers.get('X-Refund-Idempotency') });
    else if (/^\/payments\/[^/]+\/refunds$/.test(path) && config.method === 'get') data = { items: await provider.gateway.findRefundsByPayment(path.split('/')[2]) };
    else throw new Error(`Unsupported synthetic payment operation: ${config.method} ${path}`);
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
  const original = axios.defaults.adapter;
  axios.defaults.adapter = adapter;
  const require = createRequire(import.meta.url);
  const razorpayRequire = createRequire(require.resolve('razorpay'));
  const sdkAxios = razorpayRequire('axios');
  const sdkOriginal = sdkAxios.defaults.adapter;
  sdkAxios.defaults.adapter = adapter;
  return () => { sdkAxios.defaults.adapter = sdkOriginal; axios.defaults.adapter = original; };
}

export function browserCheckoutScript(payment, signature) {
  return `window.Razorpay = class {
    constructor(options) { this.options = options; }
    on() {}
    open() {
      const dialog = document.createElement('dialog');
      const text = document.createElement('p'); text.textContent = 'Synthetic payment provider · no real charge';
      const button = document.createElement('button'); button.textContent = 'Complete synthetic payment';
      button.onclick = () => { dialog.close(); dialog.remove(); this.options.handler(${JSON.stringify({
        razorpay_order_id: payment.order_id, razorpay_payment_id: payment.id, razorpay_signature: signature,
      })}); };
      dialog.append(text, button); document.body.append(dialog); dialog.showModal();
    }
  };`;
}
