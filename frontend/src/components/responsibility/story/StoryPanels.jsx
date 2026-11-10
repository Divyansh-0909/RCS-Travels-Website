import {useLayoutEffect,useRef,useState} from 'react';
import {Badge} from '../ui/badge';
import {Card} from '../ui/card';
import {RecordDetails} from '../RecordViewer';
import {Dialog,DialogContent,DialogTrigger} from './ui/motion-dialog';
import {Collapsible,CollapsibleContent,CollapsibleTrigger} from './ui/collapsible';
import {Bubble,BubbleContent} from './ui/bubble';
import {SourceIcon,ExternalLink,TriangleAlert,FileText,History,Bot,ChevronDown} from './ui/icons';
import {Feedback} from './ui/feedback';
const sourceBadges={Driver:{label:'By driver',tone:'info'},Rider:{label:'By rider',tone:'source-rider'},'Booking record':{label:'Booking record',tone:'source-booking'}};
function RecordSourceBadge({by}){const item=sourceBadges[by]||{label:by,tone:'neutral'};return <Badge variant="secondary" className="review-badge" data-review-tone={item.tone}><SourceIcon by={by} className="size-3"/>{item.label}</Badge>;}
export function RecordDialog({title,value,label='View details',ariaLabel,layout}){return <Dialog><Badge asChild variant="outline" className="record-action"><DialogTrigger type="button" aria-label={ariaLabel || label}>{label}<ExternalLink data-icon="inline-end" aria-hidden="true"/></DialogTrigger></Badge><DialogContent className="record-details-dialog" title={title} description="Saved details · India time (IST)"><RecordDetails title={title} value={value} layout={layout}/></DialogContent></Dialog>;}
export function RideTimeline({ records, allRecords }) {
  const viewport = useRef(null), list = useRef(null);
  const [scrollable, setScrollable] = useState(false);
  useLayoutEffect(() => {
    const element = viewport.current, panel = element.closest('.timeline-panel');
    const accounts = panel.closest('.evidence-panels').querySelector('.accounts-panel');
    const heading = panel.querySelector('.timeline-heading');
    let frame;
    function measure() {
      const bounds = panel.getBoundingClientRect(), reference = accounts.getBoundingClientRect();
      const beside = Math.abs(bounds.top - reference.top) < 1;
      const value = beside ? `${reference.height}px` : '';
      if (panel.style.getPropertyValue('--timeline-panel-window') !== value) {
        if (value) panel.style.setProperty('--timeline-panel-window', value);
        else panel.style.removeProperty('--timeline-panel-window');
      }
      panel.dataset.heightBound = beside ? 'accounts' : 'viewport';
      setScrollable(element.scrollHeight > element.clientHeight + 1);
    }
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(panel);
    observer.observe(accounts);
    observer.observe(heading);
    observer.observe(element);
    observer.observe(list.current);
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [records]);
  return <Card className="evidence-panel timeline-panel" role="region" aria-label="Ride timeline">
    <div className="timeline-heading"><div className="flex min-w-0 flex-wrap items-center gap-3"><p className="date-label">29 October 2026 · India time (IST)</p><RecordDialog title="All ride records" label="All ride records" value={allRecords}/></div>
      {scrollable && <span id="timeline-scroll-help" className="timeline-scroll-hint">Scroll for more<span className="sr-only"> events. Focus this list and use the arrow keys to scroll.</span></span>}
    </div>
    <div ref={viewport} className="timeline-scroll" data-scrollable={scrollable}
      tabIndex={scrollable ? 0 : undefined} role={scrollable ? 'region' : undefined}
      aria-label={scrollable ? 'Scrollable ride events' : undefined} aria-describedby={scrollable ? 'timeline-scroll-help' : undefined}>
      {!records.length && <p className="small-note">No ride events have been saved yet.</p>}<ol ref={list} className="ride-timeline" aria-label="Saved ride events">{records.map((record, index) => <li key={`${record.id}-${index}`}>
        <span className="event-dot" aria-hidden="true" /><time dateTime={record.at}>{records.some(item => item.date !== records[0]?.date) && record.date && <span className="event-calendar-date">{record.date}</span>}{record.time}</time>
        <div className="event-content"><h3>{record.title}</h3><p>{record.body}</p><div className="event-meta">
          <RecordSourceBadge by={record.by} />
          <RecordDialog title={record.title} value={record.raw} label="View record" ariaLabel={`View record ${index + 1}`} />
        </div></div>
      </li>)}</ol>
    </div>
  </Card>;
}

export function EvidenceStep({story, context}) {
  return <div className="evidence-panels">
    <div className="timeline-column"><RideTimeline records={story.timeline} allRecords={{evidence:context.evidence,evidenceVersions:context.evidenceVersions}}/></div>
    <section className="accounts-panel" aria-labelledby="accounts-heading">
      <h3 id="accounts-heading">{story.conflicts.length ? 'Where the accounts differ' : 'Driver and rider accounts'}</h3>
      <Card className="evidence-panel accounts">
        {story.statements.length ? <ul className="account-messages" tabIndex={0} aria-label="Saved driver and rider statements">{story.statements.map((item,index) => <li className="account-message" data-speaker={item.role.toLowerCase()} key={item.id}>
          <span className="account-speaker source-label" id={`statement-speaker-${index}`}><SourceIcon by={item.role} size={14} monochrome/>{item.role}</span>
          <Bubble variant={item.role === 'Rider' ? 'default' : 'muted'} align={item.role === 'Rider' ? 'end' : 'start'}><BubbleContent render={<blockquote aria-labelledby={`statement-speaker-${index}`}/>}><p>{item.body}</p></BubbleContent></Bubble>
        </li>)}</ul> : <p className="small-note">No driver or rider statements were saved.</p>}
        {story.conflicts.length > 0 && <div className="full-records-link"><RecordDialog title="Differences in the saved accounts" label="View differences" value={story.conflicts} layout="differences"/></div>}
      </Card>
      {story.hasGaps ? <p className="warning-line"><TriangleAlert aria-hidden="true" size={16}/><span>Some booking details are missing. Review what is available.</span></p>
        : !story.completenessKnown ? <p className="small-note">The saved records do not confirm whether all booking details are available.</p> : null}
    </section>
  </div>;
}

export function EarlierReviewsStep({story,context}) {
  const [basisOpen,setBasisOpen]=useState(false);
  return <div className="earlier-reviews-panels">
    <Card className="earlier-decisions-card" role="region" aria-labelledby="earlier-decisions-title">
      <h3 id="earlier-decisions-title" className="icon-heading"><History size={18}/>Earlier human decisions</h3>
      {story.decisions.length ? <ol className="decision-history">{story.decisions.map(item => <li key={item.title}><div className="assessment-title"><h4>{item.title}</h4>{item.date && <time dateTime={item.date.dateTime}>{item.date.date} · {item.date.time}</time>}</div><p>{item.outcome}</p>{item.reason && <p className="secondary-copy preserve-text">{item.reason}</p>}<RecordDialog title={item.title} label="View decision" value={item.value}/></li>)}</ol>
        : <div className="earlier-decisions-placeholder"><FileText className="empty-decisions-icon"/><div className="decision-empty-state"><h3>No decisions yet</h3><p>Saved human decisions will appear here.</p></div></div>}
      {(context.provisionalDecision || context.appeal || context.appealWindow || context.finalDecision) && <div className="full-records-link"><RecordDialog title="Decision and appeal records" label="Decision and appeal records" value={{initialDecision:context.provisionalDecision,appealWindow:context.appealWindow,appeal:context.appeal,appealReview:context.appealReview,finalDecision:context.finalDecision}}/></div>}
    </Card>
    <Card className="assessment-card"><div className="assessment-title"><h3 className="icon-heading"><Bot size={18}/>AI suggestion</h3><Badge variant="secondary" className="review-badge" data-review-tone="neutral">Suggestion only</Badge></div>
      <div className="grid gap-2"><p className="assessment-outcome">{story.aiOutcome}</p><p className="assessment-summary">{story.aiSummary}</p></div>
      {story.model.validation?.valid===false&&<Feedback kind="error">The AI suggestion failed its information checks. Review the saved records before deciding.</Feedback>}
      <Collapsible open={basisOpen} onOpenChange={setBasisOpen}><CollapsibleTrigger className="basis-trigger"><span className="option-label"><FileText size={16}/>See the records behind this</span><ChevronDown size={16} className={basisOpen ? 'rotated' : ''}/></CollapsibleTrigger><CollapsibleContent className="basis-content">
        <ul>{story.timeline.length > 0 && <li>{story.timeline.length} saved ride {story.timeline.length === 1 ? 'event' : 'events'}</li>}{story.statements.length > 0 && <li>The saved driver and rider accounts</li>}{story.hasGaps && <li>A notice that booking information is incomplete</li>}{!story.timeline.length && !story.statements.length && !story.hasGaps && <li>No supporting ride records were saved.</li>}</ul>
        <div className="full-records-link"><RecordDialog title="Full AI assessment" label="Full AI assessment" layout="assessment" value={{suggestion:story.model.envelope,informationChecks:story.model.validation,serviceRules:context.shadowResult,assessmentHistory:context.shadowHistory,work:context.adjudicationWork}}/></div>
      </CollapsibleContent></Collapsible>
    </Card>
  </div>;
}
