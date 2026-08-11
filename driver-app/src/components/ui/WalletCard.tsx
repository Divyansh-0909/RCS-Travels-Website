import { Pressable, View } from 'react-native';
import { cssInterop } from 'nativewind';
import { WalletIcon } from 'phosphor-react-native';
import AppText from '../AppText';
import { rupees } from '../../constants/booking';
import { FIGURE, TILE, TILE_LABEL } from './tile';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Wallet = cssInterop(WalletIcon, asThemed);

// Ink, beside the blue month tile. The darkest surface on a white page reads first,
// which is right: the balance is the one number here that can stop a captain working.
const LABEL = 'text-[rgba(255,255,255,0.7)]';

// Amber on ink, not the negative red. Red on this card reads as an error in the app;
// this is a true balance he has to clear, and it is his to act on.
const OWED = 'text-[#FBBF24]';

type Props = {
  balance: number;
  onPressTransactions?: () => void;
};

/**
 * The wallet, as one half of the summary row.
 *
 * `balance` is signed: the schema lets it go negative on purpose — an unpaid fine
 * larger than the credit on hand is the state that blocks going online — so this tile
 * has two readings, and the negative one has to explain itself. A tile that renders
 * "-₹340" and nothing else has told the captain a number and not the consequence.
 *
 * The third line is the shape both tiles share: a label, a figure, and one line under
 * it. Here it is the consequence or the way through to the ledger; on the month tile
 * it is the ride count. Keep them the same height or the row looks broken.
 */
const WalletCard = ({ balance, onPressTransactions }: Props) => {
  const owing = balance < 0;

  return (
    <View className={`${TILE} bg-[var(--background-primary)]`}>
      <View className="flex-row items-center gap-1.5">
        <Wallet size={13} weight="fill" className={LABEL} />
        <AppText className={`${TILE_LABEL} ${LABEL}`}>Wallet</AppText>
      </View>

      <AppText
        numberOfLines={1}
        className={`text-2xl font-semibold ${owing ? OWED : 'text-white'}`}
        style={FIGURE}
      >
        {rupees(balance)}
      </AppText>

      {/* Owing outranks the link. A captain who cannot go online needs to be told
          that before he is offered a statement explaining why. */}
      {owing ? (
        <AppText numberOfLines={2} className={`text-xs ${OWED}`}>
          Clear it to go online
        </AppText>
      ) : (
        // A Pressable only where there is somewhere to go. The words are the same
        // either way so the tile does not change height when the ledger screen
        // lands — but until it does, this line is a label rather than a button, and
        // tapping it correctly does nothing.
        //
        // NOTE: those words currently promise more than the app can do. Wiring this
        // up is one prop from Account — pass onPressTransactions — and until that
        // exists the copy is ahead of the build.
        <Pressable
          role="button"
          onPress={onPressTransactions}
          disabled={!onPressTransactions}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <AppText className="text-xs font-semibold text-white">Tap to view usage</AppText>
        </Pressable>
      )}
    </View>
  );
};

export default WalletCard;
