import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, Share, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { cssInterop } from 'nativewind';
import {
  BankIcon,
  CarIcon,
  CaretRightIcon,
  FileTextIcon,
  GearIcon,
  InfoIcon,
  QuestionIcon,
  SignOutIcon,
  StarIcon,
  UserIcon,
  UsersThreeIcon,
} from 'phosphor-react-native';
import { useNavigate } from 'react-router-native';
import Constants from 'expo-constants';
import AppText from '../components/AppText';
import VerifiedBadge, { BADGE_BLUE, BADGE_GOLD } from '../components/illustrations/VerifiedBadge';
import { useHideAppBarOnScroll } from '../components/AppBarVisibility';
import AccountRow from '../components/ui/AccountRow';
import MonthEarningsCard from '../components/ui/MonthEarningsCard';
import { TILE_GAP } from '../components/ui/tile';
import JoinFleetCard from '../components/ui/JoinFleetCard';
import WalletCard from '../components/ui/WalletCard';
import { useApi } from '../hooks/useApi';
import { initials } from '../constants/booking';
import { canJoinFleet, formatPhone, formatRating, groupLabel, isFleet, verificationLabel } from '../constants/driver';
import { openSupportWhatsApp, supportPhoneDisplay } from '../constants/support';
import type { DriverProfile } from '../types/enums';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Star = cssInterop(StarIcon, asThemed);
const Car = cssInterop(CarIcon, asThemed);
const Caret = cssInterop(CaretRightIcon, asThemed);
const SignOut = cssInterop(SignOutIcon, asThemed);

const CARD = '#f3f3f3';                          // --foreground-muted
const INK = 'text-[var(--background-primary)]';
const MUTED = 'text-gray-600';

// Login's error red is tuned for the dark auth shell; on this light page it drops
// under AA, so the solid negative from Button is reused instead.
const ERROR_TEXT = '#B91C1C';

// The floating AppBar sits at bottom-6 and runs ~68px tall, and this page scrolls
// under it. Same clearance the Rides board reserves, for the same reason: without it
// the last row can never be read.
const BAR_CLEARANCE = 132;

// Same treatment the wordmark and the Rides title carry, so the three screen titles
// read as one voice. Points, not em — see tailwind.config.js — which is why the
// number is duplicated rather than shared: it is only right at text-xl.
const TITLE_TRACKING = { letterSpacing: -0.72 };

// The one gap between every stacked panel on this page, set on the scroller rather
// than as a margin on each child so nothing can drift out of step.
//
// 8, which is the Rides board's row gap (its contentContainerStyle). The two screens
// stack cards the same way and a captain moves between them constantly, so a
// different rhythm on each reads as one of them being slightly off without ever
// saying which. If that list's gap changes, change this with it.
const PANEL_GAP = 8;

// How far the menu rows pull in from the panels above them, per side.
//
// In points, not a px-* class, for the reason AVATAR below spells out: the spacing
// scale is rem and NativeWind's inlineRem is 14, so px-3 is 10.5pt rather than the 12
// it reads as. A number that has to line up with PANEL_GAP cannot be written in a
// unit that quietly shrinks.
//
// The inset IS the hierarchy now that these rows have no card under them. Everything
// wider than this is a surface carrying a fact; the menu is a list of ways out of the
// page, and pulling it in is what says so without giving it a fourth background.
const ROW_INSET = 12;

// One number for both avatar branches, in POINTS rather than a w-*/h-* class.
//
// The two used to disagree without looking like they did: w-16 is 4rem, and
// NativeWind's inlineRem is 14 (see tokens.cjs), so the class drew a 56px circle
// while the photo beside it was styled at a literal 64. A captain with a picture and
// one without were getting different avatars off code that read as the same size.
//
// borderRadius is half of it rather than rounded-full for the same reason the Rides
// tab pills are className-only: size set by class and radius set by style on one
// element is what turns a circle into a slab. Both live in style here, or neither.
// 76, down from 88 and back up a step. The column beside it is three tight lines, and
// a circle taller than the text it sits against stops reading as a portrait and starts
// reading as a slot the text failed to fill — so the ceiling here is roughly the
// height of that column, not a number of its own.
const AVATAR = 76;

// Chip tones, lifted from RideRow so a fact wearing a pill looks the same wherever it
// appears. The 800 steps rather than the 700s: the lighter ones sit at ~4.2:1 on
// their own tints, under AA at 12px.
//
// No `approved` arm: that state is the badge now. The two that remain are the two an
// icon cannot carry — "In review" and "Not approved" are sentences, and a mark that
// tried to say either would be a mark the captain has to be taught.
const CHIPS: Record<'pending' | 'rejected', { text: string; fill: string }> = {
  pending: { text: 'text-[#92400E]', fill: 'rgba(146,64,14,0.12)' },
  rejected: { text: 'text-[#B91C1C]', fill: 'rgba(185,28,28,0.12)' },
};

const Chip = ({ label, text, fill }: { label: string; text: string; fill: string }) => (
  <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: fill }}>
    <AppText className={`text-xs font-semibold uppercase tracking-wide ${text}`}>
      {label}
    </AppText>
  </View>
);

const Account = () => {
  const api = useApi();
  const navigate = useNavigate();
  const onScroll = useHideAppBarOnScroll();

  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [busy, setBusy] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  // The api object is read through a ref rather than closed over, for the reason the
  // Rides board spells out: useApi memoises on Clerk's getToken, whose identity is not
  // promised across renders, and when it changes every render the effect below re-runs
  // and its cleanup marks the in-flight request stale before it can land — leaving the
  // spinner running forever against a profile that never arrives.
  const apiRef = useRef(api);
  apiRef.current = api;

  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setError(null);
    try {
      const data = await apiRef.current.getMe();
      if (requestId !== latestRequest.current) return;

      // A failed refresh leaves the profile already on screen alone. Blanking a page
      // a captain is reading because one poll missed takes away the only copy he has.
      if ('error' in data) setError(data.error);
      else setProfile(data as DriverProfile);
    } catch (e: unknown) {
      if (requestId !== latestRequest.current) return;
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Unmount only. An empty dep array, so nothing but leaving the screen can abandon a
  // request mid-flight.
  useEffect(() => () => { latestRequest.current++; }, []);

  // The wallet moves while he is driving, not while he is looking at this page, so
  // coming back to the app is the moment worth re-reading it.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });

    return () => subscription.remove();
  }, [refresh]);

  async function handleSignOut() {
    if (busy) return;

    setBusy(true);
    setSignOutError(null);
    try {
      await api.logout();
      // Nothing guards the app routes, so the session ending is not by itself a
      // redirect — send them back to onboarding here.
      navigate('/', { replace: true });
    } catch (e: unknown) {
      setSignOutError(e instanceof Error ? e.message : 'Something went wrong');
      setBusy(false);
    }
  }

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <View className="flex-1 w-[92%] gap-3">
      {/* No action beside it. Every other screen's header earns its right-hand button
          — Rides searches, Home has the bell — and this one has nothing that belongs
          up there, so the title stands alone rather than being given company.

          It still has to sit in the same 44px band they do. Rides centres its heading
          between two h-11 controls, so the text lands 8px down; a bare AppText here is
          only its 28px line box tall and started at the top of it, which is what made
          this title ride higher than that one on identical shell padding. The band is
          the thing the two screens share — reproducing it with a margin would put the
          two headers back out of step the first time either one changed. */}
      <View className="w-full h-11 items-center justify-center">
        <AppText className={`text-xl font-semibold text-center ${INK}`} style={TITLE_TRACKING}>
          Account
        </AppText>
      </View>

      {error && (
        <View className="w-full flex-row items-center justify-between gap-4">
          <AppText numberOfLines={2} className="flex-1 text-sm text-red-600">{error}</AppText>
          <Pressable
            role="button"
            onPress={refresh}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <AppText className="text-sm font-semibold text-primary">Try again</AppText>
          </Pressable>
        </View>
      )}

      {/* PINNED. A sibling of the scroller rather than its first child, so it holds
          its place while everything below it moves.

          Outside rather than sticky-inside: with stickyHeaderIndices this block would
          overlap the content sliding under it, and it has no card of its own to hide
          that — the panel came off deliberately, so the rows would be visible through
          it. As a sibling it occupies real space and nothing can pass behind it.

          The cost is the space itself, which is now permanent: roughly the avatar's
          height off the top of every scroll. That is the trade for keeping the
          captain's own name and standing on screen while he reads the rest. */}
      {profile && (
        <View className="w-full flex-row items-center gap-4" style={{ paddingBottom: 4 }}>
          {/* Who he is. The avatar is the only primary-blue circle in the app, so
              it reads as him rather than as a control.

              No card under it. He is the subject of the page rather than one more
              item on it, and a surface would file him alongside the wallet and the
              month as a third thing to read. */}
          {profile.pfpUrl ? (
            <Image
              source={{ uri: profile.pfpUrl }}
              accessibilityIgnoresInvertColors
              alt={profile.name}
              style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 }}
            />
          ) : (
            <View
              className="items-center justify-center bg-primary"
              style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 }}
            >
              <AppText className="text-3xl font-semibold text-white">
                {initials(profile.name)}
              </AppText>
            </View>
          )}

          {/* One gap for the whole column, so name→number and number→standing
              stay equal to each other however this is tuned. That equality is the
              point: three lines about one person, evenly spaced, read as a block —
              the moment one seam is wider than the other, the wider one starts
              looking like a divider between two different things. */}
          <View className="flex-1" style={{ gap: 2 }}>
            {/* The rating rides with the name rather than down among the
                standing. It is a fact about the person, not about his paperwork,
                and next to it the number reads as his score instead of as a
                third badge. `shrink` on the name is what keeps a long one from
                pushing the pill off the row. */}
            <View className="flex-row items-center gap-2">
              <AppText
                numberOfLines={1}
                className={`shrink text-2xl font-semibold ${INK}`}
                style={{ letterSpacing: -0.5 }}
              >
                {profile.name}
              </AppText>
              {profile.rating && (
                // Padding in POINTS, not p-*. The scale is rem and NativeWind's
                // inlineRem is 14, so the steps around here land 3.5px apart —
                // p-1 to p-1.5 is 1.75px, which is not a visible change on a
                // phone and reads as the class having done nothing at all.
                <View
                  className="flex-row items-center gap-1 rounded-xl"
                  style={{ backgroundColor: CARD, padding: 6 }}
                >
                  <Star size={14} weight="fill" className={INK} />
                  <AppText className={`text-sm font-semibold ${INK}`}>
                    {formatRating(profile.rating.average)}
                  </AppText>
                </View>
              )}
            </View>

            <AppText className={`text-sm ${MUTED}`}>{formatPhone(profile.phone)}</AppText>

            {/* No margin of its own. The column's gap above is the only spacing
                in this block, which is what keeps this seam identical to the one
                between the name and the number. */}
            <View className="flex-row flex-wrap items-center gap-1.5">
              {/* Approved is a mark and a word on the bare panel, with no pill
                  behind it — the badge is already a shape with an edge, and
                  putting it inside a second one gives the eye two borders to
                  read where there is one fact.

                  The WORD is what separates a fleet captain from a partner, and
                  the gold only agrees with it. That ordering is deliberate and
                  has to stay: BADGE_GOLD lands under 3:1 on this panel, so a
                  captain who cannot pick gold out from blue would have nothing
                  left if both said "Verified". Change the colours freely; do not
                  collapse the two labels back into one word.

                  The other two states stay chips: an icon can carry a seal of
                  approval because that mark is already known, but nothing
                  recognisable says "In review", and inventing a glyph for
                  "Not approved" would hide the one status a captain most needs
                  spelled out. */}
              {profile.verificationStatus === 'approved' ? (
                <View className="flex-row items-center gap-1 pr-1">
                  <VerifiedBadge
                    size={22}
                    color={isFleet(profile.group) ? BADGE_GOLD : BADGE_BLUE}
                  />
                  <AppText className={`text-base font-semibold ${INK}`}>
                    {isFleet(profile.group) ? groupLabel(profile.group) : 'Verified'}
                  </AppText>
                </View>
              ) : (
                <Chip
                  label={verificationLabel(profile.verificationStatus)}
                  text={CHIPS[profile.verificationStatus]?.text}
                  fill={CHIPS[profile.verificationStatus]?.fill}
                />
              )}
            </View>
          </View>
        </View>
      )}

      <Animated.ScrollView
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={{ flexGrow: 1, gap: PANEL_GAP, paddingTop: 4, paddingBottom: BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* Inside the scroller rather than instead of it, so the title and the
            pinned block above stay up whatever the network is doing and the list does
            not remount under the captain's thumb when the first load lands. Only a
            first load earns this: a refresh over a profile already on screen leaves
            it alone. */}
        {loading && !profile && (
          <View className="flex-1 items-center justify-center pb-24">
            <ActivityIndicator color="#121220" />
          </View>
        )}

        {profile && (
          <>
            {/* A rejection is the one thing on this page he cannot act on from a
                chip alone, so the reason gets its own line rather than a tooltip
                nobody on a phone can open. */}
            {profile.verificationStatus === 'rejected' && profile.rejectionReason && (
              <View
                className="w-full rounded-2xl px-4 py-3"
                style={{ backgroundColor: 'rgba(185,28,28,0.08)' }}
              >
                <AppText className="text-sm" style={{ color: ERROR_TEXT }}>
                  {profile.rejectionReason}
                </AppText>
              </View>
            )}

            {/* His cars, as a card rather than as a line in the menu below.

                Directly under the identity panel, because it is the rest of the same
                answer: who is driving and what he is driving are one fact about a
                captain, and the money below is a different subject entirely. That
                placement is what earns it a surface — the menu rows are ways out of
                the page, and this is a fact about him that happens to open one.

                The plate is the value, not the count, because the plate is what a
                captain with two cars actually wants to check here: which one is the
                app going to send riders to. The count follows it only when there IS
                more than one — "1 car" tells him something he can see from the
                windscreen. */}
            <Pressable
              role="button"
              aria-label={`Your cars, ${profile.vehicleNumber}`}
              onPress={() => navigate('/account/vehicles')}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <View
                className="w-full flex-row items-center gap-3 rounded-2xl px-4 py-3.5"
                style={{ backgroundColor: CARD }}
              >
                {/* No well behind it. The card is already a surface, and a second one
                    under a single glyph gave the row a box inside a box for no fact
                    that needed separating. */}
                <Car size={26} weight="fill" className={INK} />
                <View className="flex-1">
                  <AppText numberOfLines={1} className={`font-semibold ${INK}`}>
                    Your cars
                  </AppText>
                  <AppText numberOfLines={1} className={`text-xs ${MUTED}`}>
                    {profile.vehicleCount > 1
                      ? `${profile.vehicleNumber} · ${profile.vehicleCount} cars`
                      : profile.vehicleNumber}
                  </AppText>
                </View>
                {/* Earned now, unlike the flat panel this replaces: the tap goes to a
                    screen inside the app, so the caret is keeping a promise rather
                    than making one nothing answers. */}
                <Caret size={16} weight="bold" className={MUTED} />
              </View>
            </Pressable>

            {/* One row, two tiles, equal halves. Money held and money earned are the
                same question asked twice, and stacking them full-width made the
                second one look like a separate topic a scroll away from the first.
                They share their padding, radius and figure size through ui/tile — a
                row of two cards only works while they match.

                The month here, the week on the Rides board: History answers "how did
                this week go" beside a list of recent rides, and this answers "how am
                I doing" against costs a captain pays monthly. */}
            <View className="w-full flex-row" style={{ gap: TILE_GAP }}>
              <WalletCard balance={profile.walletBalance} />
              <MonthEarningsCard summary={profile.month} />
            </View>

            {/* Straight under the money, which is where its argument lands: the tile
                above it is what a partner earned this month, and this is the offer to
                earn more. Down at the foot of the page it was a thing he scrolled
                past; here it reads as the answer to the number he just looked at.
                Partners only — see canJoinFleet. */}
            {canJoinFleet(profile.group) && <JoinFleetCard />}

            {/* One list, hairline-separated, in the order a captain needs them: the
                money first, then the paperwork that can stop him earning it, then
                the settings he touches twice a year.

                No card under it, unlike the panels above. Everything above this point
                is a thing to read — a balance, a total, a car — and a surface is what
                separates one from the next. These are a menu, and a menu on its own
                ground reads as a list of ways out of the page rather than as a fourth
                block of information competing with the three that matter. */}
            <View className="w-full" style={{ paddingHorizontal: ROW_INSET }}>
              <AccountRow
                label="Linked UPI account"
                Icon={BankIcon}
                value="Not linked"
              />
              <AccountRow
                label="Documents"
                Icon={FileTextIcon}
                value={
                  profile.expiringDocuments > 0
                    ? `${profile.expiringDocuments} expiring`
                    : 'All current'
                }
                warn={profile.expiringDocuments > 0}
                onPress={() => navigate('/account/documents')}
              />
              {/* Feedback only. The rating already has a home — the star pill beside
                  his name — and a row repeating the same number two inches below it
                  invited the captain to check whether the two agreed. What is left
                  here is what this row can actually open: what riders wrote. */}
              <AccountRow label="Feedback" Icon={StarIcon} />
              {/* Language lives under Settings, so it is not also a sibling of it. */}
              <AccountRow label="Settings" Icon={GearIcon} />
              {/* His name, his number, his papers — and the way out of the platform
                  altogether. Kept well clear of Log out at the foot of the page:
                  logging out is a thing he does every week, and closing an account is
                  a thing he does once, so they must not sit within a thumb's width of
                  each other. */}
              {/* UserIcon, the same glyph the AppBar's Account tab carries. The row
                  and the tab lead to the same subject, so a captain who tapped one
                  should recognise the other. */}
              <AccountRow label="Manage account" Icon={UserIcon} />

              {/* The rows below used to be a second group with a gap above them —
                  their taps leave the app, and the split said so. One run now, on the
                  hairlines alone. Worth knowing what that costs: the caret no longer
                  distinguishes "opens a screen" from "opens WhatsApp", so anything
                  added here that jumps out of the app has nothing left to announce it
                  but its own label. */}

              {/* The system share sheet, NOT openSupportWhatsApp. This message is
                  addressed to a friend, and every other WhatsApp link in the app
                  opens a chat with support — sending a recruitment pitch down that
                  one would deliver it to exactly the wrong person. Share lets him
                  pick the recipient, which is the whole point of a referral. */}
              {/* Both of these leave the app, so both drop the caret. Naming the
                  destination in the value slot went with it: "WhatsApp" and "Invite"
                  were answering a question the label already answers, and the row
                  reads cleaner saying one thing well. */}
              <AccountRow
                label="Refer a captain"
                Icon={UsersThreeIcon}
                caret={false}
                onPress={() =>
                  Share.share({
                    message: `Drive with RCS Travels. I'm a captain here — call ${supportPhoneDisplay()} to get started.`,
                  })
                }
              />
              <AccountRow
                label="Help"
                Icon={QuestionIcon}
                caret={false}
                onPress={() => openSupportWhatsApp('Hi, I need help with my captain account.')}
              />
              {/* Terms, privacy and the licences. Sits with Help rather than with
                  Settings because it is a thing to READ, not a thing to change — and
                  in this group because the documents live on the website, so this row
                  leaves the app exactly as the two above it do.

                  No caret yet: it is honest about having nowhere to go until there is
                  a legal screen, or a URL to open. */}
              <AccountRow label="Legal" Icon={InfoIcon} last />
            </View>

            {/* The error slot and the button are ONE scroller child, not two. As
                separate children they took a PANEL_GAP each, so an empty 17px box
                sat inside 24px of gap and the button ended up floating a long way
                below the menu. Together they cost one gap and the slot's own height.

                The slot still reserves that height whether or not it has anything to
                say: an error appearing must not shift the button out from under a
                thumb already on its way to it. */}
            <View className="w-full">
              <View className="min-h-5 items-center justify-center">
                {signOutError && (
                  <AppText className="text-sm text-center" style={{ color: ERROR_TEXT }}>
                    {signOutError}
                  </AppText>
                )}
              </View>

              {/* Quiet filled surface, not the solid negative Button draws. Solid
                  red at full width would make the least-used action the loudest. */}
              <Pressable
                role="button"
                onPress={handleSignOut}
                disabled={busy}
                style={({ pressed }) => ({ opacity: busy ? 0.5 : pressed ? 0.6 : 1 })}
              >
                <View
                  className="w-full flex-row items-center justify-center gap-2 rounded-2xl py-3.5"
                  style={{ backgroundColor: CARD }}
                >
                  <SignOut size={18} weight="bold" className="text-[#B91C1C]" />
                  <AppText className="font-semibold" style={{ color: ERROR_TEXT }}>
                    {busy ? 'Logging out…' : 'Log out'}
                  </AppText>
                </View>
              </Pressable>
            </View>

            <AppText className={`text-xs text-center ${MUTED}`}>
              RCS Captains v{version}
            </AppText>
          </>
        )}
      </Animated.ScrollView>
    </View>
  );
};

export default Account;
