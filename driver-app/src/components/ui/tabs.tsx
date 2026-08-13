import { cssInterop } from 'nativewind';
import { HouseIcon, PlusIcon, ReceiptIcon, StorefrontIcon, UserIcon } from 'phosphor-react-native';

/**
 * The app's destinations, and who is allowed to reach them.
 *
 * SHARED BECAUSE TWO THINGS DRAW THEM. The tab bar has them normally; the side
 * menu has them while a captain is on a ride, when the bar has stood aside for
 * the map. A second copy of this list is a screen that quietly offers a tab the
 * other one has stopped offering — and the gating below is a permission rule, so
 * the copy that drifts is the one that lets an unapproved captain into a screen
 * the server will refuse him.
 */

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;

export const HomeIcon = cssInterop(HouseIcon, asThemed);
export const RidesIcon = cssInterop(ReceiptIcon, asThemed);
export const PostIcon = cssInterop(PlusIcon, asThemed);
export const MarketIcon = cssInterop(StorefrontIcon, asThemed);
export const ProfileIcon = cssInterop(UserIcon, asThemed);

export type Tab = { name: string; path: string; Icon: typeof HomeIcon };

export const TABS: Tab[] = [
    { name: 'Home', path: '/', Icon: HomeIcon },
    { name: 'Market', path: '/available', Icon: MarketIcon },
    { name: 'Post', path: '/post', Icon: PostIcon },
    { name: 'Rides', path: '/rides', Icon: RidesIcon },
    { name: 'Account', path: '/account', Icon: ProfileIcon },
];

// The bar an unapproved captain gets. Market, Post and Rides all 403 at the
// server until his documents are approved, so a tab that opens a screen with
// nothing in it — or bounces him straight back — is worse than no tab. What is
// left is the two screens that can move him forward: Home, which is his
// application status while he waits, and Account, which is where the documents
// themselves live.
//
// Names rather than a second array, so a tab added to TABS above cannot quietly
// appear here as well.
const ONBOARDING_TABS = ['Home', 'Account'];

// Plus Rides, for a captain who is blocked but still owes somebody a trip — a
// suspension does not cancel the rides he was already given, and the server lets
// him finish them (requireDriverForAssignedWork). Without this tab the route is
// reachable only by deep link, which is no way to reach a rider who is standing
// at a kerb.
const OWES_RIDES_TABS = [...ONBOARDING_TABS, 'Rides'];

export const tabsFor = (canDrive: boolean, owesRides: boolean): Tab[] => {
    const allowed = canDrive ? null : owesRides ? OWES_RIDES_TABS : ONBOARDING_TABS;
    return allowed ? TABS.filter((tab) => allowed.includes(tab.name)) : TABS;
};
