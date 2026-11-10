import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.resolve("frontend/package.json"));
const pw = require("@playwright/test"),
  { expect } = pw;
const engine = process.env.REVIEW_ENGINE || "chromium";
const out =
  process.env.RESPONSIBILITY_EVIDENCE_DIR ||
  "output/handoff/responsibility-motion-2026-10-30";
const browser = await pw[engine].launch({ headless: true });
const checks = [],
  errors = [];
let active;
try {
  for (const width of [390, 768, 1440])
    for (const theme of ["light", "dark"])
      for (const reduced of [false, true]) {
        const key = `${engine}-${width}-${theme}-${reduced ? "reduced" : "normal"}`;
        const ctx = await browser.newContext({
          viewport: { width, height: width < 640 ? 844 : 1000 },
          reducedMotion: reduced ? "reduce" : "no-preference",
          hasTouch: width < 640,
          isMobile: engine !== "firefox" && width < 640,
        });
        await ctx.route("**/*", (r) =>
          ["127.0.0.1", "localhost"].includes(
            new URL(r.request().url()).hostname,
          )
            ? r.continue()
            : r.abort(),
        );
        const page = await ctx.newPage();
        active = page;
        page.on("pageerror", (error) =>
          errors.push({ key, message: error.message }),
        );
        page.setDefaultTimeout(10000);
        await page.goto(
          `http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-review&fieldReview=review&workspace=1&theme=${theme}`,
        );
        await expect(page.getByTestId("responsibility-context")).toBeVisible({
          timeout: 25000,
        });
        await page.evaluate(() => document.fonts.ready);
        const root = page.getByTestId("responsibility-page");
        await expect(root).toHaveAttribute("data-motion-input", "keyboard");
        const button = page.getByRole("button", {
          name: "Refresh case",
          exact: true,
        });
        const normalScreenshot =
          engine === "chromium" &&
          !reduced &&
          ((width === 390 && theme === "dark") ||
            (width === 1440 && theme === "light"));
        if (normalScreenshot)
          await page.screenshot({
            path: `${out}/screenshots/${key}-idle.png`,
            fullPage: true,
            animations: "disabled",
          });
        const overview = await page
          .getByRole("heading", { name: "Case overview", exact: true })
          .boundingBox();
        const box = await button.boundingBox();
        await button.hover();
        expect(
          await button.evaluate((el) => getComputedStyle(el).transform),
        ).toBe("none");
        await button.evaluate((el) => {
          window.__motionTransitions = [];
          const listener = (event) => {
            if (event.target !== el || event.propertyName !== "transform")
              return;
            const animation = el
              .getAnimations()
              .find((a) => a.transitionProperty === "transform");
            if (!animation) return;
            animation.pause();
            animation.currentTime = window.__motionTransitions.length ? 0 : 60;
            window.__motionTransitions.push({
              timing: animation.effect.getTiming(),
              frames: animation.effect.getKeyframes(),
              matrix: getComputedStyle(el).transform,
            });
          };
          el.addEventListener("transitionrun", listener);
          window.__stopPressObservation = () => {
            el.removeEventListener("transitionrun", listener);
            el.getAnimations().forEach((a) => a.finish());
          };
        });
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await expect(root).toHaveAttribute("data-motion-input", "pointer");
        let interruption;
        if (!reduced) {
          await expect
            .poll(() => page.evaluate(() => window.__motionTransitions.length))
            .toBe(1);
          const press = await page.evaluate(
            () => window.__motionTransitions[0],
          );
          expect(press.timing.duration).toBe(120);
          expect(press.timing.easing).toBe("cubic-bezier(0.23, 1, 0.32, 1)");
          const scale = Number(press.matrix.match(/^matrix\(([^,]+)/)?.[1]);
          expect(scale).toBeGreaterThanOrEqual(0.97);
          expect(scale).toBeLessThan(1);
          expect(await button.evaluate((el) => el.offsetWidth)).toBeCloseTo(
            box.width,
            0,
          );
          if (normalScreenshot)
            await page.screenshot({
              path: `${out}/screenshots/${key}-press-midpoint.png`,
              animations: "allow",
            });
          await page.mouse.move(4, 4);
          await page.mouse.up();
          await expect
            .poll(() => page.evaluate(() => window.__motionTransitions.length))
            .toBe(2);
          const release = await page.evaluate(
            () => window.__motionTransitions[1],
          );
          const from = await page.evaluate(
            (value) => new DOMMatrixReadOnly(value).a,
            release.frames[0].transform,
          );
          // Engines sample the compositor at slightly different instants. Require
          // continuity within half a CSS pixel, rather than identical float text.
          expect(Math.abs(from - scale) * box.width).toBeLessThan(0.5);
          interruption = { press, release, retargetsFromCurrentValue: true };
        } else {
          expect(
            await button.evaluate((el) => getComputedStyle(el).transform),
          ).toBe("none");
          await expect
            .poll(() =>
              button
                .locator("svg")
                .evaluate((el) => Number(getComputedStyle(el).opacity)),
            )
            .toBeLessThan(1);
          await page.mouse.move(4, 4);
          await page.mouse.up();
          expect(
            await page.evaluate(() => window.__motionTransitions.length),
          ).toBe(0);
        }
        await page.evaluate(() => window.__stopPressObservation());
        const afterPress = await page
          .getByRole("heading", { name: "Case overview", exact: true })
          .boundingBox();
        expect(afterPress).toEqual(overview);
        await button.focus();
        await page.keyboard.down("Space");
        await expect(root).toHaveAttribute("data-motion-input", "keyboard");
        expect(
          await button.evaluate((el) => getComputedStyle(el).transform),
        ).toBe("none");
        expect(
          await button.evaluate(
            (el) => getComputedStyle(el).transitionDuration,
          ),
        ).toMatch(/^0s(?:, 0s)*$/);
        await page.keyboard.up("Space");
        await expect(page.getByTestId("responsibility-context")).toBeVisible();

        const decision = page.getByRole("combobox", {
          name: "Human decision",
          exact: true,
        });
        await decision.click();
        await expect(
          page.getByRole("option", { name: "Waive", exact: true }),
        ).toBeVisible();
        // Radix correctly hides the background trigger from the accessibility tree
        // while its modal listbox is open; inspect its painted arrow by CSS.
        const caret = page.locator(
          '[data-slot="select-trigger"][aria-label="Human decision"] > svg',
        );
        expect(
          await caret.evaluate((el) => getComputedStyle(el).transitionDuration),
        ).toBe(reduced ? "0s" : "0.12s");
        expect(
          await page
            .locator('[data-slot="select-content"]')
            .evaluate((el) => el.getAnimations().length),
        ).toBe(0);
        await page.keyboard.press("Escape");
        await expect(root).toHaveAttribute("data-motion-input", "keyboard");
        await expect(page.getByRole("listbox")).toHaveCount(0);
        await expect(decision).toBeFocused();
        expect(await caret.evaluate((el) => el.getAnimations().length)).toBe(0);
        const record = page.getByRole("button", { name: /^Evidence summary/ });
        if ((await record.getAttribute("aria-expanded")) === "true")
          await record.click();
        await record.click();
        const region = page.getByRole("region", {
          name: "Evidence summary record",
          exact: true,
        });
        await expect(region).toBeVisible();
        expect(
          await region.evaluate(
            (el) => el.getAnimations({ subtree: true }).length,
          ),
        ).toBe(0);
        await record.focus();
        await page.keyboard.press("Space");
        await expect(root).toHaveAttribute("data-motion-input", "keyboard");
        await expect(region).toHaveCount(0);
        expect(
          await record
            .locator(":scope > svg")
            .evaluate((el) => el.getAnimations().length),
        ).toBe(0);
        await page.getByRole("tab", { name: "Evidence", exact: true }).focus();
        await page.keyboard.press("ArrowRight");
        await expect(
          page.getByRole("tab", { name: "AI assessment", exact: true }),
        ).toHaveAttribute("aria-selected", "true");
        expect(
          await page
            .getByRole("tab", { name: "AI assessment", exact: true })
            .evaluate((el) => el.getAnimations().length),
        ).toBe(0);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width + 1);
        expect(
          await page.evaluate(() =>
            window.__RCS_FIELD_REVIEW__.requests.every(
              (r) => r.method === "GET",
            ),
          ),
        ).toBe(true);
        checks.push({
          key,
          width,
          theme,
          reduced,
          status: "PASS",
          interruption,
          keyboardImmediate: true,
          dataDoesNotAnimate: true,
          noHoverMovement: true,
          noApiWrites: true,
        });
        console.log("PASS " + key);
        await ctx.close();
      }
  expect(errors).toEqual([]);
} catch (error) {
  if (active && !active.isClosed()) {
    const diagnostic = await active.evaluate(() => {
      const el = document.querySelector('[aria-label="Refresh case"]');
      const s = el && getComputedStyle(el);
      return {
        modality: document.querySelector("main")?.dataset.motionInput,
        active: el?.matches(":active"),
        transform: s?.transform,
        duration: s?.transitionDuration,
        events: window.__motionTransitions,
        animations: el?.getAnimations().map((a) => ({
          type: a.constructor.name,
          property: a.transitionProperty,
          timing: a.effect.getTiming(),
          frames: a.effect.getKeyframes(),
        })),
        reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
      };
    });
    fs.writeFileSync(
      `${out}/diagnostic-${engine}.json`,
      JSON.stringify(diagnostic, null, 2),
    );
  }
  checks.push({ status: "FAIL", message: error.message });
  if (active && !active.isClosed())
    await active.screenshot({
      path: `${out}/screenshots/failure-${engine}.png`,
      fullPage: true,
    });
  throw error;
} finally {
  await browser.close();
  fs.writeFileSync(
    `${out}/motion-${engine}.json`,
    JSON.stringify({ engine, checks, errors }, null, 2),
  );
}
