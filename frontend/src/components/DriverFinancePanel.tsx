import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi';

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value ?? 0);
const inputClass = 'w-full rounded-xl border border-border/60 bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink/40';
const buttonClass = 'rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40';
const secondaryButton = 'rounded-xl border border-border/70 bg-surface px-3 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40';

type Props = { driverId: string };

const DriverFinancePanel = ({ driverId }: Props) => {
  const api = useApi();
  const [finance, setFinance] = useState<any>(null);
  const [reconciliation, setReconciliation] = useState<any>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [adjustmentReference, setAdjustmentReference] = useState(() => `adj-${driverId}-${Date.now()}`);
  const [repairNote, setRepairNote] = useState('Reconcile cached wallet balance to ledger');
  const [repairReference, setRepairReference] = useState(() => `repair-${driverId}-${Date.now()}`);
  const [payoutReference, setPayoutReference] = useState(() => `payout-${driverId}-${Date.now()}`);

  const load = useCallback(async () => {
    const [financeResult, reconciliationResult, batchesResult] = await Promise.all([
      api.getDriverFinance(driverId),
      api.getFinanceReconciliation(),
      api.getPayoutBatches(),
    ]);
    if (financeResult.error) setError(financeResult.error);
    else setFinance(financeResult);
    if (!reconciliationResult.error) {
      setReconciliation(reconciliationResult.drivers?.find((row: any) => row.id === driverId) ?? null);
    }
    if (!batchesResult.error) setBatches(batchesResult.batches ?? []);
  }, [api, driverId]);

  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, action: () => Promise<any>, success: string) => {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      if (result?.error) setError(result.error);
      else {
        setMessage(success);
        await load();
      }
      return result;
    } finally {
      setBusy(null);
    }
  };

  const driverBatches = useMemo(() => batches.filter((batch) =>
    batch.payouts?.some((payout: any) => payout.driverId === driverId)), [batches, driverId]);

  const submitAdjustment = async () => {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric === 0 || !adjustmentNote.trim() || !adjustmentReference.trim()) {
      setError('Enter a non-zero amount, note, and stable reference.');
      return;
    }
    const result = await run('adjust', () => api.postDriverFinanceAdjustment(driverId, {
      amount: numeric,
      note: adjustmentNote.trim(),
      reference: adjustmentReference.trim(),
    }), 'Wallet adjustment posted.');
    if (result && !result.error) {
      setAmount('');
      setAdjustmentNote('');
      setAdjustmentReference(`adj-${driverId}-${Date.now()}`);
    }
  };

  const createAndExecutePayout = async () => {
    setBusy('payout');
    setError(null);
    setMessage(null);
    try {
      const created = await api.createPayoutBatch({ reference: payoutReference.trim(), driverIds: [driverId] });
      if (created.error) { setError(created.error); return; }
      const executed = await api.executePayoutBatch(created.id);
      if (executed.error) { setError(executed.error); return; }
      setMessage(`Payout batch ${executed.batch?.status ?? 'submitted'}.`);
      setPayoutReference(`payout-${driverId}-${Date.now()}`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (!finance) {
    return <div className="p-4 text-sm text-ink-muted">{error ?? 'Loading finance…'}</div>;
  }

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="grid grid-cols-3 gap-2">
        {[
          ['Available', finance.balances.available],
          ['Held', finance.balances.held],
          ['Total', finance.balances.total],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl bg-surface-muted px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</p>
            <p className="mt-1 text-base font-semibold text-ink">{money(Number(value))}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Payout UPI</p>
            <p className="text-sm text-ink-muted">{finance.payoutAccount.upiId || 'Not linked'}</p>
          </div>
          <button
            className={finance.payoutAccount.verified ? secondaryButton : buttonClass}
            disabled={!finance.payoutAccount.upiId || busy === 'verify'}
            onClick={() => run('verify', () => api.setPayoutVerification(driverId, !finance.payoutAccount.verified), finance.payoutAccount.verified ? 'Payout verification removed.' : 'Payout account verified.')}
          >
            {finance.payoutAccount.verified ? 'Remove verification' : 'Verify UPI'}
          </button>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-border/50 p-3">
        <p className="text-sm font-semibold text-ink">Manual wallet adjustment</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className={inputClass} inputMode="decimal" placeholder="Amount, e.g. -150 or 250" value={amount} onChange={(event) => setAmount(event.target.value)} />
          <input className={inputClass} placeholder="Stable reference" value={adjustmentReference} onChange={(event) => setAdjustmentReference(event.target.value)} />
        </div>
        <input className={inputClass} placeholder="Reason / audit note" value={adjustmentNote} onChange={(event) => setAdjustmentNote(event.target.value)} />
        <button className={buttonClass} disabled={busy === 'adjust'} onClick={submitAdjustment}>Post adjustment</button>
      </div>

      <div className="space-y-2 rounded-xl border border-border/50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Reconciliation</p>
            <p className={`text-sm ${reconciliation?.inSync ? 'text-green-700' : 'text-red-700'}`}>
              {reconciliation ? (reconciliation.inSync ? 'Ledger and cache match' : `Drift ${money(reconciliation.drift)}`) : 'Unavailable'}
            </p>
          </div>
          <span className="text-xs text-ink-muted">Cache {money(finance.cacheBalance)}</span>
        </div>
        {!reconciliation?.inSync && reconciliation && (
          <>
            <input className={inputClass} placeholder="Repair reference" value={repairReference} onChange={(event) => setRepairReference(event.target.value)} />
            <input className={inputClass} placeholder="Repair audit note" value={repairNote} onChange={(event) => setRepairNote(event.target.value)} />
            <button className={secondaryButton} disabled={busy === 'repair'} onClick={() => run('repair', () => api.repairDriverFinance(driverId, { reference: repairReference.trim(), note: repairNote.trim() }), 'Wallet cache repaired and audited.')}>Repair cached balance</button>
          </>
        )}
      </div>

      <div className="space-y-2 rounded-xl border border-border/50 p-3">
        <p className="text-sm font-semibold text-ink">Payout</p>
        <p className="text-xs text-ink-muted">Creates a batch for this captain’s current positive available balance, then sends it through the configured payout provider.</p>
        <input className={inputClass} placeholder="Stable payout reference" value={payoutReference} onChange={(event) => setPayoutReference(event.target.value)} />
        <button className={buttonClass} disabled={busy === 'payout' || !finance.payoutAccount.verified || finance.balances.available <= 0} onClick={createAndExecutePayout}>Create & execute payout</button>
        {driverBatches.slice(0, 3).map((batch) => (
          <div key={batch.id} className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
            <div className="flex items-center justify-between gap-2"><span>{batch.reference}</span><span className="font-semibold uppercase">{batch.status}</span></div>
            {batch.payouts?.filter((p: any) => p.driverId === driverId).map((payout: any) => (
              <div key={payout.id} className="mt-2 flex items-center justify-between gap-2">
                <span>{money((payout.amount ?? 0) / 100)} · {payout.status}</span>
                {payout.externalPayoutId && <button className="font-semibold text-ink underline" onClick={() => run(`refresh-${payout.id}`, () => api.refreshPayout(payout.id), 'Payout status refreshed.')}>Refresh</button>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {finance.openHolds.length > 0 && (
        <div className="rounded-xl bg-surface-muted p-3">
          <p className="text-sm font-semibold text-ink">Open wallet holds</p>
          {finance.openHolds.map((hold: any) => <p key={hold.bookingId} className="mt-1 text-xs text-ink-muted">{hold.bookingId.slice(0, 8)} · {money(hold.amount)} held</p>)}
        </div>
      )}

      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded-xl bg-green-500/10 px-3 py-2 text-sm text-green-700">{message}</p>}
    </div>
  );
};

export default DriverFinancePanel;
