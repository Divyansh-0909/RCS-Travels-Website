import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { durableJson, claimActivation, evidenceStore } from '../decisionComparison/executorEvidence.js';
import { digest } from '../s5Continuation/artifacts.js';
import { stop } from './accounting.js';

const load = async path => JSON.parse(await readFile(path, 'utf8'));
const id = sequence => String(sequence).padStart(6, '0');
export async function openEvidence(root, identity, beforeWrite = async () => {}, requiredStages = []) {
  const directory = join(root, 'output/search-v1-s5-live-executor-2026-11-03/activations', identity.phase, identity.activationId);
  const global = join(root, 'output/search-v1-s5-global-stage-ledger');
  await mkdir(join(global, 'executions'), { recursive: true }); await mkdir(join(global, 'stages'), { recursive: true });
  const entries = (await readdir(join(global, 'executions'))).filter(file => /^\d{6}-claim\.json$/.test(file)).sort();
  let previous = null;
  if (entries.length) {
    const previousId = entries.at(-1).slice(0, 6);
    try {
      const commit = await load(join(global, 'executions', `${previousId}-commit.json`));
      const terminal = await load(join(global, 'executions', `${previousId}-terminal.json`));
      if (terminal.status !== 'COMPLETE' || digest(terminal) !== commit.globalTerminalHash
        || digest(await load(join(root, terminal.activationTerminal))) !== commit.activationTerminalHash) stop('GLOBAL_PREDECESSOR_NOT_COMPLETE');
      previous = terminal;
    } catch { stop('GLOBAL_PREDECESSOR_UNRESOLVED'); }
  }
  for (const stage of requiredStages) {
    try { await readFile(join(global, 'stages', stage + '.json')); }
    catch (error) { if (error.code === 'ENOENT') continue; stop('GLOBAL_STAGE_LEDGER_UNREADABLE'); }
    stop('GLOBAL_STAGE_ALREADY_CLAIMED');
  }
  const sequence = entries.length ? Number(entries.at(-1).slice(0, 6)) + 1 : 1;
  const prefix = join(global, 'executions', id(sequence));
  await beforeWrite('global-claim');
  try { await durableJson(prefix + '-claim.json', identity); }
  catch { stop('GLOBAL_EXECUTION_ALREADY_CLAIMED'); }
  try { await claimActivation(directory, identity); }
  catch { stop('ACTIVATION_ALREADY_CLAIMED_OR_PERSISTENCE_FAILED'); }
  const store = evidenceStore(directory, identity);
  return { directory, global, previous,
    async claimStage(globalIdentity, value) {
      await beforeWrite('stage-claim');
      try { await durableJson(join(global, 'stages', globalIdentity + '.json'), { ...identity, ...value, globalIdentity }); }
      catch (error) { stop(error.code === 'EEXIST' ? 'GLOBAL_STAGE_ALREADY_CLAIMED' : 'EVIDENCE_PERSISTENCE_FAILURE'); }
    },
    async provider(provider) { await beforeWrite('provider-claim'); await store.provider(provider); },
    async intent(value) { await beforeWrite('intent'); return store.intent(value); },
    async response(number, value) { await beforeWrite('response'); await store.response(number, value); },
    async result(provider, index, value) { await beforeWrite('case'); await store.caseResult(provider, index, value); },
    async finish(terminal) {
      await beforeWrite('terminal'); await store.finish(terminal);
      const globalTerminal = { ...identity, status: terminal.status, stopReason: terminal.stopReason,
        lastDispatchWallMs: terminal.lastDispatchWallMs, activationTerminal: `output/search-v1-s5-live-executor-2026-11-03/activations/${identity.phase}/${identity.activationId}/terminal.json` };
      await beforeWrite('global-terminal'); await durableJson(prefix + '-terminal.json', globalTerminal);
      await beforeWrite('commit'); await durableJson(prefix + '-commit.json', {
        globalTerminalHash: digest(globalTerminal), activationTerminalHash: digest({ ...identity, ...terminal }),
      });
    },
  };
}
