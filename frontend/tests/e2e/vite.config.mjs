import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

if (process.env.PHASE9_ISOLATED !== '1') throw new Error('Use the isolated Phase 9 UI runner');

export default defineConfig({
  envDir: process.env.PHASE9_EMPTY_ENV_DIR,
  plugins: [{ name: 'isolated-clerk-provider', enforce: 'pre', transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/main.jsx')) return;
    return code.replace('<ClerkProvider publishableKey={PUBLISHABLE_KEY}>',
      '<ClerkProvider publishableKey={PUBLISHABLE_KEY} clerkJSUrl="/fixture-clerk/clerk.headless.browser.js" proxyUrl="/fixture-auth">');
  } }, react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 0, proxy: {
    '/api': process.env.PHASE9_BROWSER_API,
    '/fixture-backend': { target: process.env.PHASE9_BROWSER_API, rewrite: path => path.replace(/^\/fixture-backend/, '') },
    '/fixture-auth': { target: process.env.PHASE9_BROWSER_API, rewrite: path => path.replace(/^\/fixture-auth/, '/fixture-auth') },
    '/fixture-clerk': process.env.PHASE9_BROWSER_API,
    '/fixture-checkout.js': process.env.PHASE9_BROWSER_API,
  } },
});
