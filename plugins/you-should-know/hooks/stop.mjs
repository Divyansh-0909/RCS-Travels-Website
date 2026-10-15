#!/usr/bin/env node
import { chooseReview, loadRecentEvents, readStdinJson, toStopHookOutput } from "./lib.mjs";

try {
  if (process.env.YSK_INTERNAL_REVIEW === "1") {
    process.stdout.write("{}");
    process.exit(0);
  }
  const payload = readStdinJson();
  const events = loadRecentEvents(payload.session_id, payload.turn_id);
  const review = chooseReview(payload, events);
  process.stdout.write(JSON.stringify(toStopHookOutput(review)));
} catch {
  // A reviewer failure must never prevent Codex from finishing a turn.
  process.stdout.write("{}");
}
