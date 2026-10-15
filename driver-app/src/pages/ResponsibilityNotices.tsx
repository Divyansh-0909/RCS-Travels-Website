import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { View } from 'react-native';
import AppText from '../components/AppText';
import AccountDetailScreen from '../components/ui/AccountDetailScreen';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { useApi } from '../hooks/useApi';
import { driverAppealAction } from '../lib/driverAppealAction';
import { driverCopy as dc } from '../lib/copy';

type Notice = { caseId: string; reference: string; state: string; canAppeal: boolean;
    noticeDeliveredAt: string | null; appealDeadline: string | null; reviewReason: string | null;
    finalOutcome: string | null; appeal: { status: string; reason: string } | null };

export default function ResponsibilityNotices() {
    const api = useApi();
    const { userId } = useAuth();
    const [notices, setNotices] = useState<Notice[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(false);
    const [refresh, setRefresh] = useState(0);
    const submitting = useRef(false);
    const mounted = useRef(false);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => {
        let live = true;
        setLoading(true); setNotices([]); setSelected(null); setReason(''); setError(null);
        api.getResponsibilityNotices().then(result => {
            if (!live) return;
            if (result?.error) setError(result.error);
            else setNotices(result?.notices ?? []);
        }).catch(() => { if (live) setError(dc('Could not load responsibility notices. Please try again.')); })
            .finally(() => { if (live) setLoading(false); });
        return () => { live = false; };
    }, [api, userId, refresh]);
    const submit = useCallback(async (notice: Notice) => {
        const body = driverAppealAction(notice.caseId, notice.canAppeal, reason);
        if (!body || submitting.current) return;
        submitting.current = true; setPending(true); setError(null);
        try {
            const result = await api.submitResponsibilityAppeal(notice.caseId, body);
            if (!mounted.current) return;
            if (result?.error) setError(result.error);
            else setRefresh(value => value + 1);
        } catch {
            if (mounted.current) setError(dc('Could not submit your appeal. Refresh and try again.'));
        } finally {
            submitting.current = false;
            if (mounted.current) setPending(false);
        }
    }, [api, reason]);
    return <AccountDetailScreen title={dc('Responsibility notices')}>
        <View className="px-4 gap-4">
            {loading ? <AppText className="text-ink-muted">{dc('Loading notices…')}</AppText> : null}
            {error ? <AppText accessibilityRole="alert" className="text-negative">{error}</AppText> : null}
            {!loading && notices.length === 0 ? <AppText className="text-ink">{dc('No responsibility notices')}</AppText> : null}
            {notices.map(notice => <View key={notice.caseId} className="rounded-2xl bg-surface-muted p-4 gap-3">
                <AppText className="text-lg font-semibold text-ink">{notice.reference}</AppText>
                <AppText className="text-ink">{notice.finalOutcome ? dc('Review completed')
                    : notice.appeal ? dc('Appeal submitted') : notice.noticeDeliveredAt ? dc('Provisional decision') : dc('Notice delivery pending')}</AppText>
                {notice.reviewReason ? <AppText className="text-ink">{notice.reviewReason}</AppText> : null}
                {notice.appealDeadline ? <AppText className="text-sm text-ink-muted">{dc('Appeal deadline')}: {new Date(notice.appealDeadline).toLocaleString('en-IN')}</AppText> : null}
                {notice.appeal ? <AppText className="text-ink">{notice.appeal.reason}</AppText> : null}
                {notice.canAppeal && selected !== notice.caseId ? <Button onPress={() => { setSelected(notice.caseId); setReason(''); }}>
                    <AppText className="text-white font-semibold">{dc('Appeal decision')}</AppText>
                </Button> : null}
                {notice.canAppeal && selected === notice.caseId ? <>
                    <AppText className="text-ink font-semibold">{dc('Appeal reason')}</AppText>
                    <Input prop={{ variant: 'light', placeholder: dc('Explain why you are appealing'), value: reason,
                        onChangeFn: setReason, maxLength: 2000 }} />
                    <Button prop={{ disabled: pending || !driverAppealAction(notice.caseId, notice.canAppeal, reason) }} onPress={() => submit(notice)}>
                        <AppText className="text-white font-semibold">{pending ? dc('Submitting appeal…') : dc('Submit appeal')}</AppText>
                    </Button>
                </> : null}
            </View>)}
            <Button prop={{ variant: 'secondary', disabled: pending || loading }} onPress={() => setRefresh(value => value + 1)}>
                <AppText className="text-ink font-semibold">{dc('Refresh notices')}</AppText>
            </Button>
        </View>
    </AccountDetailScreen>;
}
