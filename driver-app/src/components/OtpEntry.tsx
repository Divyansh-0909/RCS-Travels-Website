import { useEffect, useRef, useState } from 'react';
import {
    Pressable,
    TextInput,
    View,
    type NativeSyntheticEvent,
    type TextInputKeyPressEventData,
} from 'react-native';
import { cssInterop } from 'nativewind';
import { XIcon } from 'phosphor-react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import AppText from './AppText';
import { INK_TEXT, MUTED, SURFACE } from './ui/rideUi';

const Cross = cssInterop(XIcon, {
    className: { target: false, nativeStyleToProp: { color: true } },
});

export const OTP_LENGTH = 4;

export const OtpEntry = ({
    riderName,
    error,
    onSubmit,
    onClose,
    title = 'Enter OTP',
    description,
    submitLabel = 'Start ride',
}: {
    riderName: string | null;
    error: string | null;
    onSubmit: (otp: string) => void | Promise<void>;
    onClose: () => void;
    title?: string;
    description?: string;
    submitLabel?: string;
}) => {
    const [otp, setOtp] = useState('');
    const [focusedBox, setFocusedBox] = useState(-1);

    const otpRefs = useRef<(TextInput | null)[]>([]);

    /*
     * Focus the requested OTP box.
     *
     * This is what makes tapping a particular box useful rather than sending
     * every tap to one hidden input.
     */
    const focusBox = (index: number) => {
        otpRefs.current[index]?.focus();
    };

    /*
     * Handles both normal single-digit entry and paste/autofill.
     *
     * React Native can give us more than one character when the user pastes
     * an OTP or when the OS autofills the code.
     */
    const handleOtpDigit = (index: number, value: string) => {
        const digits = value.replace(/\D/g, '');

        if (!digits) return;

        // Paste / OTP autofill.
        if (digits.length > 1) {
            const pasted = digits.slice(0, OTP_LENGTH);

            setOtp(pasted);

            // Keep the final entered box focused.
            focusBox(Math.min(pasted.length, OTP_LENGTH - 1));

            return;
        }

        const chars = Array.from(
            { length: OTP_LENGTH },
            (_, i) => otp[i] ?? '',
        );

        chars[index] = digits[0];

        const nextOtp = chars.join('');

        setOtp(nextOtp);

        // Automatically advance to the next box.
        if (index < OTP_LENGTH - 1) {
            focusBox(index + 1);
        }
    };

    /*
     * Backspace behavior:
     *
     * 123_
     *     ↑ backspace → 12__
     *
     * If the current box is already empty:
     *
     * 123_
     *    ↑ backspace → 12__
     *   focus moves to the previous box
     */
    const handleOtpKeyPress = (
        index: number,
        event: NativeSyntheticEvent<TextInputKeyPressEventData>,
    ) => {
        if (event.nativeEvent.key !== 'Backspace') return;

        const chars = Array.from(
            { length: OTP_LENGTH },
            (_, i) => otp[i] ?? '',
        );

        if (chars[index]) {
            chars[index] = '';
        } else if (index > 0) {
            chars[index - 1] = '';
            focusBox(index - 1);
        }

        setOtp(chars.join(''));
    };

    /*
     * Focus the first box when the OTP screen opens.
     */
    useEffect(() => {
        const timer = setTimeout(() => {
            focusBox(0);
        }, 250);

        return () => clearTimeout(timer);
    }, []);

    const digits = Array.from(
        { length: OTP_LENGTH },
        (_, i) => otp[i] ?? '',
    );

    const complete = otp.length === OTP_LENGTH;

    return (
        <Animated.View
            entering={FadeIn.duration(160)}
            style={{
                position: 'absolute',
                inset: 0,
                zIndex: 95,
                backgroundColor: SURFACE,
            }}
        >
            <Animated.View
                entering={SlideInDown.duration(240)}
                className="flex-1 px-6 pt-20"
            >
                <AppText
                    className={`text-3xl text-center font-semibold mt-6 ${INK_TEXT}`}
                    style={{ letterSpacing: -0.8 }}
                >
                    {title}
                </AppText>

                <AppText
                    className={`text-base text-center mt-1 ${MUTED}`}
                >
                    {description ?? `Ask the rider for the ${OTP_LENGTH}-digit code on their screen.`}
                </AppText>

                {/*
                 * OTP boxes.
                 *
                 * These are real TextInputs rather than decorative Views.
                 * This gives us:
                 * - tap-to-focus
                 * - cursor/focus behavior
                 * - paste
                 * - keyboard backspace
                 * - OS OTP autofill
                 * - automatic movement between boxes
                 */}
                <View className="mt-10 mb-3">
                    <View className="flex-row justify-center items-center gap-3">
                        {Array.from({ length: OTP_LENGTH }).map((_, i) => {
                            const digit = digits[i];
                            const focused = focusedBox === i;

                            return (
                                <TextInput
                                    key={i}
                                    ref={(ref) => {
                                        otpRefs.current[i] = ref;
                                    }}
                                    value={digit}
                                    keyboardType="number-pad"
                                    maxLength={1}
                                    textContentType={
                                        i === 0 ? 'oneTimeCode' : 'none'
                                    }
                                    autoComplete={
                                        i === 0 ? 'sms-otp' : 'off'
                                    }
                                    onChangeText={(value) =>
                                        handleOtpDigit(i, value)
                                    }
                                    onKeyPress={(event) =>
                                        handleOtpKeyPress(i, event)
                                    }
                                    onFocus={() => setFocusedBox(i)}
                                    onBlur={() => setFocusedBox(-1)}
                                    selectTextOnFocus
                                    className={`rounded-2xl text-center text-3xl font-semibold ${INK_TEXT}`}
                                    style={{
                                        width: 50,
                                        height: 50,
                                        padding: 0,
                                        borderWidth: 2,
                                        borderColor: error
                                            ? '#DC2626'
                                            : focused
                                                ? '#243AFB'
                                                : '#AEAEAE',
                                        backgroundColor: error
                                            ? 'rgba(220,38,38,0.06)'
                                            : focused
                                                ? 'rgba(36,58,251,0.05)'
                                                : 'transparent',
                                        textAlign: 'center',
                                        textAlignVertical: 'center',
                                        includeFontPadding: false,
                                    }}
                                />
                            );
                        })}
                    </View>
                </View>

                {error ? (
                    <AppText className="text-sm font-medium text-red-600 mt-5 text-center">
                        {error}
                    </AppText>
                ) : null}

                <View className="mt-10 flex justify-center items-center w-full gap-2">
                    <Pressable
                        className="w-full flex items-center justify-center"
                        role="button"
                        onPress={() => onSubmit(otp)}
                        disabled={!complete}
                    >
                        <View
                            className={`w-[92%] flex-row items-center justify-center gap-2 rounded-full py-3.5 ${complete
                                    ? 'bg-primary'
                                    : 'bg-primary-light'
                                }`}
                        >
                            <AppText className="text-base font-semibold text-[var(--foreground)]">
                                {submitLabel}
                            </AppText>
                        </View>
                    </Pressable>
                    <Pressable
                        className='w-full flex items-center justify-center'
                        role="button"
                        accessibilityLabel="Close"
                        onPress={onClose}
                        hitSlop={12}
                        style={({ pressed }) => ({
                            opacity: pressed ? 0.5 : 1,
                            alignSelf: 'flex-end',
                        })}
                    >
                        <View
                            className="w-[92%] flex-row items-center justify-center gap-2 rounded-full bg-[var(--background-muted)] py-3.5"
                        >
                            <AppText className="text-base font-semibold text-[var(--background-primary)]">
                                Back
                            </AppText>
                        </View>
                    </Pressable>
                </View>
            </Animated.View>
        </Animated.View>
    );
};

export default OtpEntry;
