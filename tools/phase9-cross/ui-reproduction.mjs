import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const recipes = { 'native-race': '--adversarial-native', 'customer-safety': '--adversarial-browser', 'captain-appeal': '--adversarial-appeal',
  'native-competing': '--adversarial-competing', 'native-replacement': '--adversarial-replacement',
  'native-terminal': '--adversarial-terminal', 'native-permissions': '--adversarial-permissions', 'native-recovery': '--adversarial-recovery', 'admin-supersession': '--adversarial-supersession' };
export function sealUiReproduction(recipe, observation) {
  if (!Object.hasOwn(recipes, recipe)) throw new Error('Unsupported UI regression recipe');
  const hasInitial = Number.isFinite(Date.parse(observation.initial?.clock))
    && Number.isFinite(observation.initial?.booking?.fare);
  const payload = { schema: 'phase9c-ui-reproduction-v1', recipe,
    fixture: recipe === 'customer-safety' ? 'traditional-form-v1'
      : ['captain-appeal', 'admin-supersession'].includes(recipe) ? 'driver-incident-replacement-v1' : 'scheduled-1000-v1',
    initial: observation.initial, sources: observation.sources, actions: observation.actions,
    runtime: observation.runtime ?? null,
    events: observation.events ?? observation.controlled, outcome: observation.error,
    backend: recipe === 'native-race' && hasInitial ? {
      initial: { at: new Date(observation.initial.clock).toISOString(), fare: observation.initial.booking.fare },
      order: ['capture', 'offer', 'customer_cancel', 'accept'],
      boundary: 'Recorded request barrier order. Backend reproduction uses monotonic controlled fixture times; it does not reproduce mixed host/device elapsed timestamps.',
    } : null,
    invocation: ['node', 'backend/tests/run-phase9-cross.js', recipes[recipe], '--keep-awake'],
    sourcePolicy: 'Report original versus current source identities. Re-execute the allowlisted fixed recipe; do not claim identical old UI bytecode or OS scheduling.',
  };
  return { ...payload, integrity: hash(payload) };
}

export function validateUiReproduction(artifact) {
  const { integrity, ...payload } = artifact;
  if (payload.schema !== 'phase9c-ui-reproduction-v1' || !Object.hasOwn(recipes, payload.recipe)
    || integrity !== hash(payload)) throw new Error('Invalid UI reproduction identity');
  const expected = ['node', 'backend/tests/run-phase9-cross.js', recipes[payload.recipe], '--keep-awake'];
  if (JSON.stringify(payload.invocation) !== JSON.stringify(expected)) throw new Error('Invalid UI reproduction invocation');
  return payload;
}
