import { useEffect, useRef, useState } from 'react';
import Button from './ui/Button';
import { reviewAction, reviewPayload, reviewClassificationLabels } from '../lib/responsibilityReviewAction';

export default function ResponsibilityReviewForm({ context, api, onReviewed }) {
  const [decision, setDecision] = useState('');
  const [classification, setClassification] = useState('');
  const [level, setLevel] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const action = reviewAction(context);
  if (!action) return <p className="mb-6 text-ink-muted" role="status">{context.finalDecision
    ? 'Human authority is finalized. Review history is retained below.'
    : 'No human review action is available in the recorded state. Notice delivery and appeal prerequisites still apply.'}</p>;
  const field = 'mt-2 w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-background)] px-3 py-3 text-ink focus-visible:outline-2 focus-visible:outline-primary';
  async function submit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    let body;
    try { body = reviewPayload(context, { decision, classification, consequenceLevel: level, reason }); }
    catch (failure) { setError(failure.message); return; }
    inFlight.current = true; setBusy(true); setError('');
    try {
      const result = await api.reviewResponsibility(context.case.id, action, body);
      if (result.error) throw new Error(result.error);
      if (active.current) onReviewed();
    } catch (failure) { if (active.current) setError(failure.message); }
    finally { inFlight.current = false; if (active.current) setBusy(false); }
  }
  return <section className="mb-6 rounded-2xl bg-surface-muted p-5" aria-labelledby="human-review-heading">
    <h2 id="human-review-heading" className="text-xl font-semibold">{action === 'review' ? 'Human review' : 'Appeal review'}</h2>
    <p className="mt-2 max-w-2xl text-sm text-ink-muted">Choose a decision from the evidence. Saving uses the existing notice, appeal and final-authority policy. The model recommendation does not fill these fields.</p>
    <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      <label>Human decision<select className={field} aria-label="Human decision" required disabled={busy} value={decision} onChange={event => { setDecision(event.target.value); setClassification(''); setLevel(''); }}>
        <option value="">Select decision</option><option value="WAIVE">Waive</option><option value="UPHOLD">Uphold</option>
      </select></label>
      <label>Final classification<select className={field} aria-label="Final classification" required disabled={busy || !decision} value={classification} onChange={event => setClassification(event.target.value)}>
        <option value="">Select classification</option>{Object.keys(reviewClassificationLabels).filter(value => decision === 'UPHOLD' ? value === 'DRIVER_CAUSED' : value !== 'DRIVER_CAUSED').map(value => <option key={value} value={value}>{reviewClassificationLabels[value]}</option>)}
      </select></label>
      {decision === 'UPHOLD' && <label>Consequence level<select className={field} aria-label="Consequence level" required disabled={busy} value={level} onChange={event => setLevel(event.target.value)}>
        <option value="">Select level</option><option value="LEVEL_1">LEVEL_1</option><option value="LEVEL_2">LEVEL_2</option>
      </select></label>}
      <label className="sm:col-span-2">Review reason<textarea className={field} aria-label="Review reason" required minLength={3} maxLength={2000} rows={3} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></label>
      {error && <p role="alert" className="sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2"><Button prop={{ type: 'submit', disabled: busy }} className="my-0! w-full! sm:w-auto!">{busy ? 'Saving human decision…' : action === 'review' ? 'Save human review' : 'Resolve appeal'}</Button></div>
    </form>
  </section>;
}
