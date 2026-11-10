import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.resolve("frontend/package.json"));
const pw = require("@playwright/test"),
  { expect } = pw;
const AxeBuilder = require("@axe-core/playwright").default;
const out = "output/handoff/responsibility-records-2026-10-30";
const checks = [],
  errors = [];
const address = (theme, id = "synthetic-timeline") =>
  `http://127.0.0.1:1575/dashboard/responsibility?fieldReview=review&workspace=1&theme=${theme}${id ? "&case=" + id : ""}`;
async function scaleText(page) {
  await page.evaluate(() => {
    const sizes = [
      ...document.querySelectorAll('[data-testid="responsibility-page"] *'),
    ]
      .filter((el) => el instanceof HTMLElement && !el.dataset.recordsScaled)
      .map((el) => [
        el,
        getComputedStyle(el).fontSize,
        getComputedStyle(el).lineHeight,
      ]);
    for (const [el, size, line] of sizes) {
      el.style.fontSize = `${parseFloat(size) * 2}px`;
      if (line !== "normal") el.style.lineHeight = `${parseFloat(line) * 2}px`;
      el.dataset.recordsScaled = "true";
    }
  });
}
for (const engine of ["chromium", "firefox", "webkit"]) {
  const browser = await pw[engine].launch({ headless: true });
  let active;
  const configs = (
    engine === "chromium" ? [320, 390, 768, 1440] : [390, 1440]
  ).flatMap((width) =>
    ["light", "dark"].map((theme) => ({ width, theme, text200: false })),
  );
  if (engine === "chromium")
    configs.push(
      ...[320, 1440].flatMap((width) =>
        ["light", "dark"].map((theme) => ({ width, theme, text200: true })),
      ),
    );
  try {
    for (const config of configs) {
      const { width, theme, text200 } = config,
        key = `${engine}-${width}-${theme}${text200 ? "-text200" : ""}`;
      const ctx = await browser.newContext({
        viewport: { width, height: width < 640 ? 844 : 1000 },
        timezoneId: "America/Los_Angeles",
        reducedMotion: "reduce",
      });
      await ctx.route("**/*", (r) =>
        ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname)
          ? r.continue()
          : r.abort(),
      );
      const page = await ctx.newPage();
      active = page;
      page.setDefaultTimeout(10000);
      page.on("pageerror", (error) =>
        errors.push({ key, message: error.message }),
      );
      await page.goto(address(theme));
      await expect(page.getByTestId("responsibility-context")).toBeVisible({
        timeout: 25000,
      });
      await page.evaluate(() => document.fonts.ready);
      if (text200) await scaleText(page);
      const initial = await page.evaluate(() =>
        structuredClone(window.__RCS_FIELD_REVIEW__.context),
      );
      const evidence = page.getByRole("region", {
        name: "Evidence summary record",
        exact: true,
      });
      await expect(evidence).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Evidence summary", exact: true }),
      ).toHaveAttribute("aria-expanded", "true");
      const events = evidence
        .getByRole("list", { name: "Recorded events", exact: true })
        .locator(":scope > li");
      await expect(events).toHaveCount(initial.evidence.timeline.length);
      await expect(
        evidence.getByRole("list", { name: "Recorded events", exact: true }),
      ).toHaveAttribute("data-record-timeline", "true");
      await expect(events.nth(0)).toContainText("Ride accepted");
      await expect(events.nth(1)).toContainText("Driver cancellation recorded");
      await expect(events.nth(0)).toContainText("29 Oct 2026");
      await expect(events.nth(0)).toContainText("10:00:00 AM IST");
      expect(
        await events.nth(0).locator("time").first().getAttribute("datetime"),
      ).toBe(initial.evidence.timeline[0].observedAt);
      const eventDetails = events
        .nth(0)
        .getByRole("button", { name: "Event details", exact: true });
      await eventDetails.focus();
      await page.keyboard.press("Enter");
      await expect(eventDetails).toHaveAttribute("aria-expanded", "true");
      if (text200) await scaleText(page);
      await expect(events.nth(0)).toContainText("10:00:01 AM IST");
      await eventDetails.press("Enter");
      await expect(eventDetails).toHaveAttribute("aria-expanded", "false");
      const original = evidence.getByRole("button", {
        name: "Original record",
        exact: true,
      });
      const source = evidence.locator(
        'pre[aria-label="Evidence summary original record"]',
      );
      await expect(source).toHaveCount(0);
      await original.focus();
      await page.keyboard.press("Enter");
      await expect(source).toBeVisible();
      expect(JSON.parse(await source.textContent())).toEqual(initial.evidence);
      if (text200) await scaleText(page);
      if ([390, 1440].includes(width) && !text200) {
        const axe = await new AxeBuilder({ page })
          .include(
            'section[aria-label="Recorded evidence and decision history"]',
          )
          .analyze();
        fs.writeFileSync(
          `${out}/axe-${key}.json`,
          JSON.stringify(
            {
              violations: axe.violations,
              incomplete: axe.incomplete.map((r) => ({
                id: r.id,
                nodes: r.nodes.length,
              })),
            },
            null,
            2,
          ),
        );
        expect(axe.violations.map((r) => r.id)).toEqual([]);
      }
      await original.press("Enter");
      await expect(source).toHaveCount(0);
      await expect(original).toBeFocused();
      expect(
        await page.evaluate(() =>
          JSON.stringify(window.__RCS_FIELD_REVIEW__.context),
        ),
      ).toBe(JSON.stringify(initial));
      const versions = page.getByRole("button", { name: /^Evidence versions/ });
      await versions.click();
      await expect(
        page.getByRole("region", {
          name: "Evidence versions record",
          exact: true,
        }),
      ).toContainText("Version 3");
      await expect(
        page.getByRole("region", {
          name: "Evidence versions record",
          exact: true,
        }),
      ).toContainText("10:05:00 AM IST");
      await expect(
        page
          .getByRole("region", {
            name: "Evidence versions record",
            exact: true,
          })
          .locator("[data-record-timeline] > li"),
      ).toHaveCount(initial.evidenceVersions.length);
      if (text200) await scaleText(page);
      await page
        .getByRole("heading", { name: "Evidence & decisions", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${out}/screenshots/${key}-evidence.png`,
        fullPage: true,
        animations: "disabled",
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);

      await page
        .getByRole("tab", { name: "AI assessment", exact: true })
        .click();
      const assessment = page.getByRole("region", {
        name: "Assessment details record",
        exact: true,
      });
      await expect(assessment).toContainText(
        "Conflicting accounts require an authorized human review.",
      );
      await assessment
        .getByRole("button", { name: "Original record", exact: true })
        .click();
      await page.getByRole("button", { name: /^Assessment history/ }).click();
      const history = page.getByRole("region", {
        name: "Assessment history record",
        exact: true,
      });
      await expect(history.locator("[data-record-timeline] > li")).toHaveCount(
        initial.shadowHistory.length,
      );
      await expect(history).toContainText("10:05:30 AM IST");
      expect(
        JSON.parse(
          await assessment
            .locator('pre[aria-label="Assessment details original record"]')
            .textContent(),
        ),
      ).toEqual(initial.shadowResult.analysisEnvelope);
      expect(await page.locator("body").textContent()).not.toContain(
        "synthetic-production-envelope",
      );
      await assessment
        .getByRole("button", { name: "Original record", exact: true })
        .click();
      if (text200) await scaleText(page);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      await page.getByRole("tab", { name: "Decisions", exact: true }).click();
      const stages = page.locator("[data-record-stage]");
      await expect(stages).toHaveCount(4);
      await expect(stages.nth(1)).toContainText("Not recorded");
      await expect(
        page.getByRole("region", {
          name: "Provisional decision record",
          exact: true,
        }),
      ).toContainText("Needs review");
      if (text200) await scaleText(page);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);

      await page.goto(address(theme, "synthetic-final"));
      await expect(page.getByTestId("responsibility-context")).toBeVisible({
        timeout: 25000,
      });
      await page.getByRole("tab", { name: "Decisions", exact: true }).click();
      const final = page.getByRole("region", {
        name: "Final decision record",
        exact: true,
      });
      await expect(final).toContainText("Waive");
      await expect(final).toContainText("10:10:00 AM IST");
      expect(
        await page
          .getByRole("button", { name: /^Final decision/ })
          .locator("time")
          .getAttribute("datetime"),
      ).toBe("2026-10-29T04:40:00Z");
      await expect(
        page.locator('[data-record-stage][data-recorded="true"]'),
      ).toHaveCount(2);
      await expect(
        page.getByRole("button", { name: "Save human review", exact: true }),
      ).toHaveCount(0);
      if (text200) await scaleText(page);
      await page.screenshot({
        path: `${out}/screenshots/${key}-decisions.png`,
        fullPage: true,
        animations: "disabled",
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      expect(
        await page.evaluate(() =>
          window.__RCS_FIELD_REVIEW__.requests.every((r) => r.method === "GET"),
        ),
      ).toBe(true);
      checks.push({
        key,
        ...config,
        status: "PASS",
        timezoneIndependent: true,
        exactOriginalEvidence: true,
        modelShadowIsolation: true,
        keyboardDisclosures: true,
        noHiddenRawFocusTargets: true,
        noDataMutation: true,
        noApiWrites: true,
      });
      console.log("PASS " + key);
      await ctx.close();
    }
  } catch (error) {
    checks.push({ engine, status: "FAIL", message: error.message });
    if (active && !active.isClosed())
      await active.screenshot({
        path: `${out}/screenshots/failure-${engine}.png`,
        fullPage: true,
      });
    throw error;
  } finally {
    await browser.close();
    fs.writeFileSync(
      `${out}/records-checks.json`,
      JSON.stringify({ checks, errors }, null, 2),
    );
  }
}
expect(errors).toEqual([]);
