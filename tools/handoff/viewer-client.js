if (new URLSearchParams(location.search).get('view') === 'consistency') {
  import('/consistency.js');
} else {
const el = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
let base = 'http://127.0.0.1:1575', mode = params.get('mode') === 'android' ? 'android' : 'website';
let issues = [], androidIssues = [], websiteSelected = null, androidSelected = null, loaded = false, reviewStamp = null;
let coverageRows = [], coverageSelected = null;
const replayObservations=new Map();
const comparison=document.createElement('details');comparison.id='comparison';comparison.hidden=true;el('safe-action').after(comparison);
const currentReview=document.createElement('details');currentReview.id='current-website-review';currentReview.open=params.get('review')==='VCB02';el('site').closest('section.preview').append(currentReview);
const currentSummary=document.createElement('summary');currentSummary.textContent='Current website screenshots · VC-B02 · Close to return to live preview';currentReview.append(currentSummary);
const currentSelect=document.createElement('select');currentSelect.id='current-review-finding';currentSelect.setAttribute('aria-label','Current website finding');
for(const [id,label]of [['03','03 · Backdrop clicks'],['12','12 · Shared inputs'],['09','09 · Adaptive finance'],['13','13 · Action sizing'],['01','01 · Keyboard focus']]){const option=document.createElement('option');option.value=id;option.textContent=label;currentSelect.append(option);}
currentSelect.value=['01','03','09','12','13'].includes(params.get('finding'))?params.get('finding'):'03';currentReview.append(currentSelect);
const currentCaption=document.createElement('p'),currentImages=document.createElement('div'),currentLive=document.createElement('div');currentImages.className='current-review-images';currentLive.id='current-review-live';Object.assign(currentLive.style,{display:'flex',flexWrap:'wrap',gap:'12px',margin:'8px 0'});currentReview.append(currentCaption,currentLive,currentImages);
function showCurrentReview(){
  currentReview.hidden=mode!=='website';if(currentReview.hidden)return;
  const width=Number(el('width').value)<768?390:1440,theme=el('theme').value==='dark'?'dark':'light',finding=currentSelect.value;
  const renderKey=[width,theme,finding].join(':');if(currentImages.dataset.key===renderKey)return;currentImages.dataset.key=renderKey;
  const entries=finding==='03'?[[`filter-click-${width}-${theme}`,'Before · 26 October: the backdrop receives the click; Pending stays off.'],[`backdrop-filter-click-${width}-${theme}`,'After · 29 October: clicking Pending selects it above the backdrop.']]:finding==='12'?[[`review-fields-${width}-${theme}`,'Actual review form: shared selects and textarea.'],[`finance-fields-${width}-${theme}`,'Actual finance panel: shared decimal fields.']]:finding==='09'?[[`finance-fields-${width}-light`,'Light: dark button, light text.'],[`finance-fields-${width}-dark`,'Dark: light button, dark text.']]:finding==='13'?[[`payment-${width}-${theme}`,'Actual payment and settlement components · isolated synthetic preview.'],[`review-fields-${width}-${theme}`,'Actual review form · updated action sizing.']]:[[`focus-theme-${width}-${theme}`,'Theme: primary-colour keyboard outline.'],[`focus-language-${width}-${theme}`,'Language: primary-colour keyboard outline.']];
  currentCaption.textContent=(finding==='03'?'Fixed 29 October: pointer and keyboard controls work above the backdrop. ':'Ready for your visual review. ')+`Recorded at ${width}px · synthetic data.`;
  if(finding==='12')entries.push([`fare-fields-${width}-${theme}`,'Actual fare editor: native number field and notes. Map tiles unavailable.']);
  currentLive.replaceChildren();
  if(finding==='12'){
    currentCaption.textContent=`Shared fields · ${width}px · synthetic data · saves disabled. Open a live page to try focus, dropdowns and text wrapping. Normal fields:48px high,16px text,12px corners. Textareas stay taller.`;
    for(const[kind,label,route]of[['review','Review form','/dashboard/responsibility?case=synthetic-review&'],['finance','Captain finance','/dashboard?'],['fares','Fare editor','/dashboard?']]){const a=document.createElement('a');a.textContent=label+' ↗';a.href='http://127.0.0.1:1575'+route+'fieldReview='+kind+'&theme='+theme;a.target='_blank';a.rel='noopener noreferrer';a.style.color='inherit';currentLive.append(a);}
  }
  currentImages.dataset.layout=width===390?'phone':'laptop';currentImages.replaceChildren();
  for(const [file,label]of entries){const figure=document.createElement('figure'),link=document.createElement('a'),img=document.createElement('img'),caption=document.createElement('figcaption');link.href='http://127.0.0.1:4319/consistency-audit/images/current-'+file+'.png';link.target='_blank';link.rel='noreferrer';img.src=link.href;img.alt=label;img.loading='lazy';caption.textContent=label;link.append(img);figure.append(caption,link);currentImages.append(figure);}
}
currentSelect.onchange=()=>{showCurrentReview();share();};el('width').addEventListener('change',showCurrentReview);el('theme').addEventListener('change',showCurrentReview);
function showComparison(issue){
  comparison.hidden=mode!=='website'||issue?.phase!=='P06'||issue.status!=='IMPLEMENTED';
  if(comparison.hidden||comparison.dataset.issue===issue.id)return;
  comparison.dataset.issue=issue.id;comparison.open=false;comparison.replaceChildren();
  const summary=document.createElement('summary');summary.textContent='Before / after recorded evidence';comparison.append(summary);
  const note=document.createElement('p');note.textContent='These are recorded synthetic screenshots. The live frame above runs the corrected implementation; technical checks and your visual review are separate.';comparison.append(note);
  const images=document.createElement('div');Object.assign(images.style,{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px'});
  for(const state of ['before','after']){const figure=document.createElement('figure');figure.style.margin='0';const caption=document.createElement('figcaption');caption.textContent=state==='before'?'Before — original failure':'After — approved fix';const link=document.createElement('a');link.href='/p06-compare/'+state+'/'+issue.id+'.png';link.target='_blank';link.rel='noopener noreferrer';const img=document.createElement('img');img.src=link.href;img.alt=caption.textContent+' for '+issue.id;img.loading='lazy';img.style.width='100%';link.append(img);figure.append(caption,link);images.append(figure);}comparison.append(images);
}
if (['360', '390', '768', '1280', '1440', '1920'].includes(params.get('width'))) el('width').value = params.get('width');
if (['dark', 'light'].includes(params.get('theme'))) el('theme').value = params.get('theme');
const selected = () => mode === 'android' ? androidSelected : websiteSelected;
function share() {
  const q = new URLSearchParams({ mode, width: el('width').value, theme: el('theme').value });
  if(currentReview.open&&mode==='website'){q.set('review','VCB02');q.set('finding',currentSelect.value);}
  if (coverageSelected) q.set('coverage', coverageSelected.id);
  else if (selected()) q.set('issue', selected().id);
  history.replaceState(null, '', '/?' + q);
}
function locate() {
  if (coverageSelected) { coverageNavigation(); return; }
  if (mode === 'website' && websiteSelected) el('site').contentWindow?.postMessage({ channel: 'rcs-review', type: 'select', issue: { id: websiteSelected.id, selector: websiteSelected.selector, phase: websiteSelected.phase }, theme: el('theme').value }, new URL(base).origin);
}
function renderQueue() {
  el('queue-title').textContent = 'Issues · '+(mode === 'android' ? androidIssues.length : issues.length);
  el('queue').replaceChildren(...(mode === 'android' ? androidIssues : issues).map(issue => {
    const b = document.createElement('button');
    b.dataset.issue = issue.id; b.textContent = issue.id + ' · ' + issue.name;
    b.setAttribute('aria-current', !coverageSelected && selected()?.id === issue.id);
    b.onclick = () => choose(issue); return b;
  }));
}
function showGuide(issue){
  const guide=issue?.phase==='P07'?issue.steps.join(' → '):{'P06-B01-01':'Type Alpha, then Beta. Beta suggestions should remain.','P06-B01-02':'Check tomorrow at 00:30. See prices should be enabled.','P06-B01-03':'At laptop width, use Tab or arrows to choose a suggestion.','P06-B01-04':'Choose a vehicle. Only that card should be selected.'}[issue?.id];
  const replay=issue&&replayObservations.get(issue.id),status=replay?.includes('FIX VERIFIED')?'FIX VERIFIED · ':replay?.includes('READY FOR MANUAL REPLAY')?'READY FOR MANUAL REPLAY · ':'';
  el('safe-action').textContent=mode==='android'&&issue?issue.steps.join(' → '):guide?status+guide:'';
}
function describe() {
  if (coverageSelected) { describeCoverage(); return; }
  const issue = selected();
  el('review-state').textContent=issue?.status==='IMPLEMENTED'?'Implemented':issue?.phase==='P03'?'Kept current':'Needs review';
  el('screen').textContent = issue ? issue.id + ' · ' + issue.name : 'Actual captain Android - DEVICE';
  showComparison(issue);
  el('issue').textContent = issue?.defect || 'Inspect the actual foreground test app on the connected phone.';
  el('selector').textContent = mode === 'android' ? 'com.rcstravels.driver.phase9' : issue?.selector || '';
  el('measurement').textContent = mode === 'android' ? (issue?.baseline || '') + '\nChecking frame freshness…' : 'Locating the real element…';
  el('options').replaceChildren(...(issue?.options || []).map(option => { const li = document.createElement('li'); li.textContent = option; return li; }));
  el('options').previousElementSibling.textContent = issue?.status === 'IMPLEMENTED' ? 'Implemented treatment' : 'Possible treatments — owner chooses';
  el('decision').textContent = mode === 'android' ? (issue?.status === 'IMPLEMENTED' ? `${issue.id} is implemented following the owner's direction. ${androidIssues.every(i => i.status === 'IMPLEMENTED') ? 'Both approved P04 issues are implemented.' : 'Other findings remain for review.'} Brand colors stay locked.` : 'P04: owner choice required before native layout or navigation changes. Brand colors stay locked.') : issue?.phase==='P06'?(issue.status==='IMPLEMENTED'?'P06 — Implemented following your approval. Review the corrected actual booking flow; the original audit remains available. Brand colors and booking rules are preserved.':'OWNER CHOICE NEEDED — P06. This finding is unmodified. Choose a treatment after inspecting the actual synthetic booking flow; brand colors and booking rules stay locked.'):'P03: owner chose to keep Home and Outstation as they are. Visual findings are deferred.';
  showGuide(issue);
}
function navigate() {
  showCurrentReview();
  el('website').setAttribute('aria-pressed', mode === 'website'); el('android').setAttribute('aria-pressed', mode === 'android');
  el('website-controls').hidden = mode === 'android'; el('native-help').hidden = mode !== 'android'; el('locate').hidden = mode !== 'website';
  fitPreview();
  el('page').disabled = Boolean(coverageSelected);
  if (coverageSelected) { navigateCoverage(); return; }
  if (el('page').value === '__coverage') setPageRoute(websiteSelected?.route || '/outstation');
  el('site').hidden = false; el('open').removeAttribute('aria-disabled');
  const url = mode === 'android' ? location.origin + '/native' : base + el('page').value;
  el('site').title = mode === 'android' ? 'Actual isolated Android device - VIEW-ONLY' : 'Actual RCS website with hot reload';
  if (el('site').getAttribute('src') !== url) el('site').src = url; else locate();
  el('open').href = url; el('frame-label').textContent = mode === 'android' ? 'Actual Android · DEVICE · VIEW-ONLY' : websiteSelected?.phase==='P06'?'Actual /book UI · SYNTHETIC SAMPLE PRICES / PLACES · Maps unavailable · no booking/payment writes':'Actual website · synthetic fixture · HMR';
  renderQueue(); describe(); share();
}
function fitPreview(){
  const stage=el('site-stage'),frame=el('site'),width=mode==='android'?390:Number(el('width').value),height=width<=600?844:width<1000?1024:width<1920?900:1080;
  if(!stage.clientWidth||!stage.clientHeight)return;
  const scale=Math.min(1,stage.clientWidth/width,stage.clientHeight/height);
  Object.assign(frame.style,{width:width+'px',height:height+'px',left:Math.max(0,(stage.clientWidth-width*scale)/2)+'px',transform:'scale('+scale+')'});
}
new ResizeObserver(fitPreview).observe(el('site-stage'));
function setPageRoute(route){
  if(!route?.startsWith('/')||route.startsWith('//'))return;
  if(![...el('page').options].some(option=>option.value===route)){const option=document.createElement('option');option.value=route;const id=new URL(route,base).searchParams.get('issue'),names={'P06-B01-01':'Suggestions','P06-B01-02':'Scheduling','P06-B01-03':'Keyboard','P06-B01-04':'Vehicle choice'};option.textContent=names[id]?id+' · '+names[id]:route;el('page').append(option);}
  el('page').value=route;
}
function choose(issue) {
  coverageSelected = null;
  el('review-issues').open=false;el('review-issues').parentElement.scrollTop=0;
  if (issue.surface === 'android') { androidSelected = issue; mode = 'android'; }
  else { websiteSelected = issue; mode = 'website'; setPageRoute(issue.route); }
  navigate();
}
el('site').addEventListener('load', () => { locate(); setTimeout(locate, 1200); });
el('website').onclick = () => { mode = 'website'; if(coverageSelected?.platform!=='website')coverageSelected=null; renderCoverage(); navigate(); };
el('android').onclick = () => { mode = 'android'; if(coverageSelected?.platform!=='android')coverageSelected=null; renderCoverage(); navigate(); };
el('width').onchange = navigate; el('theme').onchange = () => { locate(); share(); }; el('locate').onclick = locate;
el('page').onchange = () => { const issue = issues.find(i => i.route === el('page').value); if (issue) choose(issue); else navigate(); };
addEventListener('message', event => {
  if (mode !== 'website' || event.source !== el('site').contentWindow || event.origin !== new URL(base).origin || event.data?.channel !== 'rcs-review') return;
  const data = event.data;
  if(coverageSelected){
    if(data.type==='ready')coverageNavigation();
    if(data.type==='coverage-ready'&&data.id===coverageSelected.id)el('measurement').textContent='ACTUAL WEBSITE · SYNTHETIC FIXTURE\nActive route: '+data.route+'\n'+data.navigation+'\nRender/navigation observation only; this does not complete the tracker audit or verify the backend.';
    if(data.type==='safe-action')el('safe-action').textContent='PREVIEW ONLY — contact intent intercepted; nothing sent.';
    return;
  }
  if (data.type === 'ready') locate();
  if (data.type === 'replay-status' && data.id===websiteSelected?.id) {replayObservations.set(data.id,data.status);showGuide(websiteSelected);}
  if (data.type === 'measurement' && data.id === websiteSelected?.id) el('measurement').textContent = data.missing ? 'Element is not present on ' + data.route + '. Use Locate issue again.' : `LIVE: ${data.width.toFixed(1)} × ${data.height.toFixed(1)}px hit/element bounds\nViewport ${data.viewport}px · document ${data.scrollWidth}px\nText ${data.color} · background ${data.background}\nPreference ${data.preference} | actual root theme: ${data.theme}\nBaseline: ${websiteSelected.baseline}`;
  if (data.type === 'safe-action') el('safe-action').textContent = 'PREVIEW ONLY — contact intent intercepted; nothing sent. ' + data.action.url;
});
let refreshing = false;
async function refresh() {
  if (refreshing) return; refreshing = true;
  try {
    const data = await fetch('/api/status', { cache: 'no-store' }).then(r => r.json()), s = data.state, p = data.progress || {};
    base = data.previewUrl;
    el('status').textContent = s.state === 'APPROVAL_REQUIRED' ? 'OWNER CHOICE NEEDED - '+(s.run?.phase||'current phase') : (p.status || 'Investigating') + ' · ' + s.state;
    el('doing').textContent = p.doing || s.action; el('connection').textContent = 'Google: ' + (s.connections?.google || 'checking');
    el('heartbeat').textContent = 'Worker ' + (Date.now() - Date.parse(s.heartbeat) < 20000 ? 'live' : 'STALE') + ' · ' + new Date(s.heartbeat).toLocaleTimeString();
    el('stamp').textContent = 'Last work update: ' + new Date(p.updatedAt || s.updatedAt).toLocaleString();
    if (!loaded || reviewStamp !== p.updatedAt) {
      const initial = !loaded, websiteId = websiteSelected?.id || params.get('issue'), androidId = androidSelected?.id || params.get('issue');
      const review = await fetch('/api/review').then(r => r.json()); issues = review.issues || []; androidIssues = review.androidIssues || [];
      websiteSelected = issues.find(i => i.id === websiteId) || issues.find(i => i.id === 'P03-O1') || issues[0];
      androidSelected = androidIssues.find(i => i.id === androidId) || androidIssues[0];
      if (websiteSelected) setPageRoute(websiteSelected.route);
      loaded = true; reviewStamp = p.updatedAt;
      if (initial) navigate(); else { renderQueue(); describe(); locate(); }
    }
    if (mode === 'android') {
      const n = await fetch('/api/native/status', { cache: 'no-store' }).then(r => r.json());
      el('measurement').textContent = (coverageSelected ? coverageSelected.id+' · selected inventory route '+coverageSelected.route+'\n'+(n.live?'The actual isolated device stream is live. Selection describes this entry; it does not navigate the phone or verify this screen.':'No fresh isolated device stream. This selection does not establish device verification.')+' Historical audit evidence stays separate.' : androidSelected?.baseline || '') + '\n' + (n.live ? 'LIVE' : 'ANDROID NOT LIVE') + ' · ' + n.source + ' · VIEW-ONLY · ' + n.status + '\n' + (n.width ? n.width + ' × ' + n.height + ' device pixels · ' : '') + 'Capture age: ' + (n.ageMs === null ? 'unknown' : Math.round(n.ageMs / 1000) + 's') + '\nThe actual feed follows the phone, including owner interactions.';
    }
  } catch { el('status').textContent = 'CONNECTION LOST — progress may be stale'; }
  finally { refreshing = false; }
}
refresh(); setInterval(refresh, 2000);

function renderCoverage(){
  const platform=mode==='android'?'android':'website',query=el('coverage-search').value.trim().toLowerCase(),filter=el('coverage-filter').value;
  const all=coverageRows.filter(r=>r.platform===platform),visible=all.filter(r=>{
    const matches=filter==='all'||(filter==='unavailable'?(r.platform==='android'?r.reachability!=='DEVICE_OBSERVED':!r.preview_path):[r.audit_status,r.owner_decision,r.verification_status].includes(filter));
    return matches&&[r.id,r.screen,r.route,r.role,r.source_file,r.state].join(' ').toLowerCase().includes(query);
  });
  el('coverage-count').textContent=visible.length+' of '+all.length+' '+platform+' inventory entries. Parent status does not complete children.';
  const map=new Map(coverageRows.map(r=>[r.id,r]));
  el('coverage-list').replaceChildren(...visible.map(row=>{
    const button=document.createElement('button');button.type='button';button.dataset.coverage=row.id;
    button.setAttribute('aria-current',String(coverageSelected?.id===row.id));button.style.textAlign='left';
    let depth=0,parent=row.parent_id;while(parent&&depth<8){depth++;parent=map.get(parent)?.parent_id;}
    button.style.paddingLeft=(10+Math.min(depth*4,24))+'px';button.style.minWidth='0';button.style.overflowWrap='anywhere';button.style.width='100%';
    button.textContent=row.id+' · '+row.screen+' — audit '+row.audit_status+' / verification '+row.verification_status;
    button.onclick=()=>{coverageSelected=row;mode=row.platform==='android'?'android':'website';navigate();if(matchMedia('(max-width:1000px)').matches)el('site').closest('.preview').scrollIntoView({block:'start',behavior:'instant'});};return button;
  }));
}
function describeCoverage(){
  const row=coverageSelected;
  el('review-state').textContent=row.audit_status==='AUDITED'?'Audited by dimension':'Inventory only';
  el('screen').textContent=row.id+' · '+row.screen;
  el('issue').textContent='Route / source scope: '+row.route+'\nState/group: '+row.state.slice(0,1600)+(row.state.length>1600?'… Full predicates are retained in the canonical CSV.':'')+(row.blocker?'\nLIMIT: '+row.blocker:'');
  el('selector').textContent=row.source_file+':'+row.source_line;
  el('measurement').textContent=row.blocker||'Source inventory; waiting for actual safe preview. No audit is inferred.';
  el('options').replaceChildren(...['Audit: '+row.audit_status+' · '+(row.audit_dimensions.join(', ')||'no completed dimensions'),'Owner: '+row.owner_decision,'Implementation: '+row.implementation_status,'Verification: '+row.verification_status+' · '+row.verification_levels.join(', '),'Historical phase/date: '+(row.last_review_phase||'none')+' / '+(row.last_review_date||'none'),'Theme policy: '+row.theme_policy+' — '+row.theme_basis,'Next action: '+row.next_action].map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
  for(const url of row.evidence_urls){const li=document.createElement('li'),a=document.createElement('a');a.textContent='Recorded evidence';a.href=url;a.target='_blank';a.rel='noreferrer';li.append(a);el('options').append(li);}
  for(const id of row.issue_ids){const li=document.createElement('li'),issue=[...issues,...androidIssues].find(i=>i.id===id);if(issue){const button=document.createElement('button');button.textContent='Open issue '+id+' · '+row.issue_severity;button.onclick=()=>choose(issue);li.append(button);}else li.textContent='Recorded issue: '+id+' · severity '+row.issue_severity;el('options').append(li);}
  el('options').previousElementSibling.textContent='Coverage fields remain independent';
  el('decision').textContent=row.owner_decision==='OWNER_DEFERRED'?'Owner chose KEEP CURRENT; the recorded defect remains FAIL.':'P05 maps coverage only. Product appearance and navigation changes require live review and explicit owner direction.';
  el('safe-action').textContent='Navigation: '+row.navigation_steps.join(' → ');
}
function navigateCoverage(){
  const row=coverageSelected;el('locate').hidden=true;renderQueue();renderCoverage();describeCoverage();share();
  if(!el('page').querySelector('[value="__coverage"]')){const option=document.createElement('option');option.value='__coverage';option.textContent='Coverage selection';el('page').append(option);}
  el('page').value='__coverage';
  if(row.platform==='website'&&!row.preview_path){el('site').hidden=true;el('frame-label').textContent='NOT_RUN · preview unavailable for '+row.route;el('open').removeAttribute('href');el('open').setAttribute('aria-disabled','true');return;}
  const url=row.platform==='android'?location.origin+'/native':base+'/__review/open?actor='+encodeURIComponent(row.preview_actor||'customer')+'&to='+encodeURIComponent(row.preview_path);
  el('site').hidden=false;el('open').removeAttribute('aria-disabled');el('open').href=url;
  el('site').title=row.platform==='android'?'Actual isolated Android device - VIEW-ONLY':'Actual RCS website - synthetic fixture';
  el('frame-label').textContent=row.platform==='android'?'Actual Android · DEVICE · VIEW-ONLY · no browser substitute':'Actual website · SYNTHETIC FIXTURE · '+row.preview_path+' · product route '+row.route;
  if(el('site').getAttribute('src')!==url)el('site').src=url;else coverageNavigation();
}
function coverageNavigation(){
  comparison.hidden=true;
  if(!coverageSelected||mode!=='website'||!coverageSelected.preview_path)return;
  el('site').contentWindow?.postMessage({channel:'rcs-review',type:'coverage',id:coverageSelected.id,theme:el('theme').value},new URL(base).origin);
}
el('coverage-search').addEventListener('input',renderCoverage);
el('coverage-filter').addEventListener('change',renderCoverage);
fetch('/api/coverage',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Coverage unavailable');return r.json();}).then(data=>{
  coverageRows=data.rows||[];
  const initial=coverageRows.find(r=>r.id===params.get('coverage'));
  if(initial){coverageSelected=initial;mode=initial.platform==='android'?'android':'website';navigate();}
  renderCoverage();
}).catch(()=>{el('coverage-count').textContent='Coverage inventory unavailable. Existing issue review remains available.';});
}
