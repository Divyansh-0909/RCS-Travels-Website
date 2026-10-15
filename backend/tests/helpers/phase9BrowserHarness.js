import express from 'express';
import { clerkMiddleware } from '@clerk/express';
import { createTestDatabase } from './database.js';
import { createBrowserAuth, browserPublishableKey } from './phase9BrowserAuth.js';
import { fileURLToPath } from 'node:url';
import { installBrowserPaymentProvider, browserCheckoutScript } from './phase9BrowserProviders.js';
import assert from 'node:assert/strict';
import { installLiveSessionFake } from './liveSessionFake.js';

export async function createBrowserHarness({ formBooking = false } = {}) {
  const database = await createTestDatabase();
  const db = database.client;
  globalThis.prisma = db;
  const { createPhase9Lifecycle, phase9FinancialSnapshot, forbidPhase9Consequences } = await import('./phase9Lifecycle.js');
  const lifecycle = await createPhase9Lifecycle(database, { deferBooking: formBooking });
  const restoreProvider = installBrowserPaymentProvider(lifecycle.provider);
  const providerPayment = lifecycle.provider.snapshot().payments[0];
  const customer = lifecycle.actors.customer;
  const admin = await db.user.create({ data: { clerkId: 'user_phase9_admin', name: 'Synthetic Review Admin',
    phone: 'phase9-admin', bookingCode: 'P9ADMIN' } });
  const foreign = await db.user.create({ data: { clerkId: 'user_phase9_foreign', name: 'Synthetic Other Customer',
    phone: 'phase9-foreign', bookingCode: 'P9OTHER' } });
  const actors = { customer, admin: { ...admin, role: 'admin' }, foreign,
    captain: lifecycle.actors.driversByGroup.rcs, replacement: lifecycle.actors.driversByGroup.partner };
  const auth = createBrowserAuth(actors);
  const liveSessions = installLiveSessionFake(actors);
  process.env.CLERK_PUBLISHABLE_KEY = browserPublishableKey;
  const app = express();
  const requests = [];
  app.use((req, res, next) => {
    const path = req.path;
    res.on('finish', () => {
      if (path.startsWith('/api/')) requests.push({ method: req.method, path, status: res.statusCode });
    });
    next();
  });
  app.use('/fixture-clerk', express.static(fileURLToPath(new URL('../../../frontend/node_modules/@clerk/clerk-js/dist/', import.meta.url))));
  app.use('/fixture-auth', express.json(), auth.middleware);
  app.get('/fixture-checkout.js', (_req, res) => {
    const payment = formBooking ? lifecycle.provider.snapshot().payments[0] : providerPayment;
    if (!payment) return res.status(409).json({ error: 'Synthetic checkout requires a UI-created order' });
    res.type('javascript').send(browserCheckoutScript(payment, lifecycle.provider.paymentSignature(payment.order_id, payment.id)));
  });
  app.use(clerkMiddleware({ publishableKey: browserPublishableKey, secretKey: 'sk_test_phase9_synthetic_only', jwtKey: auth.jwtKey }));
  app.use(express.json());
  const faults = { adminRead: false, accountRead: false, paymentOrder: false };
  app.use((req, res, next) => {
    const fault = req.path.startsWith('/api/admin/responsibility/cases/') && req.method === 'GET' ? 'adminRead'
      : req.path === '/api/users/me' ? 'accountRead'
      : req.path.endsWith('/scheduled-advance/order') ? 'paymentOrder' : null;
    if (fault && faults[fault]) { faults[fault] = false; return res.status(503).json({ error: 'Controlled upstream outage. Please retry.' }); }
    next();
  });
  const { default: users } = await import('../../routes/users.js');
  const { default: bookings } = await import('../../routes/bookings.js');
  const { default: responsibility } = await import('../../routes/responsibilityAdmin.ts');
  const { default: payments } = await import('../../routes/payments.js');
  const { default: driver } = await import('../../routes/driver.ts');
  const { default: fare } = await import('../../routes/fare.js');
  const { default: google } = await import('../../routes/googleAPI.js');
  app.use('/api/users', users);
  app.use('/api/bookings', bookings);
  app.use('/api/admin/responsibility', responsibility);
  app.use('/api/payments', payments);
  app.use('/api/driver', driver);
  app.use('/api/fare', fare);
  app.use('/api/googleAPI', google);
  app.use((_error, _req, res, _next) => res.status(500).json({ error: 'Isolated request failed' }));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  return { db, database, lifecycle, actors, auth, requests, faults, liveSessions,
    apiUrl: `http://127.0.0.1:${server.address().port}`,
    async shadow() {
      const [identity] = await db.$queryRaw`SELECT current_database() AS name`;
      assert.equal(identity.name, database.name);
      assert.match(identity.name, /^rcs_verify_[a-f0-9]{32}$/);
      const before = await phase9FinancialSnapshot(db);
      await forbidPhase9Consequences(db);
      try {
        await lifecycle.shadow();
        const after = await phase9FinancialSnapshot(db);
        if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Shadow changed financial state');
      } finally {
        await db.$executeRawUnsafe(`DO $$ DECLARE item record; BEGIN
          FOR item IN SELECT relname FROM pg_trigger JOIN pg_class ON tgrelid = pg_class.oid
            WHERE tgname = 'phase9_no_consequence' LOOP
            EXECUTE format('DROP TRIGGER phase9_no_consequence ON %I', item.relname);
          END LOOP; END $$;`);
      }
      return db.responsibilityCase.findFirstOrThrow({ where: { bookingId: lifecycle.bookingId, caseType: 'DRIVER_CANCELLATION' } });
    },
    async close() {
      liveSessions.restore();
      restoreProvider();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await lifecycle.close();
      await database.close();
    } };
}
