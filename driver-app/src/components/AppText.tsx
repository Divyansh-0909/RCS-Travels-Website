import { Text, type TextProps } from 'react-native';

const suppliesFont = (className: string) => /(^|\s)font-/.test(className);
const suppliesColor = (className: string) => /(^|\s)text-\[var\(--/.test(className);
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
