import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { cssInterop } from 'nativewind';
import { XIcon } from 'phosphor-react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import AppText from './AppText';
import { SlideAction } from './ui/SlideAction';
import { INK_TEXT, MUTED, SURFACE } from './ui/rideUi';

const Cross = cssInterop(XIcon, {
    className: { target: false, nativeStyleToProp: { color: true } },
});

/**
 * The code that starts the ride, on a screen of its own.
 *
 * A FIELD IN THE CORNER OF THE RIDE SHEET WAS THE WRONG SHAPE FOR THIS. Handing
 * over the code is the one moment in the trip that is a conversation with the
 * rider rather than a thing the captain does to his phone — he has to ask for
 * it, hear four digits over traffic, and type them without losing his place. It
 * deserves the whole screen and nothing else on it.
 *
 * It is also the only irreversible step he cannot undo by driving somewhere:
 * starting a ride begins the fare. Hence the same slide-to-confirm the rest of
 * the flow uses, rather than a button under a keyboard.
 */

export const OTP_LENGTH = 4;

export const OtpEntry = ({
    riderName,
    error,
    onSubmit,
    onClose,
}: {
    riderName: string | null;
    error: string | null;
    /** Resolves when the server has answered; the screen stays up if it refused. */
    onSubmit: (otp: string) => void | Promise<void>;
    onClose: () => void;
}) => {
    const [otp, setOtp] = useState('');
    const input = useRef<TextInput>(null);

    // Straight into the keypad. He has just parked and the rider is at the
    // window; a screen that waits to be tapped before it will take a number is a
    // screen asking him to do the same job twice.
    useEffect(() => {
        const t = setTimeout(() => input.current?.focus(), 250);
        return () => clearTimeout(t);
    }, []);

    const digits = Array.from({ length: OTP_LENGTH }, (_, i) => otp[i] ?? '');
    const complete = otp.length === OTP_LENGTH;

    return (
        <Animated.View
            entering={FadeIn.duration(160)}
            style={{ position: 'absolute', inset: 0, zIndex: 95, backgroundColor: SURFACE }}
        >
            <Animated.View entering={SlideInDown.duration(240)} className="flex-1 px-6 pt-16">
                <Pressable
                    role="button"
                    accessibilityLabel="Close"
                    onPress={onClose}
                    hitSlop={12}
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, alignSelf: 'flex-end' })}
                >
                    <View className="w-10 h-10 items-center justify-center rounded-full" style={{ backgroundColor: '#f3f3f3' }}>
                        <Cross size={22} weight="bold" className={INK_TEXT} />
                    </View>
                </Pressable>

                <AppText className={`text-3xl font-bold mt-6 ${INK_TEXT}`} style={{ letterSpacing: -0.8 }}>
                    Start the ride
                </AppText>
                <AppText className={`text-base mt-1 ${MUTED}`}>
                    Ask {riderName ?? 'the rider'} for the {OTP_LENGTH}-digit code on their screen.
                </AppText>

                {/* One box per digit, and the real field is invisible behind them.
                    A code read aloud is read a character at a time, so it wants to
                    be SET a character at a time — and boxes show him where he is
                    without him having to find a cursor. */}
                <Pressable onPress={() => input.current?.focus()} className="mt-10">
                    <View className="flex-row justify-between">
                        {digits.map((digit, i) => (
                            <View
                                key={i}
                                className="rounded-2xl items-center justify-center"
                                style={{
                                    width: 64, height: 76,
                                    backgroundColor: '#f3f3f3',
                                    borderWidth: 2,
                                    // The next empty box is outlined, so his eye has
                                    // somewhere to be between digits.
                                    borderColor: i === otp.length ? '#243AFB' : 'transparent',
                                }}
                            >
                                <AppText className={`text-3xl font-bold ${INK_TEXT}`}>{digit}</AppText>
                            </View>
                        ))}
                    </View>
                </Pressable>

                <TextInput
                    ref={input}
                    value={otp}
                    onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                    keyboardType="number-pad"
                    maxLength={OTP_LENGTH}
                    // Off screen rather than hidden: a display:none input cannot
                    // hold focus, and the keyboard closes the moment it loses it.
                    style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
                    autoFocus
                />

                {error ? (
                    <AppText className="text-sm font-medium text-red-600 mt-5 text-center">
                        {error}
                    </AppText>
                ) : null}

                <View className="mt-auto mb-10">
                    <SlideAction
                        label="Slide to start the ride"
                        onConfirm={() => onSubmit(otp)}
                        disabled={!complete}
                        disabledHint={`Enter the ${OTP_LENGTH}-digit code`}
                    />
                </View>
            </Animated.View>
        </Animated.View>
    );
};
