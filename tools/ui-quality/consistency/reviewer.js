const el=id=>document.getElementById(id),params=new URLSearchParams(location.search);
document.body.classList.add('consistency-shell');
el('website-controls').hidden=true;document.querySelector('main').hidden=true;
el('website').setAttribute('aria-pressed','false');el('android').setAttribute('aria-pressed','false');el('consistency').setAttribute('aria-current','page');
const switchView=mode=>location.assign('/?'+new URLSearchParams({mode,width:el('consistency-width').value,theme:el('consistency-theme').value}));
el('website').onclick=()=>switchView('website');el('android').onclick=()=>switchView('android');
const root=document.createElement('section');root.id='consistency-view';root.setAttribute('role','main');document.body.append(root);
root.innerHTML=[
'<div class="consistency-canvas"><div class="consistency-pair" id="consistency-pair"></div><p class="consistency-canvas-note">Live previews · sample data</p></div>',
'<form class="consistency-choice" id="consistency-choice" aria-labelledby="consistency-title">',
'<div class="consistency-heading"><h1 id="consistency-title">Compare</h1><span id="consistency-family-count"></span></div>',
'<div class="consistency-content"><label class="consistency-family-label" for="consistency-family">Component</label><select id="consistency-family"></select>',
'<div class="review-source-controls" hidden><select id="consistency-width" aria-label="Screen size"><option value="360">Phone · 360 px</option><option value="390" selected>Phone · 390 px</option><option value="768">Tablet · 768 px</option><option value="1280">Laptop · 1280 px</option><option value="1440">Laptop · 1440 px</option><option value="1920">Desktop · 1920 px</option></select><select id="consistency-theme" aria-label="Preview colour mode" data-review-theme><option value="light">Light</option><option value="dark">Dark</option></select></div>',
'<section class="consistency-section"><h2>Difference</h2><p id="consistency-difference"></p><div class="consistency-facts" id="consistency-facts"></div></section>',
'<section class="consistency-section" id="consistency-audit-state" hidden><label for="consistency-state">Measurements</label><select id="consistency-state"><option value="default">Rest</option><option value="focus" selected>Keyboard focus</option><option value="hover">Hover</option><option value="active">Pointer pressed</option><option value="pending">Loading / pending</option></select></section>',
'<fieldset id="consistency-options"><legend>Pattern</legend></fieldset><fieldset id="consistency-screens"><legend>Apply to</legend></fieldset>',
'<section class="consistency-section"><label class="consistency-note-label" for="consistency-note">Note <span>optional</span></label><textarea id="consistency-note" maxlength="2000" placeholder="Add an instruction or exclusion"></textarea><p id="consistency-scope-note"></p></section>',
'<details class="consistency-details"><summary>Details</summary><p id="consistency-rationale"></p><p id="consistency-cascade"></p><ul id="consistency-sources"></ul><div class="consistency-table-wrap"><table><thead><tr><th>Control</th><th>Screen</th><th>Height</th><th>Text</th></tr></thead><tbody id="consistency-recorded"></tbody></table></div></details></div>',
'<div class="consistency-footer"><p id="consistency-save-status" role="status"></p><button type="submit" id="consistency-save">Save choice</button></div></form>'
].join('');
let data,family,frames=[],observers=[],lastFamily;
let auditPanes,auditFacts,auditScreenName=id=>id;
const drafts=new Map();
const familyNames={'VC-B01-ACTIONS':'Booking buttons','VC-B01-ADDRESS':'Address fields','VC-B01-SELECTION':'Selection controls'};
const controlNames={VCB01_ROUTE_ACTION:'Route entry',VCB01_TIMING_ACTION:'Scheduling',VCB01_VEHICLE_ACTION:'Vehicles',VCB01_PICKUP:'Pickup',VCB01_DROP:'Drop',VCB01_SAVED_ADDRESS:'Saved Home',VCB01_TRIP_MODE:'Trip type',VCB01_VEHICLE_CARD:'Vehicle cards'};
const screenNames={'W.BOOKING.ROUTE':'Route entry','W.BOOKING.TIMING':'Scheduling','W.BOOKING.VEHICLES':'Vehicle selection','W.SETTINGS.SAVED-PLACES':'Saved Home editor'};
const choiceNames={A:'Use A',B:'Use B',VARIANTS:'Keep both',REVIEW:'Decide later',CUSTOM:'Custom'};
const node=(tag,text)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;return value;};
const option=(value,label)=>{const item=node('option',label);item.value=value;return item;};
const urlFor=occurrence=>'http://127.0.0.1:1575'+occurrence.preview+'&theme='+el('consistency-theme').value;
const short=value=>Number(value.toFixed(1)).toString();
function keepDraft(){
  if(!family)return;
  drafts.set(family.id,{choice:el('consistency-choice').querySelector('[name=pattern]:checked')?.value||null,screenIds:[...el('consistency-choice').querySelectorAll('[name=screen]:checked')].map(item=>item.value),note:el('consistency-note').value});
}
function updateFacts(){
  if(family?.audit){auditFacts(el('consistency-facts'),frames,family.id);return;}
  const a=frames[0]?.measurement,b=frames[1]?.measurement;
  const values=['','A','B','Height',a?short(a.rect.height)+'px':'—',b?short(b.rect.height)+'px':'—','Text',a?'≈'+short(a.font.renderedSizeEstimate)+'px':'—',b?'≈'+short(b.font.renderedSizeEstimate)+'px':'—'];
  el('consistency-facts').replaceChildren(...values.map((text,index)=>{const span=node('span',text);if(index<3)span.className='fact-heading';return span;}));
}
function pane(occurrence,index){
  const section=node('section');section.className='consistency-pane';section.setAttribute('aria-label','Preview '+(index?'B':'A'));
  const heading=node('div');heading.className='consistency-pane-heading';const letter=node('label',index?'B':'A');letter.className='consistency-pane-letter';letter.htmlFor='consistency-occurrence-'+index;heading.append(letter);
  const available=index?[family.occurrences.at(-1)]:family.occurrences.slice(0,-1),select=node('select');select.id=letter.htmlFor;select.setAttribute('aria-label','Preview '+(index?'B':'A')+' control');select.append(...available.map(item=>option(item.id,controlNames[item.id])));select.value=occurrence.id;select.disabled=available.length===1;heading.append(select);section.append(heading);
  const links=node('div');links.className='consistency-pane-links';const link=node('a','Open page ↗');link.target='_blank';link.rel='noreferrer';link.href=urlFor(occurrence);
  const output=node('p','Loading…');output.className='consistency-readout';output.setAttribute('role','status');links.append(link,output);section.append(links);
  const scroll=node('div');scroll.className='consistency-scroll';const frame=node('iframe');frame.title=controlNames[occurrence.id]+' · live preview';frame.dataset.occurrence=occurrence.id;
  const width=Number(el('consistency-width').value),height=width<=600?844:width<1000?1024:width<1920?900:1080;
  frame.style.width=width+'px';frame.style.height=height+'px';frame.src=link.href;scroll.append(frame);section.append(scroll);
  const observer=new ResizeObserver(()=>{const scale=Math.min(1,Math.max(1,scroll.clientWidth)/width);frame.style.transform='scale('+scale+')';frame.style.left=Math.max(0,(scroll.clientWidth-width*scale)/2)+'px';scroll.style.height=(height*scale)+'px';});observer.observe(scroll);observers.push(observer);
  const entry={frame,output,measurement:null};frames.push(entry);
  select.onchange=()=>{const next=available.find(item=>item.id===select.value);entry.measurement=null;frame.dataset.occurrence=next.id;frame.title=controlNames[next.id]+' · live preview';link.href=urlFor(next);output.textContent='Loading…';frame.src=link.href;updateFacts();};
  return section;
}
function render(){
  for(const observer of observers)observer.disconnect();observers=[];frames=[];
  family=data.families.find(item=>item.id===el('consistency-family').value);
  root.classList.toggle('audit-comparison',Boolean(family.audit));
  if(lastFamily!==family.id){el('consistency-state').value=family.id==='VC-B02-14'?'pending':family.id==='VC-B02-01'?'focus':'default';lastFamily=family.id;}
  el('consistency-family-count').textContent=(data.families.indexOf(family)+1)+' / '+data.families.length;
  el('consistency-pair').dataset.layout=Number(el('consistency-width').value)<=600?'phone':'laptop';
  el('consistency-difference').textContent=family.audit?family.summary:family.id==='VC-B01-ACTIONS'?'Choose a button size.':family.id==='VC-B01-ADDRESS'?'Choose an address field style.':'Compact trip buttons. Detailed vehicle cards.';
  el('consistency-rationale').textContent=family.rationale;el('consistency-cascade').textContent=family.cascade;
  el('consistency-scope-note').textContent=family.audit?family.classification:family.id==='VC-B01-ADDRESS'?'Home shown. Shared with Work and custom places.':'';
  el('consistency-audit-state').hidden=!family.audit;
  document.querySelector('.consistency-canvas-note').textContent=family.audit?'Recorded evidence and design samples · source-only items labelled':'Live previews · sample data';
  const panes=family.audit?auditPanes(family,data.audit,{width:Number(el('consistency-width').value),theme:el('consistency-theme').value,state:el('consistency-state').value},frames,updateFacts):[pane(family.occurrences[0],0),pane(family.occurrences.at(-1),1)];
  el('consistency-pair').replaceChildren(...panes);updateFacts();
  const registry=family.audit?data.audit.registry:data.registry,revision=family.audit?data.audit.catalogRevision:data.catalogRevision;
  const previous=registry.decisions.find(item=>item.familyId===family.id),implemented=previous?.implementationStatus==='IMPLEMENTED'&&previous?.implementationCatalogRevision===revision,saved=previous?.catalogRevision===revision||implemented?previous:null,current=drafts.get(family.id)||saved,choices=[...family.choices,{id:'CUSTOM',label:'Custom instruction'}];
  el('consistency-options').replaceChildren(node('legend','Pattern'),...choices.map(choice=>{const label=node('label');label.className='consistency-pattern';label.title=choice.label;const input=node('input');input.type='radio';input.name='pattern';input.value=choice.id;input.required=true;input.checked=current?.choice===choice.id;label.append(input,node('span',choice.shortLabel||choiceNames[choice.id]));return label;}));
  const screens=family.audit?family.screens:[...new Set(family.occurrences.map(item=>item.screenId))];
  el('consistency-screens').replaceChildren(node('legend','Apply to'),...screens.map(id=>{const label=node('label');label.className='consistency-screen-option';label.title=id;const input=node('input');input.type='checkbox';input.name='screen';input.value=id;input.checked=current?current.screenIds.includes(id):true;label.append(input,node('span',family.audit?auditScreenName(id):screenNames[id]||id));return label;}));
  const savedState=saved?{choice:saved.choice,screenIds:saved.screenIds,note:saved.note}:{choice:null,screenIds:screens,note:''};
  const dirty=drafts.has(family.id)&&JSON.stringify(drafts.get(family.id))!==JSON.stringify(savedState);
  el('consistency-note').value=current?.note||'';el('consistency-save-status').textContent=dirty?'Unsaved choice':implemented?'Implemented · review UI':saved?'Saved':previous?'Review again':'No choice saved';
  el('consistency-sources').replaceChildren(...(family.audit?family.sources.map(source=>node('li',source)):family.occurrences.map(item=>node('li',controlNames[item.id]+' · '+item.screenId+' · '+item.source+':'+item.sourceLine))));
  const rows=family.audit?data.audit.observations.filter(sample=>family.examples.includes(sample.key)).map(sample=>[data.audit.labels[sample.key]||sample.key,sample.width+' / '+sample.theme,short(sample.key.startsWith('saved-')&&!sample.key.includes('cancel')?sample.states.default.field.height:sample.states.default.rect.height)+'px','≈'+short(sample.states.default.renderedFontEstimate)+'px']):(data.evidence?.samples||[]).filter(sample=>family.occurrences.some(item=>item.id===sample.id)).map(sample=>[controlNames[sample.id],sample.measurement.viewport.width+' / '+sample.measurement.preference,short(sample.measurement.rect.height)+'px','≈'+short(sample.measurement.font.renderedSizeEstimate)+'px']);
  el('consistency-recorded').replaceChildren(...rows.map(values=>{const row=node('tr');for(const value of values)row.append(node('td',value));return row;}));
  history.replaceState(null,'','/?'+new URLSearchParams({view:'consistency',family:family.id,width:el('consistency-width').value,theme:el('consistency-theme').value}));
}
addEventListener('message',event=>{
  if(event.origin!=='http://127.0.0.1:1575'||event.data?.channel!=='rcs-consistency')return;
  const entry=frames.find(item=>item.frame?.contentWindow===event.source&&item.frame.dataset.occurrence===event.data.id);if(!entry)return;
  if(event.data.type==='unavailable'){entry.output.textContent='Unavailable';entry.output.title=event.data.reason;}
  if(event.data.type==='measurement'){
    const measurement=event.data.measurement;entry.measurement=measurement;const status='LIVE · '+measurement.viewport.width+'px';if(entry.output.textContent!==status)entry.output.textContent=status;
    entry.output.title=short(measurement.rect.width)+' × '+short(measurement.rect.height)+'px · '+measurement.font.family+' · '+measurement.preference+' preference';updateFacts();
  }
});
el('consistency-choice').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter||el('consistency-save'),familyId=family.id,registry=family.audit?data.audit.registry:data.registry,revision=family.audit?data.audit.catalogRevision:data.catalogRevision,endpoint=family.audit?data.auditBase+'/api/consistency/audit-decision':'/api/consistency/decision';button.disabled=true;button.textContent='Saving…';
  try{
    const choice=el('consistency-choice').querySelector('[name=pattern]:checked')?.value,screenIds=[...el('consistency-choice').querySelectorAll('[name=screen]:checked')].map(item=>item.value);
    if(!choice||!screenIds.length)throw Error('Choose a pattern and a screen.');
    if(choice==='CUSTOM'&&!el('consistency-note').value.trim())throw Error('Add a note for Custom.');
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({familyId,choice,screenIds,note:el('consistency-note').value,revision:registry.revision,catalogRevision:revision})});
    const result=await response.json();if(!response.ok)throw Error(response.status===409?'Choices changed. Reload to review.':response.status>=500?'Could not save. Try again.':result.error);
    registry.revision=result.revision;registry.decisions=[...registry.decisions.filter(item=>item.familyId!==result.saved.familyId),result.saved];drafts.delete(familyId);if(family.id===familyId)el('consistency-save-status').textContent=choice==='REVIEW'?'Left for later':'Choice saved · UI unchanged';
  }catch(error){if(family.id===familyId)el('consistency-save-status').textContent=error instanceof TypeError?'Could not save. Try again.':error.message;}finally{button.disabled=false;button.textContent='Save choice';}
};
try{
  const response=await fetch('/api/consistency',{cache:'no-store'});if(!response.ok)throw Error();data=await response.json();
  data.auditBase=data.auditAvailable?location.origin:'http://127.0.0.1:4319';
  try{const auditResponse=await fetch(data.auditBase+'/api/consistency/audit',{cache:'no-store'});data.audit=auditResponse.ok?await auditResponse.json():null;if(data.audit)({auditPanes,auditFacts,auditScreenName}=await import(data.auditBase+'/consistency-audit.js'));}catch{data.audit=null;}
  if(data.audit)data.families.push(...data.audit.families);
  el('consistency-family').append(...data.families.map(item=>option(item.id,familyNames[item.id]||(item.id.slice(-2)+' · '+item.name))));if(data.families.some(item=>item.id===params.get('family')))el('consistency-family').value=params.get('family');
  if(['360','390','768','1280','1440','1920'].includes(params.get('width')))el('consistency-width').value=params.get('width');if(['light','dark'].includes(params.get('theme')))el('consistency-theme').value=params.get('theme');
  for(const id of ['consistency-family','consistency-width','consistency-theme','consistency-state'])el(id).onchange=()=>{keepDraft();render();};
  render();
  if(!data.audit)document.querySelector('.consistency-canvas-note').textContent='Audit unavailable · original comparisons remain available';
}catch{root.replaceChildren(node('p','Review unavailable. Reload to try again.'));}
