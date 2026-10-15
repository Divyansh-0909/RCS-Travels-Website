import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const surfaces = {
  'users.js': ['/api/users', 'customer'], 'bookings.js': ['/api/bookings', 'customer/shared'],
  'driver.ts': ['/api/driver', 'captain'], 'admin.ts': ['/api/admin', 'admin'],
  'responsibilityAdmin.ts': ['/api/admin/responsibility', 'admin'], 'payments.js': ['/api/payments', 'customer/shared'],
  'fare.js': ['/api/fare', 'public / customer coupon'],
};
const report = { schema: 'human-session-route-inventory-v1', routes: [], sources: {},
  independent: [
    { mount: '/api/payments/razorpay/webhook', authentication: 'Razorpay HMAC over raw bytes, before Clerk', source: 'backend/index.js' },
    { mount: '/api/payouts/razorpayx/webhook', authentication: 'RazorpayX HMAC over raw bytes, before Clerk', source: 'backend/index.js' },
    { mount: '/webhooks/whatsapp', authentication: 'Meta raw-body signature / verification challenge, before Clerk', source: 'backend/index.js' },
    { mount: '/internal', authentication: 'Google OIDC plus job authorization, before Clerk', source: 'backend/middleware/internalAuth.js' },
    { mount: '/captain-payment/checkout', authentication: 'Scoped expiring HMAC checkout token, before Clerk', source: 'backend/routes/driverCheckout.js' },
    { mount: '/api/share/:token', authentication: 'Scoped public sharing capability and limiter', source: 'backend/routes/share.js' },
    { mount: '/api/auth', authentication: 'Public OTP syntax / atomic consume / per-phone abuse budget; mints Clerk ticket', source: 'backend/routes/hybridAuth.js' },
    { mount: '/api/googleAPI', authentication: 'Public IP-limited address/maps proxy', source: 'backend/routes/googleAPI.js' },
    { mount: '/health', authentication: 'Public liveness', source: 'backend/index.js' },
  ] };
const index = await readFile('backend/index.js', 'utf8');
for (const file of await readdir('backend/routes')) {
  if (!/\.(js|ts)$/.test(file)) continue;
  const source = await readFile('backend/routes/' + file, 'utf8');
  if (/getAuth\(|req\.auth/.test(source)) assert(Object.hasOwn(surfaces, file), 'Uninventoried human identity consumer: ' + file);
}
assert(index.includes('app.use(protectedApiPrefixes, protect)'));
assert(index.indexOf('app.use(protectedApiPrefixes, protect)') < index.indexOf("app.use('/api/bookings', bookingsRouter)"));
for (const [file, [prefix, actor]] of Object.entries(surfaces)) {
  const source = await readFile('backend/routes/' + file, 'utf8');
  report.sources['backend/routes/' + file] = createHash('sha256').update(source).digest('hex');
  if (file !== 'fare.js') assert(index.includes("'" + prefix.split('/responsibility')[0] + "'"));
  for (const [offset, line] of source.split(/\r?\n/).entries()) {
    const match = line.match(/\w+Router\.(get|post|put|patch|delete)\('([^']+)',\s*(.*)/);
    if (!match) continue;
    const middleware = match[3].split(/(?:async\s*)?\(/)[0].split(',').map(value => value.trim()).filter(Boolean);
    const session = middleware.includes('protect') || middleware.includes('protectCoupon');
    assert(session, file + ':' + (offset + 1) + ' has no shared guard');
    if (actor === 'admin') assert(middleware.includes('protectAdmin'));
    report.routes.push({ method: match[1].toUpperCase(), path: prefix + (match[2] === '/' ? '' : match[2]), actor,
      authentication: file === 'fare.js' ? 'Clerk session + live getSession when couponId exists; otherwise public' : 'Clerk session + live getSession',
      middleware, source: 'backend/routes/' + file, line: offset + 1 });
  }
}
report.protectedRoutes = report.routes.filter(row => row.actor !== 'public / customer coupon').length;
report.sources['backend/index.js'] = createHash('sha256').update(index).digest('hex');
await writeFile('output/session-revocation-2026-10-12/route-inventory.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ protectedRoutes: report.protectedRoutes, optionalCouponRoutes: 1,
  byActor: Object.fromEntries([...new Set(report.routes.map(row => row.actor))].map(actor => [actor, report.routes.filter(row => row.actor === actor).length])) }));
