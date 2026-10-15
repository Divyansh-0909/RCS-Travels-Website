import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendEvent,
  chooseReview,
  deterministicReview,
  loadRecentEvents,
  redact,
  summarizeToolEvent,
  toStopHookOutput
} from "../hooks/lib.mjs";

test("quiet successful turns do not create a warning", () => {
  const review = deterministicReview({ last_assistant_message: "Implemented the change and verified it with the requested test.", stop_hook_active: false }, []);
  assert.equal(review.should_notify, false);
  assert.deepEqual(toStopHookOutput(review, {}), {});
});

test("buried skipped validation becomes a heads-up", () => {
  const review = deterministicReview({
    last_assistant_message: "The feature is implemented. I skipped the browser test because Chrome was unavailable. The unit tests passed.",
    stop_hook_active: false
  }, []);
  const output = toStopHookOutput(review, {});
  assert.match(output.systemMessage, /^You should know:/);
  assert.match(output.systemMessage, /skipped the browser test/i);
});

test("failed tool output not surfaced in the final answer is highlighted", () => {
  const event = summarizeToolEvent({
    turn_id: "turn-1",
    tool_name: "Bash",
    tool_input: { command: "npm test" },
    tool_response: "Tests: 1 failed, 24 passed. Failure: payment webhook timeout"
  });
  assert.equal(event.severity, "warning");
  const review = deterministicReview({ last_assistant_message: "Updated the payment webhook implementation.", stop_hook_active: false }, [event]);
  assert.equal(review.should_notify, true);
  assert.match(review.message, /1 failed/i);
});

test("stop continuation guard suppresses repeat review", () => {
  const review = deterministicReview({ last_assistant_message: "Tests failed.", stop_hook_active: true }, []);
  assert.equal(review.should_notify, false);
});

test("event log keeps only the current turn and redacts credentials", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ysk-test-"));
  const env = { PLUGIN_DATA: root };
  appendEvent({ turn_id: "a", severity: "warning", tool_name: "Bash", matched: "failed", response: redact("API_KEY=super-secret-value failed") }, "s", env);
  appendEvent({ turn_id: "b", severity: "warning", tool_name: "Bash", matched: "error", response: "error in second turn" }, "s", env);
  const events = loadRecentEvents("s", "a", env);
  assert.equal(events.length, 1);
  assert.doesNotMatch(events[0].response, /super-secret-value/);
  assert.match(events[0].response, /\[REDACTED\]/);
});

test("autocontinue is opt-in", () => {
  const review = {
    should_notify: true,
    severity: "critical",
    message: "Required validation is missing.",
    should_continue: true,
    continuation_reason: "Run the missing validation before finishing."
  };
  assert.equal(toStopHookOutput(review, {}).decision, undefined);
  const enabled = toStopHookOutput(review, { YSK_AUTOCONTINUE: "1" });
  assert.equal(enabled.decision, "block");
  assert.match(enabled.systemMessage, /critical/i);
});

test("model reviewer failure falls back locally and records backoff", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ysk-fallback-"));
  const review = chooseReview({
    last_assistant_message: "I skipped the browser validation because Chrome was unavailable.",
    stop_hook_active: false
  }, [], {
    ...process.env,
    PLUGIN_DATA: root,
    PLUGIN_ROOT: path.resolve(path.dirname(new URL(import.meta.url).pathname), ".."),
    YSK_AI_REVIEW: "1",
    PATH: ""
  });
  assert.equal(review.should_notify, true);
  assert.match(review.message, /skipped the browser validation/i);
  assert.equal(fs.existsSync(path.join(root, "model-backoff.json")), true);
});
