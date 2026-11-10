import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.resolve("frontend/package.json"));
const { chromium, expect } = require("@playwright/test");
const browser = await chromium.launch({ headless: true }),
  checks = [];
try {
  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "no-preference",
    });
    await ctx.route("**/*", (r) =>
      ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname)
        ? r.continue()
        : r.abort(),
    );
    const page = await ctx.newPage();
    await page.goto(
      `http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-review&fieldReview=review&workspace=1&theme=${theme}`,
    );
    await expect(page.getByTestId("responsibility-context")).toBeVisible({
      timeout: 20000,
    });
    const initialReads = await page.evaluate(
      () => window.__RCS_FIELD_REVIEW__.requests.length,
    );
    const button = page.getByRole("button", {
      name: "Refresh case",
      exact: true,
    });
    const box = await button.boundingBox(),
      cdp = await ctx.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await expect(page.getByTestId("responsibility-page")).toHaveAttribute(
      "data-motion-input",
      "pointer",
    );
    await expect
      .poll(() =>
        button.evaluate(
          (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a,
        ),
      )
      .toBeLessThan(1);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await expect(page.getByTestId("responsibility-page")).toHaveAttribute(
      "data-motion-input",
      "keyboard",
    );
    expect(await button.evaluate((el) => getComputedStyle(el).transform)).toBe(
      "none",
    );
    expect(
      await page.evaluate(() => window.__RCS_FIELD_REVIEW__.requests.length),
    ).toBe(initialReads);
    checks.push({
      theme,
      input: "Chromium CDP touch emulation",
      pressFeedback: true,
      cancelClearsPressImmediately: true,
      noRefreshOrWriteOnCancel: true,
    });
    await cdp.detach();
    await ctx.close();
    console.log(`PASS touch cancellation ${theme}`);
  }
} finally {
  await browser.close();
  fs.writeFileSync(
    "output/handoff/responsibility-motion-2026-10-30/touch.json",
    JSON.stringify({ checks, physicalDevice: false }, null, 2),
  );
}
