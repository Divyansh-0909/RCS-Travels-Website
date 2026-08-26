import { useEffect, useMemo, useState } from 'react';
import { Pressable, SectionList, TextInput, View } from 'react-native';
import { cssInterop } from 'nativewind';
import { MagnifyingGlassIcon, XIcon } from 'phosphor-react-native';
import { useLocation, useNavigate } from 'react-router-native';
import AppText from '../components/AppText';
import { useHideAppBarOnScroll } from '../components/AppBarVisibility';
import MarketplaceRow, { type MarketplaceListing } from '../components/ui/MarketplaceRow';
import { dayBucket } from '../constants/booking';
import { marketplaceListings } from '../constants/marketplace';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Search = cssInterop(MagnifyingGlassIcon, asThemed);
const Clear = cssInterop(XIcon, asThemed);

type MarketplaceScope = 'open' | 'mine';
type MarketplaceSection = { title: string; data: MarketplaceListing[] };

const CARD = '#f3f3f3';
const INK_TEXT = 'text-[var(--background-primary)]';
const MUTED = 'text-gray-600';
const BAR_CLEARANCE = 132;
const TITLE_TRACKING = { letterSpacing: -0.72 };

const TABS: { key: MarketplaceScope; label: string }[] = [
    { key: 'open', label: 'Open bookings' },
    { key: 'mine', label: 'Your listings' },
];

const scopeFromSearch = (search: string): MarketplaceScope =>
    new URLSearchParams(search).get('tab') === 'mine' ? 'mine' : 'open';

const pathForScope = (scope: MarketplaceScope) =>
    scope === 'mine' ? '/available?tab=mine' : '/available';

const Marketplace = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const onScroll = useHideAppBarOnScroll();
    // Marketplace details unmount this list too. Put the selected board on the
    // navigation entry so returning from one of Your listings does not silently
    // switch the captain to Open bookings.
    const [scope, setScope] = useState<MarketplaceScope>(() => scopeFromSearch(location.search));
    const [searching, setSearching] = useState(false);
    const [query, setQuery] = useState('');
    const listings = useMemo(marketplaceListings, []);

    useEffect(() => {
        setScope(scopeFromSearch(location.search));
        setSearching(false);
        setQuery('');
    }, [location.key, location.search]);

    const sections = useMemo<MarketplaceSection[]>(() => {
        const needle = query.trim().toLocaleLowerCase();
        const filtered = listings
            .filter((listing) => (scope === 'mine' ? listing.mine : !listing.mine && listing.status === 'open'))
            .filter((listing) => !needle || [
                listing.pickupAddress,
                listing.dropAddress,
                listing.vehicleClass,
            ].some((value) => value.toLocaleLowerCase().includes(needle)))
            .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

        const groups = new Map<string, MarketplaceListing[]>();
        for (const listing of filtered) {
            const title = dayBucket(new Date(listing.scheduledAt));
            groups.set(title, [...(groups.get(title) ?? []), listing]);
        }

        return Array.from(groups, ([title, data]) => ({ title, data }));
    }, [listings, query, scope]);

    const switchTo = (next: MarketplaceScope) => {
        if (next === scope) return;
        setScope(next);
        navigate(pathForScope(next), { replace: true });
        setQuery('');
    };

    return (
        <View className="flex-1 w-[92%] gap-3">
            <View className="flex-row items-center justify-between gap-3">
                {searching ? (
                    <View className="flex-1 flex-row items-center gap-2 rounded-full px-4 h-11" style={{ backgroundColor: CARD }}>
                        <Search size={18} weight="bold" className={MUTED} />
                        <TextInput
                            autoFocus
                            value={query}
                            onChangeText={setQuery}
                            placeholder="Pickup, drop or vehicle"
                            placeholderTextColor="#6B7280"
                            returnKeyType="search"
                            className={`flex-1 font-sans ${INK_TEXT}`}
                            style={{ paddingVertical: 0 }}
                        />
                        <Pressable
                            role="button"
                            aria-label="Close search"
                            onPress={() => { setSearching(false); setQuery(''); }}
                            hitSlop={8}
                            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                        >
                            <Clear size={18} weight="bold" className={MUTED} />
                        </Pressable>
                    </View>
                ) : (
                    <>
                        <View className="w-11 h-11" />
                        <AppText className={`text-xl font-semibold ${INK_TEXT}`} style={TITLE_TRACKING}>
                            Marketplace
                        </AppText>
                        <Pressable
                            role="button"
                            aria-label="Search marketplace bookings"
                            onPress={() => setSearching(true)}
                            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                        >
                            <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: CARD }}>
                                <Search size={20} weight="bold" className={INK_TEXT} />
                            </View>
                        </Pressable>
                    </>
                )}
            </View>

            <View className="flex-row rounded-full p-1" style={{ backgroundColor: CARD }}>
                {TABS.map((tab) => {
                    const active = tab.key === scope;
                    return (
                        <Pressable
                            key={tab.key}
                            role="tab"
                            aria-selected={active}
                            onPress={() => switchTo(tab.key)}
                            className={`flex-1 items-center justify-center rounded-full py-2.5 px-2 ${active ? 'bg-[#121220]' : 'bg-transparent'}`}
                        >
                            <AppText className={`text-sm font-semibold ${active ? 'text-white' : MUTED}`}>
                                {tab.label}
                            </AppText>
                        </Pressable>
                    );
                })}
            </View>

            <View className="w-full min-h-14 justify-center rounded-2xl p-3 bg-primary">
                <View>
                    <AppText className="text-sm font-semibold text-white">
                        {scope === 'open' ? 'Know the price before you claim' : 'Your deposit settles after the ride'}
                    </AppText>
                    <AppText className="text-xs leading-4 text-[rgba(255,255,255,0.8)]">
                        {scope === 'open'
                            ? 'The customer pays you the fare directly. Rider and poster details stay private until the marketplace deposit hold succeeds.'
                            : 'Deposits start at ₹50 and stay below fare. You receive yours less 10% after completion; your cancellation returns the full hold.'}
                    </AppText>
                </View>
            </View>

            <SectionList
                sections={sections}
                keyExtractor={(item) => item.id}
                stickySectionHeadersEnabled={false}
                showsVerticalScrollIndicator={false}
                onScroll={onScroll}
                scrollEventThrottle={16}
                style={{ flex: 1, width: '100%' }}
                contentContainerStyle={{ gap: 8, paddingBottom: BAR_CLEARANCE, flexGrow: 1 }}
                renderSectionHeader={({ section }) => (
                    <AppText className={`text-xs font-semibold uppercase tracking-wide px-1 pt-2 ${MUTED}`}>
                        {section.title}
                    </AppText>
                )}
                renderItem={({ item }) => (
                    <MarketplaceRow
                        listing={item}
                        onPress={() => navigate(`/available/${item.id}`, { state: { listing: item } })}
                    />
                )}
                ListEmptyComponent={
                    <View className="flex-1 items-center justify-center gap-1 pb-24 px-6">
                        <AppText className={`text-base font-semibold text-center ${INK_TEXT}`}>
                            {query
                                ? 'No listings match that'
                                : scope === 'open'
                                    ? 'No open bookings right now'
                                    : 'You have not posted a booking'}
                        </AppText>
                        <AppText className={`text-sm text-center ${MUTED}`}>
                            {query
                                ? 'Try a pickup, destination, or vehicle class.'
                                : scope === 'open'
                                    ? 'New bookings from other captains will appear here.'
                                    : 'Post an off-app booking when another captain needs to take it.'}
                        </AppText>
                        {scope === 'mine' && !query ? (
                            <Pressable
                                role="button"
                                onPress={() => navigate('/post')}
                                className="mt-4 rounded-full bg-[#121220] px-5 py-3"
                            >
                                <AppText className="font-semibold text-white">Post a booking</AppText>
                            </Pressable>
                        ) : null}
                    </View>
                }
            />
        </View>
    );
};

export default Marketplace;
