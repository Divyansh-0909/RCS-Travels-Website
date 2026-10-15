import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, "..");
const postHook = path.join(pluginRoot, "hooks", "post-tool-use.mjs");
const stopHook = path.join(pluginRoot, "hooks", "stop.mjs");

function runHook(script, payload, dataDir) {
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: {
      ...process.env,
      PLUGIN_ROOT: pluginRoot,
      PLUGIN_DATA: dataDir,
      YSK_AI_REVIEW: "0"
    }
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout || "{}");
}

function runUserHook(script, payload, codexHome) {
  const env = {
    ...process.env,
    CODEX_HOME: codexHome,
    YSK_AI_REVIEW: "0"
  };
  delete env.PLUGIN_ROOT;
  delete env.PLUGIN_DATA;
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout || "{}");
}

test("PostToolUse -> Stop surfaces an omitted failure through the real hook executables", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ysk-contract-"));
  const base = { session_id: "session-contract", turn_id: "turn-1", cwd: process.cwd(), model: "test" };

  assert.deepEqual(runHook(postHook, {
    ...base,
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_use_id: "tool-1",
    tool_input: { command: "npm test" },
    tool_response: "Tests: 1 failed, 24 passed. payment webhook timeout"
  }, dataDir), {});

  const output = runHook(stopHook, {
    ...base,
    hook_event_name: "Stop",
    stop_hook_active: false,
    last_assistant_message: "Updated the payment webhook implementation."
  }, dataDir);

  assert.match(output.systemMessage, /^You should know:/);
  assert.match(output.systemMessage, /1 failed/i);
});

test("Stop stays silent for a clean completion", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ysk-contract-"));
  const output = runHook(stopHook, {
    session_id: "session-clean",
    turn_id: "turn-clean",
    cwd: process.cwd(),
    model: "test",
    hook_event_name: "Stop",
    stop_hook_active: false,
    last_assistant_message: "Implemented the change and verified the requested tests."
  }, dataDir);
  assert.deepEqual(output, {});
});

test("Stop guard prevents continuation loops", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ysk-contract-"));
  const output = runHook(stopHook, {
    session_id: "session-loop",
    turn_id: "turn-loop",
    cwd: process.cwd(),
    model: "test",
    hook_event_name: "Stop",
    stop_hook_active: true,
    last_assistant_message: "Tests failed."
  }, dataDir);
  assert.deepEqual(output, {});
});

test("standalone user-hook mode works without plugin environment variables", () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), "ysk-user-hook-"));
  const base = { session_id: "user-hook-session", turn_id: "user-hook-turn", cwd: process.cwd(), model: "test" };

  runUserHook(postHook, {
    ...base,
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_input: { command: "npm test" },
    tool_response: "Validation failed: browser smoke test timed out"
  }, codexHome);

  const output = runUserHook(stopHook, {
    ...base,
    hook_event_name: "Stop",
    stop_hook_active: false,
    last_assistant_message: "Implemented the requested UI change."
  }, codexHome);

  assert.match(output.systemMessage, /^You should know:/);
  assert.match(output.systemMessage, /failed/i);
  assert.equal(fs.existsSync(path.join(codexHome, "you-should-know-data", "events", "user-hook-session.jsonl")), true);
});
