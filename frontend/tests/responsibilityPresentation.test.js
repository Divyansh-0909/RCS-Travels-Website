import assert from "node:assert/strict";
import test from "node:test";
import {
  formatRecordDate,
  recordScalar,
  recordLabel,
  recordEntryHeading,
  recordDateNote,
} from "../src/lib/responsibilityPresentation.js";

test("UTC records show an explicit India date and time", () => {
  assert.deepEqual(formatRecordDate("2026-10-29T04:30:00Z", "observedAt"), {
    date: "29 Oct 2026",
    time: "10:00:00 AM IST",
    dateTime: "2026-10-29T04:30:00Z",
  });
});
test("explicit offsets resolve to the same instant and midnight rolls over in India", () => {
  assert.equal(
    formatRecordDate("2026-10-29T10:00:00+05:30", "at").time,
    "10:00:00 AM IST",
  );
  assert.deepEqual(formatRecordDate("2026-10-29T20:00:00Z", "created_at"), {
    date: "30 Oct 2026",
    time: "1:30:00 AM IST",
    dateTime: "2026-10-29T20:00:00Z",
  });
});
test("calendar-only dates stay on the recorded calendar day", () => {
  assert.deepEqual(formatRecordDate("2026-10-29", "date"), {
    date: "29 Oct 2026",
    time: null,
    dateTime: "2026-10-29",
  });
});
test("invalid dates, ambiguous local clocks and numeric epochs are not guessed", () => {
  for (const value of [
    "2026-02-30T04:30:00Z",
    "2026-02-29",
    "2026-13-01",
    "2026-10-29T24:00:00Z",
    "2026-10-29T04:30:60Z",
    "2026-10-29T04:30:00+24:00",
    "2026-10-29T04:30:00",
    "29/10/2026",
    1793248200000,
    null,
  ])
    assert.equal(formatRecordDate(value, "at"), null);
  assert.equal(formatRecordDate("2028-02-29", "date").date, "29 Feb 2028");
});
test("dates embedded in IDs and statements retain their source meaning", () => {
  assert.equal(formatRecordDate("2026-10-29", "id"), null);
  assert.equal(formatRecordDate("2026-10-29T04:30:00Z", "reason"), null);
  assert.equal(recordScalar("NEEDS_REVIEW", "reason"), "NEEDS_REVIEW");
});
test("sub-second audit precision is retained rather than rounded away", () => {
  assert.equal(
    formatRecordDate("2026-10-29T04:30:00.123456Z", "at").time,
    "10:00:00.123456 AM IST",
  );
  assert.equal(
    formatRecordDate("2026-10-29T04:30:00.000000001Z", "at").time,
    "10:00:00.000000001 AM IST",
  );
});
test("structured values get clear labels without rewriting free text or identifiers", () => {
  assert.equal(
    recordScalar("DRIVER_CAUSED", "classification"),
    "Driver responsible",
  );
  assert.equal(recordScalar("not_available", "availability"), "Not available");
  assert.equal(recordScalar(false), "No");
  assert.equal(recordScalar(true), "Yes");
  assert.equal(recordScalar(0), "0");
  assert.equal(recordScalar("ev_0001", "id"), "ev_0001");
  assert.equal(recordLabel("observedAt"), "Recorded event time");
  assert.equal(
    recordScalar("Review GPS evidence first", "recommendation"),
    "Review GPS evidence first",
  );
  assert.equal(recordScalar("iOS", "category"), "iOS");
});

test("unconverted times clearly explain missing zones or invalid recorded dates", () => {
  assert.equal(
    recordDateNote("2026-10-29T04:30:00", "observedAt"),
    "Time zone not recorded",
  );
  assert.equal(
    recordDateNote("2026-02-30T04:30:00Z", "at"),
    "Unrecognized recorded date",
  );
  assert.equal(recordDateNote("2026-10-29T04:30:00Z", "observedAt"), null);
  assert.equal(recordDateNote("2026-10-29", "id"), null);
});
test("event headings distinguish observed time from received time without mutating or sorting data", () => {
  const event = Object.freeze({
    kind: "driver_cancellation_recorded",
    observedAt: "2026-10-29T04:30:00Z",
    receivedAt: "2026-10-29T04:31:00Z",
    id: "ev_0001",
  });
  assert.deepEqual(recordEntryHeading(event, 0, "timeline"), {
    title: "Driver cancellation recorded",
    titleKey: "kind",
    timeKey: "observedAt",
  });
  assert.deepEqual(
    recordEntryHeading({ version: 3, generatedAt: "2026-10-29T04:30:00Z" }, 0),
    { title: "Version 3", titleKey: "version", timeKey: "generatedAt" },
  );
  assert.equal(event.receivedAt, "2026-10-29T04:31:00Z");
});

test("decision headers prefer the action time over database creation time", () => {
  for (const key of [
    "evaluatedAt",
    "decidedAt",
    "submittedAt",
    "reviewedAt",
    "finalizedAt",
  ]) {
    const value = Object.freeze({
      [key]: "2026-10-29T04:30:00Z",
      createdAt: "2026-10-29T04:30:03Z",
    });
    assert.equal(recordEntryHeading(value, 0).timeKey, key);
    assert.equal(formatRecordDate(value[key], key).time, "10:00:00 AM IST");
  }
  assert.equal(
    formatRecordDate("2026-10-30T04:30:00Z", "appealDeadline").date,
    "30 Oct 2026",
  );
});
