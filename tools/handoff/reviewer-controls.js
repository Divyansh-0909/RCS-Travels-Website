// Shared select adapter for the loopback reviewer. Native selects remain the value source.
// Menu styling follows graphicUI_clone's editor-controls/workbench menu, without a new app build.
const controllers=new Map(),inspectors=new WeakSet();let active=null,sequence=0,queued=false;
const chevron='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const tick='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
const glyph=paths=>'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
const deviceIcons={
  phone:glyph('<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>'),
  tablet:glyph('<rect x="4" y="2" width="16" height="20" rx="2.5"/><path d="M11 18h2"/>'),
  laptop:glyph('<rect x="4" y="3" width="16" height="13" rx="1.5"/><path d="m4 16-2 4h20l-2-4M10 20h4"/>'),
  desktop:glyph('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M12 17v4M8 21h8"/>'),
};
const modeIcons={website:glyph('<rect x="2" y="3" width="20" height="18" rx="3"/><path d="M2 8h20M6 5.5h.01M9 5.5h.01"/>'),android:glyph('<path d="m7 4-2-2m12 2 2-2M5 10a7 7 0 0 1 14 0v7H5ZM8 17v4m8-4v4M2 10v6m20-6v6"/><path d="M9 7h.01M15 7h.01"/>'),consistency:glyph('<rect x="2" y="3" width="20" height="18" rx="3"/><path d="M12 3v18M6 9h2m8 6h2"/>')};
const themeIcons={light:glyph('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),dark:glyph('<path d="M20.8 13.4A9 9 0 0 1 10.6 3.2 9 9 0 1 0 20.8 13.4Z"/>')};
const deviceKind=value=>Number(value)<=600?'phone':Number(value)<1000?'tablet':Number(value)<1920?'laptop':'desktop';
const make=(tag,className)=>{const element=document.createElement(tag);if(className)element.className=className;return element;};
const frameShield=make('div','review-menu-frame-shields');frameShield.hidden=true;frameShield.setAttribute('aria-hidden','true');document.body.append(frameShield);let shieldKey='';
frameShield.addEventListener('pointerdown',event=>{event.preventDefault();active?.close(false,'preview-click');});
function shieldFrames(){
  if(!active){frameShield.hidden=true;return;}
  const boxes=[];
  for(const frame of document.querySelectorAll('iframe')){
    const rect=frame.getBoundingClientRect();let left=Math.max(0,rect.left),right=Math.min(innerWidth,rect.right),top=Math.max(0,rect.top),bottom=Math.min(innerHeight,rect.bottom);
    for(let parent=frame.parentElement;parent&&parent!==document.body;parent=parent.parentElement){const style=getComputedStyle(parent),box=parent.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(style.overflowX)){left=Math.max(left,box.left);right=Math.min(right,box.right);}if(/auto|scroll|hidden|clip/.test(style.overflowY)){top=Math.max(top,box.top);bottom=Math.min(bottom,box.bottom);}}
    if(right>left&&bottom>top)boxes.push({left,top,width:right-left,height:bottom-top});
  }
  const key=JSON.stringify(boxes);if(key!==shieldKey){shieldKey=key;frameShield.replaceChildren(...boxes.map(box=>{const element=make('div');for(const [name,value]of Object.entries(box))element.style[name]=value+'px';return element;}));}
  frameShield.hidden=false;
}
function labelFor(select){
  if(select.getAttribute('aria-label'))return select.getAttribute('aria-label');
  return [...select.labels].map(label=>{const copy=label.cloneNode(true);copy.querySelectorAll('select,button,.review-select').forEach(element=>element.remove());return copy.textContent.trim();}).filter(Boolean).join(' ')||select.name||'Choose an option';
}
class ReviewSelect{
  constructor(select){
    this.select=select;this.wrapper=make('span','review-select');this.wrapper.dataset.select=select.id;if(select.style.width)this.wrapper.style.width=select.style.width;
    this.trigger=make('button','review-select-trigger');this.trigger.type='button';this.trigger.id=(select.id||'review-select-'+(++sequence))+'-trigger';
    this.trigger.setAttribute('role','combobox');this.trigger.setAttribute('aria-haspopup','listbox');this.trigger.setAttribute('aria-expanded','false');
    this.text=make('span','review-select-value');const arrow=make('span','review-select-arrow');arrow.innerHTML=chevron;this.trigger.append(this.text,arrow);
    this.popup=make('div','review-select-popup');this.popup.id=this.trigger.id+'-listbox';this.popup.setAttribute('role','listbox');this.popup.hidden=true;
    this.trigger.setAttribute('aria-controls',this.popup.id);select.before(this.wrapper);this.wrapper.append(select,this.trigger);this.home=this.wrapper.parentElement;document.body.append(this.popup);
    select.classList.add('review-native-select');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
    this.trigger.addEventListener('click',()=>active===this?this.close():this.open());this.trigger.addEventListener('keydown',event=>this.key(event));
    this.change=()=>this.sync();select.addEventListener('change',this.change);
    this.labels=[...select.labels];this.labelClick=event=>{if(event.target.closest('button,input,a'))return;event.preventDefault();this.trigger.focus();};for(const label of this.labels)label.addEventListener('click',this.labelClick);
    this.sync();
  }
  sync(){
    const label=labelFor(this.select),selected=this.select.selectedOptions[0],display=selected?.textContent||'Choose';
    if(this.text.textContent!==display)this.text.textContent=display;
    const docked=this.select.dataset.dock==='screen';
    if(docked){
      if(!this.deviceIcon){this.deviceIcon=make('span','review-device-icon');this.trigger.prepend(this.deviceIcon);this.trigger.classList.add('review-device-trigger');this.popup.classList.add('review-device-popup');}
      const kind=deviceKind(this.select.value);if(this.trigger.dataset.device!==kind){this.trigger.dataset.device=kind;this.deviceIcon.innerHTML=deviceIcons[kind];}
      const title='Screen size: '+display;if(this.trigger.title!==title)this.trigger.title=title;
    }
    if(this.trigger.disabled!==this.select.disabled)this.trigger.disabled=this.select.disabled;
    const name=docked?'Screen size: '+display:label;
    if(this.trigger.getAttribute('aria-label')!==name)this.trigger.setAttribute('aria-label',name);
    if(this.popup.getAttribute('aria-label')!==label)this.popup.setAttribute('aria-label',label);
    const key=JSON.stringify([...this.select.options].map(option=>[option.value,option.textContent,option.disabled]).concat([this.select.value]));
    if(key!==this.keyValue){this.keyValue=key;if(active===this)this.build();}
    if(this.select.disabled&&active===this)this.close(false);
  }
  build(){
    this.items=[...this.select.options];this.popup.replaceChildren();
    for(const [index,option] of this.items.entries()){
      const row=make('div','review-select-option');row.id=this.popup.id+'-'+index;row.setAttribute('role','option');row.setAttribute('aria-selected',String(option.selected));row.dataset.index=index;
      if(option.disabled)row.setAttribute('aria-disabled','true');
      const text=make('span');text.textContent=option.textContent;const check=make('span','review-select-check');check.innerHTML=tick;check.hidden=!option.selected;row.append(text,check);
      if(this.select.dataset.dock==='screen'){const icon=make('span','review-device-option-icon');icon.innerHTML=deviceIcons[deviceKind(option.value)];row.prepend(icon);text.className='review-device-option-label';}
      row.addEventListener('pointermove',()=>{if(!option.disabled)this.highlight(index);});row.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse')event.preventDefault();});row.addEventListener('click',()=>{if(!option.disabled)this.choose(index);});this.popup.append(row);
    }
    this.highlight(Math.max(0,this.select.selectedIndex),false);
  }
  open(index){
    if(this.select.disabled||!this.select.isConnected)return;if(active&&active!==this)active.close(false);active=this;
    const landmark=document.querySelector('[role="main"],main:not([hidden])');if(landmark)this.popup.parentElement!==landmark&&landmark.append(this.popup);
    this.build();this.popup.hidden=false;delete this.popup.dataset.dismissed;this.trigger.setAttribute('aria-expanded','true');this.wrapper.dataset.open='true';this.position();
    if(index!==undefined)this.highlight(index);else this.highlight(Math.max(0,this.select.selectedIndex));
  }
  close(focus=true,reason='control'){
    this.popup.hidden=true;this.popup.dataset.dismissed=reason;this.trigger.setAttribute('aria-expanded','false');this.trigger.removeAttribute('aria-activedescendant');delete this.wrapper.dataset.open;
    if(active===this){active=null;frameShield.hidden=true;}if(focus&&this.trigger.isConnected)this.trigger.focus();
  }
  position(){
    if(active!==this)return;if(!this.select.isConnected){this.close(false);return;}
    const rect=this.trigger.getBoundingClientRect(),viewport=window.visualViewport,width=viewport?.width||innerWidth,height=viewport?.height||innerHeight;
    if(rect.bottom<0||rect.top>height){this.close(false,'offscreen');return;}
    const clipping=this.trigger.closest('.consistency-content,.review-inspector-content,aside');if(clipping){const box=clipping.getBoundingClientRect();if(rect.bottom<=box.top||rect.top>=box.bottom){this.close(false,'clipped');return;}}
    const popupWidth=Math.min(Math.max(this.select.dataset.dock==='screen'?232:160,rect.width),width-24),below=height-rect.bottom-18,above=rect.top-18;
    this.popup.style.width=popupWidth+'px';const desired=Math.min(340,this.popup.scrollHeight+2),up=below<Math.min(desired,170)&&above>below;
    this.popup.style.maxHeight=Math.max(40,Math.min(340,up?above:below))+'px';const popupHeight=Math.min(desired,parseFloat(this.popup.style.maxHeight));
    this.popup.style.left=Math.max(12,Math.min(rect.left,width-popupWidth-12))+'px';this.popup.style.top=Math.max(12,up?rect.top-popupHeight-6:rect.bottom+6)+'px';
    shieldFrames();
  }
  highlight(index,scroll=true){
    if(!this.items?.length)return;index=Math.max(0,Math.min(index,this.items.length-1));if(this.items[index].disabled)return;this.index=index;
    for(const [i,row] of [...this.popup.children].entries()){if(i===index)row.dataset.highlighted='true';else delete row.dataset.highlighted;}
    const row=this.popup.children[index];this.trigger.setAttribute('aria-activedescendant',row.id);
    if(scroll&&!this.popup.hidden){const box=this.popup.getBoundingClientRect(),item=row.getBoundingClientRect();if(item.top<box.top+6)this.popup.scrollTop-=box.top+6-item.top;else if(item.bottom>box.bottom-6)this.popup.scrollTop+=item.bottom-box.bottom+6;}
  }
  step(delta){
    let index=this.index??this.select.selectedIndex;do{index+=delta;}while(index>=0&&index<this.items.length&&this.items[index].disabled);
    if(index>=0&&index<this.items.length)this.highlight(index);
  }
  choose(index){
    const option=this.items[index];if(!option||option.disabled)return;const changed=this.select.value!==option.value;this.select.value=option.value;this.close();this.sync();
    if(changed){this.select.dispatchEvent(new Event('input',{bubbles:true}));this.select.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  key(event){
    if(this.select.disabled)return;const open=active===this;
    if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)){
      event.preventDefault();
      if(event.key==='Enter'||event.key===' '){if(open)this.choose(this.index);else this.open();return;}
      if(!open)this.open();else if(event.key==='ArrowDown'||event.key==='ArrowUp')this.step(event.key==='ArrowDown'?1:-1);
      if(event.key==='Home')this.highlight(0);if(event.key==='End')this.highlight(this.items.length-1);return;
    }
    if(event.key==='Escape'&&open){event.preventDefault();this.close();return;}
    if(event.key==='Tab'&&open){this.close(false);return;}
    if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      event.preventDefault();if(!open)this.open();const now=Date.now();this.search=now-(this.searchedAt||0)<600?(this.search||'')+event.key:event.key;this.searchedAt=now;
      const index=this.items.findIndex(option=>!option.disabled&&option.textContent.trim().toLowerCase().startsWith(this.search.toLowerCase()));if(index>=0)this.highlight(index);
    }
  }
  destroy(){this.close(false);this.popup.remove();this.select.removeEventListener('change',this.change);for(const label of this.labels)label.removeEventListener('click',this.labelClick);}
}
let dockWidth=null,dockTheme=null;
const setAttribute=(element,name,value)=>{if(element.getAttribute(name)!==String(value))element.setAttribute(name,String(value));};
function syncDock(){
  const dock=document.querySelector('.review-dock');if(!dock)return;
  for(const [id,label]of [['website','Website'],['android','Android'],['consistency','Compare']]){
    const button=document.getElementById(id);if(!button||button.dataset.dockIcon)continue;
    const icon=make('span','dock-mode-icon');icon.innerHTML=modeIcons[id];const text=make('span','dock-mode-label');text.textContent=label;button.replaceChildren(icon,text);button.dataset.dockIcon=id;setAttribute(button,'aria-label',label+' preview');button.title=label+' preview';
  }
  const comparison=document.body.classList.contains('consistency-shell');
  const width=document.getElementById(comparison?'consistency-width':'width'),theme=document.getElementById(comparison?'consistency-theme':'theme');
  if(!width||!theme){dock.querySelector('.dock-preview-tools').hidden=true;active?.close(false,'unavailable');return;}
  const control=controllers.get(width);if(!control)return;
  if(dockWidth!==control){
    active?.close(false,'view-change');if(dockWidth?.home?.isConnected)dockWidth.home.append(dockWidth.wrapper);
    dockWidth=control;width.dataset.dock='screen';document.getElementById('dock-screen').append(control.wrapper);control.sync();
  }
  dockTheme=theme;
  const native=!comparison&&document.getElementById('android').getAttribute('aria-pressed')==='true',tools=dock.querySelector('.dock-preview-tools');
  if(tools.hidden!==native)tools.hidden=native;
  if(native&&active===control)active.close(false,'native-view');
  const mode=theme.value==='dark'?'dark':'light',button=document.getElementById('dock-theme');
  if(button.dataset.mode!==mode){button.dataset.mode=mode;button.innerHTML=themeIcons[mode];}
  const next=mode==='dark'?'light':'dark';setAttribute(button,'aria-pressed',mode==='dark');setAttribute(button,'aria-label','Dark mode');
  const title=(mode==='dark'?'Dark':'Light')+' mode · switch to '+next;if(button.title!==title)button.title=title;
  if(document.body.dataset.canvasTheme!==mode)document.body.dataset.canvasTheme=mode;
  const link=document.getElementById('consistency'),href='/?'+new URLSearchParams({view:'consistency',width:width.value,theme:mode});if(link&&link.getAttribute('href')!==href)link.setAttribute('href',href);
}
document.getElementById('dock-theme')?.addEventListener('click',()=>{
  if(!dockTheme)return;dockTheme.value=dockTheme.value==='dark'?'light':'dark';dockTheme.dispatchEvent(new Event('input',{bubbles:true}));dockTheme.dispatchEvent(new Event('change',{bubbles:true}));syncDock();
});
document.addEventListener('change',syncDock);
function refresh(){
  queued=false;for(const [select,control] of controllers){if(!select.isConnected){control.destroy();controllers.delete(select);}else control.sync();}
  for(const select of document.querySelectorAll('select:not([data-review-theme])'))if(!controllers.has(select))controllers.set(select,new ReviewSelect(select));
  for(const inspector of document.querySelectorAll('.consistency-choice,main>aside'))if(!inspectors.has(inspector)){inspectors.add(inspector);inspector.addEventListener('wheel',event=>{if(event.ctrlKey||!event.deltaY||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;const content=inspector.querySelector('.consistency-content,.review-inspector-content');if(!content)return;event.preventDefault();content.scrollTop+=event.deltaY*(event.deltaMode===1?18:event.deltaMode===2?content.clientHeight:1);},{passive:false});}
  syncDock();active?.position();
}
new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(refresh);}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected','aria-label','aria-pressed','aria-current']});
document.addEventListener('pointerdown',event=>{if(active&&!active.wrapper.contains(event.target)&&!active.popup.contains(event.target))active.close(false,'outside');});
document.addEventListener('scroll',()=>active?.position(),true);addEventListener('resize',()=>active?.position());
addEventListener('blur',()=>{const control=active;if(!control)return;if(document.activeElement?.tagName==='IFRAME')queueMicrotask(()=>{if(active===control)control.trigger.focus({preventScroll:true});});else control.close(false,'window-blur');});
document.addEventListener('visibilitychange',()=>{if(document.hidden)active?.close(false,'document-hidden');});refresh();
