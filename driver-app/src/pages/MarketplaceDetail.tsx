import { useLanguage as useCopyLanguage } from "../i18n";
import { driverCopy as dc } from "../lib/copy";
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
    RouteLeg,
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
import { useTheme } from '../theme/ThemeContext';

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
}) => {
    const { colors } = useTheme();
    return <View className="w-full rounded-2xl" style={{ backgroundColor: colors.surface }}>
        {banner}
        <View className={`p-5 ${gap}`}>{children}</View>
    </View>;
};

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
    useCopyLanguage();
    const { id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { colors } = useTheme();

    const stateListing = (location.state as { listing?: MarketplaceListing } | null)?.listing;
    const listing = stateListing?.id === id
        ? stateListing
        : marketplaceListings().find((candidate) => candidate.id === id);

    const header = <DetailPageHeader title={dc("Booking details")} onBack={() => navigate(-1)} />;

    if (!listing) {
        return (
            <View
                className="flex-1 w-full gap-4"
                style={{ backgroundColor: colors.surfaceMuted, marginTop: -SHELL_TOP_PAD, paddingTop: SHELL_TOP_PAD }}
            >
                {header}
                <View className="flex-1 items-center justify-center mx-5 pb-24 gap-1 px-6">
                    <AppText className={`font-semibold text-center ${INK_TEXT}`}>{dc("Booking not available")}</AppText>
                    <AppText className={`text-sm text-center ${MUTED}`}>{dc("It may have been claimed, cancelled or removed.")}</AppText>
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
            listing.mine ? dc("Listing management is not connected yet") : dc("Claiming is not connected yet"),
            dc("This screen is ready for the marketplace payment service. No booking or wallet balance has been changed."),
        );
    };

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: colors.surfaceMuted, marginTop: -SHELL_TOP_PAD, paddingTop: SHELL_TOP_PAD }}
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
                            label={listing.mine ? dc("Your listing · {{value0}}", {value0: (status.label)}) : dc("{{value0}} booking", {value0: (status.label)})}
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
                            {vehicleLabel(listing.vehicleClass)}{" " + dc("booking")}</AppText>
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
                        <AppText className="flex-1 text-xs leading-4 text-white">{dc("Pay the marketplace deposit to unlock the contact details of the booking owner and customer.")}</AppText>
                    </View>
                </Card>

                <View className="gap-2">
                    <View className="px-1"><Label>{dc("Your breakdown")}</Label></View>
                    <Card gap="gap-3">
                        <View className="gap-2">
                            {listing.mine ? (
                                <>
                                    <MoneyLine
                                        label={dc("Marketplace deposit")}
                                        amount={listing.deposit}
                                        note={dc("Set by you when the booking was posted")}
                                    />
                                    <MoneyLine
                                        label={dc("Marketplace fee")}
                                        amount={-money.posterFee}
                                        note={dc("{{value0}}% of your deposit", { value0: posterFeePercent })}
                                    />
                                </>
                            ) : (
                                <>
                                    <MoneyLine
                                        label={dc("Customer fare")}
                                        amount={listing.fare}
                                        note={dc("Paid directly to you after the ride")}
                                    />
                                    <MoneyLine
                                        label={dc("Marketplace deposit")}
                                        amount={-listing.deposit}
                                        note={dc("Held when you claim")}
                                    />
                                </>
                            )}
                        </View>

                        <View className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />

                        <View className="flex-row items-center justify-between gap-3">
                            <View className="flex-1">
                                <AppText className={`text-xl font-semibold ${INK_TEXT}`}>
                                    {listing.mine ? dc("You receive") : dc("You get")}
                                </AppText>
                                {listing.mine ? (
                                    <AppText className={`text-xs ${MUTED}`}>{dc("After the ride is completed")}</AppText>
                                ) : null}
                            </View>
                            <AppText className={`text-xl font-semibold ${INK_TEXT}`}>
                                {rupees(listing.mine ? money.posterNet : money.claimerNet)}
                            </AppText>
                        </View>
                    </Card>
                </View>

                <View className="gap-2">
                    <View className="px-1"><Label>{dc("If the booking is cancelled")}</Label></View>
                    <Card gap="gap-3">
                        {listing.mine ? (
                            <>
                                <MoneyLine
                                    label={dc("If you cancel after it is claimed")}
                                    amount={0}
                                    note={dc("The claiming captain gets the full held deposit back")}
                                />
                                <MoneyLine
                                    label={dc("If the claiming captain cancels")}
                                    amount={0}
                                    note={dc("{{value0}} goes to the platform and {{value1}} returns to them", { value0: rupees(money.cancellationFee), value1: rupees(money.cancellationRefund) })}
                                />
                            </>
                        ) : (
                            <>
                                <MoneyLine
                                    label={dc("If you cancel after claiming")}
                                    amount={money.cancellationRefund}
                                    note={dc("{{value0}} is the 12% cancellation fee", { value0: rupees(money.cancellationFee) })}
                                />
                                <MoneyLine
                                    label={dc("If the posting captain cancels")}
                                    amount={listing.deposit}
                                    note={dc("Your full marketplace deposit is returned")}
                                />
                            </>
                        )}
                    </Card>
                </View>
            </ScrollView>

            <View
                className="w-full flex-row px-5 pt-3 pb-6"
                style={{ backgroundColor: colors.surfaceMuted }}
            >
                <ActionButton
                    label={
                        listing.status !== 'open'
                            ? dc("Contact support")
                            : listing.mine
                                ? dc("Manage listing")
                                : dc("Claim for {{value0}}", { value0: rupees(listing.deposit) })
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
