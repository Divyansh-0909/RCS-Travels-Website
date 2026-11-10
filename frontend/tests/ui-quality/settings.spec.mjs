import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ context }, info) => {
  await context.addInitScript(theme => { if (!localStorage.getItem('rcs.website.theme')) localStorage.setItem('rcs.website.theme', theme); }, info.project.use.colorScheme);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    return route.continue();
  });
});
async function notifications(page) {
  await page.goto('/dev/settings', { waitUntil: 'domcontentloaded' });
  await page.getByText('Notifications', { exact: true }).first().click();
  await expect(page.getByRole('switch', { name: 'Ride updates', exact: true })).toBeEnabled();
}
test('named switches support keyboard, focus, fixture persistence, AA audit and responsive layout', async ({ page }, info) => {
  const writes = [];
  let preferences = { notifications: { whatsapp: true, push: true, promotions: false } };
  await page.route('**/api/users/me/preferences', route => {
    if (route.request().method() === 'PUT') preferences = { ...preferences, notifications: { ...preferences.notifications, ...route.request().postDataJSON().notifications } };
    return route.fulfill({ json: preferences });
  });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', req => { if (req.method() === 'PUT' && req.url().endsWith('/preferences')) writes.push(req.postDataJSON()); });
  await notifications(page);
  const control = page.getByRole('switch', { name: 'Ride updates', exact: true });
  const initial = await control.getAttribute('aria-checked');
  await control.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); await expect(control).toBeFocused();
  const outline = await control.evaluate(el => ({ style: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth }));
  expect(outline.style).not.toBe('none'); expect(Number.parseFloat(outline.width)).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Space');
  await expect(control).toHaveAttribute('aria-checked', initial === 'true' ? 'false' : 'true');
  await expect(control).toBeEnabled(); expect(writes).toHaveLength(1);
  expect(writes[0].notifications.whatsapp).toBe(initial !== 'true');
  await page.reload(); await page.getByText('Notifications', { exact: true }).first().click();
  await expect(page.getByRole('switch', { name: 'Ride updates', exact: true })).toHaveAttribute('aria-checked', initial === 'true' ? 'false' : 'true');
  await expect(page.getByRole('switch', { name: 'Push', exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Promotions', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', info.project.use.colorScheme);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
  expect(pageErrors).toEqual([]);
});
test('loading disables switches and a failed update preserves the previous preference', async ({ page }) => {
  let releaseRead;
  const gate = new Promise(resolve => { releaseRead = resolve; });
  await page.route('**/api/users/me/preferences', async route => {
    if (route.request().method() === 'GET') { await gate; return route.fulfill({ json: { notifications: { whatsapp: true, push: true, promotions: false } } }); }
    return route.fulfill({ status: 503, json: { error: 'Synthetic unavailable response' } });
  });
  await page.goto('/dev/settings', { waitUntil: 'domcontentloaded' });
  await page.getByText('Notifications', { exact: true }).first().click();
  const control = page.getByRole('switch', { name: 'Ride updates', exact: true });
  await expect(control).toBeDisabled(); releaseRead(); await expect(control).toBeEnabled();
  await control.click(); await expect(control).toBeEnabled();
  await expect(control).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText("Couldn't save this preference. Please try again.")).toBeVisible();
});
test('theme preference uses the real application selector and persists across reload', async ({ page }) => {
  await page.goto('/dev/settings', { waitUntil: 'domcontentloaded' });
  await page.getByText('Theme', { exact: true }).first().click();
  await page.getByRole('radio').filter({ hasText: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByText('Theme', { exact: true }).first().click();
  await page.getByRole('radio').filter({ hasText: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
