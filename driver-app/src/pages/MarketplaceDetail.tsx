import { Alert, ScrollView, View } from 'react-native';
import {
    LockKeyIcon,
    PencilSimpleIcon,
} from 'phosphor-react-native';
import { useLocation, useNavigate, useParams } from 'react-router-native';
import AppText from '../components/AppText';
import {
    ActionButton,
    DetailPageHeader,
    DetailStatusBanner,
    type DetailStatusTone,
    HAIRLINE,
    INK_TEXT,
    MUTED,
    PAGE,
    RouteLeg,
    SURFACE,
    WhatsappMark,
} from '../components/ui/rideUi';
import { formatDateTime, rupees, vehicleLabel } from '../constants/booking';
import {
    MARKETPLACE_POSTER_FEE_RATE,
    MARKETPLACE_STATUS,
    marketplaceListings,
    marketplaceMoney,
    type MarketplaceListing,
    type MarketplaceStatus,
} from '../constants/marketplace';
import { openSupportWhatsApp } from '../constants/support';

const SHELL_TOP_PAD = 40;
const MONEY_LINE = 'text-sm font-semibold text-black';

const MARKETPLACE_BANNER_TONE: Record<MarketplaceStatus, DetailStatusTone> = {
    open: 'primary',
    claimed: 'warning',
    completed: 'success',
    cancelled: 'neutral',
};

const Card = ({ children, gap = 'gap-4', banner }: {
    children: React.ReactNode;
    gap?: string;
    banner?: React.ReactNode;
}) => (
    <View className="w-full rounded-2xl" style={{ backgroundColor: SURFACE }}>
        {banner}
        <View className={`p-5 ${gap}`}>{children}</View>
    </View>
);

const Label = ({ children }: { children: React.ReactNode }) => (
    <AppText className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>
        {children}
    </AppText>
);

const MoneyLine = ({ label, amount, note }: {
    label: string;
    amount: number;
    note?: string;
}) => (
    <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
            <AppText className={MONEY_LINE}>{label}</AppText>
            {note ? <AppText className={`text-xs ${MUTED}`}>{note}</AppText> : null}
        </View>
        <AppText className={MONEY_LINE}>{rupees(amount)}</AppText>
    </View>
);

const MarketplaceDetail = () => {
    const { id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();

    const stateListing = (location.state as { listing?: MarketplaceListing } | null)?.listing;
    const listing = stateListing?.id === id
        ? stateListing
        : marketplaceListings().find((candidate) => candidate.id === id);

    const header = <DetailPageHeader title="Booking details" onBack={() => navigate(-1)} />;

    if (!listing) {
        return (
            <View
                className="flex-1 w-full gap-4"
                style={{ backgroundColor: PAGE, marginTop: -SHELL_TOP_PAD, paddingTop: SHELL_TOP_PAD }}
            >
                {header}
                <View className="flex-1 items-center justify-center mx-5 pb-24 gap-1 px-6">
                    <AppText className={`font-semibold text-center ${INK_TEXT}`}>Booking not available</AppText>
                    <AppText className={`text-sm text-center ${MUTED}`}>
                        It may have been claimed, cancelled or removed.
                    </AppText>
                </View>
            </View>
        );
    }

    const status = MARKETPLACE_STATUS[listing.status];
    const money = marketplaceMoney(listing);
    const posterFeePercent = MARKETPLACE_POSTER_FEE_RATE * 100;

    const action = () => {
        if (listing.status !== 'open') {
            openSupportWhatsApp(`Hi, I need help with marketplace booking ${listing.id}.`);
            return;
        }

        Alert.alert(
            listing.mine ? 'Listing management is not connected yet' : 'Claiming is not connected yet',
            'This screen is ready for the marketplace payment service. No booking or wallet balance has been changed.',
        );
    };

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: PAGE, marginTop: -SHELL_TOP_PAD, paddingTop: SHELL_TOP_PAD }}
        >
            {header}
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    paddingHorizontal: 20,
                    paddingTop: 16,
                    paddingBottom: 16,
                    gap: 16,
                }}
                showsVerticalScrollIndicator={false}
            >
                <Card
                    banner={(
                        <DetailStatusBanner
                            label={listing.mine ? `Your listing · ${status.label}` : `${status.label} booking`}
                            tone={MARKETPLACE_BANNER_TONE[listing.status]}
                        />
                    )}
                >
                    <View className="gap-1">
                        <AppText
                            numberOfLines={1}
                            className={`text-2xl font-semibold ${INK_TEXT}`}
                            style={{ letterSpacing: -0.5 }}
                        >
                            {vehicleLabel(listing.vehicleClass)} booking
                        </AppText>
                        <AppText className={`text-sm ${MUTED}`}>{formatDateTime(listing.scheduledAt)}</AppText>
                        <AppText className="text-3xl font-semibold text-black" style={{ letterSpacing: -0.9 }}>
                            {rupees(listing.fare)}
                        </AppText>
                    </View>

                    <View className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />

                    <View className="gap-3">
                        <RouteLeg address={listing.pickupAddress} />
                        <RouteLeg address={listing.dropAddress} drop />
                    </View>

                    <View className="flex-row items-center gap-3 rounded-2xl p-3 bg-primary">
                        <View className="w-8 h-8 shrink-0 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.16)' }}>
                            <LockKeyIcon size={17} weight="bold" color="#ffffff" />
                        </View>
                        <AppText className="flex-1 text-xs leading-4 text-white">
                            Pay the marketplace deposit to unlock the contact details of the booking owner and customer.
                        </AppText>
                    </View>
                </Card>

                <View className="gap-2">
                    <View className="px-1"><Label>Your breakdown</Label></View>
                    <Card gap="gap-3">
                        <View className="gap-2">
                            {listing.mine ? (
                                <>
                                    <MoneyLine
                                        label="Marketplace deposit"
                                        amount={listing.deposit}
                                        note="Set by you when the booking was posted"
                                    />
                                    <MoneyLine
                                        label="Marketplace fee"
                                        amount={-money.posterFee}
                                        note={`${posterFeePercent}% of your deposit`}
                                    />
                                </>
                            ) : (
                                <>
                                    <MoneyLine
                                        label="Customer fare"
                                        amount={listing.fare}
                                        note="Paid directly to you after the ride"
                                    />
                                    <MoneyLine
                                        label="Marketplace deposit"
                                        amount={-listing.deposit}
                                        note="Held when you claim"
                                    />
                                </>
                            )}
                        </View>

                        <View className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />

                        <View className="flex-row items-center justify-between gap-3">
                            <View className="flex-1">
                                <AppText className={`text-xl font-semibold ${INK_TEXT}`}>
                                    {listing.mine ? 'You receive' : 'You get'}
                                </AppText>
                                {listing.mine ? (
                                    <AppText className={`text-xs ${MUTED}`}>After the ride is completed</AppText>
                                ) : null}
                            </View>
                            <AppText className={`text-xl font-semibold ${INK_TEXT}`}>
                                {rupees(listing.mine ? money.posterNet : money.claimerNet)}
                            </AppText>
                        </View>
                    </Card>
                </View>

                <View className="gap-2">
                    <View className="px-1"><Label>If the booking is cancelled</Label></View>
                    <Card gap="gap-3">
                        {listing.mine ? (
                            <>
                                <MoneyLine
                                    label="If you cancel after it is claimed"
                                    amount={0}
                                    note="The claiming captain gets the full held deposit back"
                                />
                                <MoneyLine
                                    label="If the claiming captain cancels"
                                    amount={0}
                                    note={`${rupees(money.cancellationFee)} goes to the platform and ${rupees(money.cancellationRefund)} returns to them`}
                                />
                            </>
                        ) : (
                            <>
                                <MoneyLine
                                    label="If you cancel after claiming"
                                    amount={money.cancellationRefund}
                                    note={`${rupees(money.cancellationFee)} is the 12% cancellation fee`}
                                />
                                <MoneyLine
                                    label="If the posting captain cancels"
                                    amount={listing.deposit}
                                    note="Your full marketplace deposit is returned"
                                />
                            </>
                        )}
                    </Card>
                </View>
            </ScrollView>

            <View
                className="w-full flex-row px-5 pt-3 pb-6"
                style={{ backgroundColor: PAGE }}
            >
                <ActionButton
                    label={
                        listing.status !== 'open'
                            ? 'Contact support'
                            : listing.mine
                                ? 'Manage listing'
                                : `Claim for ${rupees(listing.deposit)}`
                    }
                    leading={
                        listing.status !== 'open'
                            ? <WhatsappMark />
                            : listing.mine
                                ? <PencilSimpleIcon size={18} weight="bold" color="#ffffff" />
                                : null
                    }
                    solid
                    size="large"
                    onPress={action}
                />
            </View>
        </View>
    );
};

export default MarketplaceDetail;
