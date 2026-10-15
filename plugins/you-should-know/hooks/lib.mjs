import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const IMPORTANT_PATTERNS = [
  { severity: "critical", re: /\b(security vulnerability|data loss|corrupt(?:ion|ed)|credential leak|secret exposed)\b/i },
  { severity: "warning", re: /\b(fail(?:ed|ure|ing)?|error|exception|timed? out|timeout|broken|regression)\b/i },
  { severity: "warning", re: /\b(skipp?ed|not run|wasn't run|were not run|untested|unverified|couldn't verify|could not verify)\b/i },
  { severity: "warning", re: /\b(workaround|temporary|hack|limitation|unsupported|not supported|blocked|incomplete)\b/i },
  { severity: "info", re: /\b(assum(?:e|ed|ption)|caveat|follow[- ]?up|todo|remaining)\b/i }
];

const REDACTIONS = [
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:Bearer\s+)[A-Za-z0-9._~+\/-]+=*\b/gi,
  /\b[A-Za-z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)[A-Za-z0-9_]*\s*[=:]\s*[^\s,;]+/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /(?<!\d)(?:\+91[- ]?)?[6-9]\d{9}(?!\d)/g
];

export function readStdinJson(input = fs.readFileSync(0, "utf8")) {
  const trimmed = input.trim();
  return trimmed ? JSON.parse(trimmed) : {};
}

export function redact(value) {
  let text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  for (const pattern of REDACTIONS) text = text.replace(pattern, "[REDACTED]");
  return text;
}

export function compactText(value, limit = 1800) {
  const text = redact(value).replace(/\s+/g, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

export function classifyText(value) {
  const text = compactText(value, 4000);
  let best = null;
  for (const item of IMPORTANT_PATTERNS) {
    const match = text.match(item.re);
    if (!match) continue;
    if (!best || severityRank(item.severity) > severityRank(best.severity)) {
      best = { severity: item.severity, matched: match[0] };
    }
  }
  return best;
}

export function severityRank(value) {
  return { info: 1, warning: 2, critical: 3 }[value] ?? 0;
}

export function pluginDataDir(env = process.env) {
  if (env.PLUGIN_DATA) return env.PLUGIN_DATA;
  const codexHome = env.CODEX_HOME || path.join(os.homedir(), ".codex");
  return path.join(codexHome, "you-should-know-data");
}

export function eventFile(sessionId, env = process.env) {
  const safe = String(sessionId || "unknown").replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(pluginDataDir(env), "events", `${safe}.jsonl`);
}

export function summarizeToolEvent(payload) {
  const response = compactText(payload.tool_response, 5000);
  const input = compactText(payload.tool_input, 800);
  const signal = classifyText(response);
  if (!signal) return null;
  const lower = response.toLowerCase();
  const index = Math.max(0, lower.indexOf(String(signal.matched).toLowerCase()));
  const start = Math.max(0, index - 180);
  const context = compactText(response.slice(start, index + String(signal.matched).length + 260), 520);
  return {
    at: new Date().toISOString(),
    turn_id: payload.turn_id || null,
    tool_name: payload.tool_name || "unknown",
    severity: signal.severity,
    matched: signal.matched,
    input,
    response: context
  };
}

export function appendEvent(event, sessionId, env = process.env) {
  if (!event) return;
  const file = eventFile(sessionId, env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, "utf8");
}

export function loadRecentEvents(sessionId, turnId, env = process.env, max = 16) {
  const file = eventFile(sessionId, env);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  const parsed = [];
  for (const line of lines.slice(-80)) {
    try {
      const event = JSON.parse(line);
      if (!turnId || !event.turn_id || event.turn_id === turnId) parsed.push(event);
    } catch {
      // Ignore a partial/corrupt line; hooks must never break a Codex turn.
    }
  }
  return parsed.slice(-max);
}

function extractImportantSentences(message) {
  const sentences = compactText(message, 8000)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const hits = [];
  for (const sentence of sentences) {
    const signal = classifyText(sentence);
    if (signal) hits.push({ ...signal, sentence: compactText(sentence, 320) });
  }
  hits.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  return hits.slice(0, 3);
}

export function deterministicReview(payload, events = []) {
  if (payload.stop_hook_active) return { should_notify: false, severity: "info", message: "", should_continue: false, continuation_reason: "" };

  const assistantHits = extractImportantSentences(payload.last_assistant_message || "");
  const importantEvents = [...events]
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 3);

  if (!assistantHits.length && !importantEvents.length) {
    return { should_notify: false, severity: "info", message: "", should_continue: false, continuation_reason: "" };
  }

  const topSeverity = [
    ...assistantHits.map((x) => x.severity),
    ...importantEvents.map((x) => x.severity)
  ].sort((a, b) => severityRank(b) - severityRank(a))[0] || "info";

  const assistantText = compactText(payload.last_assistant_message || "", 8000).toLowerCase();
  const unseenEvent = importantEvents.find((event) => {
    const token = String(event.matched || "").toLowerCase();
    return token && !assistantText.includes(token);
  });

  let message;
  if (unseenEvent) {
    message = `A ${unseenEvent.tool_name} result contained a ${unseenEvent.severity} signal (${unseenEvent.matched}) that the final answer may not clearly surface: ${compactText(unseenEvent.response, 360)}`;
  } else {
    message = assistantHits.map((hit) => hit.sentence).join(" ");
  }

  return {
    should_notify: Boolean(message),
    severity: topSeverity,
    message: compactText(message, 650),
    should_continue: false,
    continuation_reason: ""
  };
}

function backoffFile(env = process.env) {
  return path.join(pluginDataDir(env), "model-backoff.json");
}

function inBackoff(env = process.env) {
  const file = backoffFile(env);
  if (!fs.existsSync(file)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return Number(data.until || 0) > Date.now();
  } catch {
    return false;
  }
}

function setBackoff(stderr, env = process.env) {
  const usageLimited = /usage limit|credits|try again at/i.test(stderr || "");
  const durationMs = usageLimited ? 6 * 60 * 60 * 1000 : 15 * 60 * 1000;
  const file = backoffFile(env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ until: Date.now() + durationMs, usageLimited }), "utf8");
}

function buildReviewPrompt(payload, events) {
  const assistant = compactText(payload.last_assistant_message || "", 7000);
  const eventText = events.map((event, i) => `${i + 1}. ${event.tool_name} [${event.severity}]: ${compactText(event.response, 700)}`).join("\n") || "None.";
  return [
    "You are a side reviewer for a coding agent. Decide whether the user should receive a separate concise heads-up about something easy to miss.",
    "Focus on failed or skipped validation, incomplete work, hidden limitations, risky assumptions, temporary workarounds, regressions, security/data risks, and material scope changes.",
    "Do not restate routine success. Do not invent facts. A heads-up should be independently useful even if the user only skims the final answer.",
    "Set should_continue=true only when the coding agent clearly left required work unfinished and another pass can realistically fix or verify it.",
    "Keep message and continuation_reason concise.",
    "",
    "FINAL ASSISTANT MESSAGE:",
    assistant || "(empty)",
    "",
    "NOTABLE TOOL EVENTS:",
    eventText
  ].join("\n");
}

export function modelReview(payload, events = [], env = process.env) {
  if (env.YSK_AI_REVIEW === "0" || env.YSK_INTERNAL_REVIEW === "1" || inBackoff(env)) return null;

  const pluginRoot = env.PLUGIN_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dataDir = pluginDataDir(env);
  const reviewDir = path.join(dataDir, "reviewer");
  fs.mkdirSync(reviewDir, { recursive: true });
  const outputPath = path.join(reviewDir, `review-${process.pid}-${Date.now()}.json`);
  const schemaPath = path.join(pluginRoot, "hooks", "review.schema.json");

  const args = [
    "exec",
    "--disable", "plugins",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "-s", "read-only",
    "-C", reviewDir,
    "--output-schema", schemaPath,
    "-o", outputPath
  ];
  args.push("-m", env.YSK_MODEL || "gpt-5.6-luna");
  args.push("-");

  const result = spawnSync("codex", args, {
    input: buildReviewPrompt(payload, events),
    encoding: "utf8",
    timeout: Number(env.YSK_REVIEW_TIMEOUT_MS || 25000),
    windowsHide: true,
    env: { ...env, YSK_INTERNAL_REVIEW: "1" }
  });

  if (result.error || result.status !== 0 || !fs.existsSync(outputPath)) {
    setBackoff(`${result.stderr || ""} ${result.error?.message || ""}`, env);
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    return {
      should_notify: Boolean(parsed.should_notify),
      severity: ["info", "warning", "critical"].includes(parsed.severity) ? parsed.severity : "info",
      message: compactText(parsed.message || "", 650),
      should_continue: Boolean(parsed.should_continue),
      continuation_reason: compactText(parsed.continuation_reason || "", 650)
    };
  } catch {
    return null;
  }
}

export function chooseReview(payload, events = [], env = process.env) {
  const fallback = deterministicReview(payload, events);
  if (payload.stop_hook_active) return fallback;
  const ai = modelReview(payload, events, env);
  return ai || fallback;
}

export function toStopHookOutput(review, env = process.env) {
  if (!review?.should_notify && !review?.should_continue) return {};
  const prefix = review.severity === "critical" ? "You should know — critical" : "You should know";
  const output = {};
  if (review.should_notify && review.message) output.systemMessage = `${prefix}: ${review.message}`;
  if (env.YSK_AUTOCONTINUE === "1" && review.should_continue && review.continuation_reason) {
    output.decision = "block";
    output.reason = review.continuation_reason;
  }
  return output;
}
