import { ScrollView, View } from 'react-native';
import { SkeletonBlock, SkeletonSection } from './Skeleton';

const CARD = '#f3f3f3';
const HAIRLINE = 'rgba(18,18,32,0.1)';

const Card = ({ children }: { children: React.ReactNode }) => (
  <SkeletonSection
    className="w-full rounded-2xl p-4"
    style={{ backgroundColor: CARD }}
  >
    {children}
  </SkeletonSection>
);

const ListRow = ({ last = false }: { last?: boolean }) => (
  <View
    className="flex-row items-center gap-3 py-3.5"
    style={last ? undefined : { borderBottomWidth: 1, borderBottomColor: HAIRLINE }}
  >
    <SkeletonBlock width={36} height={36} radius={12} />
    <View className="flex-1 gap-2">
      <SkeletonBlock width="54%" height={15} />
      <SkeletonBlock width="34%" height={11} />
    </View>
    <SkeletonBlock width={10} height={14} />
  </View>
);

/** Cards used under an already-rendered detail-page header. */
export const DetailSectionsSkeleton = ({ cards = 3 }: { cards?: number }) => (
  <View
    accessible
    accessibilityLabel="Loading page sections"
    accessibilityState={{ busy: true }}
    className="mx-4 gap-2"
  >
    {Array.from({ length: cards }, (_, index) => (
      <Card key={index}>
        <View className="gap-3">
          <SkeletonBlock width={index === 0 ? '46%' : '34%'} height={15} />
          <SkeletonBlock width="78%" height={12} />
          {index !== cards - 1 ? <SkeletonBlock width="58%" height={12} /> : null}
        </View>
      </Card>
    ))}
  </View>
);

export const AccountOverviewSkeleton = () => (
  <View
    accessible
    accessibilityLabel="Loading account sections"
    accessibilityState={{ busy: true }}
    className="w-full gap-3"
  >
    <Card>
      <View className="flex-row items-center gap-3">
        <SkeletonBlock width={36} height={36} radius={12} />
        <View className="flex-1 gap-2">
          <SkeletonBlock width="38%" height={15} />
          <SkeletonBlock width="55%" height={11} />
        </View>
      </View>
    </Card>

    <View className="w-full flex-row gap-2">
      {[0, 1].map((index) => (
        <SkeletonSection
          key={index}
          className="flex-1 rounded-2xl p-4 gap-3"
          style={{ backgroundColor: CARD }}
        >
          <SkeletonBlock width="58%" height={12} />
          <SkeletonBlock width="72%" height={25} />
        </SkeletonSection>
      ))}
    </View>

    <SkeletonSection className="w-full px-4">
      <ListRow />
      <ListRow />
      <ListRow last />
    </SkeletonSection>
  </View>
);

export const AccountIdentitySkeleton = () => (
  <View
    accessible
    accessibilityLabel="Loading captain profile"
    accessibilityState={{ busy: true }}
    className="w-full"
  >
    <SkeletonSection className="w-full flex-row items-center gap-4 pb-1">
      <SkeletonBlock width={72} height={72} radius={36} />
      <View className="flex-1 gap-2">
        <SkeletonBlock width="58%" height={23} />
        <SkeletonBlock width="42%" height={13} />
        <SkeletonBlock width="34%" height={18} radius={9} />
      </View>
    </SkeletonSection>
  </View>
);

export const OfferListSkeleton = ({ cards = 3 }: { cards?: number }) => (
  <View
    accessible
    accessibilityLabel="Loading ride offers"
    accessibilityState={{ busy: true }}
    className="w-full gap-3"
  >
    {Array.from({ length: cards }, (_, index) => (
      <Card key={index}>
        <View className="flex-row justify-between items-end mb-4">
          <SkeletonBlock width={86} height={28} />
          <SkeletonBlock width={74} height={18} />
        </View>
        <View className="flex-row gap-2 mb-4">
          <SkeletonBlock width={62} height={26} radius={10} />
          <SkeletonBlock width={82} height={26} radius={10} />
        </View>
        <View className="gap-3">
          <SkeletonBlock width="76%" height={15} />
          <SkeletonBlock width="62%" height={15} />
        </View>
        <View className="flex-row gap-2 mt-4">
          <SkeletonBlock width="48%" height={44} radius={12} />
          <SkeletonBlock width="48%" height={44} radius={12} />
        </View>
      </Card>
    ))}
  </View>
);

export const HomeRideListSkeleton = () => (
  <View
    accessible
    accessibilityLabel="Loading next rides"
    accessibilityState={{ busy: true }}
    className="w-full gap-2"
  >
    {[0, 1].map((index) => (
      <SkeletonSection
        key={index}
        className="w-full rounded-2xl px-4 py-3 gap-3"
        style={{ backgroundColor: CARD }}
      >
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1 gap-2">
            <SkeletonBlock width="66%" height={14} />
            <SkeletonBlock width="44%" height={11} />
          </View>
          <SkeletonBlock width={56} height={18} />
        </View>
      </SkeletonSection>
    ))}
  </View>
);

export const RideDetailSectionsSkeleton = () => (
  <ScrollView
    style={{ flex: 1 }}
    contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 }}
    showsVerticalScrollIndicator={false}
  >
    {[0, 1, 2].map((section) => (
      <SkeletonSection
        key={section}
        className="w-full rounded-2xl p-5 gap-4"
        style={{ backgroundColor: CARD }}
      >
        <SkeletonBlock width={section === 0 ? '48%' : '34%'} height={section === 0 ? 23 : 14} />
        <SkeletonBlock width={section === 0 ? '68%' : '82%'} height={14} />
        <SkeletonBlock width={section === 0 ? '38%' : '57%'} height={14} />
        {section === 0 ? <SkeletonBlock width="100%" height={1} radius={0} /> : null}
      </SkeletonSection>
    ))}
  </ScrollView>
);

/** A structured cold-start placeholder for the home gate, never a page-sized slab. */
export const HomeGateSkeleton = () => (
  <View
    accessible
    accessibilityLabel="Loading captain home"
    accessibilityState={{ busy: true }}
    className="flex-1 w-[92%] gap-4 pt-2 pb-28"
  >
    <SkeletonSection className="flex-1 items-center justify-center gap-3">
      <SkeletonBlock width="52%" height={25} />
      <SkeletonBlock width="68%" height={14} />
    </SkeletonSection>
    <HomeRideListSkeleton />
    <SkeletonSection className="w-full rounded-2xl p-4 gap-3" style={{ backgroundColor: CARD }}>
      <SkeletonBlock width="38%" height={14} />
      <SkeletonBlock width="72%" height={12} />
    </SkeletonSection>
  </View>
);
