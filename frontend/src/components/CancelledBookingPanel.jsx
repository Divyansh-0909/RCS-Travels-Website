import Button from './ui/Button';
import { cancelledAdvanceSummary } from '../lib/cancelledAdvanceSummary';
import { useWebsiteCopy } from '../hooks/useWebsiteCopy';

export default function CancelledBookingPanel({ financials, reference, onRefresh, loading, onHome }) {
  const tr = useWebsiteCopy();
  const summary = cancelledAdvanceSummary(financials?.advanceDisposition);
  return <section className="flex w-[min(86vw,100%)] max-w-md flex-col gap-6 py-8 text-[var(--text)]" data-testid="cancelled-booking">
    <header>
      <p className="mb-2 break-words text-sm text-[var(--text-muted)]">{reference}</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">{tr('Ride cancelled')}</h1>
      <p className="mt-3 text-[var(--text-muted)]">{tr('This ride has ended. No driver is being assigned to it.')}</p>
    </header>
    {financials && <div role="status" className="rounded-2xl bg-[var(--background-muted)] p-5">
      <h2 className="text-xl font-semibold">{tr(summary.title)}</h2>
      <p className="mt-2 text-[var(--text-muted)]">{tr(summary.message)}</p>
    </div>}
    <div className="flex flex-col gap-2">
      <Button onClick={onRefresh} prop={{ width: '100%', disabled: loading }}>{loading ? tr('Refreshing…') : tr('Refresh payment status')}</Button>
      <Button onClick={onHome} prop={{ variant: 'input', width: '100%', border: false }}>{tr('Back to home')}</Button>
    </div>
  </section>;
}
