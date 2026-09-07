import { Text, type TextProps, type TextStyle } from 'react-native';
import { useLanguage } from '../i18n';
import { devanagariFonts } from '../theme/fonts';

const suppliesFont = (className: string) => /(^|\s)font-/.test(className);
// A var() is not the only way to set a colour: the brand utilities from tokens.cjs
// and Tailwind's own palette are colours too, and letting the default fall through
// beside one of them leaves two colour utilities on the element with nothing but
// stylesheet order to decide the winner.
const suppliesColor = (className: string) =>
    /(^|\s)text-(\[|primary|negative|white|black|gray-|green-|red-|amber-)/.test(className);
const suppliesTracking = (className: string) => /(^|\s)tracking-/.test(className);

const AppText = ({ className = '', ...rest }: TextProps) => {
    const { language } = useLanguage();
    const base = [
        suppliesFont(className) ? '' : 'font-sans',
        suppliesColor(className) ? '' : 'text-[var(--text)]',
        suppliesTracking(className) ? '' : 'tracking-slight',
    ];

    // PP Mori has no Devanagari glyphs. Applying the Noto family explicitly is
    // reliable across Android and iOS, including selector Hindi before a locale
    // has been chosen. Roman Hinglish deliberately retains the product family.
    const devanagari = language === 'hi' || /[\u0900-\u097F]/.test(String(rest.children ?? ''));
    const strong = /(^|\s)font-(semibold|bold)/.test(className);
    const fontFamily = devanagari ? (strong ? devanagariFonts.semibold : devanagariFonts.normal) : undefined;
    const style = fontFamily
        ? [rest.style as TextStyle, { fontFamily, letterSpacing: 0 }]
        : rest.style;

    return <Text className={[...base, className].filter(Boolean).join(' ')} {...rest} style={style} />;
};

export default AppText;
