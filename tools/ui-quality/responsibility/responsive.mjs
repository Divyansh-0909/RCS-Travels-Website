import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("frontend/package.json"));
const pw = require("@playwright/test");
const { expect } = pw;
const AxeBuilder = require("@axe-core/playwright").default;
const engine = process.env.REVIEW_ENGINE || "chromium";
const out =
  process.env.RESPONSIBILITY_EVIDENCE_DIR ||
  "output/handoff/responsibility-redesign-2026-10-29";
const configurations =
  engine === "chromium"
    ? [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920].flatMap((width) =>
        ["light", "dark"].map((theme) => ({
          width,
          height: width < 640 ? 844 : 1000,
          theme,
        })),
      )
    : [390, 1440].flatMap((width) =>
        ["light", "dark"].map((theme) => ({
          width,
          height: width < 640 ? 844 : 1000,
          theme,
        })),
      );
configurations.push(
  ...["light", "dark"].map((theme) => ({
    width: 844,
    height: 390,
    theme,
    landscape: true,
  })),
);
configurations.push(
  ...[320, 1440].flatMap((width) =>
    ["light", "dark"].map((theme) => ({
      width,
      height: width < 640 ? 844 : 1000,
      theme,
      text200: true,
    })),
  ),
);

const results = [],
  errors = [],
  blocked = [];
const browser = await pw[engine].launch({ headless: true });
let active;
async function scaleText(page) {
  await page.evaluate(() => {
    const elements = [
      ...document.querySelectorAll(
        '[data-testid="responsibility-page"] *, [data-slot="select-content"] *',
      ),
    ].filter((el) => el instanceof HTMLElement && !el.dataset.reviewTextScaled);
    const sizes = elements.map((el) => [
      el,
      getComputedStyle(el).fontSize,
      getComputedStyle(el).lineHeight,
    ]);
    for (const [el, size, line] of sizes) {
      el.style.fontSize = `${parseFloat(size) * 2}px`;
      if (line !== "normal") el.style.lineHeight = `${parseFloat(line) * 2}px`;
      el.dataset.reviewTextScaled = "true";
    }
  });
}
async function geometry(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="responsibility-page"]');
    const controls = [
      ...root.querySelectorAll("button,a,input,textarea"),
    ].filter(
      (el) => el.getClientRects().length && !el.hidden && el.type !== "hidden",
    );
    return {
      viewport: innerWidth,
      summaryColumns: getComputedStyle(
        root.querySelector("dl"),
      ).gridTemplateColumns.split(" ").length,
      document: document.documentElement.scrollWidth,
      smallTargets: controls
        .map((el) => ({
          name: el.getAttribute("aria-label") || el.textContent.trim(),
          width: el.getBoundingClientRect().width,
          height: el.getBoundingClientRect().height,
        }))
        .filter((box) => box.width < 43.5 || box.height < 43.5),
    };
  });
}
try {
  for (const config of configurations) {
    const key = `${engine}-${config.width}x${config.height}-${config.theme}${config.text200 ? "-text200" : ""}`;
    const ctx = await browser.newContext({
      viewport: { width: config.width, height: config.height },
      colorScheme: config.theme,
      reducedMotion: "reduce",
      isMobile: engine !== "firefox" && config.width < 640,
      hasTouch: config.width < 640,
    });
    await ctx.route("**/*", (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
        blocked.push(url.hostname);
        return route.abort();
      }
      if (url.pathname.startsWith("/api/") && request.method() !== "GET")
        throw new Error("Unexpected outgoing write");
      return route.continue();
    });
    const page = await ctx.newPage();
    active = page;
    page.on("pageerror", (error) =>
      errors.push({ key, message: error.message }),
    );
    await page.goto(
      `http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-review&fieldReview=review&workspace=1&theme=${config.theme}`,
    );
    await expect(page.getByTestId("responsibility-context")).toBeVisible({
      timeout: 20000,
    });
    await page.evaluate(() => document.fonts.ready);
    if (config.text200) await scaleText(page);
    const layout = await geometry(page);
    expect(layout.document, key + ": document overflow").toBeLessThanOrEqual(
      config.width + 1,
    );
    expect(layout.smallTargets, key + ": minimum 44px targets").toEqual([]);
    if (config.width < 640)
      expect(layout.summaryColumns, key + ": phone summary column count").toBe(
        1,
      );
    await page.screenshot({
      path: `${out}/screenshots/${key}.png`,
      fullPage: true,
      animations: "disabled",
    });

    const decision = page.getByRole("combobox", {
      name: "Human decision",
      exact: true,
    });
    await decision.click();
    await expect(
      page.getByRole("option", { name: "Uphold", exact: true }),
    ).toBeVisible();
    if (config.text200) await scaleText(page);
    const popup = await page
      .locator('[data-slot="select-content"]')
      .boundingBox();
    expect(popup.x, key + ": dropdown left").toBeGreaterThanOrEqual(-1);
    expect(popup.x + popup.width, key + ": dropdown right").toBeLessThanOrEqual(
      config.width + 1,
    );
    expect(popup.y, key + ": dropdown top").toBeGreaterThanOrEqual(-1);
    expect(
      popup.y + popup.height,
      key + ": dropdown bottom",
    ).toBeLessThanOrEqual(config.height + 1);
    await page.getByRole("option", { name: "Uphold", exact: true }).click();
    await expect(decision).toContainText("Uphold");
    await page
      .getByRole("combobox", { name: "Final classification", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Driver caused", exact: true })
      .click();
    if (config.text200) await scaleText(page);
    await page
      .getByRole("combobox", { name: "Consequence level", exact: true })
      .click();
    await page.getByRole("option", { name: "Level 2", exact: true }).click();
    const reason = page.getByRole("textbox", {
      name: "Review reason",
      exact: true,
    });
    await reason.fill("Synthetic review only; no real action is sent.");
    await page
      .getByRole("button", { name: "Save human review", exact: true })
      .click({ trial: true });
    await page.getByRole("tab", { name: "AI assessment", exact: true }).click();
    const assessmentTrigger = page.getByRole("button", {
      name: /^Assessment details/,
    });
    if ((await assessmentTrigger.getAttribute("aria-expanded")) !== "true")
      await assessmentTrigger.click();
    await expect(
      page.getByRole("region", {
        name: "Assessment details record",
        exact: true,
      }),
    ).toBeVisible();
    if (config.text200) await scaleText(page);
    const expanded = await geometry(page);
    expect(
      expanded.document,
      key + ": expanded document overflow",
    ).toBeLessThanOrEqual(config.width + 1);
    let axe;
    if ([390, 1440].includes(config.width) && !config.text200) {
      const report = await new AxeBuilder({ page })
        .include('[data-testid="responsibility-page"]')
        .analyze();
      axe = {
        violations: report.violations,
        incomplete: report.incomplete.map((rule) => ({
          id: rule.id,
          nodes: rule.nodes.length,
        })),
      };
      fs.writeFileSync(`${out}/axe-${key}.json`, JSON.stringify(axe, null, 2));
      expect(axe.violations, key + ": axe violations").toEqual([]);
    }
    results.push({
      ...config,
      engine,
      status: "PASS",
      layout,
      expanded,
      popup,
      axeViolations: axe?.violations.length,
    });
    console.log("PASS " + key);
    await ctx.close();
  }
  expect(errors).toEqual([]);
} catch (error) {
  results.push({ status: "FAIL", message: error.message });
  if (active && !active.isClosed())
    await active.screenshot({
      path: `${out}/screenshots/responsive-failure-${engine}.png`,
      fullPage: true,
    });
  throw error;
} finally {
  await browser.close();
  fs.writeFileSync(
    `${out}/responsive-${engine}.json`,
    JSON.stringify(
      { engine, results, errors, blockedHosts: [...new Set(blocked)] },
      null,
      2,
    ),
  );
}
