import { Circle, CircleDot, CircleCheck, CircleX, TriangleAlert, ArrowUpRight } from "lucide-react";
import { responsibilityPanelSummaries } from "../../lib/responsibilityPanelSummaries";
import { responsibilityInspectionModel } from "../../lib/responsibilityInspection";
import { cn } from "./utils";
import RecordViewer, { RecordTimelineEntry } from "./RecordViewer";
import { recordScalar } from "../../lib/responsibilityPresentation";
import { Accordion } from "./ui/accordion";
import { buttonVariants } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogTrigger } from "./ui/dialog";
import {
  Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger,
  TraceIcon, TraceLine, TraceTitle,
} from "./ui/trace";

function FullRecords({ type, context }) {
  const model = responsibilityInspectionModel(context);
  if (type === "evidence") return (
    <Accordion type="multiple" defaultValue={["evidence"]}>
      <RecordViewer id="evidence" title="Ride records" value={context.evidence} empty="No ride records are available yet." />
      <RecordViewer id="versions" title="Record history" value={context.evidenceVersions} timeline />
    </Accordion>
  );
  if (type === "analysis") return (
    <div className="space-y-4">
      <p className="rounded-xl bg-surface-muted/60 px-4 py-3 text-sm leading-5 text-ink-muted">
        This is a suggestion, not a final decision. Check the ride records before deciding who is responsible.
      </p>
      <Accordion type="multiple" defaultValue={["model"]}>
        <RecordViewer id="model" title="AI summary" value={model.envelope} empty="The full AI response was not saved for this result." />
        <RecordViewer id="guarded" title="Checks against service rules" value={context.shadowResult} empty="No rule-check result is available." />
        <RecordViewer id="validation" title="Checks on the information" value={{ work: context.adjudicationWork, validation: model.validation }} />
        <RecordViewer id="shadow-history" title="Earlier AI suggestions" value={context.shadowHistory} timeline />
      </Accordion>
    </div>
  );
  return (
    <Accordion type="multiple" className="min-w-0 border-l border-border pl-5" defaultValue={context.finalDecision ? ["final"] : context.adminReview ? ["review"] : context.provisionalDecision ? ["provisional"] : []}>
      <RecordViewer id="provisional" title="Initial decision" value={context.provisionalDecision} empty="No initial decision has been recorded." stage firstStage />
      <RecordViewer id="review" title="Saved review" value={context.adminReview} empty="No reviewer has saved a decision yet." stage />
      <RecordViewer id="appeals" title="Appeals" stage recorded={Boolean(context.appeal || context.appealReview)} timeRecord={context.appealReview || context.appeal} value={{ appealWindow: context.appealWindow, appeal: context.appeal, appealReview: context.appealReview }} />
      <RecordViewer id="final" title="Final decision" value={context.finalDecision} empty="No final decision recorded." stage lastStage />
    </Accordion>
  );
}

const summaryTones = {
  neutral: { icon: "text-ink-muted", badge: "border-border text-ink-muted" },
  info: { icon: "text-status-info", badge: "border-status-info/20 bg-status-info/8 text-status-info" },
  warning: { icon: "text-status-warning", badge: "border-status-warning/20 bg-status-warning/8 text-status-warning" },
  success: { icon: "text-status-success", badge: "border-status-success/20 bg-status-success/8 text-status-success" },
  // The existing dark red ink needs the plain panel surface for AA text contrast.
  danger: { icon: "text-status-danger", badge: "border-status-danger/20 bg-status-danger/8 text-status-danger dark:bg-transparent" },
};

function SummaryGroup({ group, type, timelineEntries, reportedReason }) {
  const tone = summaryTones[group.tone] ?? summaryTones.neutral;
  const Icon = group.tone === "danger" ? CircleX : group.tone === "warning" ? TriangleAlert
    : group.tone === "success" ? CircleCheck : group.tone === "info" ? CircleDot : Circle;
  const normalText = type !== "analysis";
  const hasDetails = Boolean(timelineEntries?.length || group.lines.length || group.badges?.length);
  const heading = <>
    <TraceIcon className={tone.icon}><Icon /></TraceIcon>
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
      <TraceTitle>{group.title}</TraceTitle>
      {group.hint && <Badge variant="outline" className={cn("rounded-[0.625rem]", tone.badge)}><span className="min-w-0 [overflow-wrap:anywhere]">{group.hint}</span></Badge>}
    </span>
  </>;
  if (!hasDetails) return (
    <div data-summary-group={group.id} data-summary-tone={group.tone}>
      <h3 className="flex min-h-11 min-w-0 items-center gap-2 text-sm leading-5">{heading}</h3>
    </div>
  );
  return (
    <TraceCollapsible defaultOpen data-summary-group={group.id} data-summary-tone={group.tone}>
      <h3>
        <TraceCollapsibleTrigger>
          {heading}
        </TraceCollapsibleTrigger>
      </h3>
      <TraceCollapsibleContent keepMounted={Array.isArray(timelineEntries)} className={normalText ? "text-ink" : ""}>
        {timelineEntries?.length > 0 ? (
          <div>
            {reportedReason != null && typeof reportedReason !== "object" && <p className="mb-3 text-sm leading-5">Reported reason: {recordScalar(reportedReason, "reportedReason")}</p>}
            <ol aria-label="Ride event summary" className="min-w-0 space-y-2">
              {timelineEntries.slice(0, 2).map((entry, index) => (
                <li key={index}><RecordTimelineEntry entry={entry} index={index} compact /></li>
              ))}
            </ol>
            {timelineEntries.length > 2 && <p className="mt-2 text-sm leading-5">+{timelineEntries.length - 2} more events in the full records.</p>}
          </div>
        ) : (
          <div className="space-y-2 pb-1">
            {group.badges?.length > 0 && <div className="flex flex-wrap gap-2">
              {group.badges.map(label => <Badge key={label} variant="outline" className={cn("rounded-[0.625rem]", tone.badge)}><span className="min-w-0 [overflow-wrap:anywhere]">{label}</span></Badge>)}
            </div>}
            {group.lines.length > 0 && <ul className="space-y-2">
              {group.lines.map((line, index) => (
                <li key={index}>
                  <TraceLine className={normalText ? "text-ink" : ""}>
                    <span className="min-w-0 line-clamp-3 break-words" title={line}>{line}</span>
                  </TraceLine>
                </li>
              ))}
            </ul>}
          </div>
        )}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

const panelConfig = {
  evidence: { headingId: "ride-records-heading", action: "View full evidence", description: "All saved ride records and record versions. Times are shown in India time (IST)." },
  analysis: { headingId: "ai-assessment-heading", action: "View full assessment", description: "The full AI response, service-rule checks, information checks and assessment history." },
  decisions: { headingId: "decision-records-heading", action: "View all decisions", description: "All saved initial decisions, reviews, appeals and the final outcome. Times are shown in India time (IST)." },
};

export default function ResponsibilityRecordPanels({ context }) {
  const panels = responsibilityPanelSummaries(context);
  const events = ["timeline", "chronology", "events"].map(key => context.evidence?.[key]).find(Array.isArray);
  return (
    <div data-testid="responsibility-record-panels" className="grid min-w-0 items-stretch gap-3 lg:grid-cols-3">
      {Object.entries(panels).map(([type, panel]) => {
        const config = panelConfig[type];
        return (
          <section key={type} aria-labelledby={config.headingId} className="min-w-0">
            <Dialog>
              <Card className="h-full min-w-0 gap-4">
                <CardHeader>
                  <CardTitle>
                    <h2 id={config.headingId} tabIndex={-1} className="scroll-mt-6 text-lg font-medium leading-6">{panel.title}</h2>
                  </CardTitle>
                  <CardDescription className="leading-5">{panel.description}</CardDescription>
                </CardHeader>
                <CardContent className="min-w-0 flex-1">
                  <Trace>{panel.groups.map(group => (
                    <SummaryGroup key={group.id} group={group} type={type} timelineEntries={type === "evidence" && group.id === "timeline" ? events : undefined} reportedReason={context.evidence?.reportedReason} />
                  ))}</Trace>
                </CardContent>
                <CardFooter className="min-h-11 pt-2">
                  <DialogTrigger type="button" className={cn(buttonVariants({ variant: "outline" }), "relative min-h-9 max-w-full gap-1.5 px-3 py-[7px] text-sm leading-5 before:absolute before:inset-x-0 before:-inset-y-[5px] before:content-['']")}>
                    {config.action}<ArrowUpRight aria-hidden="true" />
                  </DialogTrigger>
                </CardFooter>
              </Card>
              <DialogContent title={`${panel.title} — full records`} description={config.description}>
                <FullRecords type={type} context={context} />
              </DialogContent>
            </Dialog>
          </section>
        );
      })}
    </div>
  );
}
