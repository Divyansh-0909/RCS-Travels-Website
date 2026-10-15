export async function createBrowserActor({ browser, url, actor, contexts,
  viewport = { width: 1440, height: 900 } }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  contexts.push(context);
  await context.tracing.start({ screenshots: true, snapshots: true });
  await context.route('**/*', async route => {
    const parsed = new URL(route.request().url());
    if (parsed.href === 'https://checkout.razorpay.com/v1/checkout.js') {
      return route.fulfill({ response: await context.request.get(url + '/fixture-checkout.js') });
    }
    if (['127.0.0.1', 'localhost'].includes(parsed.hostname) || ['data:', 'blob:'].includes(parsed.protocol)) return route.continue();
    return route.abort('blockedbyclient');
  });
  if (actor) await context.addCookies([{ name: 'fixture_actor', value: actor, url, httpOnly: true }]);
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90000);
  page.setDefaultTimeout(30000);
  return { page, context };
}
