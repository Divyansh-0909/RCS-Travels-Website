import { useLanguage as useCopyLanguage } from "../i18n";
import { driverCopy as dc } from "../lib/copy";
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
import { useTheme } from '../theme/ThemeContext';

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

const Stars = ({ value, size = 17 }: { value: number; size?: number }) => {
  const { colors } = useTheme();
  return <View className="flex-row gap-0.5" accessibilityLabel={dc("{{value0}} out of 5 stars", {value0: (value)})}>
    {[1, 2, 3, 4, 5].map((star) => (
      <StarIcon
        key={star}
        size={size}
        weight={star <= value ? 'fill' : 'regular'}
        color={star <= value ? colors.warning : colors.borderUi}
      />
    ))}
  </View>;
};

type FeedbackViewProps = {
  data: FeedbackResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

export const FeedbackView = ({ data, loading, error, onRetry }: FeedbackViewProps) => {
  const { colors } = useTheme();
  return (
  <AccountDetailScreen title={dc("Feedback")}>
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
          <AppText className="text-sm font-semibold text-primary">{dc("Try again")}</AppText>
        </Pressable>
      </AccountSection>
    ) : !data?.summary ? (
      <AccountSection>
        <View className="items-center py-6">
          <View className="w-12 h-12 rounded-full items-center justify-center bg-surface">
            <StarIcon size={24} weight="regular" color={colors.ink} />
          </View>
          <AppText className="font-semibold mt-3 text-ink">{dc("No feedback yet")}</AppText>
          <AppText className={`text-sm text-center mt-1 ${ACCOUNT_MUTED}`}>{dc("Ratings and comments from completed rides will appear here.")}</AppText>
        </View>
      </AccountSection>
    ) : (
      <>
        <AccountSection>
          <View className="flex-row items-center gap-4">
            <AppText className="text-4xl font-semibold text-ink">
              {data.summary.average.toFixed(1)}
            </AppText>
            <View className="flex-1 gap-1">
              <Stars value={Math.round(data.summary.average)} size={19} />
              <AppText className={`text-sm ${ACCOUNT_MUTED}`}>{dc("From") + " "}{data.summary.count} {data.summary.count === 1 ? dc("ride") : dc("rides")}
              </AppText>
            </View>
          </View>
        </AccountSection>

        <AccountSectionLabel>{dc("Recent rider feedback")}</AccountSectionLabel>
        <AccountList>
          {data.reviews.map((review, index) => (
            <AccountRow
              key={review.id}
              label={review.comment || dc("Rating only")}
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
};

const Feedback = () => {
    useCopyLanguage();
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
