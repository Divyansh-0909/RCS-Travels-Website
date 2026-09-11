import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { atlasData } from './generated-atlas.js';
import './styles.css';

cytoscape.use(dagre);

const ROOT_STORAGE_KEY = 'rcs-code-atlas.repo-root';
const normalizeRoot = (value) => {
  const pathname = String(value || '').trim().replace(/\\/g, '/');
  if (!/^(?:[a-z]:\/|\/)/i.test(pathname)) return '';
  return pathname.replace(/\/+$/, '') || '/';
};
const rootFromStaticFile = () => {
  if (window.location.protocol !== 'file:') return '';
  let pathname;
  try { pathname = decodeURIComponent(window.location.pathname).replace(/\\/g, '/'); } catch { return ''; }
  const suffix = '/tools/code-atlas/dist/index.html';
  if (!pathname.toLowerCase().endsWith(suffix)) return '';
  // file:///C:/repo/... has a leading slash, while POSIX paths must keep theirs.
  return normalizeRoot(pathname.slice(0, -suffix.length).replace(/^\/([a-z]:\/)/i, '$1'));
};
const configuredRoot = normalizeRoot(new URLSearchParams(window.location.search).get('root'));
if (configuredRoot) window.localStorage.setItem(ROOT_STORAGE_KEY, configuredRoot);
const REPO_ROOT = configuredRoot || rootFromStaticFile() || normalizeRoot(window.localStorage.getItem(ROOT_STORAGE_KEY));
const VIEWS = [
  ['overview', 'Overview'], ['files', 'Files'], ['requests', 'Requests'],
  ['data', 'Data'], ['symbols', 'Symbols'], ['impact', 'Impact'],
];
const VIEW_TYPES = {
  files: ['file'],
  requests: ['clientendpoint', 'serverendpoint', 'routehandler', 'uiroute'],
  data: ['prismamodel'],
  symbols: ['function', 'component', 'class', 'hook', 'context', 'zustandstore'],
};
const TYPE_ICONS = {
  file: 'F', module: 'M', component: 'C', page: 'P', route: 'R', endpoint: 'R',
  request: '→', middleware: 'M', service: 'S', api: 'A', model: 'D', database: 'D',
  schema: 'D', enum: 'E', migration: 'Δ', function: 'ƒ', method: 'ƒ', variable: 'V',
  class: 'K', hook: 'H', store: 'S', context: 'C', symbol: '•',
};
Object.assign(TYPE_ICONS, {
  clientendpoint: '>', serverendpoint: 'R', routehandler: 'R', uiroute: 'P',
  prismamodel: 'D', function: 'fn', zustandstore: 'S', sourcetext: 'T', symbol: '*',
});

const source = {
  meta: atlasData?.meta || {},
  nodes: Array.isArray(atlasData?.nodes) ? atlasData.nodes : [],
  edges: Array.isArray(atlasData?.edges) ? atlasData.edges : [],
  diagnostics: Array.isArray(atlasData?.diagnostics) ? atlasData.diagnostics : [],
};
const nodeById = new Map(source.nodes.filter((node) => node?.id).map((node) => [node.id, node]));
const state = {
  view: 'overview', search: '', surfaces: new Set(), selectedId: null,
  impact: false, confidence: new Set(['confirmed', 'inferred', 'dynamic']),
};
let cy;
let graphResizeObserver;
let searchDrawTimer;
const FAST_CTRL_ZOOM_RATE = 0.014;
const FAST_CTRL_ZOOM_DELTA_LIMIT = 80;

const esc = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));
const label = (node) => node?.label || node?.path?.split(/[\\/]/).pop() || node?.id || 'Untitled item';
const sourceTextGraphLabel = (node) => {
  const copy = label(node);
  const excerpt = copy.length > 32 ? `${copy.slice(0, 29).trimEnd()}…` : copy;
  const filename = node?.path?.split(/[\\/]/).pop() || 'source';
  return `${filename}${node?.line ? `:${node.line}` : ''}\n“${excerpt}”`;
};
const normal = (value) => String(value || '').trim().toLowerCase();
// Copy often includes typography that people do not type into a search field. Keep
// path separators intact for endpoint searches, but make quotes, punctuation, and
// whitespace harmless for human-facing page text.
const normalSearch = (value) => normal(value)
  .replace(/[\u2018\u2019']/g, '')
  .replace(/[.!?,;:]+(?=\s|$)/g, '')
  .replace(/\s+/g, ' ');
const nodeType = (node) => normal(node?.type) || 'symbol';
const typeName = (node) => nodeType(node) === 'sourcetext' ? 'source text' : (node?.type || 'item');
const confidenceOf = (edge) => normal(edge?.confidence) || 'inferred';
const relLabel = (edge) => edge?.label || edge?.type || 'relates to';
const detailText = (node) => {
  const details = node?.details;
  if (typeof details === 'string') return details;
  if (nodeType(node) === 'sourcetext' && details && typeof details === 'object') {
    const rawKind = String(details.kind || '').trim();
    const kind = /^translation/i.test(rawKind) ? 'translation' : rawKind;
    const owner = details.containingSymbolLabel || details.owner;
    return [
      kind && `Kind: ${kind}`,
      owner && `Owner: ${owner}`,
      details.locale && `Locale: ${details.locale}`,
    ].filter(Boolean).join('\n');
  }
  if (details && typeof details === 'object') return Object.entries(details).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`).join('\n');
  return '';
};
const surfaceOf = (node) => node?.surface || node?.group || 'Other';
const absolutePath = (path) => {
  if (!path) return '';
  const normalizedPath = String(path).replace(/\\/g, '/');
  if (/^(?:[a-z]:\/|\/)/i.test(normalizedPath)) return normalizedPath;
  return REPO_ROOT ? `${REPO_ROOT}/${normalizedPath.replace(/^\/+/, '')}` : normalizedPath;
};

function matchView(node) {
  const type = nodeType(node);
  // Source copy is deliberately search-only. It is useful as an exact navigation
  // result, but showing every string literal makes each architectural view noisy.
  if (type === 'sourcetext') return Boolean(state.search);
  if (state.view === 'overview' || state.view === 'impact') return true;
  const candidates = VIEW_TYPES[state.view] || [];
  if (candidates.includes(type)) return true;
  const fields = `${type} ${normal(node?.group)}`;
  return candidates.some((candidate) => fields.includes(candidate));
}

function matchesSearch(node) {
  const query = normalSearch(state.search);
  if (!query) return true;
  return normalSearch(`${label(node)} ${node?.path || ''} ${detailText(node)} ${node?.type || ''}`).includes(query);
}

function getFilteredNodes() {
  return source.nodes.filter((node) => matchView(node)
    && (!state.surfaces.size || state.surfaces.has(surfaceOf(node)))
    && matchesSearch(node));
}

function candidateNodes() {
  return source.nodes.filter((node) => matchView(node)
    && (!state.surfaces.size || state.surfaces.has(surfaceOf(node))));
}

function edgeAllowed(edge, allowedIds) {
  return allowedIds.has(edge?.source) && allowedIds.has(edge?.target) && state.confidence.has(confidenceOf(edge));
}

function dependentsOf(id) {
  const collected = new Set([id]);
  const pending = [id];
  while (pending.length) {
    const current = pending.shift();
    source.edges.forEach((edge) => {
      // source depends on target: changing target can affect its source.
      if (edge?.target === current && !collected.has(edge.source)) {
        collected.add(edge.source);
        pending.push(edge.source);
      }
    });
  }
  return collected;
}

function graphData() {
  let nodes = candidateNodes().filter(matchesSearch);
  if ((state.impact || state.view === 'impact') && state.selectedId) {
    const affected = dependentsOf(state.selectedId);
    nodes = nodes.filter((node) => affected.has(node.id));
  }
  const selected = nodeById.get(state.selectedId);
  const total = nodes.length;
  const exactNodes = nodes;
  const existingIds = new Set(exactNodes.map((node) => node.id));
  const contextIds = new Set();
  const addContext = (id) => source.edges.forEach((edge) => {
    if (!state.confidence.has(confidenceOf(edge))) return;
    if (edge.source === id) contextIds.add(edge.target);
    if (edge.target === id) contextIds.add(edge.source);
  });
  if (state.search) exactNodes.forEach((node) => addContext(node.id));
  if (selected) { existingIds.add(selected.id); addContext(selected.id); }
  const contextNodes = [...contextIds].map((id) => nodeById.get(id)).filter(Boolean)
    .filter((node) => !existingIds.has(node.id));
  const priority = { serverendpoint: 7, routehandler: 7, clientendpoint: 6, uiroute: 6, prismamodel: 5, component: 4, hook: 4, context: 4, zustandstore: 4, function: 3, class: 2, file: 1 };
  const degree = new Map();
  source.edges.forEach((edge) => {
    if (!state.confidence.has(confidenceOf(edge))) return;
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  });
  const usefulFirst = (a, b) => ((degree.get(b.id) || 0) * 10 + (priority[nodeType(b)] || 0))
    - ((degree.get(a.id) || 0) * 10 + (priority[nodeType(a)] || 0)) || label(a).localeCompare(label(b));
  const query = normalSearch(state.search);
  const searchFirst = (a, b) => {
    const score = (node) => {
      const copy = normalSearch(label(node));
      const kind = normal(node?.details?.kind);
      let value = copy === query ? 10000 : copy.startsWith(query) ? 8000 : copy.includes(query) ? 6000 : 0;
      // A literal in a UI source file normally takes a developer to the rendered
      // page faster than a translation catalog entry with the same copy.
      if (nodeType(node) === 'sourcetext' && kind === 'string') value += 500;
      if (/\.(?:[cm]?[jt]sx?|vue|svelte)$/i.test(node?.path || '')) value += 250;
      if (kind === 'translationvalue' || kind === 'translationkey') value -= 300;
      return value;
    };
    return score(b) - score(a) || usefulFirst(a, b);
  };
  const sortedExact = exactNodes.slice().sort(state.search ? searchFirst : usefulFirst);
  const selectedNodes = selected && !sortedExact.some((node) => node.id === selected.id) ? [selected] : [];
  // The scanner can index many thousands of source strings. Keep search results
  // navigable without letting a broad query create an unusable Cytoscape graph.
  const compactViewport = window.matchMedia('(max-width: 600px)').matches;
  const overviewCap = compactViewport ? 28 : 48;
  const searchExactCap = compactViewport ? 40 : 80;
  const searchContextCap = compactViewport ? 6 : 10;
  const visibleExact = state.search
    ? sortedExact.slice(0, Math.max(0, searchExactCap - selectedNodes.length))
    : sortedExact.slice(0, Math.max(0, overviewCap - selectedNodes.length));
  const contextCap = state.search
    ? searchContextCap
    : Math.max(0, overviewCap - visibleExact.length - selectedNodes.length);
  nodes = [...selectedNodes, ...visibleExact, ...contextNodes.sort(usefulFirst).slice(0, contextCap)];
  const ids = new Set(nodes.map((node) => node.id));
  const exactIds = new Set(exactNodes.map((node) => node.id));
  const contextCount = nodes.filter((node) => !exactIds.has(node.id)).length;
  return { nodes, edges: source.edges.filter((edge) => edgeAllowed(edge, ids)), total, contextCount, visibleExactCount: visibleExact.length };
}

function renderShell() {
  const app = document.querySelector('#app');
  const surfaces = [...new Set(source.nodes.map(surfaceOf))].sort();
  app.innerHTML = `
    <div class="atlas-shell">
      <header class="topbar">
        <div class="brand" aria-label="RCS Code Atlas">
          <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
          <span><strong>RCS</strong><small>CODE ATLAS</small></span>
        </div>
        <div class="topbar-title"><strong>${esc(source.meta.projectName || 'RCS Travels')}</strong><span>System navigator</span></div>
        <label class="search" for="atlas-search">
          <span aria-hidden="true">⌕</span>
          <input id="atlas-search" type="search" autocomplete="off" placeholder="Search files, code, routes, or page text…" />
          <kbd>⌘ K</kbd>
        </label>
        <button id="diagnostics-button" class="quiet-button diagnostics-button" type="button" aria-label="View scanner diagnostics">Diagnostics <span>${source.diagnostics.length}</span></button>
      </header>

      <nav class="viewbar" aria-label="Atlas views">
        <div class="view-tabs">${VIEWS.map(([id, text]) => `<button class="view-tab ${id === state.view ? 'is-active' : ''}" data-view="${id}" type="button">${text}</button>`).join('')}</div>
        <div class="generated-status" title="The scan timestamp is recorded in generated atlas data"><span class="status-dot"></span>${source.meta.generatedAt ? `Updated ${esc(new Date(source.meta.generatedAt).toLocaleString())}` : 'Awaiting first scan'}</div>
      </nav>

      <main class="atlas-main">
        <aside class="left-rail" aria-label="Atlas controls">
          <section class="overview-panel">
            <div class="section-heading"><span>System overview</span><span class="muted">${source.nodes.length} items</span></div>
            <div class="stats" id="stats"></div>
          </section>
          <section class="filter-panel">
            <div class="section-heading"><span>Surfaces</span><button id="clear-surfaces" class="text-button" type="button">Clear</button></div>
            <div id="surface-filters" class="filter-list">${surfaces.length ? surfaces.map((surface) => `<label class="check-row"><input type="checkbox" value="${esc(surface)}" /><span></span>${esc(surface)}</label>`).join('') : '<p class="empty-copy">No surface tags found yet.</p>'}</div>
          </section>
          <section class="filter-panel confidence-panel">
            <div class="section-heading"><span>Connection confidence</span></div>
            <div class="legend">
              <label class="legend-row"><input type="checkbox" value="confirmed" checked /><i class="edge confirmed"></i><span>Confirmed</span><small>resolved</small></label>
              <label class="legend-row"><input type="checkbox" value="inferred" checked /><i class="edge inferred"></i><span>Inferred</span><small>project match</small></label>
              <label class="legend-row"><input type="checkbox" value="dynamic" checked /><i class="edge dynamic"></i><span>Dynamic</span><small>runtime</small></label>
            </div>
          </section>
        </aside>

        <section class="graph-area" aria-label="Code relationship graph">
          <div class="graph-toolbar">
            <div><span id="result-count" class="result-count"></span><span id="graph-caption" class="graph-caption"></span></div>
            <div class="toolbar-actions">
              <button id="impact-toggle" class="tool-button" type="button" aria-pressed="false" title="Show all transitive dependents of the selected item">Impact chain</button>
              <button id="fit-graph" class="tool-button icon-tool" type="button" aria-label="Fit graph to view" title="Fit graph">⌗</button>
              <button id="reset-graph" class="tool-button icon-tool" type="button" aria-label="Reset graph selection and view" title="Reset graph">↺</button>
            </div>
          </div>
          <div id="atlas-graph" class="graph" tabindex="0" role="application" aria-label="Interactive code relationship graph. Click a node for details. Scroll to zoom, or hold Control while scrolling for fast zoom. Press F to fit or R to reset."></div>
          <div id="graph-empty" class="graph-empty" hidden></div>
          <div class="graph-key"><span class="node-key component">C</span> Components <span class="node-key route">R</span> Routes <span class="node-key model">D</span> Data <span class="graph-hint">Drag to pan · Scroll to zoom · Ctrl + scroll for fast zoom · Select an item to trace it</span></div>
        </section>

        <aside class="detail-panel" aria-live="polite" aria-label="Selected item details" id="detail-panel"></aside>
      </main>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
      <dialog id="diagnostics-dialog" class="diagnostics-dialog"><div class="dialog-head"><div><span class="eyebrow">Scanner report</span><h2>Diagnostics</h2></div><button class="tool-button icon-tool" data-close-dialog type="button" aria-label="Close diagnostics">×</button></div><div id="diagnostics-list"></div></dialog>
    </div>`;
  bindControls();
  renderStats();
  renderDetail();
  renderDiagnostics();
  drawGraph();
}

function renderStats() {
  const counts = source.meta?.totals || {};
  const number = (key, fallback) => counts[key] ?? fallback;
  const symbols = source.nodes.filter((node) => VIEW_TYPES.symbols.includes(nodeType(node))).length;
  const routes = source.nodes.filter((node) => VIEW_TYPES.requests.includes(nodeType(node))).length;
  document.querySelector('#stats').innerHTML = [
    ['Files', number('files', source.nodes.filter((node) => ['file', 'module'].includes(nodeType(node))).length)],
    ['Symbols', number('symbols', symbols)],
    ['Routes', number('routes', routes)],
    ['Links', number('edges', source.edges.length)],
  ].map(([name, value]) => `<button type="button" class="stat" data-stat-view="${normal(name)}"><strong>${esc(value)}</strong><span>${name}</span></button>`).join('');
  document.querySelectorAll('[data-stat-view]').forEach((button) => button.addEventListener('click', () => {
    const name = button.dataset.statView;
    const target = name === 'files' ? 'files' : name === 'symbols' ? 'symbols' : name === 'routes' ? 'requests' : 'overview';
    setView(target);
  }));
}

function renderDetail() {
  const panel = document.querySelector('#detail-panel');
  const node = nodeById.get(state.selectedId);
  if (!node) {
    panel.innerHTML = `<div class="detail-empty"><span class="compass" aria-hidden="true">⌖</span><h2>Find your starting point</h2><p>Select a node, or search for a file, function, route, or data model.</p><p class="detail-tip">The atlas then shows where it lives and which parts may be affected.</p></div>`;
    return;
  }
  const incoming = source.edges.filter((edge) => edge?.target === node.id);
  const outgoing = source.edges.filter((edge) => edge?.source === node.id);
  const impactCount = dependentsOf(node.id).size - 1;
  const path = node.path || 'Path unavailable';
  const canOpenInVSCode = Boolean(node.path && REPO_ROOT);
  const vscodeAction = canOpenInVSCode
    ? `<a class="action-button primary" href="vscode://file/${encodeURI(absolutePath(node.path))}${node.line ? `:${node.line}` : ''}">Open in VS Code</a>`
    : '<button class="action-button primary" type="button" disabled title="Set an absolute ?root= path to enable this action">Open in VS Code (set ?root=…)</button>';
  panel.innerHTML = `
    <div class="detail-head"><span class="type-chip ${esc(nodeType(node))}">${esc(TYPE_ICONS[nodeType(node)] || '•')} ${esc(typeName(node))}</span><button id="close-detail" class="tool-button icon-tool" type="button" aria-label="Close detail panel">×</button></div>
    <h1 title="${esc(label(node))}">${esc(label(node))}</h1>
    <p class="detail-location"><code>${esc(path)}</code>${node.line ? `<span>line ${esc(node.line)}</span>` : ''}</p>
    <div class="detail-actions"><button id="copy-path" class="action-button" type="button" ${node.path ? '' : 'disabled'}>Copy path</button>${vscodeAction}</div>
    ${detailText(node) ? `<section class="detail-section"><h2>About this item</h2><p class="details-text">${esc(detailText(node))}</p></section>` : ''}
    <section class="impact-summary"><span>Change impact</span><strong>${impactCount} dependent${impactCount === 1 ? '' : 's'}</strong><button id="trace-impact" class="text-button" type="button">Trace chain</button></section>
    ${relationList('Used by', incoming, 'source')}
    ${relationList('Uses', outgoing, 'target')}
  `;
  panel.querySelector('#close-detail').addEventListener('click', () => selectNode(null));
  panel.querySelector('#copy-path')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(absolutePath(path)); showToast(REPO_ROOT ? 'Absolute path copied' : 'Relative path copied — set ?root=… for absolute paths'); } catch { showToast('Could not copy path'); }
  });
  panel.querySelector('#trace-impact')?.addEventListener('click', () => {
    enterImpact();
  });
  panel.querySelectorAll('[data-related]').forEach((button) => button.addEventListener('click', () => selectNode(button.dataset.related)));
}

function relationList(title, edges, end) {
  if (!edges.length) return `<section class="detail-section relation-section"><h2>${title} <small>0</small></h2><p class="empty-copy">No ${title.toLowerCase()} relationships recorded.</p></section>`;
  const items = edges.slice(0, 8).map((edge) => {
    const related = nodeById.get(edge[end]);
    return `<button type="button" class="relation" data-related="${esc(edge[end])}"><span class="relation-icon ${esc(nodeType(related))}">${esc(TYPE_ICONS[nodeType(related)] || '•')}</span><span><strong>${esc(label(related))}</strong><small>${esc(relLabel(edge))}</small></span><em class="confidence ${esc(confidenceOf(edge))}">${esc(confidenceOf(edge))}</em></button>`;
  }).join('');
  return `<section class="detail-section relation-section"><h2>${title} <small>${edges.length}</small></h2><div class="relation-list">${items}</div>${edges.length > 8 ? `<p class="more-copy">+ ${edges.length - 8} more relationships in the graph</p>` : ''}</section>`;
}

function drawGraph() {
  const graph = document.querySelector('#atlas-graph');
  const empty = document.querySelector('#graph-empty');
  const { nodes, edges, total, contextCount, visibleExactCount } = graphData();
  const shownSuffix = total > visibleExactCount ? ` · showing ${visibleExactCount} matches` : '';
  document.querySelector('#result-count').textContent = `${total} result${total === 1 ? '' : 's'}${shownSuffix}`;
  const contextSuffix = contextCount ? ` · ${contextCount} connected context item${contextCount === 1 ? '' : 's'}` : '';
  document.querySelector('#graph-caption').textContent = state.impact && state.selectedId ? ` · transitive dependent chain${contextSuffix}` : state.search ? ` · exact matches${contextSuffix}` : contextSuffix;
  document.querySelector('#impact-toggle').classList.toggle('is-active', state.impact);
  document.querySelector('#impact-toggle').setAttribute('aria-pressed', String(state.impact));
  if (graphResizeObserver) graphResizeObserver.disconnect();
  if (cy) cy.destroy();
  if (!nodes.length) {
    graph.hidden = true; empty.hidden = false;
    empty.innerHTML = `<div><span class="compass">⌖</span><h2>No atlas items here</h2><p>${source.nodes.length ? 'Try another view, surface, or search term.' : 'Run the scanner to generate the first project map.'}</p>${state.search || state.surfaces.size ? '<button id="clear-filters" class="action-button primary" type="button">Clear filters</button>' : ''}</div>`;
    empty.querySelector('#clear-filters')?.addEventListener('click', clearFilters);
    return;
  }
  graph.hidden = false; empty.hidden = true;
  cy = cytoscape({
    container: graph,
    elements: [
      ...nodes.map((node) => ({ data: { id: node.id, label: nodeType(node) === 'sourcetext' ? sourceTextGraphLabel(node) : label(node), type: nodeType(node), surface: surfaceOf(node) } })),
      ...edges.map((edge, index) => ({ data: { id: edge.id || `edge-${index}`, source: edge.source, target: edge.target, confidence: confidenceOf(edge), label: relLabel(edge) } })),
    ],
    style: [
      { selector: 'node', style: { 'background-color': '#343449', label: 'data(label)', color: '#f3f3f3', 'font-family': 'PP Mori, Poppins, sans-serif', 'font-size': 10, 'font-weight': 600, 'text-valign': 'bottom', 'text-margin-y': 7, 'text-max-width': 110, 'text-wrap': 'ellipsis', width: 28, height: 28, 'border-width': 2, 'border-color': '#5d5d78' } },
      { selector: 'node[type = "component"], node[type = "uiroute"]', style: { 'background-color': '#243AFB', 'border-color': '#7A94FF' } },
      { selector: 'node[type = "clientendpoint"], node[type = "serverendpoint"], node[type = "routehandler"]', style: { 'background-color': '#0d806f', 'border-color': '#66c8bb' } },
      { selector: 'node[type = "prismamodel"]', style: { 'background-color': '#9a6817', 'border-color': '#f0bb61' } },
      { selector: 'node[type = "function"], node[type = "hook"], node[type = "context"], node[type = "zustandstore"], node[type = "class"]', style: { 'background-color': '#7944a6', 'border-color': '#c295ed' } },
      { selector: 'node[type = "sourcetext"]', style: { shape: 'round-rectangle', width: 34, height: 26, 'background-color': '#6f4a13', 'border-color': '#f0bf62', color: '#fff2d5', 'font-size': 9, 'font-weight': 700, 'text-wrap': 'wrap', 'text-max-width': 164, 'text-halign': 'center', 'text-valign': 'bottom', 'text-margin-y': 8 } },
      { selector: 'edge', style: { width: 1.4, 'line-color': '#5d5d78', 'target-arrow-color': '#5d5d78', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', opacity: 0.76 } },
      { selector: 'edge[confidence = "confirmed"]', style: { 'line-color': '#8896ff', 'target-arrow-color': '#8896ff' } },
      { selector: 'edge[confidence = "dynamic"]', style: { 'line-style': 'dashed', 'line-color': '#d9a447', 'target-arrow-color': '#d9a447' } },
      { selector: '.selected', style: { 'border-color': '#ffffff', 'border-width': 4, 'overlay-color': '#243AFB', 'overlay-opacity': 0.22, 'overlay-padding': 9 } },
      { selector: '.neighbor', style: { 'border-color': '#a9b6ff', 'border-width': 3 } },
      { selector: '.faded', style: { opacity: 0.15 } },
    ],
    layout: { name: 'preset' },
    minZoom: 0.25, maxZoom: 2.5, wheelSensitivity: 0.18,
  });
  cy.on('tap', 'node', (event) => selectNode(event.target.id()));
  cy.on('tap', (event) => { if (event.target === cy) selectNode(null); });
  const fitGraph = () => {
    if (!cy || graph.clientWidth < 1 || graph.clientHeight < 1) return;
    cy.fit(undefined, window.matchMedia('(max-width: 600px)').matches ? 28 : 38);
    applyHighlight();
  };
  cy.one('layoutstop', fitGraph);
  cy.layout({ name: 'dagre', rankDir: 'LR', nodeSep: 52, rankSep: 86, padding: 42, fit: false, animate: false, ranker: 'network-simplex', sort: (a, b) => a.id().localeCompare(b.id) }).run();
  graphResizeObserver = new ResizeObserver(() => window.requestAnimationFrame(fitGraph));
  graphResizeObserver.observe(graph);
}

function applyHighlight() {
  if (!cy) return;
  cy.elements().removeClass('selected neighbor faded');
  if (!state.selectedId || !cy.$id(state.selectedId).length) return;
  const selected = cy.$id(state.selectedId);
  const neighborhood = selected.closedNeighborhood();
  neighborhood.nodes().not(selected).addClass('neighbor');
  selected.addClass('selected');
  // Impact already limits the graph to the dependent chain. Keep that complete
  // chain legible while still emphasizing the selected item and direct links.
  if (!state.impact) cy.elements().not(neighborhood).addClass('faded');
}

function setView(view) { state.view = view; if (view !== 'impact') state.impact = false; refresh(); }
function selectNode(id) { state.selectedId = id; renderDetail(); drawGraph(); }
function clearSearch() {
  window.clearTimeout(searchDrawTimer);
  state.search = '';
  const input = document.querySelector('#atlas-search');
  if (input) input.value = '';
}
function enterImpact() {
  clearSearch();
  state.impact = true;
  state.view = 'impact';
  refresh();
}
function refresh() {
  window.clearTimeout(searchDrawTimer);
  document.querySelectorAll('.view-tab').forEach((button) => button.classList.toggle('is-active', button.dataset.view === state.view));
  renderDetail(); drawGraph();
}
function clearFilters() {
  clearSearch(); state.surfaces.clear(); state.confidence = new Set(['confirmed', 'inferred', 'dynamic']);
  document.querySelectorAll('#surface-filters input').forEach((input) => { input.checked = false; });
  document.querySelectorAll('.legend input').forEach((input) => { input.checked = true; }); refresh();
}
function showToast(message) { const toast = document.querySelector('#toast'); toast.textContent = message; toast.classList.add('show'); window.setTimeout(() => toast.classList.remove('show'), 1800); }

function fastCtrlZoom(event) {
  if (!event.ctrlKey || !cy) return;
  // A pixel delta is the normal unit, but line/page units still occur with some
  // mouse drivers. Normalize them so trackpads keep their smooth progression.
  const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? window.innerHeight : 1;
  const delta = Math.max(-FAST_CTRL_ZOOM_DELTA_LIMIT, Math.min(FAST_CTRL_ZOOM_DELTA_LIMIT, event.deltaY * unit));
  if (!delta) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const bounds = event.currentTarget.getBoundingClientRect();
  const currentZoom = cy.zoom();
  const nextZoom = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), currentZoom * Math.exp(-delta * FAST_CTRL_ZOOM_RATE)));
  if (nextZoom === currentZoom) return;
  cy.zoom({
    level: nextZoom,
    renderedPosition: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
  });
}

function renderDiagnostics() {
  const list = document.querySelector('#diagnostics-list');
  list.innerHTML = source.diagnostics.length
    ? `<ul>${source.diagnostics.map((item) => `<li><strong>${esc(item?.level || item?.type || 'Notice')}</strong><span>${esc(typeof item === 'string' ? item : item?.message || JSON.stringify(item))}</span></li>`).join('')}</ul>`
    : '<div class="diagnostic-empty"><span>✓</span><p>No scanner diagnostics. The current atlas has no reported analysis issues.</p></div>';
}

function bindControls() {
  document.querySelector('#atlas-search').addEventListener('input', (event) => {
    state.search = event.target.value;
    window.clearTimeout(searchDrawTimer);
    searchDrawTimer = window.setTimeout(drawGraph, 150);
  });
  document.querySelectorAll('.view-tab').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  document.querySelectorAll('#surface-filters input').forEach((input) => input.addEventListener('change', () => { input.checked ? state.surfaces.add(input.value) : state.surfaces.delete(input.value); drawGraph(); }));
  document.querySelectorAll('.legend input').forEach((input) => input.addEventListener('change', () => { input.checked ? state.confidence.add(input.value) : state.confidence.delete(input.value); drawGraph(); }));
  document.querySelector('#clear-surfaces').addEventListener('click', () => { state.surfaces.clear(); document.querySelectorAll('#surface-filters input').forEach((input) => { input.checked = false; }); drawGraph(); });
  document.querySelector('#impact-toggle').addEventListener('click', () => {
    if (!state.selectedId) { showToast('Select an item to trace its impact'); return; }
    if (!state.impact) { enterImpact(); return; }
    state.impact = false; state.view = 'overview'; refresh();
  });
  document.querySelector('#fit-graph').addEventListener('click', () => cy?.fit(undefined, 38));
  document.querySelector('#reset-graph').addEventListener('click', () => { state.selectedId = null; state.impact = false; state.view = 'overview'; refresh(); });
  const graph = document.querySelector('#atlas-graph');
  graph.addEventListener('wheel', fastCtrlZoom, { capture: true, passive: false });
  graph.addEventListener('keydown', (event) => { if (event.key.toLowerCase() === 'f') cy?.fit(undefined, 38); if (event.key.toLowerCase() === 'r') { state.selectedId = null; state.impact = false; refresh(); } });
  window.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('#atlas-search').focus(); } });
  const dialog = document.querySelector('#diagnostics-dialog');
  document.querySelector('#diagnostics-button').addEventListener('click', () => dialog.showModal());
  dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
}

renderShell();
