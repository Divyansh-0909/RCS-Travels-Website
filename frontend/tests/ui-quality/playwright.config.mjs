import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const artifactPath = name => fileURLToPath(new URL('../../../output/handoff/' + name, import.meta.url));
export default defineConfig({
  testDir: '.', testMatch: '*.spec.mjs', outputDir: artifactPath('playwright'),
  reporter: [['list'], ['json', { outputFile: artifactPath('playwright-results.json') }]],
  workers: 2, timeout: 45_000, retries: 0,
  use: { baseURL: 'http://127.0.0.1:1575', reducedMotion: 'reduce', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node ../tools/ui-quality/serve.mjs', url: 'http://127.0.0.1:1575/dev', reuseExistingServer: true, timeout: 120_000 },
  projects: [360, 390, 768, 1280, 1440].flatMap(width => ['light', 'dark'].map(colorScheme => ({ name: `${width}-${colorScheme}`, use: { viewport: { width, height: 900 }, colorScheme } }))),
});
