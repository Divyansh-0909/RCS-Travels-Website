import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Field} from '@base-ui/react/field';
import {Button} from '../ui/button';
import {Dialog} from './ui/motion-dialog';
import {Checkbox} from './ui/checkbox';
import {ArrowLeft,ArrowRight,Save,CarFront,Globe,CircleHelp} from './ui/icons';
import {ORIGINAL_REFRESH_ACTION,ORIGINAL_SAVE_ACTION} from './PageChrome';
import {EvidenceStep,EarlierReviewsStep} from './StoryPanels';
import {responsibilityStory} from '../../../lib/responsibilityStory';
import {CaseOverview,DecisionFields,ReviewSteps,SavedReview,ReviewConfirmation} from './JourneyContent';
import {reviewAction,reviewPayload,reviewClassificationLabels} from '../../../lib/responsibilityReviewAction';

const titles=['Review this ride','Follow what happened','Check the earlier reviews','Record your decision'];
const descriptions=['Understand why this ride needs your attention.','Read the saved events and compare the two accounts.','Consider earlier decisions and the AI suggestion.','Choose an outcome and explain your reason.'];
const nextLabels=['View timeline','Earlier reviews','Your decision'];
const initialDraft={step:0,reviewed:[false,false,false,false],evidenceRead:false,assessmentRead:false,decision:'',classification:'',level:'',reason:''};

function Acknowledge({checked,onChange,children}) {
  return <Field.Root className="acknowledge"><Checkbox checked={checked} onCheckedChange={onChange}/><Field.Label className="acknowledge-label">{children}</Field.Label></Field.Root>;
}

export default function ReviewJourney({context,api,footerRef,inputMode,draft,onDraftChange,onReviewed,onBrowse,receipt,onBusyChange,onResume}) {
  const [state,setState]=useState(()=>({...initialDraft,...draft}));
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const section=useRef(null),animation=useRef(null),firstRender=useRef(null),inFlight=useRef(false),active=useRef(true);
  const story=useMemo(()=>responsibilityStory(context),[context]);
  const action=reviewAction(context),saved=!!receipt;
  const {step,reviewed,evidenceRead,assessmentRead,decision,classification,level,reason}=state;
  const highest=saved||reviewed[2]?3:reviewed[1]?2:reviewed[0]?1:0;
  const causeOptions=Object.entries(reviewClassificationLabels).filter(([value])=>decision==='UPHOLD'?value==='DRIVER_CAUSED':value!=='DRIVER_CAUSED')
    .map(([value,label])=>[value,label,value==='DRIVER_CAUSED'?CarFront:value==='EXTERNAL_OR_UNCERTAIN'?Globe:CircleHelp]);
  let payload=null;
  try {payload=reviewPayload(context,{decision,classification,consequenceLevel:level,reason});} catch { /* Incomplete fields stay disabled. */ }
  const valid=!!payload && reviewed.slice(0,3).every(Boolean);
  function change(key,value){setState(previous=>({...previous,[key]:value,...(key==='decision'?{classification:'',level:''}:{})}));setError('');}
  function navigate(index){
    setState(previous=>({...previous,step:index,...(saved?{reviewed:[true,true,true,true],evidenceRead:true,assessmentRead:true}:{})}));
    if(saved)onResume();
  }
  useEffect(()=>{onDraftChange(state);},[state,onDraftChange]);
  useEffect(()=>{active.current=true;return ()=>{active.current=false;animation.current?.cancel();};},[]);
  useLayoutEffect(()=>{
    const stage=`${step}-${saved}`;if(firstRender.current===stage)return;firstRender.current=stage;
    animation.current?.cancel();const element=section.current;if(!element)return;
    if(inputMode==='pointer'){
      const style=getComputedStyle(element),duration=parseFloat(style.getPropertyValue('--duration-feedback'))||120;
      animation.current=element.animate([{opacity:0},{opacity:1}],{duration,easing:style.getPropertyValue('--ease-feedback').trim()||'ease-out'});
    }
    element.querySelector('.stage-title')?.focus({preventScroll:true});
    if(window.scrollY>120)window.scrollTo({top:Math.max(0,element.getBoundingClientRect().top+window.scrollY-24),behavior:'instant'});
  },[step,saved,inputMode]);
  useEffect(()=>{if(inputMode==='keyboard')animation.current?.cancel();},[inputMode]);
  function next(){setState(previous=>({...previous,reviewed:previous.reviewed.map((value,index)=>index===step?true:value),step:Math.min(step+1,3)}));}
  async function save(){
    if(!valid || inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');onBusyChange(true);
    try {
      const body=reviewPayload(context,{decision,classification,consequenceLevel:level,reason});
      const result=await api.reviewResponsibility(context.case.id,action,body);
      if(result?.error)throw new Error(result.error);
      if(active.current){setConfirm(false);onReviewed({decision,classification,level,reason:body.reason,result});}
    }catch(failure){if(active.current)setError(failure.message||'The decision could not be saved. Your entries are unchanged.');}
    finally {inFlight.current=false;if(active.current)setBusy(false);onBusyChange(false);}
  }
  return <Dialog open={confirm} onOpenChange={value=>{if(!busy)setConfirm(value);}}><div className="review-shell" data-layout="vertical">
    <ReviewSteps step={step} highest={highest} reviewed={reviewed} saved={saved} busy={busy} onNavigate={navigate}/>
    <div className="review-main" id="review-main"><section ref={section} className="step-content" aria-labelledby="step-title" data-step={step+1}>
      {saved?<SavedReview context={context} receipt={receipt} onBrowse={onBrowse}/>:<>
        <p className="step-caption">Step {step+1} of 4</p><h2 id="step-title" className="stage-title" tabIndex={-1}>{titles[step]}</h2><p className="lead">{descriptions[step]}</p>
        {step===0&&<CaseOverview context={context} story={story}/>}
        {step===1&&<div className="chapter-body evidence-body"><EvidenceStep story={story} context={context}/><Acknowledge checked={evidenceRead} onChange={value=>change('evidenceRead',value)}>I’ve checked the available ride records.</Acknowledge></div>}
        {step===2&&<div className="chapter-body"><EarlierReviewsStep story={story} context={context}/><Acknowledge checked={assessmentRead} onChange={value=>change('assessmentRead',value)}>I’ve checked the suggestion and earlier reviews.</Acknowledge></div>}
        {step===3&&<DecisionFields context={context} action={action} valid={valid} busy={busy} decision={decision} classification={classification} level={level} reason={reason} causeOptions={causeOptions} change={change} onConfirm={()=>setConfirm(true)}/>}
      </>}
    </section>
    {!saved&&<div ref={footerRef} className="chapter-actions" role="group" aria-label="Review navigation"><div className="chapter-actions-frame"><div className="chapter-actions-inner"><Button variant="outline" disabled={step===0||busy} className={'back-action '+ORIGINAL_REFRESH_ACTION} onClick={()=>change('step',Math.max(0,step-1))}><ArrowLeft/>Back</Button>
      {step<3?<Button className={'primary-action review-accent-action '+ORIGINAL_SAVE_ACTION} disabled={step===1&&!evidenceRead||step===2&&!assessmentRead} onClick={next}>{nextLabels[step]}<ArrowRight/></Button>:<Button id="check-save" className={'primary-action review-accent-action '+ORIGINAL_SAVE_ACTION} disabled={!valid||busy} onClick={()=>setConfirm(true)}><Save/>{action==='appeal-review'?'Save appeal decision':'Save decision'}</Button>}
    </div></div></div>}
    </div>
  </div><ReviewConfirmation saved={saved} decision={decision} classification={classification} level={level} reason={reason} error={error} valid={valid} busy={busy} setConfirm={setConfirm} save={save}/></Dialog>;
}
