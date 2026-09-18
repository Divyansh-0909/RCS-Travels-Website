const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const outDir = path.join(process.cwd(), '.tmp-services-qa');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });

  const cases = [
    { name: 'desktop-initial', width: 1440, height: 900, y: 0 },
    { name: 'desktop-mid', width: 1440, height: 900, y: 620 },
    { name: 'desktop-final', width: 1440, height: 900, y: 1080 },
    { name: 'mobile-initial', width: 390, height: 844, y: 0 },
    { name: 'mobile-mid', width: 390, height: 844, y: 430 },
    { name: 'mobile-final', width: 390, height: 844, y: 760 },
  ];

  for (const scenario of cases) {
    const page = await browser.newPage({
      viewport: { width: scenario.width, height: scenario.height },
    });

    await page.goto('http://127.0.0.1:5177/dev/services', { waitUntil: 'networkidle' });
    await page.locator('.services-scene').waitFor({ state: 'visible' });
    await page.evaluate((y) => window.scrollTo(0, y), scenario.y);
    await page.waitForTimeout(900);

    const metrics = await page.evaluate(() => {
      const box = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          opacity: style.opacity,
          visibility: style.visibility,
          transform: style.transform,
        };
      };

      return {
        scrollY: Math.round(scrollY),
        headline: box('.services-scene__headline'),
        rider: box('.services-rider-figure'),
        cases: box('.services-use-cases'),
        campus: box('.services-campus'),
        sun: box('.services-sun'),
      };
    });

    console.log(scenario.name, JSON.stringify(metrics));
    await page.screenshot({ path: path.join(outDir, `${scenario.name}.png`) });
    await page.close();
  }

  await browser.close();
})();
