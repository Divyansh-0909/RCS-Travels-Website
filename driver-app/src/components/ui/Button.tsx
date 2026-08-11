import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, type ViewStyle } from 'react-native';
import AppText from '../AppText';

// Same reason as Input: no color-mix() on native, so the website's /15, /30 and
// /10 steps are resolved here. Solid fills come from tokens.cjs colours.
const PRIMARY = '#243AFB';
const NEGATIVE = '#B91C1C';
const BORDER = 'rgba(255,255,255,0.3)';
const BORDER_DROPDOWN = 'rgba(255,255,255,0.15)';
const BORDER_ERROR = 'rgba(185,28,28,0.5)';
const BG_ERROR = 'rgba(185,28,28,0.1)';
const BG_DROPDOWN = '#121220';
const BG_PRESSED = 'rgba(255,255,255,0.15)';

interface ButtonProp {
    variant?: 'negative' | 'input' | 'dropdown';
    width?: ViewStyle['width'];
    rounded?: number;
    paddingX?: number;
    bg?: string;
    border?: boolean;
    error?: boolean;
    disabled?: boolean;
}

interface Props {
    prop?: ButtonProp;
    className?: string;
    children?: ReactNode;
    onPress?: () => void;
}

const Button = ({ prop = {}, className = '', children, onPress }: Props) => {
    // Pressable's style-as-a-function never runs here. className routes through
    // NativeWind, which merges the inline style into its own computation and
    // only understands objects and arrays — a function is collected, applied,
    // and yields nothing, so every value in it is dropped silently. Input holds
    // its focus state for the same reason.
    const [pressed, setPressed] = useState(false);

    const isDropdown = prop.variant === 'dropdown';
    const isInput = prop.variant === 'input';
    const isNegative = prop.variant === 'negative';
    const hasError = prop.error === true && !isDropdown;
    const isDisabled = prop.disabled === true;
    const isSolid = !prop.variant || isNegative;

    const width = prop.width ?? (isInput || isDropdown ? undefined : '100%');

    const surface = (): ViewStyle => {
        if (isSolid) {
            return {
                backgroundColor: isNegative ? NEGATIVE : PRIMARY,
                opacity: isDisabled ? 0.4 : pressed ? 0.8 : 1,
            };
        }
        if (isDropdown) {
            return {
                backgroundColor: BG_DROPDOWN,
                borderWidth: 1,
                borderColor: BORDER_DROPDOWN,
                boxShadow: '0px 4px 20px 2px rgba(0,0,0,0.5)',
                opacity: isDisabled ? 0.4 : 1,
            };
        }
        if (hasError) {
            return {
                backgroundColor: BG_ERROR,
                borderWidth: 1,
                borderColor: BORDER_ERROR,
                opacity: isDisabled ? 0.4 : 1,
            };
        }
        return {
            backgroundColor: pressed && !isDisabled ? BG_PRESSED : prop.bg ?? 'transparent',
            borderWidth: 1,
            borderColor: prop.border === false ? 'transparent' : BORDER,
            opacity: isDisabled ? 0.4 : 1,
        };
    };

    return (
        <Pressable
            onPress={onPress}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
            disabled={isDisabled}
            role="button"
            aria-disabled={isDisabled}
            className={`${className} flex-row items-center my-1 py-3 ${isDropdown ? 'justify-start px-4' : 'justify-center'}`}
            style={[
                {
                    width,
                    borderRadius: prop.rounded ?? (isDropdown ? 16 : 12),
                    paddingHorizontal: prop.paddingX,
                },
                surface(),
            ]}
        >
            {typeof children === 'string' || typeof children === 'number' ? (
                <AppText className={`text-base ${isSolid ? 'font-semibold' : 'font-medium'}`}>
                    {children}
                </AppText>
            ) : (
                children
            )}
        </Pressable>
    );
};

export default Button;
