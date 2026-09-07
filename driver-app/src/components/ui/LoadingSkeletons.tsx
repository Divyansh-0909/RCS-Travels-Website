import { driverCopy as dc } from "../../lib/copy";
import { ScrollView, View } from 'react-native';
import { SkeletonBlock, SkeletonSection } from './Skeleton';

const CARD = '#f3f3f3';
const SURFACE = '#ffffff';
const HAIRLINE = 'rgba(18,18,32,0.1)';
const PRIMARY_BLOCK = 'rgba(255,255,255,0.24)';

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
    accessibilityLabel={dc("Loading page sections")}
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
    accessibilityLabel={dc("Loading account sections")}
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
    accessibilityLabel={dc("Loading captain profile")}
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
    accessibilityLabel={dc("Loading ride offers")}
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
    accessibilityLabel={dc("Loading next rides")}
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

const MarketplaceRowSkeleton = () => (
  <SkeletonSection
    className="w-full rounded-2xl px-4 py-3 gap-3"
    style={{ backgroundColor: CARD }}
  >
    <View className="w-full flex-row items-center gap-3">
      <View className="gap-1 items-center">
        <SkeletonBlock width={58} height={15} />
        <SkeletonBlock width={34} height={11} />
      </View>
      <View className="w-px h-9" style={{ backgroundColor: HAIRLINE }} />
      <View className="flex-1 gap-1.5">
        <SkeletonBlock width="68%" height={15} />
        <SkeletonBlock width="48%" height={12} />
      </View>
      <View className="items-end gap-1.5">
        <SkeletonBlock width={52} height={15} />
        <SkeletonBlock width={42} height={11} />
      </View>
    </View>
    <View className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-1 flex-row items-center gap-2">
        <SkeletonBlock width={104} height={14} />
        <SkeletonBlock width={42} height={14} />
      </View>
      <SkeletonBlock width={8} height={13} />
    </View>
  </SkeletonSection>
);

/** Cold-start fallback for the marketplace board, matched to its final panels. */
export const MarketplacePageSkeleton = () => (
  <View
    accessible
    accessibilityLabel={dc("Loading marketplace bookings")}
    accessibilityState={{ busy: true }}
    className="flex-1 w-[92%] gap-3 overflow-hidden"
  >
    <SkeletonSection className="w-full h-11 flex-row items-center justify-between px-1">
      <SkeletonBlock width={44} height={44} radius={22} />
      <SkeletonBlock width={118} height={20} />
      <SkeletonBlock width={44} height={44} radius={22} />
    </SkeletonSection>

    <SkeletonSection
      className="w-full flex-row gap-2 rounded-full p-1"
      style={{ backgroundColor: CARD }}
    >
      <SkeletonBlock width="48%" height={36} radius={18} />
      <SkeletonBlock width="48%" height={36} radius={18} />
    </SkeletonSection>

    <SkeletonSection className="w-full min-h-16 rounded-2xl p-3 gap-2 bg-primary">
      <SkeletonBlock width="58%" height={14} style={{ backgroundColor: PRIMARY_BLOCK }} />
      <SkeletonBlock width="88%" height={11} style={{ backgroundColor: PRIMARY_BLOCK }} />
      <SkeletonBlock width="70%" height={11} style={{ backgroundColor: PRIMARY_BLOCK }} />
    </SkeletonSection>

    <View className="w-full gap-2">
      <SkeletonSection className="px-1 pt-2">
        <SkeletonBlock width={62} height={11} />
      </SkeletonSection>
      <MarketplaceRowSkeleton />
      <MarketplaceRowSkeleton />
      <MarketplaceRowSkeleton />
    </View>
  </View>
);

const DetailMoneyCardSkeleton = ({ rows = 2 }: { rows?: number }) => (
  <SkeletonSection
    className="w-full rounded-2xl p-5 gap-3"
    style={{ backgroundColor: SURFACE }}
  >
    {Array.from({ length: rows }, (_, index) => (
      <View key={index} className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1.5">
          <SkeletonBlock width={index % 2 === 0 ? '58%' : '72%'} height={14} />
          <SkeletonBlock width={index % 2 === 0 ? '76%' : '64%'} height={11} />
        </View>
        <SkeletonBlock width={54} height={14} />
      </View>
    ))}
    <View className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />
    <View className="flex-row items-center justify-between gap-3">
      <SkeletonBlock width="38%" height={20} />
      <SkeletonBlock width={72} height={20} />
    </View>
  </SkeletonSection>
);

/** Cold-start fallback for a marketplace booking's detail route. */
export const MarketplaceDetailPageSkeleton = () => (
  <View
    accessible
    accessibilityLabel={dc("Loading booking details")}
    accessibilityState={{ busy: true }}
    className="flex-1 w-full"
    style={{ backgroundColor: CARD, marginTop: -40, paddingTop: 40 }}
  >
    <SkeletonSection className="w-full h-11 flex-row items-center gap-2 px-4">
      <SkeletonBlock width={40} height={40} radius={20} />
      <SkeletonBlock width={132} height={20} />
    </SkeletonSection>

    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <SkeletonSection
        className="w-full rounded-2xl overflow-hidden"
        style={{ backgroundColor: SURFACE }}
      >
        <SkeletonBlock width="100%" height={32} radius={0} />
        <View className="p-5 gap-4">
          <View className="gap-2">
            <SkeletonBlock width="54%" height={23} />
            <SkeletonBlock width="42%" height={12} />
            <SkeletonBlock width="32%" height={29} />
          </View>
          <View className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />
          <View className="gap-3">
            {[0, 1].map((index) => (
              <View key={index} className="flex-row items-center gap-3">
                <SkeletonBlock width={12} height={12} radius={6} />
                <View className="flex-1 gap-1.5">
                  <SkeletonBlock width={index === 0 ? '68%' : '74%'} height={15} />
                  <SkeletonBlock width="46%" height={11} />
                </View>
              </View>
            ))}
          </View>
          <SkeletonBlock width="100%" height={56} radius={16} />
        </View>
      </SkeletonSection>

      <View className="gap-2">
        <SkeletonSection className="px-1"><SkeletonBlock width={104} height={11} /></SkeletonSection>
        <DetailMoneyCardSkeleton />
      </View>
      <View className="gap-2">
        <SkeletonSection className="px-1"><SkeletonBlock width={152} height={11} /></SkeletonSection>
        <DetailMoneyCardSkeleton rows={2} />
      </View>
    </ScrollView>

    <SkeletonSection className="w-full px-5 pt-3 pb-6" style={{ backgroundColor: CARD }}>
      <SkeletonBlock width="100%" height={52} radius={16} />
    </SkeletonSection>
  </View>
);

/** A structured cold-start placeholder for the home gate, never a page-sized slab. */
export const HomeGateSkeleton = () => (
  <View
    accessible
    accessibilityLabel={dc("Loading captain home")}
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
