import { useLanguage as useCopyLanguage } from "../../i18n";
import { driverCopy as dc } from "../../lib/copy";
import { Pressable, View } from 'react-native';
import { useNavigate } from 'react-router-native';
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
const WalletCard = ({ balance }: Props) => {
    useCopyLanguage();
  const navigate = useNavigate();
  const owing = balance < 0;

  return (
    <Pressable
      role="button"
      aria-label={dc("Open wallet")}
      onPress={() => navigate('/account/wallet')}
      className={`${TILE} border border-[rgba(255,255,255,0.12)] bg-[var(--background-primary)]`}
      style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
    >
      <View className="flex-row items-center gap-1.5">
        <Wallet size={13} weight="fill" className={LABEL} />
        <AppText className={`${TILE_LABEL} ${LABEL}`}>{dc("Wallet")}</AppText>
      </View>

      <AppText
        numberOfLines={1}
        className={`text-2xl font-semibold ${owing ? OWED : 'text-white'}`}
        style={FIGURE}
      >
        {rupees(balance)}
      </AppText>

      {owing ? (
        <AppText numberOfLines={2} className={`text-xs ${OWED}`}>{dc("Negative balance blocks going online")}</AppText>
      ) : (
        <AppText numberOfLines={2} className="text-xs text-[rgba(255,255,255,0.7)]">
          {dc("Available · tap for history")}
        </AppText>
      )}
    </Pressable>
  );
};

export default WalletCard;
