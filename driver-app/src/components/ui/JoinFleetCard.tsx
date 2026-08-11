import { Pressable, View } from 'react-native';
import { SealCheckIcon } from 'phosphor-react-native';
import AppText from '../AppText';
import { openSupportWhatsApp } from '../../constants/support';

// Built to MarketPromo's shape: one rounded row, copy and a pill on the left, a
// slightly darker band on the right holding the art. The two are the only cards in
// the app that make an offer rather than report a fact, so they should read as the
// same kind of thing — the colour is what says which offer it is.
const GREEN = '#BFE3CE';

// The band, a step down from the card exactly as AMBER_PANEL is from AMBER. Small on
// purpose: it has to separate the art from the copy without becoming a second card.
const GREEN_PANEL = '#B2DBC3';

// Near-black with a green cast, the way MarketPromo warms its ink to the amber. 11.7:1
// on the card.
const INK = '#13241A';

// 5.5:1 on the card — this is a line of body copy, so it clears AA rather than the
// 3:1 a large heading could have got away with.
const SUBTLE = '#3D5A47';

const TITLE = { letterSpacing: -0.4, lineHeight: 24 };
const PANEL_WIDTH = '34%';

/**
 * The offer to a partner captain to drive under RCS Travels.
 *
 * WhatsApp rather than a join endpoint, because there is no join endpoint and there
 * should not be one: Driver.group is admin-set, and joining the fleet is a vetting
 * decision with papers behind it, not a button a captain can press himself. This
 * opens the conversation that decision is made in.
 */
const JoinFleetCard = () => (
  <View
    className="w-full flex-row rounded-2xl overflow-hidden"
    style={{ backgroundColor: GREEN }}
  >
    <View className="flex-1 px-5 py-4 gap-1">
      {/* Two AppTexts rather than one wrapping string, as on the Market card: the
          break is a decision about the shape of the block, and letting it fall
          wherever the width happens to put it is not the same design at two sizes. */}
      <View>
        <AppText className="text-xl font-semibold" style={{ ...TITLE, color: INK }}>
          Drive under
        </AppText>
        <AppText className="text-xl font-semibold" style={{ ...TITLE, color: INK }}>
          RCS Travels
        </AppText>
      </View>

      <AppText className="text-sm" style={{ color: SUBTLE }}>
        Fleet captains get rides first
      </AppText>

      <Pressable
        role="button"
        onPress={() =>
          openSupportWhatsApp("Hi, I'd like to start working under RCS Travels.")
        }
        className="self-start mt-1 rounded-full px-5 py-2 bg-[var(--background-primary)] active:opacity-80"
      >
        <AppText className="font-semibold text-[var(--foreground)]">Talk to the team</AppText>
      </Pressable>
    </View>

    {/* The band is here and the art is not: there is no join-fleet illustration in
        assets/ yet, and the Market card's is a real drawing rather than something
        that could be improvised. The seal stands in at the size the artwork will
        occupy, so dropping a require() in here later changes this block and nothing
        around it. */}
    <View
      className="items-center justify-center"
      style={{ width: PANEL_WIDTH, backgroundColor: GREEN_PANEL }}
    >
      {/* The colour PROP, with the fade baked into its alpha. No cssInterop and no
          style prop: NativeWind folds an inline style into its own computation, so an
          opacity set that way beside a className is the kind of thing that silently
          does nothing. One channel, one owner. */}
      <SealCheckIcon size={40} weight="fill" color="rgba(19,36,26,0.35)" />
    </View>
  </View>
);

export default JoinFleetCard;
