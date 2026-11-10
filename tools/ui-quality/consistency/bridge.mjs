// Imported only by the dedicated synthetic developer server.
const review=window.__RCS_CONSISTENCY_CASE__;
const origin=new Set(['http://127.0.0.1:4317','http://localhost:4317']);
const tell=data=>{if(parent!==window)for(const target of origin)parent.postMessage({channel:'rcs-consistency',id:review.id,...data},target);};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const visible=element=>element&&element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(element=>visible(element)&&element.textContent.trim()===label);
async function until(probe){for(let i=0;i<300;i++){const result=probe();if(result)return result;await wait(150);}throw Error('Requested real control did not become available');}
function target(){
  const id=review.id;
  if(id==='VCB01_PICKUP')return document.querySelector('#pickup-location');
  if(id==='VCB01_DROP')return document.querySelector('#drop-location');
  if(id==='VCB01_TRIP_MODE')return button('One way');
  if(id==='VCB01_VEHICLE_CARD')return [...document.querySelectorAll('button')].find(e=>visible(e)&&e.querySelector('h4')?.textContent==='Hatchback');
  if(id==='VCB01_SAVED_ADDRESS')return [...document.querySelectorAll('input')].find(e=>visible(e)&&e.placeholder?.toLowerCase().includes('address'));
  return button(id==='VCB01_ROUTE_ACTION'?'Set date & time':id==='VCB01_TIMING_ACTION'?'See prices':'Book ride');
}
export function measure(element){
  const control=element.tagName==='INPUT'?element.closest('label')||element:element;
  const rect=control.getBoundingClientRect(),style=getComputedStyle(control);
  const shell=element.tagName==='BUTTON'&&element.parentElement.tagName==='DIV'?element.parentElement:control;
  const shellRect=shell.getBoundingClientRect(),shellStyle=getComputedStyle(shell),text=element.querySelector('span:not(:has(svg)),h4')||element;
  const textStyle=getComputedStyle(text),scaleY=element.offsetHeight?element.getBoundingClientRect().height/element.offsetHeight:1;
  return {id:review.id,route:location.pathname,viewport:{width:innerWidth,height:innerHeight},preference:localStorage.getItem('rcs.website.theme'),theme:document.documentElement.dataset.theme||'legacy',text:element.value||element.textContent.trim().slice(0,140),tag:element.tagName,role:element.getAttribute('role')||element.tagName.toLowerCase(),ariaPressed:element.getAttribute('aria-pressed'),disabled:element.disabled===true,focused:document.activeElement===element,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},shell:{width:shellRect.width,height:shellRect.height,radius:shellStyle.borderRadius,padding:shellStyle.padding,border:shellStyle.border,background:shellStyle.backgroundColor,shadow:shellStyle.boxShadow,gap:shellStyle.gap},font:{family:textStyle.fontFamily,size:textStyle.fontSize,weight:textStyle.fontWeight,lineHeight:textStyle.lineHeight,letterSpacing:textStyle.letterSpacing,renderedSizeEstimate:parseFloat(textStyle.fontSize)*scaleY},control:{radius:style.borderRadius,padding:style.padding,border:style.border,background:style.backgroundColor,color:style.color,outline:style.outline,transform:style.transform,scaleY},icons:[...element.querySelectorAll('svg,img')].map(icon=>({tag:icon.tagName,width:icon.getBoundingClientRect().width,height:icon.getBoundingClientRect().height})),horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1};
}
async function start(){
  if(!review)return;
  if(review.id==='VCB01_SAVED_ADDRESS'){
    (await until(()=>button('Saved places'))).click();
    const home=await until(()=>[...document.querySelectorAll('li')].find(e=>visible(e)&&e.querySelector('p')?.textContent.trim()==='Home'));
    (await until(()=>home.querySelector('button'))).click();
  }
  const element=await until(()=>target());await document.fonts.ready;await wait(600);
  element.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
  const report=()=>{const current=target();if(current&&visible(current)){window.__RCS_CONSISTENCY_MEASUREMENT__=measure(current);tell({type:'measurement',measurement:window.__RCS_CONSISTENCY_MEASUREMENT__});}};
  window.__RCS_CONSISTENCY_TARGET__=target;
  report();setInterval(report,1200);
  addEventListener('message',event=>{if(event.source!==parent||!origin.has(event.origin)||event.data?.channel!=='rcs-consistency'||event.data.id!==review.id)return;if(event.data.type==='locate'){target()?.scrollIntoView({block:'center',behavior:'instant'});report();}});
}
start().catch(()=>tell({type:'unavailable',reason:'Real control could not be positioned. No successful comparison is claimed; use the actual page navigation.'}));
