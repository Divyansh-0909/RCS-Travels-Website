import assert from 'node:assert/strict';

export function decisionFake(batches = []) {
  const requests = [];
  return {
    requests,
    async decide(request) {
      requests.push(request);
      const next = batches[requests.length - 1];
      if (next instanceof Error) throw next;
      const answers = typeof next === 'function' ? next(request) : next ?? {};
      const choices = {};
      const diagnostics = {};
      for (const [key, question] of Object.entries(request.questions)) {
        assert.ok(typeof question.instructions === 'string' && question.instructions.length > 0,
          'The provider requires a nonempty independent question');
        if (question.kind === 'noul') { diagnostics[key] = answers[key] ?? 0.99; continue; }
        const defaults = {
          pickup_candidate: 'NONE_OR_UNCLEAR', drop_candidate: 'NONE_OR_UNCLEAR',
          location_search_candidate: 'NONE_OR_UNCLEAR', pickup_presence: 'ABSENT', drop_presence: 'ABSENT',
          role_consistency: 'NO_ROLES', vehicle_class: 'NOT_MENTIONED', vehicle_strength: 'NOT_APPLICABLE',
          vehicle_any: 'NOT_STATED', timing_mode: 'UNSPECIFIED', unsupported_service: 'NONE',
        };
        const selected = answers[key] ?? defaults[key] ?? (key.startsWith('exclude_') ? 'NOT_EXCLUDED' : 'NONE');
        choices[key] = { choice: selected, confidence: 0.9 };
      }
      return { choices, diagnostics, metadata: { provider: 'deterministic-fake', model: 'search-test-v1',
        requestCount: 1, latencyMs: 0, questionCount: Object.keys(request.questions).length } };
    },
  };
}

export const bookingRouting = { query_type: 'BOOKING_REQUEST', booking_complexity: 'SIMPLE' };
export const inputFor = (text, candidates = []) => ({
  query: { id: 'search-case', revision: 3, text }, timeZone: 'Asia/Kolkata', candidates,
});
export const candidateFor = (input, exactText, candidateId) => {
  const start = input.query.text.indexOf(exactText);
  return { candidateId, queryId: input.query.id, queryRevision: input.query.revision,
    exactText, start, end: start + exactText.length, method: 'LABELLED_FIELD', generatorVersion: 'test-v1' };
};
export const expressionChoices = (request, fields = ['date_expression', 'time_expression', 'passenger_candidate']) =>
  Object.fromEntries(fields.filter(field => request.questions[field]).map(field => [field,
    Object.keys(request.questions[field].choices).find(label => label.startsWith('span:'))]));
