import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../frontend/src/index.css';
import i18n from '../../../frontend/src/i18n';
import Payment from '../../../frontend/src/components/CustomerPaymentPanel';
import Settlement from '../../../frontend/src/components/RideSettlementPanel';
import Cancelled from '../../../frontend/src/components/CancelledBookingPanel';
const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = 'legacy';
i18n.changeLanguage(['en', 'hi', 'hi-Latn'].includes(query.get('language')) ? query.get('language') : 'en');
function Preview() {
  const [phase, setPhase] = useState(query.get('phase') || 'idle');
  const mode = query.get('mode') || 'payment', paid = query.get('paid') === '1';
  const financials = { fare: 100000, coupon: 10000, finalFare: 90000, advance: 9000, advancePaid: paid ? 9000 : 0, remaining: 81000, finalPaid: 0, advancePercentage: 10, advanceDisposition: query.get('refund') || 'partial_refund_pending' };
  const intent = value => { window.__p07Intent?.(value); setPhase('creating'); setTimeout(() => setPhase('failed'), 400); };
  return <main className="min-h-dvh bg-immersive px-4 py-8 text-[var(--text)]">
    <h1 className="mb-6 text-sm">Actual RCS component · synthetic presentation only · {mode}</h1>
    <section data-p07-component className="mx-auto w-full max-w-[377px]">
      {mode === 'payment' ? <Payment purpose="advance" financials={query.get('missing') ? null : financials} phase={phase} bookingReference="P07-SYNTHETIC" onPay={() => intent('component-pay')} onViewBooking={() => window.__p07Intent?.('component-view-booking')} />
        : mode === 'settlement' ? <Settlement ridePayment={{ amount: 81000, state: paid ? 'paid' : 'pending', method: 'cash', upiAvailable: query.get('upi') !== '0' }} phase={phase} onPayUpi={() => intent('component-upi')} onPayCash={() => intent('component-cash')} />
          : <Cancelled financials={financials} reference="P07-SYNTHETIC" onRefresh={() => window.__p07Intent?.('component-refresh')} onHome={() => window.__p07Intent?.('component-home')} />}
    </section>
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
