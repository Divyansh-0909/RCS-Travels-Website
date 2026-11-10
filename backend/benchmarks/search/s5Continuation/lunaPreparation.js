import { createSearchInterpretationService } from '../../../services/search/complex/service.ts';
import { createLunaInterpreter } from '../../../services/search/complex/luna.ts';
import { ComplexProviderError } from '../../../services/search/complex/contracts.ts';
import { fallbackEligibility } from '../../../services/search/complex/eligibility.ts';
import { reusableProvider, parseInput, caseClock, JEV } from './compatibility.js';
import { canonical, digest } from './artifacts.js';

export const LUNA = Object.freeze({ model: 'gpt-6-luna', endpoint: 'https://api.openai.com/v1/responses',
  schema: 'ride-search-luna-v1', reasoningEffort: 'low', maxOutputTokens: 4096, timeoutMs: 15000, retries: 0,
  sdkVersion: '7.10.0', serviceTier: 'ACCOUNT_DEFAULT_MUST_BE_VERIFIED_STANDARD', cacheMode: 'EXISTING_ADAPTER_DEFAULT' });

export function requireCurrentLunaParent(parent, input, sourceIdentity) {
  if (!input || !input.partialDraft || !Array.isArray(input.candidates)
    || !parent?.exactRequestReuse || parent.sourceIdentity !== sourceIdentity || parent.lunaInputHash !== digest(input)
    || !parent.served.length || parent.served.some(row => row.actualReportedModel !== JEV.reportedModel)
    || !parent.parserResult?.draft || digest(parent.parserResult.draft) !== digest(input.partialDraft)
    || digest(parent.parserResult.draft.query) !== digest(input.query)
    || digest(parent.parserResult.draft.candidates) !== digest(input.candidates)
    || digest(fallbackEligibility(parent.parserResult)) !== digest(input.fallbackReasons)
    || !input.fallbackReasons.length) throw new Error('STALE_OR_INELIGIBLE_LUNA_PARENT');
}

export async function prepareLuna(row, replay, catalog) {
  if (!replay.exactRequestReuse || !replay.currentFallback.length) return null;
  const cache = reusableProvider(row, catalog);
  let input;
  const interpreter = { async interpret(value) { input = canonical(value); throw new ComplexProviderError('LUNA_CONFIG_ERROR'); } };
  const forbidden = async () => { throw new Error('PLACES_FORBIDDEN_DURING_PREPARATION'); };
  await createSearchInterpretationService(cache.provider, { searchAutocomplete: forbidden, getPlaceDetails: forbidden },
    interpreter, caseClock(row)).parse(parseInput(row), { activeField: row.modelInput.context.activeField, formRevision: 0 });
  if (!input || cache.refused.length) throw new Error('LUNA_INPUT_NOT_RECONCILED');
  let request;
  const adapter = createLunaInterpreter({ transport: { async parse(value) {
    request = canonical(value); throw new Error('OFFLINE_REQUEST_CAPTURE_COMPLETE');
  } } });
  try { await adapter.interpret(input); }
  catch (error) { if (!(error instanceof ComplexProviderError) || !request) throw error; }
  return { caseId: row.caseId, input, inputHash: digest(input), request, requestHash: digest(request),
    wireBytes: Buffer.byteLength(JSON.stringify(request)), downstreamGrounding: 'CONDITIONAL_ON_ACCEPTED_CURRENT_INTERPRETATION',
    measurement: 'OFFLINE_REQUEST_PREPARATION_ONLY_NO_LUNA_PREDICTION' };
}
