// Runs the real finance panel and useApi in Chromium, with local-only API/auth fixtures.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import DriverFinancePanel from './src/components/DriverFinancePanel.tsx';
window.requests = [];
window.account = 'admin-a';
window.fetch = async (url, options) => {
  window.requests.push({url, authorization: options.headers.Authorization});
  return Response.json(url.includes('/finance') && !url.includes('reconciliation')
    ? (location.search.includes('success')
      ? { balances: { available: 0, held: 0, total: 0 }, payoutAccount: {}, openHolds: [] }
      : { error: 'Fixture: finance unavailable' }) : { drivers: [], batches: [] });
};
function App() {
  const [tick, setTick] = useState(0);
  const [driver, setDriver] = useState('driver-one');
  return <><button onClick={() => setTick(tick + 1)}>Rerender {tick}</button>
    <button onClick={() => { window.account = 'admin-b'; setDriver('driver-two'); }}>Switch fixture account</button>
    <DriverFinancePanel driverId={driver} /></>;
}
createRoot(document.getElementById('root')).render(<App />);
`;
const bundle = await build({
    stdin: { contents: fixture, resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'jsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'import.meta.env.VITE_API_BASE_URL': '"http://fixture.invalid"' },
    plugins: [{ name: 'fixture-clerk', setup(plugin) {
        plugin.onResolve({ filter: /^@clerk\/clerk-react$/ }, () => ({ path: 'clerk', namespace: 'fixture' }));
        plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
            export const useAuth = () => { const account = window.account; return { getToken: async () => account }; };
            export const useClerk = () => ({ signOut: async () => {} });
        ` }));
    } }],
});
const server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/app.js' ? 'application/javascript' : 'text/html');
    res.end(req.url === '/app.js' ? bundle.outputFiles[0].text : '<div id="root"></div><script src="/app.js"></script>');
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
try {
    browser = await chromium.launch({ headless: true });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      for (const mode of ['success', 'error']) {
        const page = await browser.newPage({ viewport });
        await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);
        await page.getByText(mode === 'success' ? 'Manual wallet adjustment' : 'Fixture: finance unavailable', { exact: true }).waitFor();
        for (let n = 0; n < 30; n++) await page.getByRole('button', { name: /^Rerender/ }).click();
        if (mode === 'success') {
            for (let n = 0; n < 10; n++) await page.getByPlaceholder('Reason / audit note').fill(`Fixture note ${n}`);
        }
        assert.equal(await page.evaluate(() => window.requests.length), 3, 'rerenders must not restart finance requests');
        await page.getByRole('button', { name: 'Switch fixture account' }).click();
        await page.waitForFunction(() => window.requests.length >= 6);
        const requests = await page.evaluate(() => window.requests);
        assert.equal(requests.length, 6);
        assert.ok(requests.slice(3).every(request => request.authorization === 'Bearer admin-b'), 'stable methods must use current auth');
        console.log(`PASS ${viewport.width}px ${mode}: 30 rerenders = 3 initial reads; account/driver change = 3 fresh reads with current token`);
        await page.close();
      }
    }
} finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}
