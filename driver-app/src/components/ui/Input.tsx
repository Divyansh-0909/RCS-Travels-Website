import type { ReactNode } from 'react';
import { useState } from 'react';
import { TextInput, View, type KeyboardTypeOptions, type TextInputProps } from 'react-native';

const BORDER = 'rgba(255,255,255,0.3)';
const BORDER_FOCUS = 'rgba(255,255,255,0.6)';
const BG_FOCUS = 'rgba(255,255,255,0.05)';
const BORDER_ERROR = 'rgba(185,28,28,0.5)';
const BORDER_ERROR_FOCUS = 'rgba(185,28,28,0.8)';
const BG_ERROR = 'rgba(185,28,28,0.1)';
const PLACEHOLDER = 'rgba(243,243,243,0.5)';

// The light-surface set. Everything above is tuned for the dark auth shell — white
// borders, a translucent white fill and #ffffff text — so a field dropped onto a
// white or --foreground-muted card had an invisible edge, an invisible placeholder
// and, worst of the three, invisible typing: the captain filled it in correctly and
// watched nothing appear. These are --background-primary and the hairline the
// account screens rule with.
const INK_LIGHT = 'rgba(18,18,32,0.12)';
const INK_LIGHT_FOCUS = 'rgba(18,18,32,0.45)';
const BG_LIGHT = '#ffffff';
const PLACEHOLDER_LIGHT = 'rgba(18,18,32,0.4)';

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
    const [focused, setFocused] = useState(false);
    const hasError = prop.error === true;
    const light = prop.variant === 'light';
    const type = prop.type ?? 'text';
    const plain = type !== 'email' && type !== 'password';

    // The error pair is shared. Both are rgba ink-red, which reads on either shell —
    // only the resting and focused states had to be resolved twice.
    const borderColor = hasError
        ? focused ? BORDER_ERROR_FOCUS : BORDER_ERROR
        : light
            ? focused ? INK_LIGHT_FOCUS : INK_LIGHT
            : focused ? BORDER_FOCUS : BORDER;

    const backgroundColor = hasError
        ? BG_ERROR
        : light
            ? prop.bg ?? BG_LIGHT
            : focused ? BG_FOCUS : prop.bg ?? 'transparent';

    return (
        <View className={`${className} relative w-full my-1`}>
            <TextInput
                value={prop.value != null ? `${prop.value}` : ''}
                onChangeText={prop.onChangeFn}
                onFocus={() => { setFocused(true); prop.onFocusFn?.(); }}
                onBlur={() => { setFocused(false); prop.onBlurFn?.(); }}
                placeholder={prop.placeholder}
                placeholderTextColor={light ? PLACEHOLDER_LIGHT : PLACEHOLDER}
                autoComplete={prop.autoComplete}
                autoCapitalize={plain ? 'sentences' : 'none'}
                autoCorrect={plain}
                secureTextEntry={type === 'password'}
                keyboardType={KEYBOARD[type]}
                maxLength={prop.maxLength}
                className={`font-sans text-base ${light ? 'text-[var(--background-primary)]' : 'text-[var(--text)]'} w-full px-4 py-3 rounded-xl border ${leading ? 'pl-9' : ''} ${trailing ? 'pr-10' : ''}`}
                style={{ borderColor, backgroundColor }}
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
