// A bounded, owner-requested audit. These are real product occurrences, not styled replicas.
export const batch = 'VC-B01-2026-10-24';
export const directory = 'output/handoff/consistency/VC-B01-2026-10-24';
export const families = [
  {
    id: 'VC-B01-ACTIONS', name: 'Primary booking actions', classification: 'NEEDS_OWNER_CHOICE',
    difference: 'The route/timing action applies a 1.3 desktop scale to Button; the vehicle action uses an unscaled full-width Button with its own text size. Compare rendered height, text, radius and padding below.',
    rationale: 'These are successive primary actions in the same legacy booking flow. The commit step may deliberately differ from the earlier steps; no approved reference establishes one standard.',
    cascade: 'Button is reused outside these screens. Any future choice must be scoped to the listed booking actions; global Button or brand-token edits are excluded.',
    choices: [{id:'A',label:'Use the route/timing proportions for these actions'},{id:'B',label:'Use the vehicle-action proportions for these actions'},{id:'VARIANTS',label:'Keep purpose-specific action proportions'}],
    occurrences: [
      {id:'VCB01_ROUTE_ACTION',label:'A · Route entry — Set date & time',screenId:'W.BOOKING.ROUTE',route:'/book',stage:'route',target:'route-action',source:'frontend/src/pages/OnBoarding.jsx',token:'const priceAction = ('},
      {id:'VCB01_TIMING_ACTION',label:'A · Timing — See prices',screenId:'W.BOOKING.TIMING',route:'/book',stage:'timing',target:'timing-action',source:'frontend/src/pages/OnBoarding.jsx',token:'const priceAction = ('},
      {id:'VCB01_VEHICLE_ACTION',label:'B · Vehicle selection — Book ride',screenId:'W.BOOKING.VEHICLES',route:'/book',stage:'vehicle',target:'vehicle-action',source:'frontend/src/pages/VehicleSelect.jsx',token:'const bookAction = ('},
    ],
  },
  {
    id:'VC-B01-ADDRESS',name:'Address text fields',classification:'DESIGN_REFERENCE_UNCLEAR',
    difference:'Booking uses the shared Input with desktop vertical scaling, medium text and marker/clear adornments. Saved places uses a local unscaled input inside an account row. Measure the shared address-entry task while preserving the distinct page themes.',
    rationale:'Both accept a place address, but booking offers autocomplete and Settings edits a saved address. Theme and available width are deliberate context differences; the intended common control proportions need an owner choice.',
    cascade:'Only pickup, drop and the saved Home editor are sampled. Settings reuses its editor for Work and custom places: those variants remain unverified and need an expanded affected-controls review before any edit that would reach them. Other Input callers are excluded. Colors and autocomplete behavior are locked.',
    choices:[{id:'A',label:'Use booking field proportions, keeping each page theme'},{id:'B',label:'Use saved-place field proportions, keeping each page theme'},{id:'VARIANTS',label:'Keep purpose-specific booking and account fields'}],
    occurrences:[
      {id:'VCB01_PICKUP',label:'A · Booking pickup address',screenId:'W.BOOKING.ROUTE',route:'/book',stage:'route',target:'pickup',source:'frontend/src/pages/OnBoarding.jsx',token:'<Input'},
      {id:'VCB01_DROP',label:'A · Booking drop address',screenId:'W.BOOKING.ROUTE',route:'/book',stage:'route',target:'drop',source:'frontend/src/pages/OnBoarding.jsx',token:'id: "drop-location",'},
      {id:'VCB01_SAVED_ADDRESS',label:'B · Settings — saved Home address editor',screenId:'W.SETTINGS.SAVED-PLACES',route:'/settings',stage:'saved-address',target:'saved-address',source:'frontend/src/pages/SettingsPage.jsx',token:'aria-label={tr("Address")}'},
    ],
  },
  {
    id:'VC-B01-SELECTION',name:'Selection controls: compact modes and rich cards',classification:'INTENTIONAL_VARIANT',
    difference:'Trip mode uses compact pill buttons. Vehicle choice uses larger cards with a vehicle image, passenger count and sample fare. Both expose aria-pressed; their content and space requirements differ.',
    rationale:'Different information density justifies distinct shapes. This is an explicit exception candidate, not a confirmed visual defect. Do not turn vehicle cards into pills or trip-mode choices into fare cards.',
    cascade:'Preserve the P06 selected-state fix and the existing trip-mode behavior. A pattern decision here never approves a booking-rule change.',
    choices:[{id:'VARIANTS',label:'Keep compact modes and rich vehicle cards'},{id:'REVIEW',label:'Leave undecided for a later comparison'}],
    occurrences:[
      {id:'VCB01_TRIP_MODE',label:'A · Route — One way / Round trip',screenId:'W.BOOKING.ROUTE',route:'/book',stage:'route',target:'trip-mode',source:'frontend/src/pages/OnBoarding.jsx',token:'aria-pressed={!isRoundTrip}'},
      {id:'VCB01_VEHICLE_CARD',label:'B · Vehicle — Hatchback / Sedan / SUV',screenId:'W.BOOKING.VEHICLES',route:'/book',stage:'vehicle',target:'vehicle-card',source:'frontend/src/pages/VehicleSelect.jsx',token:'const vehicleCard = ('},
    ],
  },
];
export const occurrences = families.flatMap(family=>family.occurrences.map(occurrence=>({...occurrence,familyId:family.id})));
export function previewOccurrence(id, theme='light') {
  const occurrence=occurrences.find(item=>item.id===id);
  return occurrence&&['light','dark'].includes(theme)?{...occurrence,theme}:null;
}
