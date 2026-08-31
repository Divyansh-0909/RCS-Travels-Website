import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { StarIcon } from 'phosphor-react-native';
import AppText from '../components/AppText';
import AccountRow from '../components/ui/AccountRow';
import AccountDetailScreen, {
  ACCOUNT_MUTED,
  AccountList,
  AccountSection,
  AccountSectionLabel,
} from '../components/ui/AccountDetailScreen';
import { useApi } from '../hooks/useApi';
import { DetailSectionsSkeleton } from '../components/ui/LoadingSkeletons';

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  booking: { reference: string };
};

type FeedbackResponse = {
  summary: { average: number; count: number } | null;
  reviews: Review[];
};

const dateLabel = (value: string) => new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
}).format(new Date(value));

const Stars = ({ value, size = 17 }: { value: number; size?: number }) => (
  <View className="flex-row gap-0.5" accessibilityLabel={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((star) => (
      <StarIcon
        key={star}
        size={size}
        weight={star <= value ? 'fill' : 'regular'}
        color={star <= value ? '#92400E' : 'rgba(18,18,32,0.25)'}
      />
    ))}
  </View>
);

type FeedbackViewProps = {
  data: FeedbackResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

export const FeedbackView = ({ data, loading, error, onRetry }: FeedbackViewProps) => (
  <AccountDetailScreen title="Feedback">
    {loading ? (
      <DetailSectionsSkeleton cards={3} />
    ) : error ? (
      <AccountSection>
        <AppText className={`text-sm ${ACCOUNT_MUTED}`}>{error}</AppText>
        <Pressable
          role="button"
          onPress={onRetry}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginTop: 8 })}
        >
          <AppText className="text-sm font-semibold text-primary">Try again</AppText>
        </Pressable>
      </AccountSection>
    ) : !data?.summary ? (
      <AccountSection>
        <View className="items-center py-6">
          <View className="w-12 h-12 rounded-full items-center justify-center bg-white">
            <StarIcon size={24} weight="regular" color="#121220" />
          </View>
          <AppText className="font-semibold mt-3 text-[var(--background-primary)]">
            No feedback yet
          </AppText>
          <AppText className={`text-sm text-center mt-1 ${ACCOUNT_MUTED}`}>
            Ratings and comments from completed rides will appear here.
          </AppText>
        </View>
      </AccountSection>
    ) : (
      <>
        <AccountSection>
          <View className="flex-row items-center gap-4">
            <AppText className="text-4xl font-semibold text-[var(--background-primary)]">
              {data.summary.average.toFixed(1)}
            </AppText>
            <View className="flex-1 gap-1">
              <Stars value={Math.round(data.summary.average)} size={19} />
              <AppText className={`text-sm ${ACCOUNT_MUTED}`}>
                From {data.summary.count} {data.summary.count === 1 ? 'ride' : 'rides'}
              </AppText>
            </View>
          </View>
        </AccountSection>

        <AccountSectionLabel>Recent rider feedback</AccountSectionLabel>
        <AccountList>
          {data.reviews.map((review, index) => (
            <AccountRow
              key={review.id}
              label={review.comment || 'Rating only'}
              detail={`Ride ${review.booking.reference} · ${dateLabel(review.createdAt)}`}
              value={`${review.rating}/5`}
              Icon={StarIcon}
              last={index === data.reviews.length - 1}
            />
          ))}
        </AccountList>
      </>
    )}
  </AccountDetailScreen>
);

const Feedback = () => {
  const api = useApi();
  const apiRef = useRef(api);
  apiRef.current = api;

  const [data, setData] = useState<FeedbackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const result = await apiRef.current.getFeedback();
    if (result.error) setError(result.error);
    else setData(result as FeedbackResponse);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return <FeedbackView data={data} loading={loading} error={error} onRetry={load} />;
};

export default Feedback;
