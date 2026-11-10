import { responsibilityInspectionModel } from "./responsibilityInspection.js";
import { formatRecordDate, recordEntryHeading, recordScalar } from "./responsibilityPresentation.js";

const list = (value) => Array.isArray(value) ? value : null;
const text = (value, key = "") => value != null && !(typeof value === "string" && !value.trim()) && ["string", "number", "boolean"].includes(typeof value)
  ? recordScalar(value, key) : null;
const group = (id, title, hint, lines = [], {
  status = "neutral", badges = [],
  tone = status === "attention" ? "warning" : status === "confirmed" ? "success" : "neutral",
} = {}) => ({ id, title, hint, lines: lines.filter(Boolean), status, badges, tone });
const count = (items, singular) => items ? `${items.length} ${singular}${items.length === 1 ? "" : "s"}` : "Not recorded";
// A saved suggestion is informational, never a successful or failed verdict.
const assessmentTone = value => value === "NEEDS_REVIEW" || value === "NEEDS_ADMIN_REVIEW" ? "warning" : "info";

function names(items) {
  return items.slice(0, 3).map(value => text(value, "category") ?? "Record details")
    .join(", ") + (items.length > 3 ? `, +${items.length - 3} more` : "");
}

function recordedTime(record) {
  const heading = recordEntryHeading(record, 0);
  const date = heading?.timeKey && formatRecordDate(record[heading.timeKey], heading.timeKey);
  return date ? `${date.date}${date.time ? ` · ${date.time}` : ""}` : null;
}

function decisionGroup(id, title, record) {
  if (record == null) return group(id, title, "Not recorded");
  const outcome = record.outcome ?? record.decision;
  const label = outcome === "UPHOLD" || outcome === "FINAL_UPHELD" ? "Driver held responsible"
    : outcome === "WAIVE" || outcome === "FINAL_WAIVED" ? "No action against the driver"
      : text(outcome, "outcome");
  const assessment = text(record.classification, "classification");
  return group(id, title, label ?? (assessment ? `Assessment: ${assessment}` : "Outcome not recorded"),
    [text(record.reason), recordedTime(record)],
    { tone: label ? "info" : assessment ? assessmentTone(record.classification) : "neutral" });
}

// Summaries only read retained records. Missing data is never a passed check.
export function responsibilityPanelSummaries(context) {
  const evidence = context.evidence;
  const events = evidence && ["timeline", "chronology", "events"].map(key => list(evidence[key])).find(Boolean);
  const completeness = evidence?.completeness;
  const missing = list(completeness?.missing), unavailable = list(completeness?.unavailable);
  const conflicts = list(evidence?.contradictions), versions = list(context.evidenceVersions);
  const model = responsibilityInspectionModel(context), validation = model.validation;
  const recommendation = text(model.envelope?.recommendation, "recommendation");
  const ruleResult = text(context.shadowResult?.classification, "classification");
  const history = list(context.shadowHistory), shadow = context.shadowResult;
  const eventLines = events?.slice(0, 2).map((event, index) => recordEntryHeading(event, index, "timeline")?.title ?? "Saved ride event") ?? [];
  const hasGaps = Boolean(missing?.length || unavailable?.length);
  const informationStatus = hasGaps ? "Needs attention" : completeness?.complete === true ? "Recorded complete"
    : completeness?.complete === false ? "Needs attention" : "Not checked";
  const informationLines = [completeness?.complete === true && hasGaps ? "The record is marked complete, but missing or unavailable information is also listed."
    : completeness?.complete === false && !hasGaps ? "Information is incomplete; the missing details were not listed." : null];
  const informationBadges = [missing?.length ? `Missing: ${names(missing)}` : null,
    unavailable?.length ? `Unavailable: ${names(unavailable)}` : null].filter(Boolean);
  const validationHint = validation?.valid === true ? "Checks passed"
    : validation?.valid === false ? "Needs attention" : "Not checked";
  const appealLines = [text(context.appeal?.reason), text(context.appealReview?.reason)];
  const appealBadges = context.appealWindow?.state != null
    ? [`Period: ${recordScalar(context.appealWindow.state, "state")}`] : [];
  return {
    evidence: {
      title: "Evidence", description: "What happened and which records are available.",
      groups: [
        group("timeline", "Ride timeline", count(events, "event"), [
          text(evidence?.reportedReason) && `Reported reason: ${text(evidence.reportedReason)}`,
          ...eventLines, events?.length > 2 ? `+${events.length - 2} more events in the full records.` : null,
        ], { tone: events?.length ? "info" : "neutral" }),
        group("completeness", "Information checks", informationStatus, informationLines,
          { status: completeness?.complete === false || missing?.length || unavailable?.length ? "attention" : completeness?.complete === true ? "confirmed" : "neutral", badges: informationBadges }),
        group("conflicts", "Conflicting details", conflicts?.length === 0 ? "None listed" : count(conflicts, "detail"),
          conflicts?.length ? ["Review these differences in the full evidence."] : [], { status: conflicts?.length ? "attention" : "neutral" }),
        group("versions", "Record history", count(versions, "version"), [], { tone: versions?.length ? "info" : "neutral" }),
      ],
    },
    analysis: {
      title: "AI assessment", description: "Suggestions and checks, separate from your decision.",
      groups: [
        group("model", "AI suggestion", model.envelope == null ? "Not saved"
          : recommendation ?? "Suggestion not recorded",
          model.envelope == null ? [] : [text(model.envelope.summary) ?? "Open the full assessment for details."],
          { tone: recommendation ? assessmentTone(model.envelope.recommendation) : "neutral" }),
        group("guarded", "Service rules", shadow == null ? "Not recorded"
          : ruleResult ?? "Result not recorded", [], { tone: ruleResult ? assessmentTone(shadow.classification) : "neutral" }),
        group("validation", "Information checks", validationHint, [validation?.valid === true
          ? "Passing these checks does not confirm every statement."
          : validation?.valid === false ? "See the full assessment for the check result."
            : null], { status: validation?.valid === false ? "attention" : validation?.valid === true ? "confirmed" : "neutral",
              tone: validation?.valid === false ? "danger" : validation?.valid === true ? "success" : "neutral" }),
        group("history", "Past assessments", count(history, "assessment"), [], { tone: history?.length ? "info" : "neutral" }),
      ],
    },
    decisions: {
      title: "Decisions", description: "Initial decisions, reviews, appeals and the final outcome.",
      groups: [
        decisionGroup("provisional", "Initial decision", context.provisionalDecision),
        decisionGroup("review", "Human review", context.adminReview),
        group("appeals", "Appeals", context.appealReview ? "Review saved" : context.appeal ? "Recorded" : "None recorded", appealLines,
          { badges: appealBadges, tone: context.appealReview || context.appeal ? "info" : "neutral" }),
        decisionGroup("final", "Final decision", context.finalDecision),
      ],
    },
  };
}
