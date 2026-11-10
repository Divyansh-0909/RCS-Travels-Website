const node = (tag, text) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; return element; };
const selections = new Map();
const currentTreatments = {
  'VC-B02-01':'Implemented: primary-colour keyboard outlines.',
  'VC-B02-02':'Implemented: missing icon import; account fields render.',
  'VC-B02-03':'Implemented 29 October: filters and account editors now sit above the backdrop. See the before/after Website screenshots.',
  'VC-B02-04':'Implemented: shared 48px fields and login/signup input styling.',
  'VC-B02-05':'Page theme work deferred. Shared input tokens applied.',
  'VC-B02-06':'Implemented: 36px pills with 44px targets.',
  'VC-B02-07':'Implemented: compact chips. Ride options trigger preserved.',
  'VC-B02-08':'Implemented: Settings switch geometry and motion.',
  'VC-B02-09':'Implemented: adaptive finance text and background.',
  'VC-B02-10':'Implemented: circular close/back controls and compact floating controls.',
  'VC-B02-11':'Unchanged by owner direction.',
  'VC-B02-12':'Shared field styling implemented. Awaiting owner visual approval.',
  'VC-B02-13':'Implemented: newer action sizing in payment, account and review.',
  'VC-B02-14':'Implemented: saved-place validation and Google address selection.',
};
const assetOrigin = new URL(import.meta.url).origin;
const fontStyle = node('style', '@font-face{font-family:RCSAudit;src:url("' + assetOrigin + '/consistency-audit/font.woff2") format("woff2");font-display:swap}'); document.head.append(fontStyle);
const imageUrl = file => assetOrigin + '/consistency-audit/images/' + file.split('/').at(-1);
const screenLabels = {
  'W.LOGIN': 'Login', 'W.SIGNUP': 'Signup', 'W.HOME': 'Home navigation', 'W.BOOKING.ROUTE': 'Route entry', 'W.BOOKING.TIMING': 'Scheduling', 'W.BOOKING.VEHICLES': 'Vehicle selection',
  'W.SETTINGS.APPEARANCE': 'Theme settings', 'W.SETTINGS.LANGUAGE': 'Language settings', 'W.SETTINGS.NOTIFICATIONS': 'Notifications', 'W.SETTINGS.SAVED-PLACES': 'Saved places',
  'W.SAFETY.CONTACT': 'Safety contact', 'W.SAFETY.LOCATION': 'Safety live location', 'W.ACCOUNT.PROFILE': 'Account information', 'W.ACCOUNT.DETAIL': 'Account ride details',
  'W.ADMIN.BOOKINGS': 'Admin bookings', 'W.ADMIN.DRIVERS': 'Admin drivers', 'W.ADMIN.USERS': 'Admin users', 'W.ADMIN.DRIVER-DETAIL': 'Driver review / finance', 'W.ADMIN.FARES': 'Fare editor', 'W.RESPONSIBILITY': 'Responsibility review',
};
export const auditScreenName = id => screenLabels[id] || id;
function entriesFor(family, data) {
  const keys = [...new Set([...family.examples, ...(['VC-B02-04', 'VC-B02-05'].includes(family.id) ? ['signup-phone', 'booking-drop', 'saved-name'] : [])])];
  const entries = keys.map(key => ({ id: key, kind: 'recorded', label: data.labels[key] || key }));
  if (family.image) entries.unshift({ id: 'blocker', kind: 'blocker', label: 'Observed blocker', image: family.image });
  if (family.id === 'VC-B02-14') for (const task of ['login', 'saved']) entries.push({ id: 'pending:' + task, kind: 'pending', label: task === 'login' ? 'Login sending OTP' : 'Saved place saving', task });
  if (family.id === 'VC-B02-06') for (const face of [36, 40]) entries.push({ id: 'proposal:' + face, kind: 'proposal', label: face + 'px compact proposal', face });
  family.sourceSamples.forEach((source, index) => entries.push({ id: 'source:' + index, kind: 'source', label: 'Source: ' + source.source.split('/').at(-1), source }));
  return entries;
}
function closest(records, width, theme) {
  return [...records].sort((a, b) => Math.abs(a.width - width) - Math.abs(b.width - width) || Number(b.theme === theme) - Number(a.theme === theme))[0];
}
function observationMeasurement(record, state) {
  const value = record.states?.[state];
  if (!value) return null;
  const height = record.key.startsWith('saved-') && !record.key.includes('cancel') ? value.field.height : value.rect.height;
  const icon = ['saved-cancel', 'safety-cancel', 'timing-close', 'ride-options-close', 'settings-switch'].includes(record.key);
  return { rect: { ...value.rect, height }, font: { renderedSizeEstimate: icon ? null : value.renderedFontEstimate }, value };
}
function addImage(target, file, alt) {
  const link = node('a'); link.href = imageUrl(file); link.target = '_blank'; link.rel = 'noreferrer'; link.className = 'audit-image-link'; link.title = 'Open full screenshot';
  const image = node('img'); image.src = link.href; image.alt = alt; image.className = 'audit-image'; link.append(image); target.append(link);
}
function proposal(target, face) {
  const study = node('div'); study.className = 'audit-pill-study'; study.style.setProperty('--audit-face', face + 'px'); study.style.setProperty('--audit-font', face === 36 ? '14px' : '16px'); study.style.setProperty('--audit-inset', face === 36 ? '2px' : '0px');
  const title = node('p', 'Design sample · not applied'); title.className = 'audit-caption';
  const group = node('div'); group.className = 'audit-pill-group'; group.setAttribute('role', 'group'); group.setAttribute('aria-label', face + 'px sample trip type');
  for (const [index, text] of ['One way', 'Round trip'].entries()) {
    const button = node('button'); button.type = 'button'; button.className = 'audit-pill-button'; button.setAttribute('aria-pressed', String(index === 0)); button.append(node('span', text));
    button.onclick = () => group.querySelectorAll('button').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    group.append(button);
  }
  const later = node('button'); later.type = 'button'; later.className = 'audit-pill-button'; later.setAttribute('aria-label', 'Later · design sample');
  const faceNode = node('span'); faceNode.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" fill="none" stroke="currentColor" stroke-width="2"/></svg>Later<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>'; later.append(faceNode);
  const line = node('div'); line.className = 'audit-pill-line'; line.append(group, later); study.append(title, line, node('p', face + 'px face · 44px button targets'));
  const wrap = node('div'); wrap.className = 'audit-proposal-frame'; wrap.append(study); target.append(wrap);
  const observer = new ResizeObserver(() => { if (!wrap.isConnected) { observer.disconnect(); return; } const scale = Math.min(1, wrap.clientWidth / 340); study.style.transform = 'scale(' + scale + ')'; wrap.style.height = study.scrollHeight * scale + 'px'; }); observer.observe(wrap);
}
export function auditPanes(family, data, settings, frames, onMeasure) {
  const entries = entriesFor(family, data);
  const preferred = entries.filter(entry => !['source', 'proposal'].includes(entry.kind));
  const second = family.id === 'VC-B02-06' ? entries.find(entry => entry.id === 'proposal:36') : ['VC-B02-04', 'VC-B02-05'].includes(family.id) ? entries.find(entry => entry.id === 'booking-pickup') : preferred.length > 1 ? preferred.at(-1) : entries.at(-1);
  const defaults = [preferred[0] || entries[0], second];
  return defaults.map((initial, index) => {
    const section = node('section'); section.className = 'consistency-pane audit-pane'; section.setAttribute('aria-label', 'Preview ' + (index ? 'B' : 'A'));
    const heading = node('div'); heading.className = 'consistency-pane-heading';
    const label = node('label', index ? 'B' : 'A'); label.className = 'consistency-pane-letter'; label.htmlFor = 'consistency-occurrence-' + index;
    const select = node('select'); select.id = label.htmlFor; select.setAttribute('aria-label', 'Preview ' + (index ? 'B' : 'A') + ' control');
    for (const entry of entries) { const option = node('option', entry.label); option.value = entry.id; select.append(option); }
    select.value = selections.get(family.id + ':' + index) || initial.id;
    heading.append(label, select); section.append(heading);
    if(index===0){
      const note=node('p',currentTreatments[family.id]+' Baseline images below are retained from the audit.');note.className='audit-caption';section.append(note);
      if(['VC-B02-01','VC-B02-03','VC-B02-09','VC-B02-12','VC-B02-13'].includes(family.id)){const link=node('a','Current Website screenshots ↗');link.href='/?mode=website&review=VCB02&finding='+family.id.slice(-2)+'&width='+settings.width+'&theme='+settings.theme;link.className='audit-caption';section.append(link);}
    }
    const readout = node('p'); readout.className = 'consistency-readout audit-readout'; readout.setAttribute('role', 'status'); section.append(readout);
    const content = node('div'); content.className = 'audit-pane-content'; section.append(content);
    const frame = { measurement: null }; frames.push(frame);
    const render = () => {
      const entry = entries.find(item => item.id === select.value); content.replaceChildren(); frame.measurement = null;
      selections.set(family.id + ':' + index, entry.id);
      if (entry.kind === 'recorded') {
        const record = closest(data.observations.filter(item => item.key === entry.id), settings.width, settings.theme);
        if (!record) { readout.textContent = 'Not recorded'; onMeasure(); return; }
        frame.measurement = observationMeasurement(record, settings.state);
        readout.textContent = 'RECORDED · ' + record.width + 'px · ' + record.theme;
        const note = node('p', frame.measurement ? 'Metrics: ' + (settings.state === 'default' ? 'rest' : settings.state) + ' · image: focus.' : 'This interaction state was not recorded.'); note.className = 'audit-caption'; content.append(note);
        if (record.screenshot) addImage(content, record.screenshot, entry.label + ' · actual website');
        if (record.states.default.pointerBlocked) content.append(node('p', 'Pointer intercepted by the backdrop.'));
      } else if (entry.kind === 'pending') {
        const record = closest(data.pending.filter(item => item.task === entry.task), settings.width, settings.theme);
        readout.textContent = 'RECORDED · pending · ' + record.width + 'px · ' + record.theme;
        if (settings.state === 'pending') frame.measurement = { rect: record.styles.rect, font: { renderedSizeEstimate: parseFloat(record.styles.font) }, value: record.styles };
        addImage(content, record.screenshot, entry.label + ' · synthetic held request');
        content.append(node('p', 'Disabled: ' + (record.styles.disabled ? 'yes' : 'no') + ' · read-only: ' + (record.styles.readOnly ? 'yes' : 'no') + ' · opacity: ' + record.styles.opacity));
      } else if (entry.kind === 'proposal') {
        readout.textContent = 'PROPOSAL · ' + entry.face + 'px face'; proposal(content, entry.face);
        frame.measurement = { rect: { height: entry.face + 4 }, font: { renderedSizeEstimate: entry.face === 36 ? 14 : 16 }, proposal: true };
      } else if (entry.kind === 'blocker') {
        readout.textContent = 'RECORDED BLOCKER · 390px · light'; addImage(content, entry.image, family.title); content.append(node('p', family.summary));
      } else {
        readout.textContent = 'SOURCE ONLY · runtime verification pending';
        content.append(node('p', entry.source.source + ':' + entry.source.line));
        const code = node('pre', entry.source.code); code.className = 'audit-source-code'; content.append(code);
        content.append(node('p', 'No rendered size or successful interaction is inferred from this source.'));
      }
      onMeasure();
    };
    select.onchange = render; render(); return section;
  });
}
export function auditFacts(target, frames, familyId) {
  const values = ['', 'A', 'B'];
  for (const [label, get] of [
    [familyId === 'VC-B02-14' ? 'Text entry' : 'Height', m => Number(m.rect.height.toFixed(1)) + 'px'],
    [familyId === 'VC-B02-14' ? 'CSS text' : 'Text', m => m.font.renderedSizeEstimate === null ? 'Icon only' : (familyId === 'VC-B02-14' ? '' : '≈') + Number(m.font.renderedSizeEstimate.toFixed(1)) + 'px'],
    ['Fill', m => m.proposal ? 'Design sample' : m.value?.background || '—'],
    ['Border', m => m.value?.border || '—'],
    ['Focus', m => m.proposal ? 'Design sample' : m.value?.shadow && m.value.shadow !== 'none' ? 'Ring / shadow' : m.value?.outline || '—'],
  ]) values.push(label, ...[0, 1].map(index => frames[index]?.measurement ? get(frames[index].measurement) : '—'));
  target.replaceChildren(...values.map((value, index) => { const span = node('span', value); if (index < 3) span.className = 'fact-heading'; return span; }));
}
