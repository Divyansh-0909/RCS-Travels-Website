import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.resolve("frontend/package.json"));
const pw = require("@playwright/test");
const { expect } = pw;
const AxeBuilder = require("@axe-core/playwright").default;
const out =
  process.env.RESPONSIBILITY_EVIDENCE_DIR ||
  "output/handoff/responsibility-timeline-fix-2026-10-31";
const results = [],
  errors = [];
fs.mkdirSync(`${out}/screenshots`, { recursive: true });
const address = (theme, id = "synthetic-timeline") =>
  `http://127.0.0.1:1575/dashboard/responsibility?case=${id}&fieldReview=review&workspace=1&theme=${theme}`;

async function enlargeText(page) {
  await page.evaluate(() => {
    const previous = window.__timelineTextStyles || new Map();
    for (const [element, style] of previous) {
      element.style.fontSize = style.fontSize;
      element.style.lineHeight = style.lineHeight;
    }
    const elements = [
      ...document.querySelectorAll('[data-testid="responsibility-page"] *'),
    ].filter((el) => el instanceof HTMLElement);
    const sizes = elements.map((el) => [
      el,
      getComputedStyle(el).fontSize,
      getComputedStyle(el).lineHeight,
    ]);
    window.__timelineTextStyles = new Map(
      elements.map((el) => [
        el,
        { fontSize: el.style.fontSize, lineHeight: el.style.lineHeight },
      ]),
    );
    for (const [el, size, line] of sizes) {
      el.style.fontSize = `${parseFloat(size) * 2}px`;
      if (line !== "normal") el.style.lineHeight = `${parseFloat(line) * 2}px`;
    }
  });
}

async function measure(items, name) {
  const rows = await items.evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = (el) => {
        const b = el.getBoundingClientRect();
        return {
          x: b.x,
          y: b.y,
          right: b.right,
          bottom: b.bottom,
          width: b.width,
          height: b.height,
          cx: b.x + b.width / 2,
          cy: b.y + b.height / 2,
        };
      };
      const title = node.matches("[data-record-stage]")
        ? node.querySelector(
            '[data-slot="accordion-trigger"] > span > span:first-child',
          )
        : node.querySelector('[data-slot="card-content"] > div > p');
      const titleBox = rect(title);
      return {
        item: rect(node),
        marker: rect(node.querySelector('[data-slot="timeline-marker"]')),
        line: rect(node.querySelector('[data-slot="timeline-connector"]')),
        title: titleBox,
        titleFirstLineCenter:
          titleBox.y + parseFloat(getComputedStyle(title).lineHeight) / 2,
      };
    }),
  );
  expect(rows.length, name).toBeGreaterThan(0);
  const close = (a, b, message) =>
    expect(Math.abs(a - b), `${name}: ${message}`).toBeLessThanOrEqual(1);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    close(
      row.marker.cy,
      row.titleFirstLineCenter,
      `marker ${i + 1} aligns with first title line`,
    );
    close(
      row.line.cx,
      row.marker.cx,
      `connector ${i + 1} aligns with marker center`,
    );
    close(row.marker.cx, rows[0].marker.cx, `marker ${i + 1} shares the rail`);
    expect(
      row.marker.right,
      `${name}: marker stays outside content`,
    ).toBeLessThan(row.title.x);
    if (i === 0)
      close(row.line.y, row.marker.cy, "rail starts at first marker");
    if (i === rows.length - 1)
      close(row.line.bottom, row.marker.cy, "rail ends at last marker");
    if (i < rows.length - 1)
      close(
        row.line.bottom,
        rows[i + 1].line.y,
        `connector ${i + 1} has no gap before next marker`,
      );
  }
  return { name, rows };
}

async function screenshot(page, key, state) {
  await page
    .getByRole("region", {
      name: "Recorded evidence and decision history",
      exact: true,
    })
    .evaluate((el) =>
      el.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  await page.screenshot({
    path: `${out}/screenshots/after-${key}-${state}.png`,
    animations: "disabled",
  });
}

for (const engine of ["chromium", "firefox", "webkit"]) {
  const browser = await pw[engine].launch();
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
  let active;
  try {
    for (const config of configs) {
      const { width, theme, text200 } = config;
      const key = `${engine}-${width}-${theme}${text200 ? "-text200" : ""}`;
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion: "reduce",
        timezoneId: "America/Los_Angeles",
      });
      await context.route("**/*", (route) =>
        ["127.0.0.1", "localhost"].includes(
          new URL(route.request().url()).hostname,
        )
          ? route.continue()
          : route.abort(),
      );
      const page = (active = await context.newPage());
      page.on("pageerror", (error) =>
        errors.push({ key, message: error.message }),
      );
      await page.goto(address(theme));
      await expect(page.getByTestId("responsibility-context")).toBeVisible({
        timeout: 25000,
      });
      await page.evaluate(() => document.fonts.ready);
      const initial = await page.evaluate(() =>
        structuredClone(window.__RCS_FIELD_REVIEW__.context),
      );
      if (text200) await enlargeText(page);
      const geometry = [];
      const caseDetails = page.getByRole("button", {
        name: "Case details",
        exact: true,
      });
      if (await caseDetails.count()) {
        await caseDetails.focus();
        await page.keyboard.press("Enter");
        const overview = page.locator(
          'section[aria-labelledby="case-overview-heading"]',
        );
        await expect(overview).toContainText(initial.case.id);
        await expect(overview).toContainText(initial.case.evidenceHash);
        await expect(overview).toContainText(initial.case.state);
        await caseDetails.press("Enter");
        await expect(caseDetails).toHaveAttribute("aria-expanded", "false");
      }
      const evidence = page.getByRole("region", {
        name: "Evidence summary record",
        exact: true,
      });
      const events = evidence.locator("[data-record-timeline] > li");
      await expect(events).toHaveCount(2);
      await expect(events.nth(0)).toContainText("Ride accepted");
      await expect(events.nth(1)).toContainText("Driver cancellation recorded");
      const checks = page.getByRole("region", {
        name: "Evidence checks",
        exact: true,
      });
      if (await checks.count()) {
        await expect(checks).toContainText("Required evidence complete");
        await expect(checks).toContainText("No");
        await expect(checks).toContainText("Booking");
      }
      const actorLabel = await events
        .nth(0)
        .getByText("Actor", { exact: true })
        .evaluate((el) => ({
          height: el.getBoundingClientRect().height,
          line: parseFloat(getComputedStyle(el).lineHeight),
        }));
      expect(
        actorLabel.height / actorLabel.line,
        "short field labels stay on one line",
      ).toBeLessThanOrEqual(1.05);
      geometry.push(await measure(events, "evidence"));
      await screenshot(page, key, "evidence");
      const details = events
        .nth(0)
        .getByRole("button", { name: "Event details", exact: true });
      await details.focus();
      await page.keyboard.press("Enter");
      await expect(details).toHaveAttribute("aria-expanded", "true");
      if (text200) await enlargeText(page);
      geometry.push(await measure(events, "expanded event"));
      await expect(events.nth(0)).toContainText("10:00:01 AM IST");
      await details.press("Enter");
      await expect(details).toHaveAttribute("aria-expanded", "false");
      const original = evidence.getByRole("button", {
        name: "Original record",
        exact: true,
      });
      await original.click();
      expect(JSON.parse(await evidence.locator("pre").textContent())).toEqual(
        initial.evidence,
      );
      await original.click();
      await expect(evidence.locator("pre")).toHaveCount(0);
      const evidenceDetails = evidence.getByRole("button", {
        name: "Evidence details",
        exact: true,
      });
      if (await evidenceDetails.count()) {
        await evidenceDetails.click();
        await expect(evidence).toContainText("10:05:00 AM IST");
        await expect(evidence).toContainText("Required evidence");
        await evidenceDetails.click();
      }
      await page.getByRole("button", { name: /^Evidence versions/ }).click();
      if (text200) await enlargeText(page);
      geometry.push(
        await measure(
          page
            .getByRole("region", {
              name: "Evidence versions record",
              exact: true,
            })
            .locator("[data-record-timeline] > li"),
          "versions",
        ),
      );
      await page
        .getByRole("tab", { name: "AI assessment", exact: true })
        .click();
      await page.getByRole("button", { name: /^Assessment history/ }).click();
      if (text200) await enlargeText(page);
      geometry.push(
        await measure(
          page
            .getByRole("region", {
              name: "Assessment history record",
              exact: true,
            })
            .locator("[data-record-timeline] > li"),
          "single assessment",
        ),
      );
      await page.getByRole("tab", { name: "Decisions", exact: true }).click();
      if (text200) await enlargeText(page);
      const stages = page.locator("[data-record-stage]");
      geometry.push(await measure(stages, "default decision stages"));
      await screenshot(page, key, "decisions");
      for (const item of await stages.all()) {
        const trigger = item.locator('[data-slot="accordion-trigger"]');
        if ((await trigger.getAttribute("aria-expanded")) !== "true")
          await trigger.click();
      }
      if (text200) await enlargeText(page);
      geometry.push(await measure(stages, "all decision stages expanded"));
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      await screenshot(page, key, "decisions-expanded");
      if (engine === "chromium" && [390, 1440].includes(width) && !text200) {
        const audit = await new AxeBuilder({ page })
          .include(
            'section[aria-label="Recorded evidence and decision history"]',
          )
          .analyze();
        fs.writeFileSync(
          `${out}/axe-${key}.json`,
          JSON.stringify(
            {
              violations: audit.violations,
              incomplete: audit.incomplete.map((r) => ({
                id: r.id,
                nodes: r.nodes.length,
              })),
            },
            null,
            2,
          ),
        );
        expect(audit.violations.map((v) => v.id)).toEqual([]);
      }
      const jump = page.getByRole("link", {
        name: "Go to review",
        exact: true,
      });
      if ((await jump.count()) && (await jump.isVisible())) {
        const reason = page.getByRole("textbox", {
          name: "Review reason",
          exact: true,
        });
        await reason.fill("A synthetic review draft");
        await jump.click();
        await expect(page.locator("#human-review-heading")).toBeFocused();
        await expect(reason).toHaveValue("A synthetic review draft");
        expect(new URL(page.url()).searchParams.get("case")).toBe(
          "synthetic-timeline",
        );
      }
      expect(
        await page.evaluate(() =>
          JSON.stringify(window.__RCS_FIELD_REVIEW__.context),
        ),
      ).toBe(JSON.stringify(initial));
      await page.goto(address(theme, "synthetic-final"));
      await expect(page.getByTestId("responsibility-context")).toBeVisible({
        timeout: 25000,
      });
      await page.getByRole("tab", { name: "Decisions", exact: true }).click();
      if (text200) await enlargeText(page);
      geometry.push(
        await measure(
          page.locator("[data-record-stage]"),
          "expanded final decision",
        ),
      );
      await screenshot(page, key, "final");
      expect(
        await page
          .getByRole("button", { name: /^Final decision/ })
          .locator("time")
          .getAttribute("datetime"),
      ).toBe("2026-10-29T04:40:00Z");
      await expect(
        page.getByRole("button", { name: "Save human review", exact: true }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      expect(
        await page.evaluate(() =>
          window.__RCS_FIELD_REVIEW__.requests.every((r) => r.method === "GET"),
        ),
      ).toBe(true);
      results.push({ key, ...config, status: "PASS", geometry });
      console.log(`PASS ${key}`);
      await context.close();
    }
  } catch (error) {
    results.push({ engine, status: "FAIL", message: error.message });
    if (active && !active.isClosed())
      await active.screenshot({
        path: `${out}/screenshots/failure-${engine}.png`,
      });
    throw error;
  } finally {
    await browser.close();
    fs.writeFileSync(
      `${out}/layout-checks.json`,
      JSON.stringify({ results, errors }, null, 2),
    );
  }
}
expect(errors).toEqual([]);
