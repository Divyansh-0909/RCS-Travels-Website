import { Text, type TextProps } from 'react-native';

const suppliesFont = (className: string) => /(^|\s)font-/.test(className);
// A var() is not the only way to set a colour: the brand utilities from tokens.cjs
// and Tailwind's own palette are colours too, and letting the default fall through
// beside one of them leaves two colour utilities on the element with nothing but
// stylesheet order to decide the winner.
const suppliesColor = (className: string) =>
    /(^|\s)text-(\[|primary|negative|white|black|gray-|green-|red-|amber-)/.test(className);
const suppliesTracking = (className: string) => /(^|\s)tracking-/.test(className);

const AppText = ({ className = '', ...rest }: TextProps) => {
    const base = [
        suppliesFont(className) ? '' : 'font-sans',
        suppliesColor(className) ? '' : 'text-[var(--text)]',
        suppliesTracking(className) ? '' : 'tracking-slight',
    ];

    return <Text className={[...base, className].filter(Boolean).join(' ')} {...rest} />;
};

export default AppText;
