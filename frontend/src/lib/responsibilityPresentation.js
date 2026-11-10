import { reviewClassificationLabels } from "./responsibilityReviewAction.js";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
const calendarFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const timeFormat = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
  timeZoneName: "short",
});
const dateKeys = new Set([
  "at",
  "date",
  "time",
  "timestamp",
  "when",
  "appealdeadline",
]);
const iso =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2}))?$/i;
const isDateKey = (key) =>
  dateKeys.has(key.toLowerCase()) ||
  /(?:At|Date|Time|Timestamp)$/.test(key) ||
  /_(?:at|date|time|timestamp)$/i.test(key);

export function formatRecordDate(value, key = "") {
  if (typeof value !== "string" || !isDateKey(key)) return null;
  const match = iso.exec(value);
  if (!match) return null;
  const [
    ,
    yearText,
    monthText,
    dayText,
    hour,
    minute,
    second = "00",
    fraction = "",
    offset,
  ] = match;
  const year = Number(yearText),
    month = Number(monthText),
    day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1])
    return null;
  if (
    hour != null &&
    (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59)
  )
    return null;
  if (
    offset &&
    offset.toUpperCase() !== "Z" &&
    (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59)
  )
    return null;
  const instant = new Date(hour == null ? `${value}T00:00:00Z` : value);
  if (!Number.isFinite(instant.getTime())) return null;
  if (hour == null)
    return {
      date: calendarFormat.format(instant),
      time: null,
      dateTime: value,
    };
  const parts = Object.fromEntries(
    timeFormat.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  const zone = /^(?:GMT|UTC)\+0?5:30$/.test(parts.timeZoneName)
    ? "IST"
    : parts.timeZoneName;
  const decimals = fraction.replace(/0+$/, "");
  const time = `${parts.hour}:${parts.minute}:${parts.second}${decimals ? "." + decimals : ""} ${parts.dayPeriod.toUpperCase()} ${zone}`;
  return { date: dateFormat.format(instant), time, dateTime: value };
}

export function recordDateNote(value, key = "") {
  if (
    !isDateKey(key) ||
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}/.test(value) ||
    formatRecordDate(value, key)
  )
    return null;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)
    ? "Time zone not recorded"
    : "Unrecognized recorded date";
}

const labels = {
  at: "Event time",
  observedAt: "Recorded event time",
  receivedAt: "Received at",
  createdAt: "Recorded",
  updatedAt: "Updated",
  generatedAt: "Prepared at",
  occurredAt: "Happened at",
  scheduledAt: "Scheduled",
  expiresAt: "Expires",
  evaluatedAt: "Checked at",
  decidedAt: "Decision time",
  reviewedAt: "Reviewed",
  submittedAt: "Submitted",
  finalizedAt: "Completed at",
  appealStartedAt: "Appeal started",
  appealDeadline: "Appeal deadline",
  timeline: "Recorded events",
  chronology: "Recorded events",
  reportedReason: "Reported reason",
  id: "Reference",
  caseId: "Case reference",
  bookingId: "Booking reference",
  evidenceIds: "Evidence references",
  derivedFrom: "Based on evidence",
  rawModelOutput: "Original AI response",
  claimKey: "Statement reference",
  completeness: "Information checks",
  contradictions: "Details that do not match",
  requiredCategories: "Information needed",
  missing: "Missing information",
  unavailable: "Information that could not be collected",
  value: "Details",
  caseType: "Issue",
  consequenceLevel: "Action level",
  complete: "All required information is present",
  actor: "Who was involved",
  actors: "People or services involved",
  actorType: "Person or service type",
  actorId: "Person or service ID",
  actorRole: "Role",
  classification: "Cause of the issue",
  recommendation: "AI suggestion",
  decision: "Decision",
  outcome: "Outcome",
  state: "Current status",
  status: "Status",
  source: "Where this came from",
  category: "Type of record",
  basis: "How this was recorded",
  quality: "Checks on this record",
  confidence: "AI confidence score",
  availability: "Is this information available?",
  valid: "Passed the checks",
  factualValidation: "Checks on the information",
  validation: "Checks on the information",
  analysisEnvelope: "Full AI response",
  envelope: "Full AI response",
  adjudicationWork: "AI processing details",
  work: "AI processing details",
  attempts: "Processing attempts",
  evidenceHash: "Record verification code",
  evidenceVersion: "Record version",
  schemaVersion: "Record format version",
  version: "Version",
  policyVersion: "Service policy version",
  suggestedActionCategory: "Suggested action",
  severity: "Issue severity",
};
export function recordLabel(key) {
  return (
    labels[key] ||
    key
      .replace(/([a-z\d])([A-Z])/g, "$1 $2")
      .replaceAll("_", " ")
      .replace(/^./, (c) => c.toUpperCase())
  );
}
const enumKeys = new Set([
  "classification",
  "recommendation",
  "state",
  "status",
  "decision",
  "outcome",
  "consequenceLevel",
  "caseType",
  "category",
  "requiredCategories",
  "missing",
  "unavailable",
  "basis",
  "availability",
  "kind",
  "suggestedActionCategory",
  "severity",
]);
const values = {
  ...reviewClassificationLabels,
  UPHOLD: "Hold driver responsible",
  WAIVE: "Take no action",
  LEVEL_0: "No action",
  LEVEL_1: "Level 1",
  LEVEL_2: "Level 2",
  NEEDS_ADMIN_REVIEW: "Needs review",
  EVIDENCE_COLLECTING: "Collecting ride records",
  AI_REVIEW: "AI is checking the records",
  POLICY_EVALUATION: "Checking service rules",
  PROVISIONAL_AUTO_UPHELD: "Initial decision: driver responsible",
  PROVISIONAL_ADMIN_UPHELD: "Initial decision: driver responsible",
  PROVISIONAL_AUTO_WAIVED: "Initial decision: no action",
  PROVISIONAL_ADMIN_WAIVED: "Initial decision: no action",
  APPEAL_WINDOW: "Appeal period open",
  APPEAL_OPEN: "Appeal period open",
  APPEAL_REVIEW: "Appeal needs review",
  NOTICE_PENDING: "Waiting for notification",
  FINAL_UPHELD: "Driver held responsible",
  FINAL_WAIVED: "No action against the driver",
  FINALIZED: "Decision complete",
  direct: "Recorded directly",
  derived: "Based on other records",
  NOT_OPEN: "Not open",
};
export function recordScalar(value, key = "") {
  if (value == null) return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (
    typeof value === "string" &&
    enumKeys.has(key) &&
    /^(?:[A-Z0-9_]+|[a-z0-9_]+)$/.test(value)
  )
    return (
      values[value] ||
      value
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase())
    );
  return String(value);
}

export function recordEntryHeading(entry, index, key = "") {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const titleKey = ["event", "kind", "title"].find(
    (field) => typeof entry[field] === "string" && entry[field],
  );
  const versionKey = ["version", "evidenceVersion"].find(
    (field) =>
      typeof entry[field] === "number" || typeof entry[field] === "string",
  );
  const title = titleKey
    ? recordScalar(entry[titleKey], titleKey)
    : versionKey
      ? `Version ${entry[versionKey]}`
      : `${["timeline", "chronology", "events"].includes(key) ? "Event" : "Record"} ${index + 1}`;
  const timeKey = [
    "observedAt",
    "at",
    "occurredAt",
    "finalizedAt",
    "reviewedAt",
    "decidedAt",
    "submittedAt",
    "evaluatedAt",
    "generatedAt",
    "createdAt",
    "recordedAt",
    "updatedAt",
  ].find((field) => formatRecordDate(entry[field], field));
  return { title, titleKey: titleKey || versionKey, timeKey };
}
