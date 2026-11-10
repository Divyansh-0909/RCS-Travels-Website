import {Button} from '../ui/button';
import {Badge} from '../ui/badge';
import {Card} from '../ui/card';
import {Label} from '../ui/label';
import {Textarea} from '../ui/textarea';
import {DialogContent} from './ui/motion-dialog';
import {CheckMark} from './ui/checkbox';
import ReviewChoice from './ui/review-choice';
import {Feedback} from './ui/feedback';
import {ArrowLeft,Clock3,CalendarDays,FileText,ClipboardCheck,Save,LoaderCircle} from './ui/icons';
import {ORIGINAL_REFRESH_ACTION,ORIGINAL_SAVE_ACTION} from './PageChrome';
import {RecordDialog} from './StoryPanels';
import {recordScalar} from '../../../lib/responsibilityPresentation';
const choices=[['UPHOLD','Hold the driver responsible'],['WAIVE','Take no action against the driver']];
export function CaseOverview({context,story}){return (<div className="chapter-body"><Card className="intro-card"><Badge variant="negative" className="review-badge" data-review-tone="warning"><Clock3 className="size-3"/>{recordScalar(context.case.state,'state')}</Badge><div className="grid gap-2"><h3>{story.issue}</h3><p>{story.reason||'Review the available ride records before deciding what should happen.'}</p></div>
          <dl className="ride-facts"><div><dt className="detail-label"><FileText size={16}/>Booking</dt><dd>{context.case.bookingId||'Not recorded'}</dd></div><div><dt className="detail-label"><CalendarDays size={16}/>Scheduled pickup</dt><dd>{story.scheduled?`${story.scheduled.date}${story.scheduled.time?' · '+story.scheduled.time:''}`:'Not recorded'}</dd></div><div><dt className="detail-label"><Clock3 size={16}/>Case opened</dt><dd>{story.opened?`${story.opened.date}${story.opened.time?' · '+story.opened.time:''}`:'Not recorded'}</dd></div></dl>
          <div className="full-records-link"><RecordDialog title="Case details" label="Case details" value={{...context.case,evidenceSnapshot:undefined}}/></div>
        </Card><p className="small-note">You’ll read the ride history, check earlier reviews, then record your decision.</p></div>);}
export function SavedReview({context,receipt,onBrowse}){const summary=receipt;return (<>
        <div className="saved-heading"><Badge variant="negative" className="review-badge saved-check" data-review-tone="success"><CheckMark/></Badge><span>Review saved</span></div>
        <h2 id="step-title" className="stage-title" tabIndex={-1}>Your decision is saved</h2><p className="lead">{context.finalDecision?'The final decision is recorded.':'Notification or appeal steps may still be needed before this case is complete.'}</p>
        <Card className="recap-card"><dl className="details-list"><div><dt>Decision</dt><dd>{recordScalar(summary.decision,'outcome')}</dd></div><div><dt>Cause of the issue</dt><dd>{recordScalar(summary.classification,'classification')}</dd></div><div><dt>Your reason</dt><dd className="preserve-text">{summary.reason}</dd></div></dl></Card><Button className={'primary-action '+ORIGINAL_SAVE_ACTION} onClick={onBrowse}><ArrowLeft/>Back to open cases</Button>
      </>);}
export function DecisionFields({context,action,valid,busy,decision,classification,level,reason,causeOptions,change,onConfirm}){return (action?<form id="decision-form" aria-label={action==='review'?'Your decision':'Appeal decision'} onSubmit={event=>{event.preventDefault();if(valid)onConfirm();}} className="chapter-body decision-form">
          <div className="form-row"><Label htmlFor="review-decision">Decision <span aria-hidden="true">*</span></Label><ReviewChoice id="review-decision" label="Decision" name="decision" value={decision} onValueChange={value=>change('decision',value)} options={choices} placeholder="Choose a decision" disabled={busy}/></div>
          <div className="form-row"><Label htmlFor="review-cause">Cause of the issue <span aria-hidden="true">*</span></Label><ReviewChoice id="review-cause" label="Cause of the issue" name="classification" value={classification} onValueChange={value=>change('classification',value)} options={causeOptions} placeholder={decision?'Choose a cause':'Choose a decision first'} disabled={!decision||busy}/></div>
          {decision==='UPHOLD'&&<div className="form-row"><Label htmlFor="review-level">Action level <span aria-hidden="true">*</span></Label><ReviewChoice id="review-level" label="Action level" name="consequenceLevel" value={level} onValueChange={value=>change('level',value)} options={ [['LEVEL_1','Level 1'],['LEVEL_2','Level 2']] } placeholder="Select an action level" disabled={busy}/><p className="field-help">Use the level set by your service policy.</p></div>}
          <div className="form-row"><Label htmlFor="review-reason">Reason for your decision <span aria-hidden="true">*</span></Label><Textarea id="review-reason" required minLength={3} maxLength={2000} rows={3} value={reason} disabled={busy} onChange={event=>change('reason',event.target.value)} aria-describedby="review-reason-help" placeholder="Explain your decision"/><p className="field-help" id="review-reason-help">3–2,000 characters <span>{reason.length.toLocaleString('en-IN')} / 2,000</span></p></div><p className="small-note">The saved records and your reason stay separate from the AI suggestion.</p>
        </form>:<Card className="chapter-body evidence-panel"><h3>{context.finalDecision?'Final decision saved':'Not ready for a decision'}</h3><p className="small-note">{context.finalDecision?'This case is complete. See Earlier reviews for the saved outcome.':'Required notifications or appeal steps must finish before this case can be reviewed.'}</p></Card>);}
export function ReviewConfirmation({saved,decision,classification,level,reason,error,valid,busy,setConfirm,save}){return (<DialogContent restoreFocus={()=>saved?document.querySelector('.responsibility-story .stage-title'):document.getElementById('check-save')} icon={ClipboardCheck} title="Save this decision?" description="Check your decision and reason before saving.">
    <dl className="details-list"><div><dt>Decision</dt><dd>{recordScalar(decision,'outcome')}</dd></div><div><dt>Cause of the issue</dt><dd>{recordScalar(classification,'classification')}</dd></div>{decision==='UPHOLD'&&<div><dt>Action level</dt><dd>{recordScalar(level,'consequenceLevel')}</dd></div>}<div><dt>Your reason</dt><dd className="preserve-text">{reason}</dd></div></dl>
    {error&&<Feedback kind="error">{error}</Feedback>}<div className="confirm-actions"><Button variant="outline" className={ORIGINAL_REFRESH_ACTION} disabled={busy} onClick={()=>setConfirm(false)}>Keep editing</Button><Button className={'primary-action '+ORIGINAL_SAVE_ACTION} disabled={!valid||busy} aria-busy={busy} onClick={save}>{busy?<LoaderCircle className="icon-spin"/>:<Save/>}{busy?'Saving decision':error?'Retry saving':'Save decision'}</Button></div>
  </DialogContent>);}
export function ReviewSteps({step,highest,reviewed,saved,busy,onNavigate}){
 const names=['The ride','What happened','Earlier reviews','Your decision'];
 return <aside className="review-nav"><p className="nav-label">Review steps</p><nav aria-label="Review steps"><ol>{names.map((label,index)=>{
  const current=step===index&&!saved,complete=reviewed[index]||saved;
  const variant=current?'secondary':complete?'negative':'outline',tone=current?'secondary':complete?'success':undefined;
  return <li key={label} data-current={current} data-done={complete}><button type="button" disabled={busy||index>highest} aria-current={current?'step':undefined} onClick={()=>onNavigate(index)}><span className="step-name">{label}{current?<small>In review</small>:complete?<small>Reviewed</small>:null}</span><Badge variant={variant} className={'step-number'+(current||complete?' review-badge':'')} data-review-tone={tone}>{complete?<CheckMark/>:index+1}</Badge></button></li>;
 })}</ol></nav></aside>;
}
