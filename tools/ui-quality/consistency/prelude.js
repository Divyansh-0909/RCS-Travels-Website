// Synchronous instrumentation of the isolated local fixture only; never bundled in the product.
(()=>{
  const query=new URLSearchParams(location.search),id=query.get('rcsConsistency');
  const ids=['VCB01_ROUTE_ACTION','VCB01_TIMING_ACTION','VCB01_VEHICLE_ACTION','VCB01_PICKUP','VCB01_DROP','VCB01_SAVED_ADDRESS','VCB01_TRIP_MODE','VCB01_VEHICLE_CARD'];
  if(!ids.includes(id))return;
  const theme=query.get('preference')==='dark'?'dark':'light';
  localStorage.setItem('rcs.website.theme',theme);
  document.cookie='p06_scenario=default; Path=/; SameSite=Lax';
  document.cookie='fixture_actor=customer; Path=/; SameSite=Lax';
  sessionStorage.setItem('rcs-data',JSON.stringify({state:{pickupLocation:'Aster Synthetic Place 1, Fixture City',dropLocation:'Birch Synthetic Place 1, Fixture City',pickupCoords:{lat:28.61,lng:77.21},dropCoords:{lat:28.64,lng:77.25},timing:'Schedule',vehicleClass:'hatchback'},version:0}));
  // Seed the actual router's existing stage contract before React mounts. Automatic
  // multi-step clicks can stall a View Transition in an offscreen mobile iframe.
  // Manual product navigation and its transitions remain untouched.
  const stage=id==='VCB01_TIMING_ACTION'?'timing':['VCB01_VEHICLE_ACTION','VCB01_VEHICLE_CARD'].includes(id)?'vehicle':null;
  history.replaceState({...history.state,usr:stage?{stage}:null},'');
  window.__RCS_CONSISTENCY_CASE__={id,theme};
  document.title='Visual consistency — actual RCS UI / synthetic data';
})();

// Owner visual-review links. This file is injected only by the isolated
// loopback Vite fixture; product code and deployed auth are untouched.
(() => {
  const query = new URLSearchParams(location.search), page = query.get('fieldReview');
  if (!['review', 'finance', 'fares'].includes(page) || !['127.0.0.1:1575', 'localhost:1575'].includes(location.host)) return;
  document.cookie = 'fixture_actor=admin; Path=/; SameSite=Lax';
  const theme = query.get('theme') === 'light' ? 'light' : 'dark';
  localStorage.setItem('rcs.website.theme', theme);
  document.title = 'Shared fields review · Synthetic data · Saves disabled';
  const record = window.__RCS_FIELD_REVIEW__ = { page, theme, requests: [], ready: false };
  const workspace = page === 'review' && query.get('workspace') === '1';
  const caseContext = id => {
    const appeal = id === 'synthetic-appeal', final = id === 'synthetic-final';
    const result = {
      case: { id, state: final ? 'FINALIZED' : appeal ? 'APPEAL_OPEN' : id === 'synthetic-not-ready' ? 'NOTICE_PENDING' : 'NEEDS_ADMIN_REVIEW', caseType: 'DRIVER_CANCELLATION', bookingId: 'SYNTHETIC-BOOKING-0142', evidenceVersion: 3, evidenceHash: 'sha256:synthetic-evidence-version-3' },
      evidence: { chronology: [{ event: 'Ride accepted', at: '2026-10-29T04:30:00Z', actor: 'Synthetic captain' }, { event: 'Cancellation reported', at: '2026-10-29T04:34:00Z', actor: 'Synthetic rider' }], reportedReason: 'The recorded accounts disagree about the cancellation cause.', provenance: { source: 'Isolated visual-review fixture', productionData: false, fixtureOnly: true } },
      evidenceVersions: [{ version: 1, generatedAt: '2026-10-29T04:34:00Z', change: 'Initial synthetic report' }, { version: 2, generatedAt: '2026-10-29T04:34:30Z', change: 'Synthetic captain account added' }, { version: 3, generatedAt: '2026-10-29T04:35:00Z', change: 'Synthetic event chronology retained' }],
      analysis: { envelope: { id: 'synthetic-production-envelope', recommendation: 'NEEDS_REVIEW' }, validation: { valid: true } },
      shadowResult: { evidenceHash: 'sha256:synthetic-evidence-version-3', classification: 'NEEDS_REVIEW', analysisEnvelope: { id: 'synthetic-shadow-envelope', summary: 'Conflicting accounts require an authorized human review.', recommendation: 'NEEDS_REVIEW', rawModelOutput: { classification: 'EXTERNAL_OR_UNCERTAIN', confidence: 0.62 } }, factualValidation: { valid: true, source: 'Synthetic validation record' } },
      provisionalDecision: { classification: 'NEEDS_REVIEW', reason: 'Recorded accounts need human inspection.' },
      adminReview: null,
      appealWindow: { state: appeal ? 'OPEN' : final ? 'CLOSED' : 'NOT_OPEN' },
      appeal: appeal ? { id: 'synthetic-appeal', reason: 'Please consider the additional synthetic statement.', state: 'OPEN', submittedAt: '2026-10-29T04:38:00Z' } : null,
      appealReview: null,
      finalDecision: final ? { decision: 'WAIVE', classification: 'EXTERNAL_OR_UNCERTAIN', consequenceLevel: 'LEVEL_0', reason: 'Recorded synthetic final authority; no real consequence.', finalizedAt: '2026-10-29T04:40:00Z', createdAt: '2026-10-29T04:40:03Z' } : null,
      shadowHistory: [{ id: 'synthetic-shadow-run-1', evidenceVersion: 3, outcome: 'NEEDS_REVIEW', createdAt: '2026-10-29T04:35:30Z' }],
      adjudicationWork: { state: 'COMPLETE', attempts: 1, source: 'Synthetic fixture' },
    };
    if (id === 'synthetic-timeline') result.evidence = {
      evidenceVersion: 'responsibility-evidence-v1', caseId: id, caseType: 'DRIVER_CANCELLATION', bookingId: result.case.bookingId,
      scheduledAt: '2026-10-29T05:00:00Z', occurredAt: '2026-10-29T04:34:00Z', generatedAt: '2026-10-29T04:35:00Z',
      timeline: [
        { id: 'ev_0001', category: 'assignment', kind: 'ride_accepted', value: { actor: 'Synthetic captain' }, source: 'Synthetic booking record', basis: 'direct', derivedFrom: [], availability: 'available', claimKey: null, observedAt: '2026-10-29T04:30:00Z', receivedAt: '2026-10-29T04:30:01Z', quality: {} },
        { id: 'ev_0002', category: 'cancellation', kind: 'driver_cancellation_recorded', value: { actor: 'Synthetic rider', reason: 'The synthetic accounts disagree about the cancellation cause.' }, source: 'Synthetic incident record', basis: 'direct', derivedFrom: [], availability: 'available', claimKey: null, observedAt: '2026-10-29T04:34:00Z', receivedAt: '2026-10-29T04:34:02Z', quality: {} },
      ],
      completeness: { requiredCategories: ['booking', 'assignment', 'cancellation'], complete: false, missing: ['booking'], unavailable: [] }, contradictions: [],
    };
    if (id === 'synthetic-mismatch') result.shadowResult.evidenceHash = 'sha256:synthetic-evidence-version-2';
    if (id === 'synthetic-legacy') result.shadowResult = { evidenceHash: result.case.evidenceHash };
    if (id === 'synthetic-empty-records') for (const key of ['evidence', 'evidenceVersions', 'analysis', 'shadowResult', 'provisionalDecision', 'shadowHistory', 'adjudicationWork']) result[key] = null;
    return result;
  };
  const driver = { id: 'synthetic-fields-driver', name: 'Synthetic Captain', phone: '9990000101', vehicleClass: 'hatchback', vehicleNumber: 'SYNTHETIC', verificationStatus: 'pending', group: 'partner', isOnline: false, createdAt: '2026-10-29T00:00:00Z', walletBalance: 0 };
  const zones = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Synthetic Zone', fares: { hatchback: 500 }, toll: 50, notes: 'Synthetic area notes' }, geometry: { type: 'Polygon', coordinates: [[[77.20, 28.60], [77.24, 28.60], [77.24, 28.64], [77.20, 28.64], [77.20, 28.60]]] } }] };
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return original(input, init);
    const method = (init?.method || input.method || 'GET').toUpperCase(), path = url.pathname;
    record.requests.push({ method, path, denied: method !== 'GET' });
    if (method !== 'GET') return new Response(JSON.stringify({ error: 'Visual review preview: saving is disabled. No action was applied.' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    if (workspace && path.startsWith('/api/admin/responsibility/cases/')) {
      const id = decodeURIComponent(path.split('/').pop());
      const known = ['synthetic-review', 'synthetic-timeline', 'synthetic-appeal', 'synthetic-final', 'synthetic-not-ready', 'synthetic-mismatch', 'synthetic-legacy', 'synthetic-empty-records', 'synthetic-slow', 'synthetic-read-error', 'synthetic-foreign'];
      let status = 200, body;
      if (!known.includes(id)) { status = 404; body = { error: 'Synthetic case not found.' }; }
      else if (id === 'synthetic-read-error' && !record.recoverRead) { status = 503; body = { error: 'The synthetic case read is temporarily unavailable.' }; }
      else { if (id === 'synthetic-slow') await new Promise(resolve => setTimeout(resolve, 1200)); body = caseContext(id); if (id === 'synthetic-foreign') body.case.id = 'a-different-synthetic-case'; }
      record.context = body;
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    }
    const body = path === '/api/users/me' ? { id: 'synthetic-fields-admin', role: 'admin', name: 'Synthetic Admin', notifications: {}, savedPlaces: [] }
      : path === '/api/admin/responsibility/cases/synthetic-review' ? { case: { id: 'synthetic-review', state: 'NEEDS_ADMIN_REVIEW', evidenceVersion: 1, evidenceHash: 'synthetic-evidence' }, history: [] }
        : path === '/api/admin/driver' ? { drivers: [driver], total: 1 }
          : path === '/api/admin/booking' ? { bookings: [], total: 0 }
            : path === '/api/admin/user' ? { users: [], total: 0 }
              : path.endsWith('/synthetic-fields-driver/documents') ? { driver, vehicles: [], documents: [], missing: [], conduct: { cancellationCount30Days: 0, benefitRestrictedUntil: null, complaints: [] } }
                : path.endsWith('/synthetic-fields-driver/finance') ? { balances: { available: 500, held: 0, total: 500 }, cacheBalance: 500, openHolds: [], payoutAccount: { upiId: 'synthetic@invalid', verified: false } }
                  : path === '/api/admin/finance/reconciliation' ? { drivers: [{ id: driver.id, inSync: false, drift: 10 }] }
                    : path === '/api/admin/finance/payout-batches' ? { batches: [] }
                      : path === '/api/admin/zones' ? zones : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const clicked = new Set(), started = Date.now();
  const visible = el => el.getClientRects().length && !el.disabled;
  const click = (key, test) => {
    if (clicked.has(key)) return false;
    const button = [...document.querySelectorAll('button')].find(el => visible(el) && test(el));
    if (!button) return false;
    clicked.add(key); button.click(); return true;
  };
  const position = () => {
    if (workspace && document.querySelector('[data-testid="responsibility-page"]')) { record.ready = true; clearInterval(timer); return; }
    const target = page === 'review' ? document.querySelector('section[aria-labelledby="human-review-heading"]')
      : page === 'finance' ? document.querySelector('input[placeholder="Amount, e.g. -150 or 250"]') : document.querySelector('#f-toll');
    if (target) { target.scrollIntoView({ block: 'center', behavior: 'instant' }); record.ready = true; clearInterval(timer); return; }
    if (Date.now() - started > 20000) { clearInterval(timer); record.positioningTimedOut = true; return; }
    if (page === 'review') return;
    const label = page === 'finance' ? 'Drivers' : 'Edit Fares';
    if (!clicked.has('section')) {
      if (click('section', el => el.textContent.trim() === label)) return;
      click('menu', el => el.getAttribute('aria-label') === 'Show sections');
      return;
    }
    click('detail', el => el.textContent.includes(page === 'finance' ? 'Synthetic Captain' : 'Synthetic Zone'));
  };
  const timer = setInterval(position, 150);
})();
