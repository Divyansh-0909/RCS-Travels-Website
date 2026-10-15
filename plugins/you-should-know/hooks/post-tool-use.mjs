#!/usr/bin/env node
import { appendEvent, readStdinJson, summarizeToolEvent } from "./lib.mjs";

try {
  if (process.env.YSK_INTERNAL_REVIEW === "1") process.exit(0);
  const payload = readStdinJson();
  const event = summarizeToolEvent(payload);
  appendEvent(event, payload.session_id);
  process.stdout.write("{}");
} catch {
  // Observation must never interfere with the coding agent.
  process.stdout.write("{}");
}
