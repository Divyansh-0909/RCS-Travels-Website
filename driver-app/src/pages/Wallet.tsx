import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ClockCounterClockwiseIcon, LockKeyIcon, WalletIcon } from 'phosphor-react-native';
import AppText from '../components/AppText';
import AccountDetailScreen, { ACCOUNT_MUTED, AccountSectionLabel } from '../components/ui/AccountDetailScreen';
import Button from '../components/ui/Button';
import InlineError from '../components/ui/InlineError';
import { rupees } from '../constants/booking';
import { useApi } from '../hooks/useApi';
import { useDriver } from '../hooks/useDriver';
import { driverCopy as dc } from '../lib/copy';
import { useTheme } from '../theme/ThemeContext';

type WalletEntry = {
  id: string;
  amount: number;
  type: string;
  method: string | null;
  bookingId: string | null;
  note: string | null;
  createdAt: string;
};

type WalletStatement = {
  balances: { available: number; held: number; total: number };
  cacheBalance: number;
  inSync: boolean;
  payoutAccount: { upiId: string | null; verified: boolean; verifiedAt: string | null };
  openHolds: Array<{ bookingId: string; amount: number }>;
  entries: WalletEntry[];
  nextCursor: string | null;
};

const labelForEntry = (type: string) => ({
  ride_earning: dc('Ride earning'),
  deposit_hold: dc('Held for ride'),
  deposit_refund: dc('Hold released'),
  fine: dc('Fine'),
  adjustment: dc('Adjustment'),
  debt_payment: dc('Balance cleared'),
  payout: dc('Payout sent'),
  payout_reversal: dc('Payout returned'),
}[type] ?? type.replace(/_/g, ' '));

const BalanceBox = ({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) => (
  <View className={`flex-1 rounded-2xl p-4 ${emphasis ? 'bg-[var(--background-primary)]' : 'bg-surface-muted'}`}>
    <AppText className={`text-xs ${emphasis ? 'text-[rgba(255,255,255,0.7)]' : ACCOUNT_MUTED}`}>{label}</AppText>
    <AppText className={`mt-1 text-xl font-semibold ${emphasis ? 'text-white' : 'text-ink'}`}>{rupees(value)}</AppText>
  </View>
);

const Wallet = () => {
  const api = useApi();
  const { refresh: refreshProfile } = useDriver();
  const { colors } = useTheme();
  const [statement, setStatement] = useState<WalletStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await api.getWallet();
    if (result.error) setError(result.error);
    else {
      setStatement(result as WalletStatement);
      setError(null);
    }
    setLoading(false);
  }, [api]);

  useEffect(() => { void refresh(); }, [refresh]);

  const hasDebt = (statement?.balances.available ?? 0) < 0;
  const debt = Math.abs(statement?.balances.available ?? 0);
  const heldCopy = useMemo(() => {
    const count = statement?.openHolds.length ?? 0;
    return count === 1 ? dc('1 active ride hold') : dc('{{value0}} active ride holds', { value0: count });
  }, [statement?.openHolds.length]);

  const clearDebt = async () => {
    setPaying(true);
    setError(null);
    setNotice(null);
    try {
      const order = await api.createDebtPaymentOrder();
      if (order.error) {
        setError(order.error);
        return;
      }
      if (!order.checkoutUrl) {
        setError(dc('Payment checkout is unavailable. Please try again.'));
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(order.checkoutUrl, 'rcscaptains://wallet/payment');
      if (result.type !== 'success' || !result.url) {
        setNotice(dc('Payment was cancelled. Your wallet was not changed.'));
        return;
      }

      const callback = new URL(result.url);
      if (callback.searchParams.get('status') !== 'success') {
        setNotice(dc('Payment was cancelled. Your wallet was not changed.'));
        return;
      }
      const paymentId = callback.searchParams.get('paymentId');
      const razorpayOrderId = callback.searchParams.get('razorpay_order_id');
      const razorpayPaymentId = callback.searchParams.get('razorpay_payment_id');
      const signature = callback.searchParams.get('razorpay_signature');
      if (!paymentId || paymentId !== order.paymentId || !razorpayOrderId || !razorpayPaymentId || !signature) {
        setError(dc('Payment response was incomplete. Your wallet has not been credited yet.'));
        return;
      }

      const verified = await api.verifyDebtPayment(paymentId, {
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: signature,
      });
      if (verified.error) {
        setError(verified.error);
        return;
      }

      setNotice(dc('Payment verified. Your available wallet balance has been updated.'));
      await Promise.all([refresh(), refreshProfile()]);
    } finally {
      setPaying(false);
    }
  };

  return (
    <AccountDetailScreen title={dc('Wallet')} centeredHeader>
      {loading ? (
        <View className="items-center py-16"><ActivityIndicator color={colors.ink} /></View>
      ) : statement ? (
        <>
          <View className="mx-4 gap-3">
            <View className="flex-row gap-3">
              <BalanceBox label={dc('AVAILABLE')} value={statement.balances.available} emphasis />
              <BalanceBox label={dc('HELD')} value={statement.balances.held} />
            </View>
            <View className="rounded-2xl bg-surface-muted px-4 py-3 flex-row items-center justify-between">
              <View>
                <AppText className={`text-xs ${ACCOUNT_MUTED}`}>{dc('TOTAL')}</AppText>
                <AppText className="text-base font-semibold text-ink">{rupees(statement.balances.total)}</AppText>
              </View>
              <View className="items-end">
                <AppText className={`text-xs ${ACCOUNT_MUTED}`}>{heldCopy}</AppText>
                <AppText className={`text-xs ${ACCOUNT_MUTED}`}>{dc('Available balance controls whether you can go online.')}</AppText>
              </View>
            </View>

            {hasDebt && (
              <View className="rounded-2xl border border-[#FBBF24]/40 bg-[#FBBF24]/10 p-4 gap-2">
                <View className="flex-row items-center gap-2">
                  <WalletIcon size={20} color={colors.ink} weight="fill" />
                  <AppText className="font-semibold text-ink">{dc('Clear {{value0}} to go online', { value0: rupees(debt) })}</AppText>
                </View>
                <AppText className={`text-sm ${ACCOUNT_MUTED}`}>
                  {dc('The payment order is always created for your current negative AVAILABLE balance. If that debt drops before payment is captured, the excess is refunded.')}
                </AppText>
                <Button prop={{ disabled: paying }} onPress={clearDebt}>{paying ? dc('Opening payment…') : dc('Clear balance')}</Button>
              </View>
            )}

            {!statement.inSync && (
              <View className="rounded-2xl bg-surface-muted p-4 flex-row gap-3">
                <LockKeyIcon size={20} color={colors.inkMuted} />
                <AppText className={`flex-1 text-sm ${ACCOUNT_MUTED}`}>{dc('Wallet reconciliation is pending. Payouts may be held until an admin reviews it.')}</AppText>
              </View>
            )}
            <InlineError message={error} color="#B91C1C" />
            {notice && <AppText className="text-sm text-ink">{notice}</AppText>}
          </View>

          {statement.openHolds.length > 0 && (
            <>
              <AccountSectionLabel>{dc('Held from wallet')}</AccountSectionLabel>
              <View className="mx-4 rounded-2xl overflow-hidden bg-surface-muted">
                {statement.openHolds.map((hold) => (
                  <View key={hold.bookingId} className="px-4 py-3 flex-row items-center justify-between border-b border-border/40">
                    <View className="flex-1 pr-3">
                      <AppText className="text-sm font-semibold text-ink">{dc('Ride hold')}</AppText>
                      <AppText className={`text-xs ${ACCOUNT_MUTED}`}>{hold.bookingId.slice(0, 8).toUpperCase()}</AppText>
                    </View>
                    <AppText className="text-sm font-semibold text-ink">{rupees(hold.amount)}</AppText>
                  </View>
                ))}
              </View>
            </>
          )}

          <AccountSectionLabel>{dc('Wallet history')}</AccountSectionLabel>
          <View className="mx-4 rounded-2xl overflow-hidden bg-surface-muted">
            {statement.entries.length === 0 ? (
              <View className="p-4"><AppText className={`text-sm ${ACCOUNT_MUTED}`}>{dc('No wallet activity yet.')}</AppText></View>
            ) : statement.entries.map((entry) => (
              <View key={entry.id} className="px-4 py-3 flex-row items-center gap-3 border-b border-border/40">
                <ClockCounterClockwiseIcon size={19} color={colors.inkMuted} />
                <View className="flex-1">
                  <AppText className="text-sm font-semibold text-ink">{labelForEntry(entry.type)}</AppText>
                  <AppText className={`text-xs ${ACCOUNT_MUTED}`}>
                    {entry.note || new Date(entry.createdAt).toLocaleDateString()}
                  </AppText>
                </View>
                <AppText className={`text-sm font-semibold ${entry.amount < 0 ? 'text-[#B91C1C]' : 'text-ink'}`}>{rupees(entry.amount)}</AppText>
              </View>
            ))}
          </View>
        </>
      ) : (
        <View className="mx-4"><InlineError message={error ?? dc('Could not load wallet.')} color="#B91C1C" /></View>
      )}
    </AccountDetailScreen>
  );
};

export default Wallet;
