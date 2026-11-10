import assert from "node:assert/strict";
import test from "node:test";
import { responsibilityPanelSummaries } from "../src/lib/responsibilityPanelSummaries.js";

const group = (summary, panel, id) => summary[panel].groups.find(value => value.id === id);

test("missing checks and empty record lists remain different from passed checks", () => {
  const missing = responsibilityPanelSummaries({});
  assert.equal(group(missing, "evidence", "completeness").hint, "Not checked");
  assert.equal(group(missing, "analysis", "validation").hint, "Not checked");
  assert.equal(group(missing, "evidence", "timeline").hint, "Not recorded");
  const empty = responsibilityPanelSummaries({ evidence: { timeline: [], contradictions: [] } });
  assert.equal(group(empty, "evidence", "timeline").hint, "0 events");
  assert.deepEqual(group(empty, "evidence", "timeline").lines, []);
  assert.deepEqual(group(missing, "evidence", "timeline").lines, []);
  assert.equal(group(empty, "evidence", "conflicts").hint, "None listed");
  assert.equal(group(empty, "evidence", "completeness").status, "neutral");
});

test("failed checks and contradictory completeness flags keep their warnings", () => {
  const summary = responsibilityPanelSummaries({
    evidence: { completeness: { complete: true, missing: ["GPS"], unavailable: [] }, contradictions: ["Different accounts"] },
    shadowResult: { factualValidation: { valid: false } },
  });
  const check = group(summary, "evidence", "completeness");
  assert.equal(check.status, "attention");
  assert.equal(check.hint, "Needs attention");
  assert.match(check.lines.join(" "), /marked complete, but missing/);
  assert.equal(group(summary, "evidence", "conflicts").status, "attention");
  assert.equal(group(summary, "analysis", "validation").status, "attention");
});

test("a saved validation result does not certify the other record groups", () => {
  const summary = responsibilityPanelSummaries({ shadowResult: { factualValidation: { valid: true } } });
  assert.equal(group(summary, "analysis", "validation").status, "confirmed");
  assert.equal(group(summary, "evidence", "completeness").status, "neutral");
  assert.match(group(summary, "analysis", "validation").lines.join(" "), /does not confirm every statement/);
});

test("a legacy shadow record never borrows the production AI response or validation", () => {
  const summary = responsibilityPanelSummaries({
    shadowResult: {}, analysis: { envelope: { summary: "Unrelated production response" }, validation: { valid: true } },
  });
  assert.equal(group(summary, "analysis", "model").hint, "Not saved");
  assert.equal(group(summary, "analysis", "validation").hint, "Not checked");
  assert.doesNotMatch(JSON.stringify(summary), /Unrelated production response/);
});

test("final case state does not fabricate an absent final-decision record", () => {
  const summary = responsibilityPanelSummaries({ case: { state: "FINAL_UPHELD" } });
  assert.equal(group(summary, "decisions", "final").hint, "Not recorded");
  const recorded = responsibilityPanelSummaries({ finalDecision: { outcome: "WAIVE", reason: "Outside cause" } });
  assert.equal(group(recorded, "decisions", "final").hint, "No action against the driver");
  assert.deepEqual(group(recorded, "decisions", "final").lines, ["Outside cause"]);
});

test("unexpected list shapes remain unavailable, rather than being counted as zero", () => {
  const summary = responsibilityPanelSummaries({ evidence: { timeline: {}, contradictions: "unknown" }, evidenceVersions: {}, shadowHistory: "unknown" });
  assert.equal(group(summary, "evidence", "timeline").hint, "Not recorded");
  assert.equal(group(summary, "evidence", "versions").hint, "Not recorded");
  assert.equal(group(summary, "analysis", "history").hint, "Not recorded");
});

test("a saved classification is labelled as an assessment, without inventing a decision outcome", () => {
  const summary = responsibilityPanelSummaries({ provisionalDecision: { classification: "NEEDS_REVIEW" } });
  assert.equal(group(summary, "decisions", "provisional").hint, "Assessment: Needs more review");
  assert.deepEqual(group(summary, "decisions", "provisional").lines, []);
});

test("blank saved text produces an honest fallback instead of an empty summary", () => {
  const summary = responsibilityPanelSummaries({ shadowResult: { analysisEnvelope: { summary: "  ", recommendation: "" } }, adminReview: { outcome: " " } });
  assert.deepEqual(group(summary, "analysis", "model").lines, ["Open the full assessment for details."]);
  assert.equal(group(summary, "decisions", "review").hint, "Outcome not recorded");
});

test("summarizing does not mutate, reorder, or rewrite retained records and free text", () => {
  const note = "Actor ID ev_2026-10-29 and quoted text <script> remain original.";
  const context = { evidence: { timeline: [{ kind: "driver_cancellation_recorded" }, { kind: "ride_accepted" }] }, shadowResult: { analysisEnvelope: { summary: note } } };
  const before = structuredClone(context);
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } }
  freeze(context);
  const summary = responsibilityPanelSummaries(context);
  assert.deepEqual(context, before);
  assert.equal(group(summary, "analysis", "model").lines[0], note);
  assert.deepEqual(group(summary, "evidence", "timeline").lines, ["Driver cancellation recorded", "Ride accepted"]);
});

test("missing and unavailable information form distinct badges without hiding contradictory checks", () => {
  const context = { evidence: { completeness: { complete: true, missing: ["booking"], unavailable: ["location"] } } };
  const original = structuredClone(context);
  const check = group(responsibilityPanelSummaries(context), "evidence", "completeness");
  assert.deepEqual(check.badges, ["Missing: Booking", "Unavailable: Location"]);
  assert.equal(check.status, "attention");
  assert.match(check.lines[0], /marked complete, but missing/);
  assert.deepEqual(context, original);
});

test("compact statuses keep AI suggestions separate from service rules and validation", () => {
  const summary = responsibilityPanelSummaries({ shadowResult: {
    analysisEnvelope: { summary: "Saved explanation", recommendation: "DRIVER_CAUSED" },
    classification: "NEEDS_REVIEW", factualValidation: { valid: false },
  } });
  assert.equal(group(summary, "analysis", "model").hint, "Driver responsible");
  assert.equal(group(summary, "analysis", "guarded").hint, "Needs more review");
  assert.equal(group(summary, "analysis", "validation").status, "attention");
  assert.deepEqual(group(summary, "analysis", "model").lines, ["Saved explanation"]);
});

test("empty histories have concise counts while absent histories remain unknown", () => {
  const empty = responsibilityPanelSummaries({ evidenceVersions: [], shadowHistory: [] });
  assert.equal(group(empty, "evidence", "versions").hint, "0 versions");
  assert.equal(group(empty, "analysis", "history").hint, "0 assessments");
  assert.deepEqual(group(empty, "analysis", "history").lines, []);
  assert.equal(group(responsibilityPanelSummaries({}), "analysis", "history").hint, "Not recorded");
});

test("compact decisions retain the exact reason and recorded time without upgrading an assessment to an outcome", () => {
  const reason = "Original driver response\nSecond line stays saved.";
  const review = { classification: "NEEDS_REVIEW", reason, reviewedAt: "2026-10-29T04:30:00Z" };
  const summary = group(responsibilityPanelSummaries({ adminReview: review }), "decisions", "review");
  assert.equal(summary.hint, "Assessment: Needs more review");
  assert.equal(summary.lines[0], reason);
  assert.match(summary.lines[1], /29 Oct 2026.*10:00:00.*IST/);
  assert.doesNotMatch(summary.hint, /Driver held responsible|No action against/);
});

test("status color keeps unknown and empty records neutral without borrowing a newer AI result", () => {
  const summary = responsibilityPanelSummaries({ evidence: { timeline: [], contradictions: [] },
    evidenceVersions: [], shadowHistory: [], shadowResult: {},
    analysis: { envelope: { recommendation: "DRIVER_CAUSED" }, validation: { valid: true } },
    case: { state: "FINAL_UPHELD" } });
  for (const panel of Object.values(summary))
    for (const item of panel.groups) assert.equal(item.tone, "neutral", item.id);
});

test("missing records are a warning while an explicit failed validation is an error", () => {
  const summary = responsibilityPanelSummaries({ evidence: {
    completeness: { complete: true, missing: ["booking"], unavailable: ["location"] },
    contradictions: ["Conflicting accounts"],
  }, shadowResult: { factualValidation: { valid: false } } });
  assert.equal(group(summary, "evidence", "completeness").tone, "warning");
  assert.equal(group(summary, "evidence", "conflicts").tone, "warning");
  assert.equal(group(summary, "analysis", "validation").tone, "danger");
  const complete = responsibilityPanelSummaries({ evidence: { completeness: { complete: true } },
    shadowResult: { factualValidation: { valid: true } } });
  assert.equal(group(complete, "evidence", "completeness").tone, "success");
  assert.equal(group(complete, "analysis", "validation").tone, "success");
});

test("AI recommendations and both decision outcomes stay separate from successful validation", () => {
  for (const outcome of ["UPHOLD", "WAIVE"]) {
    const summary = responsibilityPanelSummaries({
      adminReview: { outcome }, finalDecision: { decision: outcome },
      shadowResult: { analysisEnvelope: { recommendation: "DRIVER_CAUSED" }, classification: "DRIVER_CAUSED" },
    });
    for (const [panel, id] of [["decisions", "review"], ["decisions", "final"], ["analysis", "model"], ["analysis", "guarded"]])
      assert.equal(group(summary, panel, id).tone, "info");
    assert.equal(group(summary, "analysis", "validation").tone, "neutral");
  }
  const pending = responsibilityPanelSummaries({ provisionalDecision: { classification: "NEEDS_REVIEW" },
    shadowResult: { analysisEnvelope: { recommendation: "NEEDS_REVIEW" }, classification: "NEEDS_REVIEW" } });
  for (const [panel, id] of [["decisions", "provisional"], ["analysis", "model"], ["analysis", "guarded"]])
    assert.equal(group(pending, panel, id).tone, "warning");
});

test("color follows retained fields rather than words inside a saved explanation", () => {
  const summary = responsibilityPanelSummaries({ evidence: { timeline: [{ kind: "ride_accepted" }] },
    shadowResult: { analysisEnvelope: { summary: "Checks passed. No action. NEEDS_REVIEW." } },
    adminReview: { reason: "UPHOLD — Checks passed" }, evidenceVersions: [{}], shadowHistory: [{}] });
  assert.equal(group(summary, "analysis", "model").tone, "neutral");
  assert.equal(group(summary, "decisions", "review").tone, "neutral");
  assert.equal(group(summary, "evidence", "timeline").tone, "info");
  assert.equal(group(summary, "evidence", "versions").tone, "info");
  assert.equal(group(summary, "analysis", "history").tone, "info");
});
