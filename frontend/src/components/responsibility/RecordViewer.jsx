import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { cn } from "./utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { ChevronDown, Circle, CircleDot, MessageSquareText, Bot, ClipboardCheck, FileText, History } from './story/ui/icons';
import {
  TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger,
  Trace, TraceIcon, TraceTitle,
} from "./ui/trace";
import {
  formatRecordDate,
  recordDateNote,
  recordEntryHeading,
  recordLabel,
  recordScalar,
} from "../../lib/responsibilityPresentation";

const priorities = [
  "timeline",
  "chronology",
  "events",
  "summary",
  "reason",
  "reportedReason",
  "classification",
  "decision",
  "outcome",
  "state",
  "status",
  "createdAt",
  "generatedAt",
  "change",
  "completeness",
  "contradictions",
];
const rootReferences = new Set([
  "id",
  "caseId",
  "bookingId",
  "evidenceHash",
  "evidenceVersion",
  "schemaVersion",
  "rawModelOutput",
]);

function DateValue({ value, field }) {
  const date = formatRecordDate(value, field);
  if (!date) return null;
  return (
    <time
      dateTime={date.dateTime}
      title={`Original value: ${value}`}
      className="inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 tabular-nums"
    >
      <span>{date.date}</span>
      {date.time && (
        <>
          <span aria-hidden="true">·</span>
          <span>{date.time}</span>
        </>
      )}
    </time>
  );
}

function Disclosure({ label, children }) {
  return (
    <Collapsible className="record-disclosure mt-3 border-t border-border/60 pt-1">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-between px-1 text-ink-muted [&[data-state=open]>svg]:rotate-180"
        >
          {label}
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function CompactEventDetails({ value }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return <DataValue value={value} depth={1} />;
  const actor = typeof value.actor === "string" && value.actor.trim() ? value.actor : null;
  const narrative = new Set(["reason", "summary", "statement", "description", "note"]);
  const paragraphs = Object.entries(value).filter(([key, item]) => narrative.has(key) && typeof item === "string" && item.trim());
  const rest = Object.fromEntries(Object.entries(value).filter(([key]) => !(key === "actor" && actor) && !paragraphs.some(([field]) => field === key)));
  return <div className="min-w-0 space-y-2">
    {actor && <Badge variant="outline" className="rounded-[0.625rem] border-status-info/20 bg-status-info/8 text-status-info" title="Person listed in this record"><span className="min-w-0 [overflow-wrap:anywhere]">By {actor}</span></Badge>}
    {paragraphs.map(([key, item]) => <p key={key} title={item} className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-5 [overflow-wrap:anywhere]">{recordLabel(key)}: {item}</p>)}
    {Object.keys(rest).length > 0 && <DataValue value={rest} depth={1} />}
    {!actor && !paragraphs.length && !Object.keys(rest).length && <DataValue value={value} depth={1} />}
  </div>;
}

function RecordEntry({ entry, index, field, depth, flat = false, compact = false }) {
  const header = recordEntryHeading(entry, index, field);
  if (!header)
    return <DataValue value={entry} depth={depth + 1} field={field} />;
  const journal =
    typeof entry.kind === "string" &&
    typeof entry.observedAt === "string" &&
    Object.hasOwn(entry, "value");
  const body = Object.fromEntries(
    Object.entries(entry).filter(
      ([key]) => key !== header.titleKey && key !== header.timeKey,
    ),
  );
  const metadata = Object.fromEntries(
    Object.entries(body).filter(([key]) => !["value", "source"].includes(key)),
  );
  const labels = journal && (
    <span className="flex flex-wrap items-center gap-2 text-xs leading-4">
      {entry.category && <span>{recordScalar(entry.category, "category")}</span>}
      {entry.basis === "derived" && <Badge variant="outline">From other records</Badge>}
      {entry.availability && entry.availability !== "available" && (
        <Badge variant="outline">{recordScalar(entry.availability, "availability")}</Badge>
      )}
    </span>
  );
  const details = compact ? <CompactEventDetails value={journal ? entry.value : body} /> : journal ? (
    <>
      <DataValue value={entry.value} depth={depth + 1} />
      {!compact && (
        <>
          {entry.source && <p className="mt-3 break-words text-xs leading-5 [overflow-wrap:anywhere]">Recorded in: {String(entry.source)}</p>}
          {entry.basis === "derived" && entry.derivedFrom?.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs">Based on these records</p>
              <DataValue value={entry.derivedFrom} depth={depth + 1} field="evidenceIds" />
            </div>
          )}
          {entry.quality && Object.keys(entry.quality).length > 0 && (
            <div className="mt-3 rounded-lg border border-border bg-surface-muted p-3">
              <p className="mb-2 text-xs font-medium">Checks on this record</p>
              <DataValue value={entry.quality} depth={depth + 1} />
            </div>
          )}
          <Disclosure label="More about this event">
            <DataValue value={metadata} depth={depth + 1} />
          </Disclosure>
        </>
      )}
    </>
  ) : Object.keys(body).length > 0 ? <DataValue value={body} depth={depth + 1} />
    : <p className="text-sm leading-6">No further details were recorded.</p>;

  if (flat) return (
    <TraceCollapsible defaultOpen={index === 0} data-record-step data-compact-record={compact || undefined}>
      <TraceCollapsibleTrigger className="items-start py-2">
        <TraceIcon className={cn("mt-[calc(0.5lh-0.5rem)]", compact && "text-status-info")}><CircleDot /></TraceIcon>
        <span className="min-w-0 flex-1 text-ink">
          <TraceTitle className={cn("block leading-5", compact && "text-status-info")}>{header.title}</TraceTitle>
          {header.timeKey && <span className="mt-1 block text-xs font-normal leading-4"><DateValue value={entry[header.timeKey]} field={header.timeKey} /></span>}
          {labels}
        </span>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent keepMounted className="pb-3 text-ink">
        <div data-slot={compact ? "event-summary" : "timeline-detail-box"} className={compact ? "min-w-0" : "rounded-2xl bg-surface-muted/60 p-4 text-ink dark:bg-surface-raised [&_dt]:text-ink"}>
          {details}
        </div>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
  return (
    <Card className="record-entry gap-0 rounded-xl border-border/70 bg-surface py-0 sm:py-0">
      <CardContent className="record-entry-content px-3 py-3 sm:px-4">
        <p className="text-sm font-medium leading-6">{header.title}</p>
        {labels}
        {header.timeKey && <p className="mt-1 text-xs leading-5"><span>{recordLabel(header.timeKey)}: </span><DateValue value={entry[header.timeKey]} field={header.timeKey} /></p>}
        <div className="mt-3">{details}</div>
      </CardContent>
    </Card>
  );
}

export function RecordTimelineEntry({ entry, index = 0, compact = false }) {
  return <RecordEntry entry={entry} index={index} field="timeline" depth={0} flat compact={compact} />;
}

function isScalarList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(item => item == null || typeof item !== 'object');
}

function recordFieldLayout(value) {
  if (value == null || typeof value !== 'object') return 'inline';
  if (Array.isArray(value) && (!value.length || isScalarList(value))) return 'inline';
  return 'section';
}

function DataValue({ value, depth = 0, field = "", timeline = false }) {
  if (value == null)
    return <span className="text-ink-muted">Not recorded</span>;
  if (typeof value !== "object") {
    if (formatRecordDate(value, field))
      return <DateValue value={value} field={field} />;
    if (
      [
        "classification",
        "recommendation",
        "decision",
        "outcome",
        "state",
        "status",
      ].includes(field)
    )
      return (
        <Badge variant="secondary">
          {recordScalar(value, field)}
        </Badge>
      );
    const note = recordDateNote(value, field);
    return (
      <>
        <span className="inline-block max-w-prose whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {recordScalar(value, field)}
        </span>
        {note && (
          <span className="mt-1 block text-xs text-ink-muted">{note}</span>
        )}
      </>
    );
  }
  if (isScalarList(value))
    return <ul className="record-inline-values flex min-w-0 flex-wrap gap-2" aria-label={field ? recordLabel(field) : 'Saved values'}>{value.map((item,index) => <li className="min-w-0 max-w-full" key={index}><Badge variant="outline" className="whitespace-pre-wrap [overflow-wrap:anywhere]">{recordScalar(item,field)}</Badge></li>)}</ul>;
  if (depth > 3)
    return (
      <pre className="whitespace-pre-wrap break-words text-xs leading-6 [overflow-wrap:anywhere]">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  if (Array.isArray(value)) {
    const chronological =
      timeline || ["timeline", "chronology", "events"].includes(field);
    if (!value.length)
      return (
        <p className="text-ink-muted">
          {["timeline", "chronology", "events"].includes(field)
            ? "No events recorded."
            : "None"}
        </p>
      );
    return (
      <ol
        aria-label={field ? recordLabel(field) : "Records"}
        data-record-timeline={chronological || undefined}
        className={chronological ? "min-w-0" : "space-y-4"}
      >
        {value.map((entry, index) => (
          <li
            key={index}
            className={
              chronological
                ? "min-w-0 pb-2 text-sm leading-6 last:pb-0"
                : "min-w-0"
            }
          >
            <RecordEntry
              entry={entry}
              index={index}
              field={field}
              depth={depth}
              flat={chronological}
            />
          </li>
        ))}
      </ol>
    );
  }
  const entries = Object.entries(value)
    .filter(([key]) => depth !== 0 || !rootReferences.has(key))
    .sort(
      ([a], [b]) =>
        (priorities.includes(a) ? priorities.indexOf(a) : 100) -
        (priorities.includes(b) ? priorities.indexOf(b) : 100),
    );
  if (!entries.length)
    return (
      <p className="text-ink-muted">
        {Object.keys(value).length
          ? "Open Technical record to see all saved details."
          : "No details recorded."}
      </p>
    );
  return (
    <dl className="record-fields divide-y divide-border/60">
      {entries.map(([key, entry]) => {
        const full =
          (entry != null && typeof entry === "object") ||
          Boolean(formatRecordDate(entry, key)) ||
          [
            "reason",
            "summary",
            "statement",
            "reportedReason",
            "explanation",
            "change",
          ].includes(key) ||
          String(entry).length > 64;
        return (
          <div
            key={key}
            data-record-layout={recordFieldLayout(entry)}
            className={`record-field grid min-w-0 gap-1 py-2.5 first:pt-0 last:pb-0 ${full ? "" : "grid-cols-[repeat(auto-fit,minmax(min(100%,10em),1fr))] gap-x-3"}`}
          >
            <dt className="break-words text-xs font-medium leading-6 text-ink-muted [overflow-wrap:anywhere]">
              {recordLabel(key)}
            </dt>
            <dd className="min-w-0 text-sm leading-6">
              <DataValue value={entry} depth={depth + 1} field={key} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function EvidenceRecord({ value }) {
  const field =
    value && typeof value === "object" && !Array.isArray(value)
      ? ["timeline", "chronology", "events"].find((key) =>
          Array.isArray(value[key]),
        )
      : null;
  if (!field) return <DataValue value={value} />;
  const metadata = Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => ![field, "reportedReason", "contradictions"].includes(key),
    ),
  );
  const checks =
    value.completeness &&
    typeof value.completeness === "object" &&
    !Array.isArray(value.completeness)
      ? Object.fromEntries(
          Object.entries(value.completeness).filter(([key]) =>
            ["complete", "missing", "unavailable"].includes(key),
          ),
        )
      : null;
  return (
    <div className="space-y-6">
      {Object.hasOwn(value, "reportedReason") && (
        <div className="space-y-2">
          <p className="text-xs font-medium leading-5 text-ink-muted">
            Reported reason
          </p>
          <div className="text-sm leading-6">
            <DataValue value={value.reportedReason} field="reportedReason" />
          </div>
        </div>
      )}
      <div className="space-y-4">
        <p className="text-xs font-medium leading-5 text-ink-muted">
          Recorded events
        </p>
        <DataValue value={value[field]} field={field} timeline />
      </div>
      {checks && Object.keys(checks).length > 0 && (
        <section
          aria-label="Information checks"
          className="space-y-3 border-t border-border/60 pt-4"
        >
          <h3 className="text-sm font-medium leading-6">Information checks</h3>
          <DataValue value={checks} />
        </section>
      )}
      {Object.hasOwn(value, "contradictions") && (
        <section
          aria-label="Details that do not match"
          className="space-y-2 border-t border-border/60 pt-4"
        >
          <h3 className="text-sm font-medium leading-6">
            Details that do not match
          </h3>
          {Array.isArray(value.contradictions) &&
          value.contradictions.length === 0 ? (
            <p className="text-sm leading-6 text-ink-muted">None recorded</p>
          ) : (
            <DataValue value={value.contradictions} field="contradictions" />
          )}
        </section>
      )}
      <Disclosure label="More about these records">
        <DataValue value={metadata} />
      </Disclosure>
    </div>
  );
}

function RecordTraceSection({ title, icon: Icon = FileText, defaultOpen = true, children }) {
  return <TraceCollapsible defaultOpen={defaultOpen} className="record-trace-section">
    <TraceCollapsibleTrigger className="record-trace-trigger">
      <TraceIcon><Icon /></TraceIcon><TraceTitle>{title}</TraceTitle>
    </TraceCollapsibleTrigger>
    <TraceCollapsibleContent className="record-trace-branch">
      <div className="record-trace-card">{children}</div>
    </TraceCollapsibleContent>
  </TraceCollapsible>;
}

function DifferenceTrace({ value }) {
  const differences = Array.isArray(value) ? value : [value];
  if (!differences.length) return <p className="text-sm text-ink-muted">No differences were recorded.</p>;
  return <div className="record-difference-groups">{differences.map((difference, index) => {
    if (!difference || typeof difference !== 'object' || Array.isArray(difference)) {
      return <Trace key={index}><RecordTraceSection title={`Difference ${index + 1}`} icon={MessageSquareText}><DataValue value={difference} /></RecordTraceSection></Trace>;
    }
    const { claimKey, observations, ...metadata } = difference;
    const heading = typeof claimKey === 'string' && claimKey.trim() ? recordLabel(claimKey) : `Difference ${index + 1}`;
    return <section key={index} aria-label={heading} className="record-difference-group">
      <h3>{heading}</h3>
      {Object.keys(metadata).length > 0 && <DataValue value={metadata} />}
      <Trace className="record-trace">{Array.isArray(observations) && observations.length > 0
        ? observations.map((observation, account) => <RecordTraceSection key={account} title={`Saved account ${account + 1}`} icon={MessageSquareText}><DataValue value={observation} /></RecordTraceSection>)
        : <RecordTraceSection title="Saved accounts" icon={MessageSquareText}><DataValue value={observations} /></RecordTraceSection>}
      </Trace>
    </section>;
  })}</div>;
}

const assessmentTraceIcons = { suggestion: Bot, informationChecks: ClipboardCheck, serviceRules: FileText, assessmentHistory: History, work: CircleDot };
const assessmentTraceLabels = { suggestion: 'AI suggestion', informationChecks: 'Information checks', serviceRules: 'Service rules', assessmentHistory: 'Earlier AI assessments', work: 'Processing details' };

function AssessmentTrace({ value }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return <DataValue value={value} />;
  const sections = Object.entries(value);
  if (!sections.length) return <p className="text-sm text-ink-muted">No assessment details were recorded.</p>;
  return <Trace className="record-trace">{sections.map(([field, entry], index) => <RecordTraceSection key={field} title={assessmentTraceLabels[field] || recordLabel(field)} icon={assessmentTraceIcons[field] || FileText} defaultOpen={index === 0}>
    <DataValue value={entry} field={field} />
  </RecordTraceSection>)}</Trace>;
}

export function RecordDetails({ title, value, layout, empty = 'No saved details are available.' }) {
  return <div className="record-data min-w-0 text-ink" role="region" aria-label={`${title} record`}>
    {value == null ? <p className="text-sm leading-5 text-ink-muted">{empty}</p> : <>
      {layout === 'differences' ? <DifferenceTrace value={value} /> : layout === 'assessment' ? <AssessmentTrace value={value} /> : <DataValue value={value} />}
      <Disclosure label="Technical record"><pre aria-label={`${title} technical record`} tabIndex={0} className="record-technical max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-muted p-3 text-xs leading-5 [overflow-wrap:anywhere] outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{JSON.stringify(value,null,2)}</pre></Disclosure>
    </>}
  </div>;
}

export default function RecordViewer({
  id,
  title,
  value,
  empty = "Not recorded.",
  timeline = false,
  stage = false,
  recorded = value != null,
  timeRecord = value,
  firstStage = false,
  lastStage = false,
}) {
  const count = Array.isArray(value) ? value.length : null;
  const heading = stage ? recordEntryHeading(timeRecord, 0) : null;
  return (
    <AccordionItem
      value={id}
      data-record-stage={stage || undefined}
      data-recorded={stage ? recorded : undefined}
      data-first-stage={stage ? firstStage : undefined}
      data-last-stage={stage ? lastStage : undefined}
      className={stage ? "min-w-0 border-0 pb-3 text-sm leading-6 last:pb-0" : "border-border"}
    >
      <AccordionTrigger className={stage ? "min-h-11 gap-2 py-2 text-sm text-ink hover:no-underline" : "gap-3 py-4 text-base hover:no-underline"}>
        {stage && <TraceIcon className="mt-[calc(0.5lh-0.5rem)]">{recorded ? <CircleDot /> : <Circle />}</TraceIcon>}
        <span className="min-w-0 flex-1 break-words leading-6">
          <span className="block">{title}</span>
          {stage && (
            <span className="mt-1 block text-xs font-normal text-ink">
              {heading?.timeKey ? (
                <DateValue
                  value={timeRecord[heading.timeKey]}
                  field={heading.timeKey}
                />
              ) : recorded ? (
                "Time not recorded"
              ) : (
                "Not recorded"
              )}
            </span>
          )}
        </span>
        {((!stage && value == null) || count != null) && (
          <Badge variant="secondary" className="hidden self-start sm:inline-flex">
            {value == null
              ? "No record"
              : `${count} ${count === 1 ? "record" : "records"}`}
          </Badge>
        )}
      </AccordionTrigger>
      <AccordionContent className={stage || timeline || id === "evidence" ? "ml-[calc(0.5rem-1px)] min-w-0 border-l border-border pl-4" : ""}>
        <div
          role="region"
          aria-label={`${title} record`}
          data-slot={stage ? "timeline-detail-box" : "record-details"}
          className={`min-w-0 text-ink ${stage ? "rounded-2xl bg-surface-muted/60 p-4 dark:bg-surface-raised [&_dt]:text-ink" : timeline || id === "evidence" ? "p-0" : "rounded-xl bg-surface-muted/60 p-4"}`}
        >
          {value == null ? (
            <p className="text-sm leading-6 text-ink-muted">{empty}</p>
          ) : (
            <>
              {id === "evidence" ? (
                <EvidenceRecord value={value} />
              ) : (
                <DataValue value={value} timeline={timeline} />
              )}
              <Disclosure label="Technical record">
                <pre
                  aria-label={`${title} technical record`}
                  tabIndex={0}
                  className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface p-3 text-xs leading-6 [overflow-wrap:anywhere] outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {JSON.stringify(value, null, 2)}
                </pre>
              </Disclosure>
            </>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
