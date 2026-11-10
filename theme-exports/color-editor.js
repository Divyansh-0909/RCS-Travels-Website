(() => {
  'use strict';
  const { foundations, brand, differences, tones, pages } = window.rcsPaletteSource;
  const storageKey = 'rcs.palette-draft.2026-11-03.v1';
  const tokens = new Map();
  const fields = [];
  let overrides = Object.create(null);
  let resetBackup = null;
  let storageAvailable = true;
  let fieldNumber = 0;
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const normalize = value => {
    const hex = String(value).trim().replace(/^#/, '');
    if (/^[\da-f]{3}$/i.test(hex)) return '#' + [...hex].map(c => c + c).join('').toUpperCase();
    return /^[\da-f]{6}$/i.test(hex) ? '#' + hex.toUpperCase() : null;
  };
  const register = (key, label, original) => {
    if (!tokens.has(key)) tokens.set(key, { key, label, original: normalize(window.rcsApprovedPalette?.[key] || original) });
    return key;
  };
  const brandKeys = brand.map(([label, color], i) => register(`brand.${i}`, `Shared brand: ${label}`, color));
  const foundationKeys = foundations.map(([label, light, dark], i) => [
    register(`foundation.${i}.light`, `Shared light: ${label}`, light),
    register(`foundation.${i}.dark`, `Shared dark: ${label}`, dark),
  ]);
  // Link by actual role, never merely by matching hex values.
  const differenceKeys = differences.map(([label, light, dark, app], i) => {
    if (i === 0) return [brandKeys[2], brandKeys[0], brandKeys[0]];
    if (i === 1) {
      const common = register('status.success', 'Light website / app: success', light);
      return [common, register('status.success.dark', 'Dark website: success', dark), common];
    }
    if (i === 2) return [brandKeys[6], brandKeys[8], brandKeys[6]];
    if (i === 3) {
      const common = register('status.warning', 'Light website / app: warning', light);
      return [common, register('status.warning.dark', 'Dark website: warning', dark), common];
    }
    if (i === 4) return [brandKeys[4], brandKeys[5], null];
    return [brandKeys[2], brandKeys[2], register('app.primaryLight', 'App: native primaryLight', app)];
  });
  const toneKeys = tones.map(([label, light, dark], i) => [brandKeys[10 + i], register(`tone.${i}.dark`, `Website dark: ${label} panel`, dark)]);
  const pageLinks = {
    '0.0': brandKeys[3], '0.1': foundationKeys[7][1], '0.3': foundationKeys[9][1], '0.5': brandKeys[9],
    '1.0': brandKeys[3], '2.0': brandKeys[3], '2.1': foundationKeys[1][0],
    '3.0': brandKeys[1], '4.2': brandKeys[1],
    '7.0': register('map.land.light', 'Shared maps: light land', '#B9B9BF'),
    '7.1': register('map.land.dark', 'Shared maps: dark land', '#2E2E38'),
    '7.6': register('map.route', 'Shared maps: route', '#7A94FF'),
  };
  const pageKeys = pages.map(([title, , colors], i) => colors.map(([label, color], j) => pageLinks[`${i}.${j}`] || register(`page.${i}.${j}`, `${title}: ${label}`, color)));
  // Keep all existing IDs and the storage key stable. New roles are additive.
  const originalTokenKeys = [...tokens.keys()];
  const responsibilityFields = [
    ['border', 'Card / panel border', '#D8D8DE', '#454552'],
    ['input-border', 'Input border', '#D8D8DE', '#454552'],
    ['input-background', 'Input background', '#E8E8EC', '#272635'],
    ['lookup-background', 'Case-ID input background', '#E8E8EC', '#272634'],
    ['focus-border', 'Focused input border', '#3067FD', '#243AFB'],
    ['disabled-background', 'Disabled input background', '#E8E8EC', '#262636'],
    ['disabled-border', 'Disabled input border', '#D8D8DE', '#363644'],
  ];
  const responsibilityKeys = responsibilityFields.map(([role, label, light, dark]) => [
    register(`responsibility-review.${role}.light`, `Responsibility review light: ${label}`, light),
    register(`responsibility-review.${role}.dark`, `Responsibility review dark: ${label}`, dark),
  ]);
  const value = key => overrides[key] || tokens.get(key).original;
  function editor(key, context) {
    const token = tokens.get(key);
    const id = `color-${fieldNumber++}`;
    const label = escape(context || token.label);
    return `<span class="color-field" data-token="${key}"><input id="${id}" type="color" value="${value(key)}" aria-label="${label}: color picker"><input type="text" value="${value(key)}" maxlength="7" spellcheck="false" autocomplete="off" aria-label="${label}: hex color" aria-describedby="hex-help"><button type="button" data-reset="${key}" aria-label="Restore ${label}" title="Restore original ${token.original}" disabled>↺</button></span>`;
  }
  function render() {
    document.querySelector('#foundations').innerHTML = ['Light mode', 'Dark mode'].map((title, mode) => `<article class="panel preview-panel" data-mode="${mode}"><h3>${title}</h3><small>Website + captain app</small><div class="ride-preview"><strong>Your next ride</strong><p>Pickup confirmed · 4 min away</p><div class="preview-actions"><span class="preview-action">Website action</span><span class="preview-action app">Captain app action</span></div><small class="preview-caption">Live color example</small></div>${foundations.map(([name], i) => `<div class="row"><span>${escape(name)}</span>${editor(foundationKeys[i][mode])}</div>`).join('')}</article>`).join('');
    document.querySelector('#brand').innerHTML = brand.map(([name], i) => `<article class="tile"><div class="paint" data-paint="${brandKeys[i]}"></div><div>${escape(name)}<br>${editor(brandKeys[i])}</div></article>`).join('');
    document.querySelector('#differences-body').innerHTML = differences.map(([label, ...cells], i) => `<tr><td>${escape(label)}</td>${cells.map((text, j) => `<td>${differenceKeys[i][j] ? editor(differenceKeys[i][j], `${label}, ${['website light', 'website dark', 'captain app'][j]}`) : escape(text)}</td>`).join('')}</tr>`).join('');
    document.querySelector('#tones').innerHTML = tones.map(([label], i) => `<tr><td>${escape(label)}</td>${toneKeys[i].map(key => `<td>${editor(key)}</td>`).join('')}</tr>`).join('');
    document.querySelector('#page-cards').innerHTML = pages.map(([title, note, colors, source], i) => `<article class="card"><h3>${escape(title)}</h3><p>${escape(note)}</p><div class="swatches">${colors.map(([label], j) => `<div class="mini"><span>${escape(label)}</span>${editor(pageKeys[i][j])}</div>`).join('')}</div><small class="source">${escape(source)}</small></article>`).join('');
    const help = document.createElement('p');
    help.id = 'hex-help';
    help.className = 'muted';
    help.textContent = 'Hex values accept 3 or 6 digits, with or without #. Use ↺ to restore one color. Shared brand roles update their linked swatches.';
    document.querySelector('.editor-toolbar').after(help);
    fields.push(...document.querySelectorAll('.color-field'));
  }
  const validated = entries => {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('Expected a palette colors object.');
    const clean = Object.create(null);
    for (const [key, color] of Object.entries(entries)) {
      if (!tokens.has(key) || !normalize(color)) throw new Error('The file contains an unknown color role or invalid hex value.');
      if (normalize(color) !== tokens.get(key).original) clean[key] = normalize(color);
    }
    return clean;
  };
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) overrides = validated(JSON.parse(saved));
  } catch { storageAvailable = false; }
  render();
  const responsibilityNav = document.createElement('a');
  responsibilityNav.href = '#responsibility-fields';
  responsibilityNav.textContent = 'Responsibility inputs';
  document.querySelector('nav').append(responsibilityNav);
  document.querySelector('#responsibility-previews').innerHTML = ['Light mode', 'Dark mode'].map((title, mode) => `
    <article class="panel responsibility-palette" data-responsibility-mode="${mode}">
      <h3>${title}</h3>
      <div class="responsibility-sample">
        <strong>Responsibility review</strong>
        <label>Case ID<input class="review-lookup" value="Example case" aria-label="${title}: case ID preview" readonly></label>
        <label>Review note<input class="review-input" placeholder="Click here to preview the focus border" aria-label="${title}: review input preview"></label>
        <label>Disabled field<input class="review-disabled" value="Review unavailable" aria-label="${title}: disabled field preview" disabled></label>
      </div>
      ${responsibilityFields.map(([, label], i) => `<div class="row"><span>${escape(label)}</span>${editor(responsibilityKeys[i][mode])}</div>`).join('')}
    </article>`).join('');
  fields.push(...document.querySelectorAll('#responsibility-previews .color-field'));
  const status = document.querySelector('#editor-status');
  function announce(message, error = false) {
    status.textContent = message;
    status.classList.toggle('editor-error', error);
  }
  function sync() {
    for (const field of fields) {
      const color = value(field.dataset.token);
      for (const input of field.querySelectorAll('input')) {
        if (input !== document.activeElement) {
          input.value = color;
          input.removeAttribute('aria-invalid');
          input.setCustomValidity('');
        }
      }
      field.querySelector('button').disabled = !overrides[field.dataset.token];
    }
    document.querySelectorAll('[data-paint]').forEach(el => el.style.setProperty('--c', value(el.dataset.paint)));
    document.querySelectorAll('[data-mode]').forEach(panel => {
      const mode = Number(panel.dataset.mode);
      for (const [name, index] of [['canvas', 0], ['surface', 1], ['ink', 4], ['muted', 5], ['border', 6]]) panel.style.setProperty(`--preview-${name}`, value(foundationKeys[index][mode]));
      panel.style.setProperty('--preview-primary', value(differenceKeys[0][mode]));
      panel.style.setProperty('--preview-app-primary', value(brandKeys[0]));
    });
    document.querySelectorAll('[data-responsibility-mode]').forEach(panel => {
      const mode = Number(panel.dataset.responsibilityMode);
      responsibilityFields.forEach(([role], index) => panel.style.setProperty(`--review-${role}`, value(responsibilityKeys[index][mode])));
      panel.style.setProperty('--review-surface', value(mode ? brandKeys[3] : foundationKeys[1][0]));
      panel.style.setProperty('--review-ink', value(foundationKeys[4][mode]));
      panel.style.setProperty('--review-muted', value(foundationKeys[5][mode]));
    });
    document.querySelector('#reset-palette').disabled = !Object.keys(overrides).length;
    document.querySelector('#undo-reset').hidden = !resetBackup;
  }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(overrides)); storageAvailable = true; }
    catch { storageAvailable = false; }
    sync();
    const count = Object.keys(overrides).length;
    announce(`${count ? `${count} edited color${count === 1 ? '' : 's'}` : 'Original source colors'} · ${storageAvailable ? 'Saved in this browser' : 'Browser storage unavailable; export to keep changes'}`);
  }
  function change(input, final = false) {
    const key = input.closest('.color-field').dataset.token;
    const color = normalize(input.value);
    if (!color) {
      if (final) {
        input.setAttribute('aria-invalid', 'true');
        input.setCustomValidity('Enter a 3- or 6-digit hex color, such as #243AFB.');
        announce('Enter a valid hex color. The preview keeps the last valid value.', true);
      }
      return;
    }
    input.removeAttribute('aria-invalid');
    input.setCustomValidity('');
    if (final) input.value = color;
    if (color === tokens.get(key).original) delete overrides[key]; else overrides[key] = color;
    save();
  }
  document.addEventListener('input', event => {
    if (event.target.matches('.color-field input')) change(event.target);
  });
  document.addEventListener('change', event => {
    if (event.target.matches('.color-field input')) change(event.target, true);
  });
  document.addEventListener('focusout', event => {
    if (event.target.matches('.color-field input[type=text]')) change(event.target, true);
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-reset]');
    if (button) { delete overrides[button.dataset.reset]; save(); }
  });
  document.querySelector('#reset-palette').addEventListener('click', () => {
    resetBackup = { ...overrides }; overrides = Object.create(null); save();
  });
  document.querySelector('#undo-reset').addEventListener('click', () => {
    overrides = validated(resetBackup); resetBackup = null; save();
  });
  document.querySelector('#export-palette').addEventListener('click', () => {
    const draft = {
      schemaVersion: 1, sourceSnapshot: '2026-11-03', exportedAt: new Date().toISOString(),
      description: 'RCS palette draft. Applying this file to the app and website is a separate step.',
      colors: Object.fromEntries([...tokens.keys()].map(key => [key, value(key)])),
      changes: [...tokens.values()].filter(token => overrides[token.key]).map(token => ({ ...token, value: value(token.key) })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'rcs-palette-draft.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('Palette exported. Import this JSON to restore the draft later.');
  });
  const fileInput = document.querySelector('#palette-file');
  document.querySelector('#import-palette').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    try {
      const file = fileInput.files[0]; if (!file) return;
      if (file.size > 256 * 1024) throw new Error('Choose a palette JSON file smaller than 256 KB.');
      const draft = JSON.parse(await file.text());
      if (draft.schemaVersion !== 1 || draft.sourceSnapshot !== '2026-11-03') throw new Error('Choose a JSON export from this palette editor.');
      validated(draft.colors);
      if (!originalTokenKeys.every(key => Object.hasOwn(draft.colors, key))) throw new Error('This palette is missing color roles.');
      // Older exports have no review-field roles. Retain any newer draft edits.
      overrides = validated({ ...overrides, ...draft.colors }); resetBackup = null; save();
    } catch (error) { announce(`Import failed: ${error.message}`, true); }
    finally { fileInput.value = ''; }
  });
  sync();
  announce(`${Object.keys(overrides).length} edited colors${storageAvailable ? ' · Drafts save in this browser' : ' · Browser storage unavailable; export to keep changes'}`);
})();
