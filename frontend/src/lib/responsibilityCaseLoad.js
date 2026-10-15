// A new selection immediately clears the previous evidence. Aborted or superseded
// requests cannot publish evidence, errors or loading state into another case.
export function createCaseLoadController(load, publish) {
  let active;
  const dispose = () => { active?.abort(); };
  async function open(caseId) {
    dispose();
    active = new AbortController();
    const signal = active.signal;
    const current = () => !signal.aborted;
    publish({ context: null, error: '', loading: Boolean(caseId) });
    if (!caseId) return;
    try {
      const result = await load(caseId, signal);
      if (!current()) return;
      if (result?.error) publish({ error: result.error });
      else if (result?.case?.id !== caseId) publish({ error: 'The returned case does not match this request. Refresh to try again.' });
      else publish({ context: result });
    } catch {
      if (current()) publish({ error: 'The case could not be loaded. Please try again.' });
    } finally {
      if (current()) publish({ loading: false });
    }
  }
  return { open, dispose };
}
