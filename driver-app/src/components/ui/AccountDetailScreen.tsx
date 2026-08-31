import type { ReactNode } from 'react';
import { ScrollView, View, type ScrollViewProps } from 'react-native';
import { useNavigate } from 'react-router-native';
import AppText from '../AppText';
import BackButton from './BackButton';

export const ACCOUNT_CARD = '#f3f3f3';
export const ACCOUNT_HAIRLINE = 'rgba(18,18,32,0.1)';
export const ACCOUNT_INK = '#121220';
export const ACCOUNT_MUTED = 'text-gray-600';

const TITLE_TRACKING = { letterSpacing: -0.72 };

type Props = {
  title: string;
  children: ReactNode;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
};

/**
 * The shared frame for Account's drill-down pages. Documents and Your cars
 * established this shape: a full-width white scroller, a compact back/title
 * band, 16-point side gutters and no floating app bar over the work below.
 */
const AccountDetailScreen = ({ title, children, contentContainerStyle }: Props) => {
  const navigate = useNavigate();

  return (
    <ScrollView
      className="flex-1 w-full bg-white"
      contentContainerStyle={[
        { paddingBottom: 32, gap: 8 },
        contentContainerStyle,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row items-center gap-2 px-4 pt-4" style={{ paddingBottom: 12 }}>
        <BackButton onPress={() => navigate(-1)} icon="caret" className="-ml-3 -mr-3" />
        <AppText
          className="text-xl font-semibold text-[var(--background-primary)]"
          style={TITLE_TRACKING}
        >
          {title}
        </AppText>
      </View>

      {children}
    </ScrollView>
  );
};

export const AccountSection = ({ children }: { children: ReactNode }) => (
  <View className="mx-4 rounded-2xl p-4" style={{ backgroundColor: ACCOUNT_CARD }}>
    {children}
  </View>
);

/** Flat, inset menu used by Account and its drill-downs. */
export const AccountList = ({ children }: { children: ReactNode }) => (
  <View className="mx-4">{children}</View>
);

export const AccountSectionLabel = ({ children }: { children: ReactNode }) => (
  <View className="mx-4 mt-2">
    <AppText className="text-sm font-semibold text-[var(--background-primary)]">
      {children}
    </AppText>
  </View>
);

export default AccountDetailScreen;
