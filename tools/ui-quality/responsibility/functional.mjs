import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.resolve("frontend/package.json"));
const pw = require("@playwright/test"),
  { expect } = pw,
  engine = process.env.REVIEW_ENGINE || "chromium";
const out =
    process.env.RESPONSIBILITY_EVIDENCE_DIR ||
    "output/handoff/responsibility-redesign-2026-10-29",
  checks = [],
  network = [],
  errors = [];
const browser = await pw[engine].launch({ headless: true });
let active;
const address = (id, theme = "light") =>
  "http://127.0.0.1:1575/dashboard/responsibility?fieldReview=review&workspace=1&theme=" +
  theme +
  (id ? "&case=" + encodeURIComponent(id) : "");
async function make(id = "synthetic-review", width = 390) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 640 ? 844 : 1000 },
    reducedMotion: "reduce",
  });
  await ctx.route("**/*", (r) => {
    const u = new URL(r.request().url()),
      local = ["127.0.0.1", "localhost"].includes(u.hostname);
    network.push({
      method: r.request().method(),
      host: u.hostname,
      path: u.pathname,
      blocked: !local,
    });
    return local ? r.continue() : r.abort();
  });
  const page = await ctx.newPage();
  active = page;
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(address(id));
  await expect(
    page.getByRole("heading", { name: "Responsibility review", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  return { ctx, page };
}
async function loaded(page) {
  await expect(page.getByTestId("responsibility-context")).toBeVisible({
    timeout: 15000,
  });
}
async function choose(page, label, name) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: label, exact: true }),
  ).toContainText(name);
}
async function fill(
  page,
  decision = "Waive",
  classification = "External cause or uncertain",
  level = "Level 1",
) {
  await choose(page, "Human decision", decision);
  await choose(page, "Final classification", classification);
  if (decision === "Uphold") await choose(page, "Consequence level", level);
  await page
    .getByRole("textbox", { name: "Review reason", exact: true })
    .fill("  Synthetic evidence supports this explicit human decision.  ");
}
async function adapter(page, { fail = false, delay = 350 } = {}) {
  await page.evaluate(
    ({ fail, delay }) => {
      const original = window.fetch.bind(window),
        context = structuredClone(window.__RCS_FIELD_REVIEW__.context);
      window.__reviewTest = { posts: [], reads: [], saved: false };
      window.fetch = async (input, init) => {
        const u = new URL(
            typeof input === "string" ? input : input.url,
            location.href,
          ),
          method = init?.method || input.method || "GET",
          state = window.__reviewTest;
        if (u.pathname.startsWith("/api/admin/responsibility/cases/")) {
          if (method === "POST") {
            const body = JSON.parse(init.body);
            state.posts.push({ path: u.pathname, body });
            await new Promise((r) => setTimeout(r, delay));
            if (fail)
              return new Response(
                JSON.stringify({
                  error:
                    "Synthetic save rejected. Refresh the evidence and try again.",
                }),
                { status: 409 },
              );
            state.saved = true;
            state.updated = structuredClone(context);
            state.updated.adminReview = {
              ...body,
              source: "Synthetic browser test",
            };
            state.updated.case.state = "NOTICE_PENDING";
            if (u.pathname.endsWith("/appeal-review")) {
              state.updated.case.state = "FINALIZED";
              state.updated.finalDecision = { ...body, decision: body.outcome };
            }
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          }
          state.reads.push(u.pathname);
          if (state.saved && u.pathname.endsWith("/" + context.case.id))
            return new Response(JSON.stringify(state.updated), { status: 200 });
        }
        return original(input, init);
      };
    },
    { fail, delay },
  );
}
async function test(name, body) {
  await body();
  checks.push({ name, status: "PASS", engine });
  console.log("PASS " + name);
}
try {
  await test("empty/lookup/clear, query preservation and case Back/Forward", async () => {
    const { ctx, page } = await make("");
    await expect(
      page.getByRole("heading", { name: "Open a case to begin", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open case", exact: true }),
    ).toBeDisabled();
    const input = page.getByRole("textbox", { name: "Case ID", exact: true });
    await input.fill("  synthetic-review  ");
    await page.getByRole("button", { name: "Open case", exact: true }).click();
    await loaded(page);
    await expect(input).toHaveValue("synthetic-review");
    expect(new URL(page.url()).searchParams.get("workspace")).toBe("1");
    await input.fill("synthetic-appeal");
    await page.getByRole("button", { name: "Open case", exact: true }).click();
    await loaded(page);
    await expect(
      page.getByRole("heading", { name: "Appeal review", exact: true }),
    ).toBeVisible();
    await page.goBack();
    await loaded(page);
    await expect(input).toHaveValue("synthetic-review");
    await page.goForward();
    await loaded(page);
    await expect(input).toHaveValue("synthetic-appeal");
    await page.getByRole("button", { name: "Clear case", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Open a case to begin", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("responsibility-context")).toHaveCount(0);
    await ctx.close();
  });
  await test("loading, retryable error, denied/missing and foreign case identity", async () => {
    const { ctx, page } = await make("synthetic-slow");
    await expect(
      page.getByRole("status", { name: "Loading recorded case", exact: true }),
    ).toBeVisible();
    await loaded(page);
    await page.goto(address("synthetic-read-error"));
    await expect(page.getByRole("alert")).toContainText(
      "temporarily unavailable",
    );
    await expect(page.getByTestId("responsibility-context")).toHaveCount(0);
    await page.evaluate(() => {
      window.__RCS_FIELD_REVIEW__.recoverRead = true;
    });
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await loaded(page);
    await page.goto(address("synthetic-unknown"));
    await expect(page.getByRole("alert")).toContainText(
      "Synthetic case not found",
    );
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await page.goto(address("synthetic-foreign"));
    await expect(page.getByRole("alert")).toContainText(
      "does not match this request",
    );
    await expect(page.getByTestId("responsibility-context")).toHaveCount(0);
    await ctx.close();
  });
  await test("all record groups, model/shadow isolation and missing-data presentations", async () => {
    const { ctx, page } = await make();
    await loaded(page);
    for (const [tab, titles] of [
      ["Evidence", ["Evidence summary", "Evidence versions"]],
      [
        "AI assessment",
        [
          "Assessment details",
          "Rule checks",
          "Validation checks",
          "Assessment history",
        ],
      ],
      [
        "Decisions",
        [
          "Provisional decision",
          "Recorded human review",
          "Appeals",
          "Final decision",
        ],
      ],
    ]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      for (const title of titles) {
        const trigger = page.getByRole("button", {
          name: new RegExp("^" + title),
        });
        if ((await trigger.getAttribute("aria-expanded")) !== "true")
          await trigger.click();
        await expect(
          page.getByRole("region", { name: title + " record", exact: true }),
        ).toBeVisible();
      }
      if (tab === "AI assessment") {
        await page
          .getByRole("region", {
            name: "Assessment details record",
            exact: true,
          })
          .getByRole("button", { name: "Original record", exact: true })
          .click();
        await expect(
          page.getByRole("region", {
            name: "Assessment details record",
            exact: true,
          }),
        ).toContainText("synthetic-shadow-envelope");
        expect(await page.locator("body").innerText()).not.toContain(
          "synthetic-production-envelope",
        );
      }
    }
    await page.goto(address("synthetic-mismatch"));
    await loaded(page);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Different evidence snapshot" }),
    ).toBeVisible();
    await page.goto(address("synthetic-legacy"));
    await loaded(page);
    await page.getByRole("tab", { name: "AI assessment", exact: true }).click();
    await expect(
      page.getByRole("region", {
        name: "Assessment details record",
        exact: true,
      }),
    ).toContainText("was not retained");
    expect(await page.locator("body").innerText()).not.toContain(
      "synthetic-production-envelope",
    );
    await page.goto(address("synthetic-empty-records"));
    await loaded(page);
    await expect(
      page.getByRole("region", {
        name: "Evidence summary record",
        exact: true,
      }),
    ).toContainText("No evidence recorded");
    await ctx.close();
  });
  await test("validation, classification reset, reason limits and keyboard dropdown navigation", async () => {
    const { ctx, page } = await make();
    await loaded(page);
    const save = page.getByRole("button", {
      name: "Save human review",
      exact: true,
    });
    await expect(
      page.getByRole("combobox", { name: "Final classification", exact: true }),
    ).toBeDisabled();
    await save.click();
    await expect(page.getByRole("alert")).toContainText(
      "Choose a human decision",
    );
    const decision = page.getByRole("combobox", {
      name: "Human decision",
      exact: true,
    });
    await expect(decision).toBeFocused();
    await decision.press("Enter");
    await expect(
      page.getByRole("option", { name: "Waive", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("End");
    await expect(
      page.getByRole("option", { name: "Uphold", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(decision).toContainText("Uphold");
    await expect(decision).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("combobox", { name: "Final classification", exact: true }),
    ).toBeFocused();
    await choose(page, "Final classification", "Driver caused");
    await save.click();
    await expect(page.getByRole("alert")).toContainText(
      "Enter a review reason",
    );
    await choose(page, "Consequence level", "Level 2");
    await choose(page, "Human decision", "Waive");
    await expect(
      page.getByRole("combobox", { name: "Consequence level", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "Final classification", exact: true }),
    ).toContainText("Select a classification");
    await page
      .getByRole("combobox", { name: "Final classification", exact: true })
      .click();
    await expect(
      page.getByRole("option", { name: "Driver caused", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("option", { name: "Valid waiver", exact: true })
      .click();
    const reason = page.getByRole("textbox", {
      name: "Review reason",
      exact: true,
    });
    await reason.fill("x".repeat(2100));
    expect((await reason.inputValue()).length).toBe(2000);
    await reason.fill(" a ");
    await save.click();
    await expect(page.getByRole("alert")).toContainText("between 3 and 2,000");
    await expect(reason).toBeFocused();
    await ctx.close();
  });
  for (const [id, decision, classification, level] of [
    ["synthetic-review", "Waive", "Platform caused", "Level 1"],
    ["synthetic-review", "Uphold", "Driver caused", "Level 2"],
    ["synthetic-appeal", "Waive", "Valid waiver", "Level 1"],
  ])
    await test(`synthetic ${id} ${decision}: exact binding, busy/double click, accepted response and refreshed record`, async () => {
      const { ctx, page } = await make(id);
      await loaded(page);
      const initial = await page.evaluate(
        () => window.__RCS_FIELD_REVIEW__.context,
      );
      await adapter(page);
      await fill(page, decision, classification, level);
      const save = page.getByRole("button", {
        name:
          id === "synthetic-appeal" ? "Resolve appeal" : "Save human review",
        exact: true,
      });
      await save.dblclick();
      await expect(
        page.getByText("Review saved", { exact: true }),
      ).toBeVisible();
      await loaded(page);
      const result = await page.evaluate(() => window.__reviewTest);
      expect(result.posts).toHaveLength(1);
      const body = result.posts[0].body;
      expect(body.evidenceVersion).toBe(initial.case.evidenceVersion);
      expect(body.evidenceHash).toBe(initial.case.evidenceHash);
      expect(body.reason).toBe(
        "Synthetic evidence supports this explicit human decision.",
      );
      expect(body[id === "synthetic-appeal" ? "outcome" : "decision"]).toBe(
        decision.toUpperCase(),
      );
      expect(body.consequenceLevel).toBe(
        decision === "Waive" ? "LEVEL_0" : "LEVEL_2",
      );
      expect(
        result.posts[0].path.endsWith(
          id === "synthetic-appeal" ? "/appeal-review" : "/review",
        ),
      ).toBe(true);
      await expect(
        page.getByRole("button", {
          name:
            id === "synthetic-appeal" ? "Resolve appeal" : "Save human review",
          exact: true,
        }),
      ).toHaveCount(0);
      await ctx.close();
    });
  await test("rejected save preserves draft, re-enables fields and announces error without success", async () => {
    const { ctx, page } = await make();
    await loaded(page);
    await adapter(page, { fail: true, delay: 650 });
    await fill(page);
    const button = page.getByRole("button", {
      name: "Save human review",
      exact: true,
    });
    await button.click();
    await expect(
      page.getByRole("textbox", { name: "Review reason", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("alert")).toContainText(
      "Synthetic save rejected",
    );
    await expect(button).toBeEnabled();
    await expect(
      page.getByRole("textbox", { name: "Review reason", exact: true }),
    ).toHaveValue(/Synthetic evidence supports/);
    await expect(page.getByText("Review saved", { exact: true })).toHaveCount(
      0,
    );
    await ctx.close();
  });
  await test("case switch ignores an old save completion and old slow read", async () => {
    const { ctx, page } = await make();
    await loaded(page);
    await adapter(page, { delay: 1200 });
    await fill(page);
    await page
      .getByRole("button", { name: "Save human review", exact: true })
      .click();
    const input = page.getByRole("textbox", { name: "Case ID", exact: true });
    await input.fill("synthetic-appeal");
    await page.getByRole("button", { name: "Open case", exact: true }).click();
    await loaded(page);
    await expect(
      page.getByRole("heading", { name: "Appeal review", exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(1400);
    await expect(
      page.getByRole("heading", { name: "Appeal review", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Review saved", { exact: true })).toHaveCount(
      0,
    );
    await page.goto(address("synthetic-slow"));
    await expect(
      page.getByRole("status", { name: "Loading recorded case", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Clear case", exact: true }).click();
    await page.waitForTimeout(1400);
    await expect(
      page.getByRole("heading", { name: "Open a case to begin", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("responsibility-context")).toHaveCount(0);
    await ctx.close();
  });
  await test("final/policy-gated cases have no review action; theme switching keeps the draft", async () => {
    const { ctx, page } = await make("synthetic-final");
    await loaded(page);
    await expect(
      page.getByRole("heading", {
        name: "Human authority finalized",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await page.goto(address("synthetic-not-ready"));
    await loaded(page);
    await expect(
      page.getByRole("heading", {
        name: "No review action available",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await page.goto(address("synthetic-review"));
    await loaded(page);
    await page
      .getByRole("textbox", { name: "Review reason", exact: true })
      .fill("Preserve this draft across themes.");
    await page.getByRole("button", { name: "Dark mode", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(
      page.getByRole("textbox", { name: "Review reason", exact: true }),
    ).toHaveValue("Preserve this draft across themes.");
    expect(
      await page.evaluate(() => localStorage.getItem("rcs.website.theme")),
    ).toBe("dark");
    await page.getByRole("button", { name: "Dark mode", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await ctx.close();
  });
  expect(errors).toEqual([]);
  expect(
    network.filter((n) => n.path.startsWith("/api/") && n.method !== "GET"),
  ).toEqual([]);
} catch (e) {
  if (active && !active.isClosed())
    await active.screenshot({
      path:
        out +
        "/screenshots/functional-failure-" +
        engine +
        "-" +
        Date.now() +
        ".png",
      animations: "disabled",
    });
  throw e;
} finally {
  await browser.close();
  fs.writeFileSync(
    out + "/functional-" + engine + ".json",
    JSON.stringify(
      {
        engine,
        checks,
        network,
        errors,
        scope:
          "Actual React UI; accepted saves exist only in an in-memory browser adapter. No backend/provider write or policy acceptance.",
      },
      null,
      2,
    ),
  );
}
console.log(
  JSON.stringify({ engine, checks: checks.length, errors: errors.length }),
);
