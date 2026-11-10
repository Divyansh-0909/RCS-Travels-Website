import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {useApi} from '../hooks/useApi';
import {useTheme} from '../context/ThemeContext';
import {createCaseLoadController} from '../lib/responsibilityCaseLoad';
import {useDebouncedCaseQuery,useResponsibilityCases} from '../hooks/useResponsibilityCases';
import {useResponsibilityPageSize} from '../hooks/useResponsibilityPageSize';
import {ReviewTopBar,CaseHeader,ORIGINAL_REFRESH_ACTION} from '../components/responsibility/story/PageChrome';
import {DEFAULT_FILTERS,OpenCasesTable} from '../components/responsibility/story/CaseBrowser';
import ReviewJourney from '../components/responsibility/story/ReviewJourney';
import {Feedback} from '../components/responsibility/story/ui/feedback';
import {RefreshCw,ArrowLeft} from '../components/responsibility/story/ui/icons';
import {Button} from '../components/responsibility/ui/button';
import '../components/responsibility/appearance.css';
import '../components/responsibility/story/story.css';

export default function ResponsibilityCase() {
  const api=useApi(),{resolvedTheme,setTheme}=useTheme();
  const [params,setParams]=useSearchParams(),caseId=params.get('case')?.trim()??'';
  const [draft,setDraft]=useState({caseId,value:caseId}),[context,setContext]=useState(null);
  const [error,setError]=useState(''),[loading,setLoading]=useState(false),[refresh,setRefresh]=useState(0);
  const [filters,setFilters]=useState(DEFAULT_FILTERS),[direction,setDirection]=useState('desc');
  const [receipt,setReceipt]=useState(null),[reviewBusy,setReviewBusy]=useState(false),[inputMode,setInputMode]=useState('keyboard');
  const input=draft.caseId===caseId?draft.value:caseId;
  const frame=useRef(null),footer=useRef(null);
  const pageSize=useResponsibilityPageSize(frame,footer,!caseId);
  const query=useDebouncedCaseQuery(input),queryKey=JSON.stringify({q:query,...filters,direction,pageSize});
  const [pagination,setPagination]=useState({key:'',cursors:[undefined],index:0});
  const page=pagination.key===queryKey?pagination:{key:queryKey,cursors:[undefined],index:0};
  const cases=useResponsibilityCases(api,{q:query,...filters,direction,limit:pageSize,cursor:page.cursors[page.index]},!caseId,refresh);
  const suggestions=useResponsibilityCases(api,{q:query,...filters,direction:'desc',limit:10},!!query,refresh);
  const [drafts,setDrafts]=useState(()=>new Map());
  const controller=useMemo(()=>createCaseLoadController(api.getResponsibilityCase,patch=>{
    if('context'in patch)setContext(patch.context);if('loading'in patch)setLoading(patch.loading);if('error'in patch)setError(patch.error);
  }),[api]);
  useEffect(()=>{void controller.open(caseId);return controller.dispose;},[controller,caseId,refresh]);
  useEffect(()=>{
    const root=document.documentElement,previous=root.dataset.inputMode;
    const pointer=()=>{root.dataset.inputMode='pointer';setInputMode('pointer');};
    const keyboard=()=>{root.dataset.inputMode='keyboard';setInputMode('keyboard');};
    root.dataset.inputMode='keyboard';document.addEventListener('pointerdown',pointer,true);document.addEventListener('keydown',keyboard,true);
    return()=>{document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('keydown',keyboard,true);if(previous)root.dataset.inputMode=previous;else delete root.dataset.inputMode;};
  },[]);
  useLayoutEffect(()=>{
    const bar=footer.current,container=frame.current;if(!bar||!container)return;
    const root=document.documentElement,previous=root.style.scrollPaddingBottom;let tick;
    const measure=()=>{const size=Math.ceil(bar.getBoundingClientRect().height)+'px';container.style.setProperty('--review-actions-height',size);root.style.scrollPaddingBottom=`calc(${size} + 1rem)`;};
    const observer=new ResizeObserver(()=>{cancelAnimationFrame(tick);tick=requestAnimationFrame(measure);});observer.observe(bar);measure();
    return()=>{observer.disconnect();cancelAnimationFrame(tick);container.style.removeProperty('--review-actions-height');root.style.scrollPaddingBottom=previous;};
  },[caseId,context,loading,receipt,queryKey,page.index]);
  function openCase(value){
    if(reviewBusy)return;
    const id=typeof value==='string'?value:value.id;if(!id?.trim())return;
    setDraft({caseId:id,value:id});setReceipt(null);
    if(id===caseId)setRefresh(value=>value+1);
    else{const next=new URLSearchParams(params);next.set('case',id);setParams(next);}
  }
  function browseCases(){if(reviewBusy)return;const next=new URLSearchParams(params);next.delete('case');setParams(next);setDraft({caseId:'',value:''});setReceipt(null);}
  const identity=context?JSON.stringify([context.case.id,context.case.evidenceVersion,context.case.evidenceHash]):'';
  const storeDraft=useCallback(value=>{setDrafts(previous=>{if(previous.get(identity)===value)return previous;const next=new Map(previous);next.set(identity,value);return next;});},[identity]);
  function reviewed(value){setDrafts(previous=>{const next=new Map(previous);next.delete(identity);return next;});setReceipt({caseId,...value});setRefresh(previous=>previous+1);}
  function revealFocusedControl(event){
    const target=event.target;if(inputMode!=='keyboard'||!(target instanceof HTMLElement)||!target.matches(':focus-visible'))return;
    requestAnimationFrame(()=>{const bar=footer.current;if(!bar||target.closest('.chapter-actions,.case-table-footer,[data-slot=dialog-content]'))return;
      const overlap=target.getBoundingClientRect().bottom-bar.getBoundingClientRect().top+12;
      if(overlap>0)window.scrollBy({top:overlap,behavior:'instant'});
    });
  }
  return <main className="responsibility-page responsibility-story" data-testid="responsibility-page" data-motion-input={inputMode} onFocusCapture={revealFocusedControl}>
    <div ref={frame} className="template-page mx-auto max-w-[1440px] space-y-6 px-4 pt-3 pb-6 sm:px-6 sm:pt-4 sm:pb-8 lg:px-8">
      <ReviewTopBar theme={resolvedTheme} setTheme={setTheme}/>
      <fieldset disabled={reviewBusy} className="review-header-fields"><CaseHeader input={input} setInput={value=>{if(!value&&caseId)browseCases();else setDraft({caseId,value});}} cases={suggestions.items} onSelect={openCase} onOpenId={openCase}
        clearCase={()=>{browseCases();requestAnimationFrame(()=>document.getElementById('responsibility-case-id')?.focus());}}
        caseOpen={!!caseId} filters={filters} onFilter={setFilters} refreshCase={()=>setRefresh(value=>value+1)} refreshing={loading||(!caseId&&cases.loading)} searchLoading={suggestions.loading||query!==input.trim()} searchError={!!suggestions.error}/></fieldset>
      {caseId?(loading?<Feedback kind="loading">Loading case…</Feedback>:error?<div className="case-load-error"><Feedback kind="error">{error}</Feedback><div className="flex gap-3"><Button variant="outline" className={ORIGINAL_REFRESH_ACTION} onClick={()=>setRefresh(value=>value+1)}><RefreshCw/>Retry</Button><Button variant="outline" className={ORIGINAL_REFRESH_ACTION} onClick={browseCases}><ArrowLeft/>Open cases</Button></div></div>:context?<ReviewJourney key={identity} context={context} api={api} footerRef={footer} inputMode={inputMode} draft={drafts.get(identity)} onDraftChange={storeDraft} onReviewed={reviewed} onBrowse={browseCases} receipt={receipt?.caseId===caseId?receipt:null} onBusyChange={setReviewBusy} onResume={()=>setReceipt(null)}/>:null)
        :<OpenCasesTable key={JSON.stringify([queryKey,page.index])} footerRef={footer} cases={cases.items} total={cases.total} loading={cases.loading} error={cases.error} onRetry={()=>setRefresh(value=>value+1)} onSelect={openCase} onReset={()=>{setDraft({caseId:'',value:''});setFilters(DEFAULT_FILTERS);}} actionClassName={ORIGINAL_REFRESH_ACTION} filtered={!!query || Object.values(filters).some(value=>value!=="all")} direction={direction} onDirectionChange={setDirection} pageIndex={page.index} pageSize={pageSize} hasNext={!!cases.nextCursor}
          onPrevious={()=>setPagination({...page,index:Math.max(0,page.index-1)})} onNext={()=>{if(cases.nextCursor)setPagination({key:queryKey,cursors:[...page.cursors.slice(0,page.index+1),cases.nextCursor],index:page.index+1});}}/>}
    </div>
  </main>;
}
