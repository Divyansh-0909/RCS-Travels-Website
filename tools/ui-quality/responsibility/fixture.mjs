// Synthetic browser-verification data only. This module is never imported by the app.
const rows = [
  ['RCS-0142','BKG-1042','Needs review','Driver','2026-11-04T03:55:00Z'],
  ['RCS-0141','BKG-1041','In review','Rider','2026-11-04T03:10:00Z'],
  ['RCS-0140','BKG-1040','Needs review','Rider','2026-11-03T10:20:00Z'],
  ['RCS-0139','BKG-1039','Waiting for details','Driver','2026-11-02T08:45:00Z'],
  ['RCS-0138','BKG-1038','Needs review','Booking record','2026-11-01T06:40:00Z'],
  ['RCS-0137','BKG-1037','In review','Driver','2026-10-31T09:05:00Z'],
  ['RCS-0136','BKG-1036','Needs review','Rider','2026-10-30T11:10:00Z'],
  ['RCS-0135','BKG-1035','Waiting for details','Booking record','2026-10-29T07:30:00Z'],
].map(([id,booking,status,reporter,opened])=>({id,booking,status,reporter,opened}));

export function caseContext(id) {
  const row=rows.find(item=>item.id===id)||rows[0];
  const final=id==='RCS-FINAL',appeal=id.startsWith('RCS-APPEAL');
  const state=final?'FINAL_WAIVED':appeal?'APPEAL_OPEN':row.status==='In review'?'AI_REVIEW':row.status==='Waiting for details'?'EVIDENCE_COLLECTING':'NEEDS_ADMIN_REVIEW';
  const timeline=[{id:'ev_1',kind:'ride_accepted',actor:'driver',observedAt:'2026-10-29T04:30:00Z',summary:'The driver accepted the booking.',source:'Saved booking event'},
    {id:'ev_2',kind:'driver_cancellation_recorded',observedAt:'2026-10-29T04:34:00Z',summary:'The cancellation was recorded. This event does not establish who caused it.',source:'Saved cancellation event'}];
  if(id==='RCS-LONG')for(let i=0;i<30;i++)timeline.push({id:`ev_${i+3}`,kind:'saved_booking_update',observedAt:new Date(Date.parse('2026-10-29T04:35:00Z')+i*60000).toISOString(),summary:`Additional synthetic event ${i+3}. ${'Long saved record content. '.repeat(12)}`,value:{initiator:i%2?'rider':'driver'}});
  return {case:{id,bookingId:row.booking,state,caseType:'DRIVER_CANCELLATION',evidenceVersion:'responsibility-evidence-v1',evidenceHash:'a'.repeat(64),createdAt:row.opened,scheduledAt:'2026-10-29T05:00:00Z'},
    evidence:{timeline,driverStatement:'The road near pickup was blocked.',riderStatement:'The driver asked me to cancel.',reportedReason:'The driver and rider give different reasons. Review the saved records before deciding who was responsible.',completeness:{complete:false,missing:['routing'],unavailable:[]},contradictions:[{claimKey:'cancellation_cause',observations:[{value:'Road blocked',evidenceIds:['ev_1']},{value:'Asked to cancel',evidenceIds:['ev_2']}]}]},
    evidenceVersions:[],shadowResult:{classification:'NEEDS_REVIEW',analysisEnvelope:{recommendation:'NEEDS_REVIEW',summary:'The saved accounts disagree, and some booking details are missing. The AI suggestion does not establish who was responsible.'},factualValidation:{valid:true}},shadowHistory:[],
    adminReview:appeal?{decision:'UPHOLD',classification:'DRIVER_CAUSED',consequenceLevel:'LEVEL_1',reason:'Synthetic previous review.',createdAt:'2026-10-29T05:05:00Z'}:null,
    appeal:appeal?{reason:'Please review this synthetic appeal.',createdAt:'2026-10-29T05:06:00Z'}:null,
    appealWindow:appeal?{state:'OPEN',closesAt:'2026-10-30T05:05:00Z'}:null,
    finalDecision:final?{outcome:'FINAL_WAIVED',classification:'EXTERNAL_OR_UNCERTAIN',reason:'Synthetic final decision.',createdAt:'2026-10-29T05:05:00Z'}:null};
}

export function installCaseFixture(app) {
  const contexts=new Map();
  const get=id=>{if(!contexts.has(id))contexts.set(id,caseContext(id));return contexts.get(id);};
  app.get('/api/admin/responsibility/cases',(req,res)=>{
    const {q='',status='all',reporter='all',period='all',direction='desc',limit='5',cursor='0'}=req.query;
    let items=rows.filter(item=>!get(item.id).finalDecision)
      .filter(item=>(status==='all'||item.status===status)&&(reporter==='all'||item.reporter===reporter))
      .filter(item=>!q||[item.id,item.booking].some(value=>value.toLowerCase().includes(String(q).toLowerCase())));
    if(period!=='all'){const days=period==='today'?1:period==='week'?7:30;items=items.filter(item=>Date.parse(item.opened)>=Date.now()-days*86400000);}
    items.sort((a,b)=>(direction==='asc'?1:-1)*a.opened.localeCompare(b.opened));
    const total=items.length,start=Number(cursor)||0,size=Number(limit)||5;
    res.json({items:items.slice(start,start+size),total,limit:size,nextCursor:start+size<total?String(start+size):null});
  });
  app.get('/api/admin/responsibility/cases/:id',(req,res)=>res.json(get(req.params.id)));
  app.post('/api/admin/responsibility/cases/:id/:action',(req,res)=>{
    const context=get(req.params.id),body=req.body,decision=body.decision||body.outcome;
    if(context.case.evidenceHash!==body.evidenceHash||context.case.evidenceVersion!==body.evidenceVersion)return res.status(409).json({error:'The ride records changed. Refresh and review them again.'});
    if(!['review','appeal-review'].includes(req.params.action)||context.finalDecision)return res.status(409).json({error:'This case cannot be reviewed.'});
    if(!['UPHOLD','WAIVE'].includes(decision)||typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>2000)return res.status(400).json({error:'Complete the required fields.'});
    if(decision==='UPHOLD'&&(body.classification!=='DRIVER_CAUSED'||!['LEVEL_1','LEVEL_2'].includes(body.consequenceLevel)))return res.status(400).json({error:'Select an action level.'});
    context.adminReview={...body,createdAt:new Date().toISOString()};
    if(decision==='WAIVE')context.finalDecision={...body,outcome:'FINAL_WAIVED'};
    context.case.state=decision==='WAIVE'?'FINAL_WAIVED':'PROVISIONAL_ADMIN_UPHELD';
    res.json({review:context.adminReview,state:context.case.state});
  });
}
