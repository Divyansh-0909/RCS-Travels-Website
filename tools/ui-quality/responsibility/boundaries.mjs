import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.resolve("frontend/package.json"));
const { chromium, expect } = require("@playwright/test");
const out =
  process.env.RESPONSIBILITY_EVIDENCE_DIR ||
  "output/handoff/responsibility-redesign-2026-10-29";
const browser = await chromium.launch({ headless: true });
const checks = [];
try {
  for (const width of [320, 1440])
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
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
      await page.evaluate(() => {
        const original = window.fetch.bind(window.fetch),
          context = structuredClone(window.__RCS_FIELD_REVIEW__.context);
        context.case.bookingId = "LONG-SYNTHETIC-BOOKING-".repeat(10);
        context.case.evidenceHash = "sha256:" + "0123456789abcdef".repeat(4);
        context.evidence.longUnbrokenValue = "SYNTHETIC".repeat(100);
        context.evidence.statement =
          "A long synthetic statement, retained without truncation. ".repeat(
            30,
          );
        window.fetch = async (input, init) => {
          const url = new URL(
            typeof input === "string" ? input : input.url,
            location.href,
          );
          if (
            url.pathname.endsWith(
              "/api/admin/responsibility/cases/synthetic-review",
            ) &&
            (init?.method || input.method || "GET") === "GET"
          )
            return new Response(JSON.stringify(context), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          return original(input, init);
        };
      });
      await page
        .getByRole("button", { name: "Refresh case", exact: true })
        .click();
      await expect(page.getByTestId("responsibility-context")).toBeVisible();
      const evidenceTrigger = page.getByRole("button", {
        name: /^Evidence summary/,
      });
      if ((await evidenceTrigger.getAttribute("aria-expanded")) !== "true")
        await evidenceTrigger.click();
      const evidenceDetails = page.getByRole("button", {
        name: "Evidence details",
        exact: true,
      });
      if (await evidenceDetails.count()) await evidenceDetails.click();
      const caseDetails = page.getByRole("button", {
        name: "Case details",
        exact: true,
      });
      if (await caseDetails.count()) await caseDetails.click();
      await expect(
        page.getByRole("region", {
          name: "Evidence summary record",
          exact: true,
        }),
      ).toContainText("SYNTHETIC".repeat(100));
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      await page.screenshot({
        path: `${out}/screenshots/boundary-${width}-${theme}.png`,
        fullPage: true,
        animations: "disabled",
      });
      const decision = page.getByRole("combobox", {
        name: "Human decision",
        exact: true,
      });
      await decision.click();
      await page.getByRole("option", { name: "Waive", exact: true }).click();
      await page
        .getByRole("combobox", { name: "Final classification", exact: true })
        .click();
      await expect(
        page.getByRole("option", {
          name: "External cause or uncertain",
          exact: true,
        }),
      ).toBeVisible();
      await page.locator('[data-slot="select-content"]').evaluate((el) => {
        const elements = [el, ...el.querySelectorAll("*")].filter(
          (e) => e instanceof HTMLElement,
        );
        const sizes = elements.map((e) => [
          e,
          getComputedStyle(e).fontSize,
          getComputedStyle(e).lineHeight,
        ]);
        for (const [e, size, line] of sizes) {
          e.style.fontSize = `${parseFloat(size) * 2}px`;
          if (line !== "normal")
            e.style.lineHeight = `${parseFloat(line) * 2}px`;
        }
      });
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const popup = await page
        .locator('[data-slot="select-content"]')
        .boundingBox();
      fs.writeFileSync(
        `${out}/boundary-popup-${width}-${theme}.json`,
        JSON.stringify(popup),
      );
      await page.screenshot({
        path: `${out}/screenshots/waiver-menu-${width}-${theme}.png`,
        animations: "disabled",
      });
      expect(popup.x).toBeGreaterThanOrEqual(-1);
      expect(popup.x + popup.width).toBeLessThanOrEqual(width + 1);
      await page.keyboard.press("End");
      await expect(
        page.getByRole("option", { name: "Needs review", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("combobox", {
          name: "Final classification",
          exact: true,
        }),
      ).toContainText("Needs review");
      await expect(
        page.getByRole("combobox", {
          name: "Final classification",
          exact: true,
        }),
      ).toBeFocused();
      await page.emulateMedia({ forcedColors: "active" });
      const field = page.getByRole("combobox", {
        name: "Human decision",
        exact: true,
      });
      await page.keyboard.press("Tab");
      await field.focus();
      await expect(field).toBeFocused();
      const readFocus = () =>
        field.evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            style: s.outlineStyle,
            width: s.outlineWidth,
            offset: s.outlineOffset,
          };
        });
      await expect
        .poll(readFocus)
        .toEqual({ style: "solid", width: "2px", offset: "-2px" });
      const focus = await readFocus();
      checks.push({
        width,
        theme,
        longBookingId: 230,
        hashCharacters: 71,
        unbrokenEvidenceCharacters: 900,
        noTruncation: true,
        noDocumentOverflow: true,
        largeWaiverPopup: popup,
        forcedColorsFocus: focus,
      });
      console.log(`PASS boundaries ${width} ${theme}`);
      await ctx.close();
    }
} finally {
  await browser.close();
  fs.writeFileSync(
    `${out}/boundaries.json`,
    JSON.stringify({ checks }, null, 2),
  );
}
