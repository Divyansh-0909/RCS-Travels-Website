import type { ReactNode, Ref } from 'react';
import { useState } from 'react';
import { TextInput, View, type KeyboardTypeOptions, type TextInputProps } from 'react-native';
import { useLanguage } from '../../i18n';
import { devanagariFonts } from '../../theme/fonts';
import { useTheme } from '../../theme/ThemeContext';

const BORDER_ERROR = 'rgba(185,28,28,0.5)';
const BORDER_ERROR_FOCUS = 'rgba(185,28,28,0.8)';
const BG_ERROR = 'rgba(185,28,28,0.1)';

// The light-surface set. Everything above is tuned for the dark auth shell — white
// borders, a translucent white fill and #ffffff text — so a field dropped onto a
// white or --foreground-muted card had an invisible edge, an invisible placeholder
// and, worst of the three, invisible typing: the captain filled it in correctly and
// watched nothing appear. These are --background-primary and the hairline the
// account screens rule with.

type InputType = 'text' | 'email' | 'tel' | 'number' | 'password';

// The web takes one `type` and lets the browser decide the keyboard. Nothing
// reads it on native, so each one maps to the pieces RN splits it into.
const KEYBOARD: Partial<Record<InputType, KeyboardTypeOptions>> = {
    email: 'email-address',
    tel: 'phone-pad',
    number: 'number-pad',
};

interface InputProp {
    /**
     * `light` resolves the same field for a white page: ink text, ink placeholder,
     * hairline edge. Everything the component draws by default assumes the dark
     * auth shell it was written for.
     */
    variant?: 'light';
    value?: string | number;
    onChangeFn: (value: string) => void;
    onFocusFn?: () => void;
    onBlurFn?: () => void;
    autoComplete?: TextInputProps['autoComplete'];
    inputRef?: Ref<TextInput>;
    autoFocus?: boolean;
    type?: InputType;
    placeholder?: string;
    bg?: string;
    error?: boolean;
    maxLength?: number;
}

interface Props {
    prop: InputProp;
    className?: string;
    leading?: ReactNode;
    trailing?: ReactNode;
}

const Input = ({ prop, className = '', leading, trailing }: Props) => {
  const { language } = useLanguage();
    const { colors } = useTheme();
    const [focused, setFocused] = useState(false);
    const hasError = prop.error === true;
    const light = prop.variant === 'light';
    const type = prop.type ?? 'text';
    const plain = type !== 'email' && type !== 'password';

    // The error pair is shared. Neutral field states always come from the active
    // palette; `light` only asks for a filled field on an already-light card.
    const borderColor = hasError
        ? focused ? BORDER_ERROR_FOCUS : BORDER_ERROR
        : focused ? colors.ink : colors.borderUi;

    const backgroundColor = hasError
        ? BG_ERROR
        : prop.bg ?? (light ? colors.surface : focused ? colors.surfaceRaised : 'transparent');

    return (
        <View className={`${className} relative w-full my-1`}>
            <TextInput
                ref={prop.inputRef}
                value={prop.value != null ? `${prop.value}` : ''}
                onChangeText={prop.onChangeFn}
                onFocus={() => { setFocused(true); prop.onFocusFn?.(); }}
                onBlur={() => { setFocused(false); prop.onBlurFn?.(); }}
                placeholder={prop.placeholder}
                placeholderTextColor={colors.inkMuted}
                autoComplete={prop.autoComplete}
                autoFocus={prop.autoFocus}
                autoCapitalize={plain ? 'sentences' : 'none'}
                autoCorrect={plain}
                secureTextEntry={type === 'password'}
                keyboardType={KEYBOARD[type]}
                maxLength={prop.maxLength}
                className={`font-sans text-base text-ink w-full px-4 py-3 rounded-xl border ${leading ? 'pl-9' : ''} ${trailing ? 'pr-10' : ''}`}
                style={{ borderColor, backgroundColor, ...(language === 'hi' ? { fontFamily: devanagariFonts.normal } : {}) }}
            />

            {leading && (
                <View pointerEvents="none" className="absolute left-4 top-0 bottom-0 justify-center">
                    {leading}
                </View>
            )}

            {trailing && (
                <View className="absolute right-3 top-0 bottom-0 justify-center">
                    {trailing}
                </View>
            )}
        </View>
    );
};

export default Input;
