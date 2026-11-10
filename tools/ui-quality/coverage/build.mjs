// Explicit surface identities plus syntax discovery. Rebuilding never inherits a
// parent's audit/fix/verification into its children.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fields, lists, serialize, parse, validate, summarize } from './core.mjs';
import { readJson, atomicJson } from '../../handoff/core.mjs';
import { applyAndroidObservations } from './android-observations.mjs';

const discovery = readJson('output/handoff/current-source-discovery.json',readJson('output/handoff/P05-source-discovery.json'));
assert.equal(discovery.errors.length, 0);
const catalog = readJson('output/handoff/P05-evidence-catalog.json');
const inventoryPhase=readJson('output/handoff/state.json').run.phase;
const byFile = new Map(discovery.files.map(f => [f.file, f]));
const rows = [], issues = [], sourceCache = new Map();
const slug = value => String(value).replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase();
const lines = file => { if (!sourceCache.has(file)) sourceCache.set(file, fs.readFileSync(file, 'utf8').split(/\r?\n/)); return sourceCache.get(file); };
const locate = (file, token) => { const index = lines(file).findIndex(l => l.includes(token)); assert(index >= 0, file + ': ' + token); return index + 1; };
const evidence = name => { assert(catalog[name]?.readbackVerified, 'Missing prior Drive evidence: ' + name); return catalog[name].url; };
function add(id, platform, screen, file, token, extra = {}) {
  const line = token === 1 ? byFile.get(file)?.jsx[0]?.line || 1 : typeof token === 'number' ? token : locate(file, token);
  const row = { ...Object.fromEntries(fields.map(k => [k, lists.includes(k) ? [] : ''])),
    id, platform, role: platform === 'website' ? 'public' : 'captain', parent_id: '', screen, kind: 'state_group', route: platform === 'website' ? 'shared://website' : 'shared://android',
    source_file: file, source_line: line, source_token: lines(file)[line - 1].trim().slice(0, 180), state: screen,
    theme_policy: 'UNKNOWN', theme_basis: 'Source inventory; page-specific policy not assumed', targets: platform === 'website' ? ['360','390','768','1280','1440'] : ['Android physical device','font scaling','safe areas'],
    entry_path: 'Rendered source component; see source trace', reachability: platform === 'website' ? 'SOURCE_DISCOVERED' : 'DEVICE_OFFLINE', preview_path: '', preview_actor: 'customer', navigation_steps: [],
    audit_status: 'NOT_REVIEWED', audit_dimensions: [], issue_ids: [], issue_severity:'NOT_APPLICABLE', owner_decision: 'NOT_APPLICABLE', implementation_status: 'NOT_CHANGED', verification_status: 'NOT_RUN', verification_levels: ['SOURCE_ONLY'], inventory_phase: inventoryPhase, last_review_phase: '', last_review_date: '', evidence_urls: [],
    blocker: platform === 'android' ? 'Phone disconnected in P05; current device execution NOT_RUN' : '', next_action: 'Review this bounded surface in a future owner-approved phase', ...extra };
  rows.push(row); return row;
}
function child(parent, key, screen, token, extra = {}) {
  return add(parent.id + '.' + key, parent.platform, screen, extra.source_file || parent.source_file, token, { role: parent.role, parent_id: parent.id, route: parent.route, theme_policy: parent.theme_policy, theme_basis: parent.theme_basis, preview_path: parent.preview_path, preview_actor: parent.preview_actor, entry_path: parent.entry_path + ' > ' + screen, navigation_steps: [...parent.navigation_steps, screen], ...extra });
}
const webMain = byFile.get('frontend/src/main.jsx');
const webNames = { '/':'HOME','/login':'LOGIN','/signup':'SIGNUP','/book':'BOOKING','/booking/:id':'TRACKING','/t/:token':'SHARED-TRIP','/captains/rides/:id':'CAPTAIN-HANDOFF','/captains/delete-account':'CAPTAIN-DELETION','/manage-account':'ACCOUNT','/settings':'SETTINGS','/help':'HELP','/outstation':'OUTSTATION','/safety':'SAFETY','/dashboard':'ADMIN','/dashboard/responsibility':'RESPONSIBILITY','/dev':'DEV','/dev/:view':'DEV-VIEW','*':'NOT-FOUND' };
const preview = { TrackingPage:'/dev/tracking', ManageAccount:'/dev/account', SettingsPage:'/settings', SafetyPage:'/safety', AdminDashboard:'/dashboard', ResponsibilityCase:'', SharedTrip:'', OpenDriverApp:'', CaptainAccountDeletion:'/captains/delete-account' };
const webRoots = new Map();
function imported(file, name) {
  const ref = byFile.get(file)?.imports.find(i => i.names.includes(name)); if (!ref || !ref.from.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), ref.from));
  return [base,...['.jsx','.tsx','.js','.ts'].map(ext => base + ext), ...['.jsx','.tsx','.js','.ts'].map(ext => base + '/index' + ext)].find(f => byFile.has(f)) || null;
}
function componentFor(route) { return [...route.element.matchAll(/<([A-Z]\w*)/g)].map(m => m[1]).filter(n => !['ProtectedRoute','Navigate'].includes(n)).at(-1); }
for (const route of webMain.routes) {
  const component = componentFor(route), file = imported(webMain.file, component);
  assert(file, 'Resolve actual route component: ' + route.path);
  const legacy = ['/', '/outstation','/book','/booking/:id','/t/:token'].includes(route.path);
  const isDev = route.path.startsWith('/dev'), dynamic = route.path.includes(':');
  const row = add('W.' + webNames[route.path], 'website', component, file, 1, { kind: isDev ? 'fixture' : 'route', route: route.path,
    role: route.element.includes('requireAdmin') ? 'admin' : route.element.includes('ProtectedRoute') ? 'rider' : isDev ? 'developer' : 'public',
    theme_policy: legacy ? 'LEGACY_FIXED' : 'BOTH', theme_basis: 'frontend/src/components/ThemeRouteSync.jsx: legacy routes are fixed compositions; others receive resolved preference, page overrides still need audit',
    entry_path: `frontend/src/main.jsx:${route.line} -> ${component}`, navigation_steps: ['Open ' + route.path], preview_path: isDev ? (dynamic ? '' : route.path) : preview[component] ?? (dynamic ? '' : route.path === '*' ? '/p05-unmatched-route' : route.path), preview_actor: route.element.includes('requireAdmin') ? 'admin' : 'customer',
    reachability: isDev ? 'DEV_ONLY' : dynamic ? 'FIXTURE_REQUIRED' : 'SOURCE_DISCOVERED', blocker: dynamic ? 'Actual path needs a synthetic record/token; the preview, if present, is explicitly a fixture rather than real-backend proof' : '' });
  webRoots.set(route.path, row);
}
const legalFile = 'frontend/src/constants/legal.js';
for (let i = 0; i < lines(legalFile).length; i++) {
  const match = lines(legalFile)[i].match(/^\s*"(\/[a-z-]+)": \{ tab: "([^"]+)"/); if (!match) continue;
  add('W.LEGAL.' + slug(match[1]), 'website', match[2], 'frontend/src/pages/LegalPage.jsx', 'legalDocs', { kind:'route', route:match[1], role:match[1].startsWith('/driver-') ? 'captain/public' : 'public', theme_policy:'BOTH', theme_basis:'ThemeRouteSync resolved preference; document styling requires individual review', preview_path:match[1], entry_path:`${legalFile}:${i + 1} legalDocs -> frontend/src/main.jsx legalPaths -> LegalPage`, navigation_steps:['Footer / Account Legal links',match[1]] });
}
const settings = webRoots.get('/settings');
for (const [key,name,token] of [['APPEARANCE','Appearance','selected === 0'],['LANGUAGE','Language','selected === 1'],['NOTIFICATIONS','Notifications','selected === 2'],['SAVED-PLACES','Saved places','selected === 3']]) child(settings,key,name,token,{kind:'subscreen',state:key.toLowerCase()});
const safety = webRoots.get('/safety');
for (const [key,name,index] of [['CONTACT','Emergency contact',0],['LOCATION','Live location',1],['HELPLINE','Helpline',2]]) child(safety,key,name,'selected === ' + index,{kind:'subscreen',state:key.toLowerCase()});
const help = webRoots.get('/help');
for (const [key,name,index] of [['FAQ','FAQ / expanded answers',0],['CONTACT','Contact us',1],['CANCELLATION','Cancellation policy',2]]) child(help,key,name,'selected === ' + index,{kind:'subscreen',state:key.toLowerCase()});
const account = webRoots.get('/manage-account');
for (const [key,name,token] of [['PROFILE','Account information','Account info'],['RIDES','Ride history / sorting / filtering / pagination','const rideStatuses'],['PRIVACY','Privacy and data / export / deletion','Privacy & Data'],['DETAIL','Ride detail / cancellation / complaint modal','<DetailModal']]) child(account,key,name,token,{kind:key==='DETAIL'?'dialog':'subscreen',state:key.toLowerCase()});
const admin = webRoots.get('/dashboard');
for (const [key,name,token] of [['BOOKINGS','Bookings / filter / sort / pagination','bookingSections'],['DRIVERS','Drivers / filter / sort / pagination','driverSections'],['USERS','Users / filter / sort / pagination','userSections'],['FARES','Edit Fares','<EditFares'],['BOOKING-DETAIL','Booking detail modal','title={dc("Ride details")}'],['DRIVER-DETAIL','Driver detail / document review / finance','title={dc("Driver details")}'],['USER-DETAIL','User detail modal','title={dc("User details")}']]) child(admin,key,name,token,{kind:key.endsWith('DETAIL')?'dialog':'subscreen',state:key.toLowerCase()});
const book = webRoots.get('/book');
child(book,'ROUTE','Pickup/drop / map picker',1,{kind:'subscreen',source_file:'frontend/src/pages/OnBoarding.jsx',state:'route entry and map picker',preview_path:'/book'});
child(book,'TIMING','Ride Now / scheduled date-time','<TimingChoiceSheet',{kind:'subscreen',source_file:'frontend/src/pages/OnBoarding.jsx',state:'timing choice',preview_path:'/dev/home'});
child(book,'VEHICLES','Vehicle / route options / confirmation',1,{kind:'subscreen',source_file:'frontend/src/pages/VehicleSelect.jsx',state:'vehicle stage',preview_path:'/dev/vehicle'});
rows.find(r=>r.id==='W.BOOKING.VEHICLES').blocker='The current synthetic server denies unimplemented fare-estimate POSTs (409). A rendered vehicle/error fixture is not working pricing, map or booking acceptance; add a dedicated read-only quote fixture in the future booking audit.';
rows.find(r=>r.id==='W.BOOKING.VEHICLES').reachability='FIXTURE_REQUIRED';
webRoots.get('/dashboard/responsibility').reachability='FIXTURE_REQUIRED';webRoots.get('/dashboard/responsibility').blocker='Needs a scoped synthetic responsibility case context; never substitute a production case ID.';
const home = webRoots.get('/');
for (const [key,component,anchor] of [['HERO','LandingHero',''],['HOW','HowItWorks','#how-it-works'],['ABOUT','AboutUs','#about'],['WHY','WhyUs','#why-us'],['CTA','FinalCTA',''],['FOOTER','Footer','']]) child(home,key,component,1,{source_file:imported('frontend/src/App.jsx',component),kind:'section',state:component,preview_path:'/' + anchor,entry_path:'frontend/src/App.jsx rendered <'+component+'>; '+anchor});

// Every existing developer preview is an explicitly labelled fixture state of
// its actual product parent, not another production page or a backend pass.
const devFile = 'frontend/src/pages/DevPreview.jsx';
for (let i = 0; i < lines(devFile).length; i++) {
  const match = lines(devFile)[i].match(/^\s*\["(\/dev\/[^"\s]+)",\s*["'](.+?)["']\],?$/); if (!match) continue;
  const url = new URL(match[1], 'http://local'), view = url.pathname.split('/').at(-1);
  const owner = {hero:home,home:book,trip:book,vehicle:book,tracking:webRoots.get('/booking/:id'),rides:account,account,settings,safety,help,admin}[view] || webRoots.get('/dev');
  child(owner,'FIXTURE.' + slug(match[1]),match[2],i + 1,{source_file:devFile,kind:'fixture',state:match[1],preview_path:match[1],reachability:'DEV_ONLY',entry_path:'DevPreview PREVIEWS list; DEV-only router. This does not prove the protected route or backend.',theme_policy:'UNKNOWN',theme_basis:'Developer fixture can differ from production route policy; observe separately'});
}

const nativeMain = byFile.get('driver-app/src/main.tsx'), nativeRoots = new Map();
const nativeIds = { HomeGate:'HOME',OnBoarding:'WELCOME',Signup:'SIGNUP',Login:'LOGIN',Documents:'DOCUMENTS',Vehicles:'VEHICLES',Available:'MARKET',MarketplaceDetail:'MARKET-DETAIL',Post:'POST',Notifications:'NOTIFICATIONS',Rides:'RIDES',RideDetail:'RIDE-DETAIL',Account:'ACCOUNT',ResponsibilityNotices:'RESPONSIBILITY',PayoutAccount:'PAYOUT',Wallet:'WALLET',Feedback:'FEEDBACK',ManageAccount:'MANAGE',Help:'HELP',Legal:'LEGAL' };
for (const route of nativeMain.routes) {
  const normalized = route.path === '*' ? '*' : '/' + route.path.replace(/^\//,'');
  if (route.element.includes('<Navigate')) {
    add('A.REDIRECT.' + slug(normalized || 'ROOT'), 'android', 'Compatibility redirect ' + normalized, nativeMain.file,route.line,{kind:'redirect',route:normalized,reachability:'REDIRECT',state:route.element,implementation_status:'NOT_APPLICABLE',verification_status:'NOT_APPLICABLE',entry_path:`Native routes line ${route.line}: ${route.element}`}); continue;
  }
  const component = componentFor(route), file = imported(nativeMain.file, component); assert(file, 'Resolve native component: ' + component);
  const dev = normalized.startsWith('/dev/');
  const id = 'A.' + nativeIds[component] + (dev ? '.DEV' : '');
  const existing = nativeRoots.get(id);
  if (existing) { if (normalized !== existing.route && !existing.aliases.includes(normalized)) existing.aliases.push(normalized); continue; }
  const row = add(id,'android',component,file,1,{kind:dev?'fixture':component==='OnBoarding'?'subscreen':'route',route:normalized,
    role:['Login','Signup','OnBoarding'].includes(component)?'guest / onboarding captain':'captain', theme_policy:'BOTH',theme_basis:'driver-app/src/theme/ThemeContext.tsx preference/provider; each surface needs native review', reachability:dev?'DEV_ONLY':'DEVICE_OFFLINE', entry_path:`driver-app/src/main.tsx:${route.line}; signed-in/signed-out and VerifiedRoute/AssignedWorkRoute gates retained`, navigation_steps:['Use the isolated native test app',normalized], preview_path:'',preview_actor:'' });
  nativeRoots.set(id,row);
}
const nativeAccount = nativeRoots.get('A.ACCOUNT');
for (const row of nativeRoots.values()) if (row.route.startsWith('/account/')) row.parent_id = nativeAccount.id;
for (const [key,name,token] of [['LANGUAGE','Language menu','openSetting === \'language\''],['APPEARANCE','Appearance menu (System / Light / Dark)','expanded={openSetting === \'appearance\'}'],['FADE','Visible fade / covered and uncovered taps','<AppBarTouchGuard']]) child(nativeAccount,key,name,token,{kind:key==='FADE'?'state_group':'dialog',state:key.toLowerCase()});
child(nativeAccount,'COHORTS','Owner / RCS fleet badge and partner verification branch','isFleet(profile.group)',{kind:'state_group',role:'captain / owner / partner',state:'source-defined admin(owner), rcs and partner cohorts; not separate invented dashboards',entry_path:'Account isFleet/groupLabel; driver-app/src/constants/driver.ts defines group labels and eligibility'});
child(nativeAccount,'JOIN-FLEET','Partner-only join-fleet card','canJoinFleet(profile.group)',{kind:'subscreen',role:'partner captain',state:'partner eligibility / join-fleet request controls',entry_path:'Account -> canJoinFleet(partner) -> JoinFleetCard; owner/RCS captains do not get this card'});
const nativeLegal=nativeRoots.get('A.LEGAL');
for(const document of ['driver-terms','driver-privacy','driver-payments','driver-grievance'])child(nativeLegal,'WEB.'+slug(document),document+' external web handoff',"path: '/"+document+"'",{kind:'subscreen',route:'external:/'+document,reachability:'EXTERNAL_HANDOFF',state:'external website document; not a native Android document screen',theme_policy:'UNKNOWN',theme_basis:'External browser document has its own website theme; no native/browser device run in P05',blocker:'External handoff NOT_RUN while phone is disconnected'});
const nativeHome = nativeRoots.get('A.HOME');
for (const [key,component,token] of [['STATUS','OnboardingStatus',"return 'status'"],['ACTIVE','ActiveRide',"return 'ride'"],['STANDBY','Standby',"return profile.isOnline"],['BOARD','Home',"return profile.isOnline"]]) child(nativeHome,key,component,1,{source_file:imported('driver-app/src/components/HomeGate.tsx',component),kind:'subscreen',state:key.toLowerCase(),entry_path:'driver-app/src/components/HomeGate.tsx:'+locate('driver-app/src/components/HomeGate.tsx',token)+' homeScreenFor; active assigned work wins over approval, then status/online/offline branches'});

// Rendered-component ownership graph excludes unused imports and commented-out
// Services. It supplies grouped dialog/feedback states without inventing routes.
const owners = new Map();
function visit(file, row, seen = new Set()) {
  if (seen.has(file) || !byFile.has(file)) return; seen.add(file);
  const f = byFile.get(file); if (!owners.has(file)) owners.set(file, new Set()); owners.get(file).add(row.id);
  const names = new Set(f.jsx.map(j => j.name));
  for (const ref of f.imports) for (const name of ref.names) if (names.has(name)) { const next = imported(file,name); if (next) visit(next,row,seen); }
}
for (const row of rows.filter(r => ['route','subscreen'].includes(r.kind))) visit(row.source_file,row);
const shared = { website:add('W.SHARED','website','Shared application overlays and controls','frontend/src/main.jsx','<RideCancelledToast',{kind:'shared_surface',route:'shared://website',entry_path:'Application root and rendered page callers'}),android:add('A.SHARED','android','Shared native overlays and controls','driver-app/src/App.tsx','<OfferPanel',{kind:'shared_surface',route:'shared://android',entry_path:'App shell and rendered native page callers'}) };
visit('driver-app/src/App.tsx',shared.android);
visit('frontend/src/main.jsx',shared.website);
for(const [file,callers] of owners) {
  if(!file.includes('/pages/')||rows.some(r=>r.source_file===file&&['route','subscreen','section'].includes(r.kind)))continue;
  const platform=file.startsWith('frontend/')?'website':'android',name=path.basename(file).replace(/\.[^.]+$/,''),parent=rows.find(r=>callers.has(r.id)&&['route','subscreen'].includes(r.kind))||shared[platform];
  add((platform==='website'?'W':'A')+'.SCREEN.'+slug(name),platform,name, file,1,{kind:name==='Services'?'fixture':'subscreen',parent_id:parent.id,role:name==='EditFares'?'admin':name==='Services'?'developer':parent.role,route:parent.route,reachability:name==='Services'?'DEV_ONLY':platform==='android'?'DEVICE_OFFLINE':'SOURCE_DISCOVERED',preview_path:name==='Services'?'/dev/services':parent.preview_path,entry_path:'Rendered page callers: '+[...callers].sort().join(', ')});
}
const supportedShared = /(?:Modal|Dialog|Sheet|Drawer|Panel|Review|ReviewForm|DateTimeSelector|TimingChoice|RideOptions|SuggestionDropdown|RideDetails|RideMenu|PermissionPrompt|ErrorBoundary|RefreshNotice|RideCancelledToast|RideCompleted|RideCancelled|StartupSplash|AppBar)$/;
const primitives = new Set(['BackgroundPanel','RoutePanel','ErrorPanel','BottomSheet','Sheet','PanelBackdrop']);
for (const [file, callers] of owners) {
  const f = byFile.get(file), name = path.basename(file).replace(/\.[^.]+$/,'');
  if (!supportedShared.test(name) || primitives.has(name) || /\/pages\//.test(file)) continue;
  const platform = file.startsWith('frontend/') ? 'website':'android';
  add((platform==='website'?'W':'A') + '.SHARED.' + slug(name),platform,name,file,1,{kind:/Modal|Dialog|Sheet|Drawer|Popover|Menu/.test(name)?'dialog':'shared_surface',parent_id:shared[platform].id,route:shared[platform].route,state:name,role:platform==='website'&&/DriverFinance|DriverReview|ResponsibilityReview/.test(name)?'admin':platform==='website'?'rider/public':'captain',entry_path:'Rendered by: ' + [...callers].sort().join(', '),navigation_steps:['Enter one of these source-traced callers: ' + [...callers].sort().join(', '),name]});
}
// Related loading/error/edit/filter flags share one named feedback/interaction
// group per renderer. Each listed flag remains NOT_RUN, even if its parent was
// audited, approved or fixed in an earlier phase.
for (const [file, callers] of owners) {
  const f = byFile.get(file); if (!f.jsx.length) continue;
  const states = f.states.filter(s=>/loading|error|step|phase|status|open|visible|selected|editing|show|confirm|tab|filter|pending|saving|success|reject|suspend|delete|permission|detail|cancel|complaint|expanded/i.test(s.name || ''));
  if (!states.length) continue;
  const platform = file.startsWith('frontend/')?'website':'android', name=path.basename(file).replace(/\.[^.]+$/,'');
  const parent = rows.find(r=>r.source_file===file&&['route','subscreen','dialog','shared_surface'].includes(r.kind)) || shared[platform];
  add((platform==='website'?'W':'A')+'.STATES.'+slug(name),platform,name+' interaction and feedback states',file,states[0].line,{kind:'state_group',parent_id:parent.id,role:parent.role,route:parent.route,state:states.map(s=>s.name).join(' / '),theme_policy:parent.theme_policy,theme_basis:parent.theme_basis,preview_path:parent.preview_path,preview_actor:parent.preview_actor,entry_path:'Rendered callers: '+[...callers].sort().join(', '),navigation_steps:['Enter parent surface',...states.map(s=>s.name)],next_action:'Review the explicitly grouped renderer flags separately; no boolean combinations or parent verification are inferred'});
}
for (const [file, callers] of owners) {
  const f=byFile.get(file), overlays=[...f.overlays,...f.dialogs]; if(!overlays.length)continue;
  const platform=file.startsWith('frontend/')?'website':'android',name=path.basename(file).replace(/\.[^.]+$/,'');
  const parent=rows.find(r=>r.source_file===file&&['route','subscreen','shared_surface'].includes(r.kind))||shared[platform];
  const grouped=[...new Set(overlays.map(o=>o.name+' '+Object.entries(o.attrs).filter(([key])=>/visible|open|title|aria-label/.test(key)).map(([key,value])=>key+'='+value).join(' ')))];
  add((platform==='website'?'W':'A')+'.DIALOGS.'+slug(name),platform,name+' rendered overlay group',file,overlays[0].line,{kind:'dialog',parent_id:parent.id,role:parent.role,route:parent.route,state:grouped.join(' / '),theme_policy:parent.theme_policy,theme_basis:parent.theme_basis,preview_path:parent.preview_path,preview_actor:parent.preview_actor,entry_path:'Source-traced callers: '+[...callers].sort().join(', '),navigation_steps:['Enter parent',...grouped],next_action:'Review the named overlays and their visibility/error/close branches; individually verified child cases do not complete this group'});
}
for(const [file,callers] of owners) {
  const f=byFile.get(file),conditions=f.render_conditions||[];if(!conditions.length)continue;
  const platform=file.startsWith('frontend/')?'website':'android',name=path.basename(file).replace(/\.[^.]+$/,''),parent=rows.find(r=>r.source_file===file&&['route','subscreen','shared_surface'].includes(r.kind))||shared[platform];
  const state=[...new Set(conditions.map(c=>c.condition))].join(' / ');
  if(rows.some(r=>r.platform===platform&&r.source_file===file&&r.kind==='state_group'&&r.route===parent.route&&r.state===state))continue;
  add((platform==='website'?'W':'A')+'.BRANCHES.'+slug(name),platform,name+' conditional-render group',file,conditions[0].line,{kind:'state_group',parent_id:parent.id,role:parent.role,route:parent.route,state,theme_policy:parent.theme_policy,theme_basis:parent.theme_basis,preview_path:parent.preview_path,preview_actor:parent.preview_actor,entry_path:'Actual JSX/early-return predicates in source-discovery.json; callers: '+[...callers].sort().join(', '),next_action:'Scoped group of real renderer predicates, including derived loading/empty/error/workflow states. Split a chosen group into stable child cases during its bounded audit; no combinations or runtime success are inferred'});
}
for(const f of discovery.files.filter(f=>f.file.includes('/pages/')&&f.jsx.length&&!owners.has(f.file))) {
  const platform=f.file.startsWith('frontend/')?'website':'android',name=path.basename(f.file).replace(/\.[^.]+$/,'');
  add((platform==='website'?'W':'A')+'.UNREACHABLE.'+slug(name),platform,name+' (no rendered entry discovered)',f.file,1,{kind:'subscreen',role:'unknown',reachability:'UNREACHABLE',entry_path:'No rendered import path from the current source router; file is retained rather than invented as a route',blocker:'Unreachable/unused page component; confirm intended entry before review',next_action:'Reconcile unused component with actual product navigation; no new route is authorized'});
}

// Existing isolated native work gets narrowly scoped historical rows. Nothing
// is marked as executed on a connected phone in P05.
const offer = child(shared.android,'OFFER-503','Offer acceptance controlled 503 / retry','setError(failure?.error',{source_file:'driver-app/src/components/OfferPanel.tsx',kind:'state_group',state:'controlled-503 and retry',entry_path:'P02 synthetic captain offer fixture -> OfferPanel answer(accept)'});
const tabs = child(shared.android,'TAB-SELECTION','Current tab selected-node metadata','accessibilityState={{ selected: isSelected }}',{source_file:'driver-app/src/components/AppBar.tsx',kind:'state_group',state:'one selected current tab in tested Light/Dark destinations',entry_path:'Home / Market / Rides / Account bottom tabs'});
const issue = (id,row,description,phase,report) => { row.issue_ids.push(id);row.issue_severity='UNRATED'; issues.push({id,row_id:row.id,severity:'UNRATED',description,phase,evidence_url:evidence(report)}); };
function verified(row,phase,date,dimensions,levels,report,implementation='VERIFIED') {
  Object.assign(row,{audit_status:'AUDITED',audit_dimensions:dimensions,implementation_status:implementation,verification_status:'VERIFIED',verification_levels:levels,last_review_phase:phase,last_review_date:date,evidence_urls:[evidence(report)]});
}
verified(rows.find(r=>r.id==='W.SETTINGS.NOTIFICATIONS'),'P01','2026-10-21',['accessible_name','keyboard','loading_disabled','save_rollback','fixture_reload','responsive'],['KEYBOARD','AXE'],'P01-pilot-report.md');
verified(rows.find(r=>r.id==='W.SETTINGS.APPEARANCE'),'P01','2026-10-21',['theme_selection','fixture_persistence'],['BROWSER_INTERACTION'],'P01-test-matrix.md','NOT_CHANGED');
verified(offer,'P02','2026-10-21',['controlled_503','retry','error_dismissal'],['MAESTRO_DEVICE','ISOLATED_BACKEND'],'P02-test-evidence.md','NOT_CHANGED');
verified(rows.find(r=>r.id==='A.ACCOUNT.FADE'),'P04','2026-10-23',['covered_tap','fade_boundary','scroll_gesture','modal_bypass','light_dark'],['MAESTRO_DEVICE','NATIVE_NODE'],'P04-A1-approved-tap-guard.md');
rows.find(r=>r.id==='A.ACCOUNT.FADE').owner_decision='APPROVED_FOR_FIX';
verified(tabs,'P04','2026-10-23',['selected_node','tab_navigation','light_dark'],['MAESTRO_DEVICE','NATIVE_NODE'],'P04-A2-approved-selected-state.md');tabs.owner_decision='APPROVED_FOR_FIX';
issue('P04-A1',rows.find(r=>r.id==='A.ACCOUNT.FADE'),'Approved visible-fade content tap guard; existing layout retained','P04','P04-A1-approved-tap-guard.md');
issue('P04-A2',tabs,'Approved selected accessibility metadata; no spoken TalkBack verification','P04','P04-A2-approved-selected-state.md');
for (const [id,parent,name,token,description] of [
  ['P03-H1',home,'Copyright contrast','<Footer','2.97:1 contrast; FAIL retained'],
  ['P03-H2',home,'Carousel targets','<HowItWorks','10px inactive / 12.5px active targets; FAIL retained'],
  ['P03-H3',home,'Home +30px overhang','<LandingHero','360/390/768 widths retain +30px overhang; 390 -> 420'],
  ['P03-O1',webRoots.get('/outstation'),'Destination prompt contrast','BookPanel','1.24:1 destination prompt contrast; FAIL retained'],
  ['P03-O2',webRoots.get('/outstation'),'Copyright contrast','Footer','2.97:1 copyright contrast; FAIL retained'],
]) {
  const row=child(parent,id,name,token,{kind:'state_group',state:id,audit_status:'AUDITED',audit_dimensions:[id.endsWith('H3')?'responsive':id.endsWith('H2')?'touch_targets':'contrast'],owner_decision:'OWNER_DEFERRED',implementation_status:'OWNER_DEFERRED',verification_status:'FAIL',verification_levels:['FIXTURE_RENDER','LIVE_MANUAL'],last_review_phase:'P03',last_review_date:'2026-10-22',evidence_urls:[evidence('P03-owner-decision.md'),evidence('P03-accessibility-metrics.md')],next_action:'Keep current appearance per explicit owner direction; do not reopen without new instructions'});
  issue(id,row,description,'P03','P03-owner-decision.md');
}
for(const row of [home,webRoots.get('/outstation')])Object.assign(row,{audit_status:'AUDITED',audit_dimensions:['contrast','touch_targets','responsive'],verification_levels:['FIXTURE_RENDER','LIVE_MANUAL'],last_review_phase:'P03',last_review_date:'2026-10-22',evidence_urls:[evidence('P03-execution-report.md')],next_action:'Preserve existing identity and deferred findings; child surfaces retain independent status'});
const keyboard=child(webRoots.get('/outstation'),'MODAL-KEYBOARD','Booking modal Tab/focus containment','if (e.key !== "Tab")',{kind:'dialog',state:'keyboard containment only'});
verified(keyboard,'P03','2026-10-22',['keyboard_focus_containment'],['KEYBOARD'],'P03-execution-report.md');
const p01Samples=new Map();
for(const line of fs.readFileSync('docs/ui-quality/P01-component-audit.md','utf8').split(/\r?\n/)) {
  const cols=line.split('|').map(s=>s.trim());
  if(!cols[2]?.startsWith('/')||!cols.some(c=>c.includes('drive.google.com')))continue;
  const url=cols[2],matches=rows.filter(r=>r.platform==='website'&&r.preview_path===url),row=matches.find(r=>r.kind==='fixture')||matches.find(r=>r.kind==='route');
  if(!row||row.verification_status==='VERIFIED'||row.owner_decision==='OWNER_DEFERRED')continue;
  Object.assign(row,{audit_status:'AUDITED',audit_dimensions:[...new Set([...row.audit_dimensions,'axe_sample','fixture_render'])],verification_levels:[...new Set([...row.verification_levels,'FIXTURE_RENDER'])],evidence_urls:[...new Set([...row.evidence_urls,evidence('P01-component-audit.md'),...line.matchAll(/https:\/\/drive\.google\.com\/[^)\s]+/g)].map(v=>typeof v==='string'?v:v[0]))]});
  if(!row.last_review_phase||row.last_review_phase==='P01'){row.last_review_phase='P01';row.last_review_date='2026-10-21';}
  if(row.id==='W.HOME'||row.id==='W.OUTSTATION')continue; // Their known visual findings already have P03 IDs/owner decisions.
  if(!p01Samples.has(row.id))p01Samples.set(row.id,{row,rules:new Set()});
  for(const rule of cols[4].split(',').map(s=>s.trim()).filter(Boolean))p01Samples.get(row.id).rules.add(rule);
}
for(const {row,rules}of p01Samples.values()){
  row.verification_status='FAIL';row.verification_levels=[...new Set([...row.verification_levels,'AXE'])];
  row.owner_decision=rules.has('color-contrast')||rules.has('target-size')?'OWNER_REVIEW_REQUIRED':'NOT_APPLICABLE';
  row.blocker='P01 axe sample failed: '+[...rules].join(', ')+'. Only this sampled dimension is evidenced; functional/backend/child acceptance is NOT_RUN.';
  row.next_action='Reproduce these exact sampled findings on the current safe preview. Obtain live owner direction before any visual treatment; P05 does not authorize product fixes.';
  issue('P01-AXE-'+slug(row.id),row,'P05 stable reference to an unnamed P01 sampled axe finding: '+[...rules].join(', '),'P01','P01-component-audit.md');
}

// Keep inventory source identities stable when positions change; preserve any
// future history fields rather than silently resetting completed evidence.
const registered=readJson('tools/ui-quality/coverage/registered-surfaces.json',{surfaces:[],updates:[],issues:[]});
for(const surface of registered.surfaces){assert(!rows.some(row=>row.id===surface.id),'Duplicate registered surface');rows.push(surface);}
for(const update of registered.updates){const row=rows.find(row=>row.id===update.id);assert(row,'Registered parent missing');Object.assign(row,update);}
issues.push(...registered.issues);
assert.equal(new Set(issues.map(issue=>issue.id)).size,issues.length,'Duplicate registered issue');
const canonical='tools/ui-quality/coverage/master-ui-coverage.csv';
if(fs.existsSync(canonical)) {
  const prior=parse(fs.readFileSync(canonical,'utf8')), current=new Map(rows.map(r=>[r.id,r]));
  for(const old of prior) {
    assert(current.has(old.id),'Previously inventoried ID disappeared; explicitly reconcile: '+old.id);
    current.get(old.id).inventory_phase=old.inventory_phase;
    if(old.last_review_phase && (old.inventory_phase!==inventoryPhase||!['P01','P02','P03','P04'].includes(old.last_review_phase)))for(const key of ['audit_status','audit_dimensions','issue_ids','issue_severity','owner_decision','implementation_status','verification_status','verification_levels','last_review_phase','last_review_date','evidence_urls','preview_path','preview_actor','entry_path','navigation_steps','reachability','blocker','next_action'])current.get(old.id)[key]=old[key];
  }
}
const nativeObservation=readJson('tools/ui-quality/coverage/android-observations.json');
applyAndroidObservations(rows,nativeObservation);
// Registered audit history retains its identity when approved source edits move
// the referenced code. Resolve the same literal before validating the catalog.
for(const row of rows)if(!lines(row.source_file)[row.source_line-1]?.includes(row.source_token))row.source_line=locate(row.source_file,row.source_token);
rows.sort((a,b)=>a.id.localeCompare(b.id));
const routes=[...webMain.routes.map(r=>({platform:'website',path:r.path})),...rows.filter(r=>r.id.startsWith('W.LEGAL.')).map(r=>({platform:'website',path:r.route})),...nativeMain.routes.map(r=>({platform:'android',path:r.path==='*'?'*':'/'+r.path.replace(/^\//,'')}))];
const validation=validate(rows,{issues,routes});
fs.writeFileSync(canonical,serialize(rows));
atomicJson('tools/ui-quality/coverage/issues.json',issues);
atomicJson('tools/ui-quality/coverage/discovered-routes.json',routes);
atomicJson('output/handoff/'+inventoryPhase+'-coverage-validation.json',{...validation,summary:summarize(rows),parsedSourceFiles:discovery.fileCount,parseErrors:discovery.errors,deviceExecution:nativeObservation?'Connected device navigation/reachability follow-up; broader audits remain separate':'NOT_RUN — owner reports phone disconnected'});
console.log(JSON.stringify({rows:rows.length,platform:summarize(rows).platform,validation}));
