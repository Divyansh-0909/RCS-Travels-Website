// Injected only by the loopback synthetic Vite server; never imported by the product.
const origins = new Set(['http://127.0.0.1:4317', 'http://localhost:4317']);
let ownerOrigin = null, selected = null, overlay = null, last = '', coverageTimer = null, positionedCoverage = null;
const tell = data => { if (window.parent !== window && ownerOrigin) window.parent.postMessage({ channel: 'rcs-review', ...data }, ownerOrigin); };
function locate(scroll = false) {
  if (!selected) return;
  let target;
  try { target = document.querySelector(selected.selector); } catch { /* Report missing selector. */ }
  if (!target) { tell({ type: 'measurement', id: selected.id, missing: true, route: location.pathname }); return; }
  if (!overlay) {
    overlay = document.createElement('div'); overlay.id = '__rcs-review-marker'; overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px dashed #243afb;box-sizing:border-box;color:#fff;font:12px system-ui;';
    document.body.append(overlay);
  }
  if (scroll || !selected.located) { target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); selected.located = true; }
  const rect = target.getBoundingClientRect(), style = getComputedStyle(target);
  overlay.style.left = Math.max(0, rect.left) + 'px'; overlay.style.top = Math.max(0, rect.top) + 'px';
  overlay.style.width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(0, rect.left)) + 'px';
  overlay.style.height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(0, rect.top)) + 'px';
  overlay.replaceChildren(); const tag = document.createElement('span'); tag.textContent = selected.id;
  tag.style.cssText = 'position:absolute;left:0;top:0;background:#243afb;padding:1px 4px;transform:translateY(-100%);'; overlay.append(tag);
  const measurement = { type: 'measurement', id: selected.id, route: location.pathname,
    width: rect.width, height: rect.height, viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    color: style.color, background: style.backgroundColor, theme: document.documentElement.dataset.theme || 'legacy sections',
    preference: localStorage.getItem('rcs.website.theme'), overflow: style.overflow, overflowClipMargin: style.overflowClipMargin, text: target.textContent.trim().slice(0, 120) };
  const encoded = JSON.stringify(measurement); if (encoded !== last) { last = encoded; tell(measurement); }
}
let bookingReplay=null;
addEventListener('message', async event => {
  if (event.source !== window.parent || !origins.has(event.origin) || event.data?.channel !== 'rcs-review' || !['select','coverage'].includes(event.data.type)) return;
  ownerOrigin = event.origin;
  const { issue, theme } = event.data;
  if (['dark', 'light'].includes(theme) && localStorage.getItem('rcs.website.theme') !== theme) {
    localStorage.setItem('rcs.website.theme', theme); location.reload(); return;
  }
  if(event.data.type==='coverage'){
    selected=null;overlay?.remove();overlay=null;clearInterval(coverageTimer);
    const id=event.data.id;
    const sections={'W.SETTINGS.APPEARANCE':'Theme','W.SETTINGS.LANGUAGE':'Language','W.SETTINGS.NOTIFICATIONS':'Notifications','W.SETTINGS.SAVED-PLACES':'Saved places','W.SAFETY.CONTACT':'Emergency contact','W.SAFETY.LOCATION':'Live location','W.SAFETY.HELPLINE':'Helpline','W.HELP.FAQ':'FAQ','W.HELP.CONTACT':'Contact Us','W.HELP.CANCELLATION':'Cancellation','W.ACCOUNT.PROFILE':'Account info','W.ACCOUNT.RIDES':'Ride History','W.ACCOUNT.PRIVACY':'Privacy & Data','W.ADMIN.BOOKINGS':'Bookings','W.ADMIN.DRIVERS':'Drivers','W.ADMIN.USERS':'Users','W.ADMIN.FARES':'Edit Fares'};
    let attempts=0;
    const report=navigation=>tell({type:'coverage-ready',id,route:location.pathname+location.search+location.hash,navigation});
    if(positionedCoverage===id){report('Section positioning already applied; interact with the actual page.');return;}
    coverageTimer=setInterval(()=>{
      attempts++;
      const label=sections[id];
      if(!label&&document.getElementById('root')?.childElementCount){clearInterval(coverageTimer);report('No state-changing action was automated. Follow the recorded safe navigation steps.');return;}
      const button=label&&[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label&&b.getClientRects().length&&!b.disabled);
      if(button){button.click();positionedCoverage=id;clearInterval(coverageTimer);report('Section navigation: '+label);return;}
      if(attempts>=60){clearInterval(coverageTimer);report('Automatic section navigation unavailable. Use the page navigation and recorded steps; this is NOT a passing audit.');}
    },250);
    return;
  }
  clearInterval(coverageTimer);positionedCoverage=null;
  selected = issue; last = ''; locate(true);
  if(issue?.phase==='P06'&&bookingReplay!==issue.id){
    bookingReplay=issue.id;
    try{const {position}=await import('/__review/p06-replay.mjs');const status=await position(issue.id);tell({type:'replay-status',id:issue.id,status});selected.located=false;locate(true);}
    catch{tell({type:'replay-status',id:issue.id,status:'READY FOR MANUAL REPLAY: automatic positioning could not be confirmed. Follow the exact safe steps; no current-screen success is claimed.'});}
  }
});
addEventListener('scroll', () => locate(), { passive: true });
addEventListener('resize', () => locate());
setInterval(() => locate(), 700);
window.__rcsReviewActions = [];
window.__rcsReviewIntent = url => {
  const action = { url: String(url), at: new Date().toISOString(), sent: false };
  window.__rcsReviewActions.push(action); tell({ type: 'safe-action', action });
};
window.open = url => { window.__rcsReviewIntent(url); return null; };
document.addEventListener('click', event => {
  const a = event.target.closest?.('a[href]'); if (!a) return;
  const url = new URL(a.href, location.href);
  if (['tel:', 'mailto:', 'whatsapp:'].includes(url.protocol) || url.origin !== location.origin) {
    event.preventDefault(); event.stopImmediatePropagation(); window.__rcsReviewIntent(url.href);
  }
}, true);
for (const origin of origins) if (window.parent !== window) window.parent.postMessage({ channel: 'rcs-review', type: 'ready', route: location.pathname }, origin);
