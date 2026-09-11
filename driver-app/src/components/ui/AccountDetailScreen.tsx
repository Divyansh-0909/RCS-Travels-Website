import type { ReactNode } from 'react';
import { ScrollView, View, type ScrollViewProps } from 'react-native';
import { useNavigate } from 'react-router-native';
import AppText from '../AppText';
import BackButton from './BackButton';

export const ACCOUNT_MUTED = 'text-ink-muted';

const TITLE_TRACKING = { letterSpacing: -0.72 };

type Props = {
  title: string;
  children: ReactNode;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  centeredHeader?: boolean;
};

/**
 * The shared frame for Account's drill-down pages. Documents and Your cars
 * established this shape: a full-width white scroller, a compact back/title
 * band, 16-point side gutters and no floating app bar over the work below.
 */
const AccountDetailScreen = ({ title, children, contentContainerStyle, centeredHeader = false }: Props) => {
  const navigate = useNavigate();

  return (
    <ScrollView
      className="flex-1 w-full bg-canvas"
      contentContainerStyle={[
        { paddingBottom: 32, paddingTop: centeredHeader ? 8 : 0, gap: 8 },
        contentContainerStyle,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {centeredHeader ? (
        <View className="relative mx-4" style={{ paddingBottom: 12 }}>
          <View className="flex-row h-full items-baseline justify-center pt-1 mb-1">
            <AppText
              className="text-xl font-semibold text-center text-ink"
              style={TITLE_TRACKING}
            >
              {title}
            </AppText>
          </View>
          <BackButton
            onPress={() => navigate(-1)}
            className="absolute -top-2 left-0 rounded-full bg-surface-muted"
          />
        </View>
      ) : (
        <View className="flex-row items-center gap-2 px-4 pt-4" style={{ paddingBottom: 12 }}>
          <BackButton onPress={() => navigate(-1)} icon="caret" className="-ml-3 -mr-3" />
          <AppText
            className="text-xl font-semibold text-ink"
            style={TITLE_TRACKING}
          >
            {title}
          </AppText>
        </View>
      )}

      {children}
    </ScrollView>
  );
};

export const AccountSection = ({ children }: { children: ReactNode }) => (
  <View className="mx-4 rounded-2xl p-4 bg-surface-muted">
    {children}
  </View>
);

/** Flat, inset menu used by Account and its drill-downs. */
export const AccountList = ({ children }: { children: ReactNode }) => (
  <View className="mx-4">{children}</View>
);

export const AccountSectionLabel = ({ children }: { children: ReactNode }) => (
  <View className="mx-4 mt-2">
    <AppText className="text-sm font-semibold text-ink">
      {children}
    </AppText>
  </View>
);

export default AccountDetailScreen;
