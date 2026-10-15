import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import Button from '../components/ui/Button';
import ResponsibilityReviewForm from '../components/ResponsibilityReviewForm';
import { createCaseLoadController } from '../lib/responsibilityCaseLoad';
import { responsibilityInspectionModel } from '../lib/responsibilityInspection';

const show = value => value == null ? 'Not recorded' : String(value);

function Record({ title, value, empty = 'Not recorded' }) {
  return <section className="min-w-0 border-t border-border py-6">
    <h2 className="mb-3 text-xl font-semibold text-ink">{title}</h2>
    {value == null ? <p className="text-ink-muted">{empty}</p> :
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-muted p-4 text-sm text-ink [overflow-wrap:anywhere]">{JSON.stringify(value, null, 2)}</pre>}
  </section>;
}

export default function ResponsibilityCase() {
  const api = useApi();
  const [params, setParams] = useSearchParams();
  const caseId = params.get('case')?.trim() ?? '';
  const [draft, setDraft] = useState({ caseId, value: caseId });
  const input = draft.caseId === caseId ? draft.value : caseId;
  const [context, setContext] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const controller = useMemo(() => createCaseLoadController(api.getResponsibilityCase, patch => {
    if ('context' in patch) setContext(patch.context);
    if ('error' in patch) setError(patch.error);
    if ('loading' in patch) setLoading(patch.loading);
  }), [api]);

  useEffect(() => {
    void controller.open(caseId);
    return controller.dispose;
  }, [controller, caseId, refresh]);

  return <main className="min-h-screen bg-surface px-5 py-8 text-ink sm:px-12">
    <div className="mx-auto max-w-6xl">
      <Link className="text-primary underline-offset-4 hover:underline focus-visible:outline-2" to="/dashboard">Back to dashboard</Link>
      <header className="mb-8 mt-8">
        <p className="mb-2 text-sm text-ink-muted">Administration</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Responsibility review</h1>
        <p className="mt-3 max-w-2xl text-ink-muted">Inspect the recorded evidence and decisions. Model confidence does not establish responsibility or authorize a consequence.</p>
      </header>
      <form className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={event => {
        event.preventDefault();
        const next = input.trim();
        if (next === caseId) setRefresh(value => value + 1);
        else setParams(next ? { case: next } : {});
      }}>
        <label className="flex min-w-0 flex-1 flex-col gap-2 font-medium">Case ID
          <input value={input} onChange={event => setDraft({ caseId, value: event.target.value })} maxLength={200}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-ink focus-visible:outline-2 focus-visible:outline-primary" />
        </label>
        <Button prop={{ type: 'submit', disabled: loading || !input.trim(), width: '160px' }}>{loading ? 'Loading…' : 'Open case'}</Button>
        {caseId && <Button prop={{ variant: 'input', disabled: loading, width: '140px' }} onClick={() => setRefresh(value => value + 1)}>Refresh case</Button>}
      </form>
      {loading && <p role="status">Loading recorded case…</p>}
      {error && <div role="alert" className="rounded-xl bg-negative/10 p-4 text-ink">{error}</div>}
      {!caseId && <p className="py-8 text-ink-muted">Enter a case ID from an incident record to inspect it.</p>}
      {context && <div data-testid="responsibility-context">
        {context.shadowResult && context.shadowResult.evidenceHash !== context.case.evidenceHash &&
          <p role="status" className="mb-4 rounded-xl bg-surface-muted p-4">This shadow result refers to a different evidence snapshot. Compare its evidence hash with the version history before reviewing the case.</p>}
        <section className="mb-6 rounded-2xl bg-surface-muted p-5">
          <h2 className="mb-4 text-xl font-semibold">Case record</h2>
          <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {['id', 'state', 'caseType', 'bookingId', 'evidenceVersion', 'evidenceHash'].map(key =>
              <div key={key} className="min-w-0"><dt className="text-sm text-ink-muted">{key}</dt><dd className="mt-1 break-words [overflow-wrap:anywhere]">{show(context.case[key])}</dd></div>)}
          </dl>
        </section>
        <ResponsibilityReviewForm key={context.case.id + ':' + context.case.evidenceVersion + ':' + context.case.evidenceHash + ':' + context.case.state} context={context} api={api} onReviewed={() => setRefresh(value => value + 1)} />
        <Record title="Evidence snapshot · chronology and provenance" value={context.evidence} />
        <Record title="Evidence version history" value={context.evidenceVersions} />
        <div className="grid min-w-0 gap-x-8 lg:grid-cols-2">
          <Record title="Model analysis envelope" value={responsibilityInspectionModel(context).envelope} empty="The full model envelope was not retained for this result." />
          <Record title="Deterministic guarded result" value={context.shadowResult} empty="No guarded shadow result recorded." />
        </div>
        <Record title="Production provisional decision" value={context.provisionalDecision} empty="No production provisional decision recorded." />
        <Record title="Authorized human review" value={context.adminReview} empty="No authorized human review recorded." />
        <Record title="Appeal and review history" value={{ appealWindow: context.appealWindow, appeal: context.appeal, appealReview: context.appealReview }} />
        <Record title="Final authority record" value={context.finalDecision} empty="No final authority recorded." />
        <Record title="Shadow audit history" value={context.shadowHistory} />
        <Record title="Adjudication work and factual validation" value={{ work: context.adjudicationWork, validation: responsibilityInspectionModel(context).validation }} />
      </div>}
    </div>
  </main>;
}
