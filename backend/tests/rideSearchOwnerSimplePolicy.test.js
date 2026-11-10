import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { routingRequest, SEARCH_QUESTION_CONTRACT_VERSION } from '../services/search/questions.ts';
import { ownerSimpleTasks, resolveOwnerSimpleLabels, OWNER_SIMPLE_DECISIONS, OWNER_SIMPLE_CONTRACT } from '../scripts/search-owner-simple-policy.mjs';
import { validateRequest, buildWireRequest, PROVIDERS } from '../benchmarks/search/decisionComparison/adapters.js';

const parentDir = new URL('../../output/search-v1-decision-contract-alignment-2026-11-02/', import.meta.url);
const load = async name => JSON.parse(await readFile(new URL(name, parentDir), 'utf8'));

test('owner decisions change only the three masked complexity targets and preserve historical truth', async () => {
  const previous = await load('proposal-v5-final-labels.json');
  const original = structuredClone(previous);
  const next = resolveOwnerSimpleLabels(previous);
  assert.deepEqual(previous, original);
  const selected = OWNER_SIMPLE_DECISIONS.flatMap(row => row.caseIds);
  for (const before of previous) {
    const after = next.find(row => row.caseId === before.caseId);
    if (!selected.includes(before.caseId)) { assert.deepEqual(after, before); continue; }
    assert.equal(before.labels.complexity, null);
    assert.deepEqual(after.labels.complexity, { allowed: ['SIMPLE'] });
    assert.deepEqual({ ...after.labels, complexity: null }, before.labels);
    assert.deepEqual(after.blockedByPolicyDecisions, []);
    assert.equal(after.originalV4LabelsHash, before.originalV4LabelsHash);
    assert.equal(after.liveApproval, false);
  }
});

test('resolved routing rules are explicit and semantically identical in production and all common adapters', async () => {
  const inputs = await load('proposal-v5-final-inputs.json');
  for (const caseId of OWNER_SIMPLE_DECISIONS.flatMap(row => row.caseIds)) {
    const row = inputs.find(value => value.caseId === caseId);
    const tasks = ownerSimpleTasks(row.input);
    const routing = routingRequest({ query: row.input.query, candidates: tasks.candidates, timeZone: row.input.context.timeZone }, row.input.context.clock);
    const instructions = routing.questions.booking_complexity.instructions;
    assert.match(instructions, /Choose SIMPLE .*unsupported rental/u);
    assert.match(instructions, /single preferred vehicle class if available.*SIMPLE/u);
    assert.match(instructions, /Choose COMPLEX for multi-stop journeys, branching destinations, material conflicts/u);
    assert.deepEqual(tasks.request.questions.complexity, routing.questions.booking_complexity);
    assert.equal(JSON.parse(tasks.request.state).contractVersion, OWNER_SIMPLE_CONTRACT);
    assert.equal(JSON.parse(tasks.request.state).productionQuestionContract, SEARCH_QUESTION_CONTRACT_VERSION);
    assert.deepEqual(tasks.candidates, row.tasks.candidates);
    assert.deepEqual(tasks.unsupportedTasks, row.tasks.unsupportedTasks);
    assert.equal(Object.keys(tasks.request.questions).length, 20);
    validateRequest(tasks.request);
    for (const provider of Object.keys(PROVIDERS)) assert.doesNotThrow(() => buildWireRequest(provider, tasks.request));
  }
});
