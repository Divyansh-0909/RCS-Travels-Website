import { useSignIn, useAuth } from "@clerk/clerk-expo";
import { useState, useEffect, useRef } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useNavigate, useLocation } from "react-router-native";
import { cssInterop } from "nativewind";
import { ArrowLeftIcon } from "phosphor-react-native";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import AppText from "../components/AppText";
import { useApi } from "../hooks/useApi";
import { useData } from "../hooks/useData";
import { useOtpClipboard } from "../hooks/useOtpClipboard";
import { useDriver } from "../hooks/useDriver";
import { vehicleLabel } from "../constants/booking";
import CheckMarkOutline from "../components/illustrations/CheckMarkOutline";
import CrossOutline from "../components/illustrations/CrossOutline";


const BackIcon = cssInterop(ArrowLeftIcon, {
    className: { target: false, nativeStyleToProp: { color: true } },
});

const ERROR_TEXT = "#E86A6A";
const BOX_BG = "#1d1d27";
const BOX_BG_FOCUS = "rgba(255,255,255,0.05)";
const BOX_BORDER = "rgba(255,255,255,0.3)";
const BOX_BORDER_FOCUS = "rgba(255,255,255,0.6)";
const BOX_BORDER_ERROR = "rgba(185,28,28,0.5)";
const BOX_BORDER_ERROR_FOCUS = "rgba(185,28,28,0.8)";
const BOX_BG_ERROR = "rgba(185,28,28,0.1)";
const BOX_PASS = "#16A34A";
const BOX_FAIL = "#DC2626";

// The four classes POST /driver/me accepts, smallest first — the order a captain
// scanning for his own car expects to read them in.
const VEHICLE_CLASSES = ["hatchback", "sedan", "suv", "suv_premium"];

const BOX_SIZE = 46;  // w-[46px]/h-[46px] on the inputs
const BOX_GAP = 8;    // gap-2 on the row holding them
const CONVERGE = { duration: 600, easing: Easing.inOut(Easing.ease) };

// The website does this with a transform on --i and `transition-all duration-600`
// (see .animate-otp-box-in in frontend/src/index.css). There is no transition
// property on native, so the same slide runs on a timing animation instead.
//
// Each box travels to the row's centre, so the six converge into what reads as a
// single box. The centre of an even count sits on a half — with six, box 0 moves
// right by 2.5 steps and box 5 left by the same, one step being a box plus a gap.
//
// A component rather than inline, because useAnimatedStyle is a hook and the row
// builds its boxes with .map().
const OtpBox = ({ index, count, collapsed, children }) => {
    const slide = useAnimatedStyle(() => ({
        transform: [{
            translateX: withTiming(
                collapsed ? ((count - 1) / 2 - index) * (BOX_SIZE + BOX_GAP) : 0,
                CONVERGE,
            ),
        }],
    }));

    // Descending, so box 0 finishes on top of the pile. That is what makes
    // boxStyle's `i === 0` fill the one the user actually sees.
    return (
        <Animated.View style={[{ zIndex: count - index }, slide]}>
            {children}
        </Animated.View>
    );
};

const Signup = () => {
    const { isLoaded, signIn, setActive } = useSignIn();
    const { isSignedIn } = useAuth();
    const navigate = useNavigate();
    const phone = useData(state => state.phone);
    const setPhone = useData(state => state.setPhone);
    const [otp, setOtp] = useState("");
    const otpRefs = useRef([]);
    const OTP_LENGTH = 6;
    const OTP_TTL = 300; // seconds until the OTP expires — matches the backend's 5-minute window
    const RESEND_COOLDOWN = 45; // matches the backend's per-phone cooldown, which 429s early resends
    const [expiresIn, setExpiresIn] = useState(0);
    const [step, setStep] = useState("username"); // "username" | "phone" | "otp" | "vehicle"
    const [verdict, setVerdict] = useState(null); // null | "pass" | "fail"
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [resendIn, setResendIn] = useState(0);
    const [showLoginUp, setShowLoginUp] = useState(false);
    const [focusedBox, setFocusedBox] = useState(-1);
    const [redirecting, setRedirecting] = useState(false);
    const [username, setUsername] = useState("");
    const [vehicleClass, setVehicleClass] = useState(null);
    const [vehicleNumber, setVehicleNumber] = useState("");
    const [vehicleModel, setVehicleModel] = useState("");

    const api = useApi();
    const { profile, notRegistered, loading: driverLoading, refresh } = useDriver();

    useEffect(() => {
        if (resendIn <= 0) return;
        const timer = setInterval(() => {
            setResendIn((s) => (s <= 1 ? 0 : s - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [resendIn]);

    useEffect(() => {
        if (expiresIn <= 0) return;
        const timer = setInterval(() => {
            setExpiresIn((s) => (s <= 1 ? 0 : s - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [expiresIn]);

    const location = useLocation();

    // Seeds the number when he arrived here from Login's "no account? sign up"
    // link, so he does not type it twice.
    //
    // The deps are the real ones rather than an empty array with a lint
    // suppression. Both are stable in the way that matters: setPhone is a zustand
    // setter and never changes identity, and route state is fixed for the life of
    // the entry — so this still runs exactly once per arrival, and it now also
    // runs again if he comes BACK from Login with a different number, which the
    // empty array silently swallowed.
    useEffect(() => {
        setPhone(location.state?.phone ?? "");
    }, [location.state?.phone, setPhone]);

    // Signed in with Clerk and unknown to the fleet — he verified his phone and
    // closed the app before telling us what he drives. The session survived; the
    // three steps behind him have nothing left to ask, and re-running them would
    // send a second OTP to a number already verified. So he lands on the step he
    // actually stopped on.
    useEffect(() => {
        if (isSignedIn && notRegistered) setStep("vehicle");
    }, [isSignedIn, notRegistered]);

    const back = () => {
        // No way back from `vehicle`. Everything behind it is already done and
        // cannot be undone by walking backwards — the phone is verified and the
        // session exists. The only real "back" from here is to abandon the
        // account, which is not something to hang off an arrow he might brush.
        if (step === "vehicle") return;
        if (step === "otp") { setStep("phone"); return; }
        if (step === "phone") { setStep("username"); return; }
        navigate("/");
    };


    // Was written, never wired, and its absence left the username step broken in
    // three separate ways — see the Button below. `e.preventDefault()` is gone
    // with the wiring: that is a web idiom, and React Native hands onPress a
    // GestureResponderEvent which has no such method to call.
    function handleUsernameSubmit() {
        if (!username?.trim()) {
            setError("Enter your name");
            return;
        }
        if (username.trim().length < 2) {
            setError("Name must be at least 2 characters");
            return;
        }

        setError(null);
        setStep("phone");
    }

    async function handleSubmit() {
        if (!phone) {
            setError("Enter a Phone Number");
            return;
        }

        if (!(phone.length === 10)) {
            setError("Number should be exactly 10 digits");
            return;
        }

        try {
            setError(null);
            setLoading(true);
            await sendOtp()
        } catch (err) {
            console.error(err);
            setError(err?.message || "Something went wrong");
        } finally {
            setLoading(false);
        }
    }

    async function handleOTPSubmit() {
        if (!otp) {
            setError("Enter OTP");
            return;
        }

        if (!(otp.length === OTP_LENGTH)) {
            setError("OTP should be exactly 6 digit");
            return;
        }

        // Before the request, not after. verify-otp burns the code server-side and
        // hands back a 60s ticket, so bailing out further down would cost the user
        // their code and force a resend for something that resolves on its own.
        if (!isLoaded) {
            setError("Still connecting. Try again in a moment.");
            return;
        }

        try {
            setError(null);
            setVerdict(null);
            setLoading(true);
            await verifyOtp()
        } catch (err) {
            console.error(err);
            setError(err?.message || "Something went wrong");
            // A throw after the code was accepted leaves the verdict on "pass", which
            // would sit a tick above the error message.
            setVerdict("fail");
        } finally {
            setLoading(false);
        }
    }

    const sendOtp = async () => {
        const data = await api.sendOtp(phone, "signup");
        if (data.status === 429) {
            setStep("otp");
            setResendIn(RESEND_COOLDOWN);
            setExpiresIn(OTP_TTL - RESEND_COOLDOWN);
            return;
        }
        if (data.status === 404) {
            setError(data.error);
            setShowLoginUp(true);
            return;
        }
        if (data.error) {
            setError(data.error);
            return;
        }
        setStep("otp");
        setResendIn(RESEND_COOLDOWN);
        setExpiresIn(OTP_TTL);
    };

    async function handleResend() {
        if (resendIn > 0 || resending) return;

        try {
            setError(null);
            setResending(true);
            const data = await api.sendOtp(phone, "signup");
            if (data.error) {
                setError(data.error);
                // The client timer normally prevents a 429, but clocks can disagree
                // (rejoining a session from another device) — restart it so the user isn't
                // shown a Resend button that keeps bouncing.
                if (data.status === 429) setResendIn(RESEND_COOLDOWN);
                return;
            }
            setOtp("");
            setResendIn(RESEND_COOLDOWN);
            setExpiresIn(OTP_TTL);
        } catch (err) {
            console.error(err);
            setError("Something went wrong");
        } finally {
            setResending(false);
        }
    }

    const verifyOtp = async () => {
        const data = await api.verifyOtp(phone, otp, "signup");
        if (data.error) {
            setError(data.error);
            setVerdict("fail");
            await new Promise((resolve) => setTimeout(resolve, 2000));
            setOtp("")
            return;
        }

        setVerdict("pass");
        setRedirecting(true);

        const result = await signIn.create({ strategy: "ticket", ticket: data.ticket });
        if (result.status !== "complete") { setError("Verification failed. Please try again."); setVerdict("fail"); return; }

        await setActive({ session: result.createdSessionId });

        // On to the last step rather than creating the row here. POST /driver/me
        // wants a vehicle class, a registration number and a model, and none of
        // them have been asked for yet — and it is behind `protect`, so it could
        // not have run before the setActive above anyway.
        setRedirecting(false);
        setStep("vehicle");
    };

    const handleVehicleSubmit = async () => {
        if (!vehicleClass) { setError("Pick the kind of car you drive"); return; }
        if (vehicleNumber.trim().length < 4) { setError("Enter the number on the plate"); return; }
        // Required, like the plate. A rider meeting this car at a gate is looking
        // for "the white Innova Crysta" — the class alone does not pick it out of
        // a queue, and this is the one moment the captain is already typing.
        if (vehicleModel.trim().length < 2) { setError("Enter the car's model"); return; }

        try {
            setError(null);
            setLoading(true);

            const created = await api.createMe({
                name: username.trim(),
                vehicleClass,
                vehicleNumber: vehicleNumber.trim().toUpperCase(),
                vehicleModel: vehicleModel.trim(),
            });

            if (created?.error) { setError(created.error); return; }

            // The provider has to learn about the new row before the router asks
            // it who this is — without the refresh, VerifiedRoute still holds
            // `notRegistered` and would bounce him straight back here.
            await refresh();
            navigate("/onboarding/status", { replace: true });
        } catch (err) {
            console.error(err);
            setError(err?.message || "Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    const isUsername = step === "username";
    const isPhone = step === "phone";
    const isOtp = step === "otp";
    const isVehicle = step === "vehicle";

    const busy = loading || redirecting;

    // The collapse reports an answer, so it waits for one. busy alone starts on the
    // press, which would have the boxes merging over a request that might still
    // come back rejected. Both halves are needed: verdict outlives the request it
    // came from, and without busy the mark would stay up after the row reopens.
    const settled = busy && Boolean(verdict);

    const formatMMSS = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

    const phoneDisplay = phone ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : "+91 XXXXX XXXXX";

    const handleUsernameChange = (value) => {
        setUsername(value);
        if (error) setError(null);
    };

    const handlePhoneChange = (value) => {
        const digits = value.replace(/\D/g, "").slice(0, 10);

        setPhone(digits);
        setShowLoginUp(false);

        if (
            error === "Enter a Phone Number" ||
            error === "Number should be exactly 10 digits"
        ) {
            setError(null);
        }
    };

    const clearOtpError = () => {
        if (error) {
            setError(null);
        }
    };

    const focusBox = (i) => {
        otpRefs.current[i]?.focus();
    };

    const handleOtpDigit = (i, value) => {
        const digits = value.replace(/\D/g, "");
        if (!digits) return;

        if (digits.length > 1) {
            const pasted = digits.slice(0, OTP_LENGTH);
            setOtp(pasted);
            clearOtpError();
            focusBox(Math.min(pasted.length, OTP_LENGTH - 1));
            return;
        }

        const chars = Array.from({ length: OTP_LENGTH }, (_, idx) => otp[idx] ?? "");
        chars[i] = digits;
        setOtp(chars.join(""));
        clearOtpError();

        if (i < OTP_LENGTH - 1) focusBox(i + 1);
    };

    const handleOtpKeyPress = (i, e) => {
        if (e.nativeEvent.key !== "Backspace") return;

        const chars = Array.from({ length: OTP_LENGTH }, (_, idx) => otp[idx] ?? "");
        if (chars[i]) {
            chars[i] = "";
        } else if (i > 0) {
            chars[i - 1] = "";
            focusBox(i - 1);
        }
        setOtp(chars.join(""));
        clearOtpError();
    };

    // The OTP comes over WhatsApp, whose "Copy code" button is the only way it
    // reaches the app — SMS autofill can't see it. Only while the boxes are
    // empty: a code already typed or already filled is not one to overwrite.
    const { canPaste, paste: pasteOtp } = useOtpClipboard({
        enabled: isOtp && !busy && otp.length === 0,
        length: OTP_LENGTH,
        onCode: (code) => {
            setOtp(code);
            clearOtpError();
            focusBox(OTP_LENGTH - 1);
        },
    });

    const boxStyle = (i) => {
        const otpError = Boolean(error);
        const focused = focusedBox === i;

        // Only once the answer is in. While the boxes are still converging there is
        // nothing to report, so the top of the stack stays the neutral fill below
        // rather than going green on the way to turning red.
        if (settled && i === 0) {
            return { backgroundColor: verdict === "fail" ? BOX_FAIL : BOX_PASS, borderColor: "transparent" };
        }
        if (otpError) {
            return {
                backgroundColor: BOX_BG_ERROR,
                borderColor: focused ? BOX_BORDER_ERROR_FOCUS : BOX_BORDER_ERROR,
            };
        }
        return {
            backgroundColor: focused ? BOX_BG_FOCUS : BOX_BG,
            borderColor: focused ? BOX_BORDER_FOCUS : BOX_BORDER,
        };
    };

    return (
        <KeyboardAvoidingView
            className="flex-1 w-full py-12"
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            {/* Hidden on the vehicle step. Everything behind it is done and
                cannot be walked back — the phone is verified and the session
                exists — so an arrow there would be a promise the screen cannot
                keep. */}
            {isVehicle ? null : (
                <Pressable
                role="button"
                aria-label="Back"
                onPress={back}
                className="absolute left-3 top-10 z-10 flex-row justify-center items-center p-2 active:opacity-60"
            >
                <BackIcon size={24} weight="regular" className="text-[var(--text)]" />
                </Pressable>
            )}

            <ScrollView
                contentContainerClassName="flex-grow justify-center items-center px-6"
                keyboardShouldPersistTaps="handled"
            >
                {/* Only for somebody who is signed in AND already has a driver
                    row. Signed-in-with-no-row is the half-finished sign-up this
                    screen exists to finish, and `driverLoading` holds the answer
                    back rather than flashing "already logged in" at him for the
                    length of one request. */}
                {isSignedIn && !redirecting && !isVehicle && !driverLoading && profile
                    ? <View className="justify-center items-center">
                        <AppText className="text-2xl font-semibold text-center">
                            {"You are already\nlogged in."}
                        </AppText>
                        <Button
                            onPress={() => navigate("/")}
                            prop={{ width: 220 }}
                            className="mt-6"
                        >
                            Back
                        </Button>
                    </View>

                    : <View className="w-full justify-center items-center">
                        <View className="justify-center items-center gap-3">
                            <AppText className="text-2xl font-semibold text-center">
                                {isUsername
                                    ? "Make it yours."
                                    : isPhone
                                        ? "Looks like you're new here."
                                        : isOtp
                                            ? "One code away."
                                            : "Now the car."}
                            </AppText>
                            <AppText className="text-base text-center text-[var(--text-muted)]">
                                {isUsername
                                    ? "This is how riders will identify you."
                                    : isPhone
                                        ? "We'll send a OTP to this number."
                                        : isVehicle
                                            ? "Riders are shown this when you pick them up."
                                            : <>Enter the 6-digit code{"\n"}we sent to <AppText className="font-semibold text-[var(--text)]">{phoneDisplay}</AppText></>}
                            </AppText>
                        </View>

                        <View className="w-full justify-center items-center">

                            {/* Fixed-height slot so an error appearing doesn't shift the form */}
                            <View className="mt-4 mb-2 min-h-5 items-center justify-center">
                                {error && (
                                    <AppText className="text-sm text-center" style={{ color: ERROR_TEXT }}>
                                        {error}
                                    </AppText>
                                )}
                            </View>

                            {/* Explicitly `isOtp`, not `!isPhone`. The old
                                condition also caught the USERNAME step — isPhone
                                is false there as well — so the "Make it yours"
                                screen rendered six OTP boxes and no name field,
                                and its Input branch below was unreachable. A
                                fourth step made that impossible to leave alone. */}
                            {isOtp
                                ? <View className="justify-center items-center">
                                    <View className="relative flex-row justify-center items-center gap-2">
                                        {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                                            <OtpBox key={i} index={i} count={OTP_LENGTH} collapsed={settled}>
                                                <TextInput
                                                    ref={(el) => { otpRefs.current[i] = el; }}
                                                    keyboardType="number-pad"
                                                    textContentType={i === 0 ? "oneTimeCode" : "none"}
                                                    autoComplete={i === 0 ? "sms-otp" : "off"}
                                                    // Emptied rather than hidden. The website turns the digit
                                                    // transparent, which does not carry: Android renders the
                                                    // character when it is typed and a later colour change
                                                    // does not rebuild it, so the glyph keeps the colour it
                                                    // came in with. otp state holds the real value either way.
                                                    value={settled ? "" : (otp[i] ?? "")}
                                                    onChangeText={(value) => handleOtpDigit(i, value)}
                                                    onKeyPress={(e) => handleOtpKeyPress(i, e)}
                                                    onFocus={() => setFocusedBox(i)}
                                                    onBlur={() => setFocusedBox(-1)}
                                                    selectTextOnFocus
                                                    // text-[24px] and text-white do not collide — Tailwind
                                                    // reads the first as a length and the second as a colour.
                                                    className="font-sans text-[24px] text-center text-white w-[46px] h-[46px] my-1 rounded-xl border"
                                                    style={{
                                                        padding: 0,
                                                        includeFontPadding: false,
                                                        textAlignVertical: "center",
                                                        ...boxStyle(i),
                                                    }}
                                                />
                                            </OtpBox>
                                        ))}

                                        {settled && (
                                            <Animated.View
                                                pointerEvents="none"
                                                style={{
                                                    position: "absolute",
                                                    left: 0,
                                                    right: 0,
                                                    top: 0,
                                                    bottom: 0,
                                                    zIndex: 20,
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                }}
                                            >
                                                {/* Held until the boxes have finished converging, so the
                            mark lands on the stack rather than over six moving
                            boxes. Matches .animate-otp-badge's 0.45s on the web.
                            Keyed off the verdict, never off error: error is null
                            for the whole round trip, which is not the same thing
                            as the code being right. */}
                                                {verdict === "fail"
                                                    ? <CrossOutline size={38} delay={450} />
                                                    : <CheckMarkOutline size={38} delay={450} />}
                                            </Animated.View>
                                        )}
                                    </View>

                                    <AppText className={`text-sm text-[var(--text-muted)] mt-2 mb-5 ${busy ? "opacity-0" : ""}`}>
                                        {expiresIn > 0
                                            ? <>Code expires in <AppText className="text-[var(--text)]" style={{ fontVariant: ["tabular-nums"] }}>{formatMMSS(expiresIn)}</AppText></>
                                            : "Your code has expired."}
                                        {/* iOS only — Android fills the boxes on its own. Not
                                            offered on an expired code, which pastes to nothing. */}
                                        {canPaste && expiresIn > 0 && (
                                            <>
                                                {" · "}
                                                <AppText
                                                    onPress={pasteOtp}
                                                    className="font-semibold text-[var(--text)] underline"
                                                >
                                                    Paste code
                                                </AppText>
                                            </>
                                        )}
                                    </AppText>
                                </View>
                                : isVehicle
                                    ? <View className="w-full gap-3">
                                        {/* Buttons, not a picker. Four options is
                                            below the threshold where a dropdown
                                            earns its extra tap, and which one he
                                            is decides which rides he is offered
                                            — worth seeing all four at once. */}
                                        <View className="flex-row flex-wrap justify-center gap-2">
                                            {VEHICLE_CLASSES.map((option) => {
                                                const selected = vehicleClass === option;
                                                return (
                                                    <Pressable
                                                        key={option}
                                                        role="button"
                                                        aria-label={vehicleLabel(option)}
                                                        onPress={() => { setVehicleClass(option); if (error) setError(null); }}
                                                        className="rounded-xl px-4 py-3 border"
                                                        style={{
                                                            backgroundColor: selected ? "#243AFB" : BOX_BG,
                                                            borderColor: selected ? "transparent" : BOX_BORDER,
                                                        }}
                                                    >
                                                        <AppText className="font-semibold text-[var(--text)]">
                                                            {vehicleLabel(option)}
                                                        </AppText>
                                                    </Pressable>
                                                );
                                            })}
                                        </View>

                                        <Input
                                            prop={{
                                                type: "text",
                                                placeholder: "Registration number",
                                                value: vehicleNumber,
                                                onChangeFn: (value) => { setVehicleNumber(value); if (error) setError(null); },
                                                maxLength: 20,
                                                error: error === "Enter the number on the plate",
                                                bg: BOX_BG,
                                            }}
                                        />

                                        <Input
                                            prop={{
                                                type: "text",
                                                placeholder: "Model",
                                                value: vehicleModel,
                                                onChangeFn: setVehicleModel,
                                                maxLength: 60,
                                                error: error === "Enter the car's model",
                                                bg: BOX_BG,
                                            }}
                                        />
                                    </View>
                                : <Input
                                    prop={{
                                        type: isUsername ? "text" : "tel",
                                        placeholder: isUsername ? "Full Name" : "Phone Number",
                                        value: isUsername ? username : phone,
                                        onChangeFn: isUsername ? handleUsernameChange : handlePhoneChange,
                                        maxLength: isUsername ? null : 10,
                                        error: isUsername
                                            ? error === "Enter your name" || error === "Name must be at least 2 characters" || error === "Username is already taken"
                                            : error === "Enter a Phone Number" || error === "Number should be exactly 10 digits",
                                        bg: BOX_BG,
                                    }}
                                />
                            }

                            <Button
                                onPress={isPhone && showLoginUp
                                    ? () => navigate("/login", { state: { phone } })
                                    : isUsername
                                        ? handleUsernameSubmit
                                        : isVehicle
                                            ? handleVehicleSubmit
                                            : (isPhone ? handleSubmit : handleOTPSubmit)}
                                prop={{
                                    disabled: (isPhone && showLoginUp)
                                        ? false
                                        // Every step names its own rule. The
                                        // fallback used to be the OTP length,
                                        // which meant the USERNAME step's button
                                        // was disabled until a code he had not
                                        // been sent yet was six digits long — so
                                        // it could never be pressed at all.
                                        : isUsername
                                            ? username.trim().length < 2
                                            // Validated on press rather than
                                            // disabled: three fields behind one
                                            // button makes a dead control that
                                            // never says which is the problem.
                                            : isVehicle
                                                ? loading
                                                : (isPhone ? phone.length !== 10 : otp.length !== OTP_LENGTH),
                                }}
                                className="mt-5"
                            >
                                {isPhone
                                    ? (showLoginUp ? "Login Up" : (loading ? "Sending OTP..." : "Continue"))
                                    : isUsername
                                        ? "Continue"
                                        : isVehicle
                                            ? (loading ? "Saving..." : "Finish")
                                            : (loading ? "Redirecting..." : "Confirm")}
                            </Button>

                            {isPhone && !showLoginUp && (
                                <AppText className="mt-6 text-sm text-center text-[var(--text-muted)]">
                                    <AppText className="text-[var(--text)]">Have an account?</AppText>{" "}
                                    <AppText
                                        onPress={() => navigate("/login")}
                                        className="font-semibold text-[var(--text)] underline"
                                    >
                                        Log in
                                    </AppText>
                                </AppText>
                            )}

                            {isOtp && (
                                <AppText className={`mt-6 text-sm text-center text-[var(--text-muted)] ${busy ? "opacity-0" : ""}`}>
                                    <AppText className="text-[var(--text)]">Didn&apos;t get it?</AppText>{" "}
                                    {resending
                                        ? "Sending..."
                                        : resendIn > 0
                                            ? <AppText style={{ fontVariant: ["tabular-nums"] }}>Resend in {resendIn}s</AppText>
                                            : <AppText
                                                onPress={handleResend}
                                                className="font-semibold text-[var(--text)] underline"
                                            >
                                                Resend
                                            </AppText>}
                                </AppText>
                            )}

                            {isUsername && (<AppText className="text-sm text-center text-[var(--text-muted)] mt-5">
                                {"Your name can't be changed later, so we suggest using your full name."}
                            </AppText>)}

                            {isPhone && (<AppText className="text-sm text-center text-[var(--text-muted)] mt-5">
                                {"Your number can't be changed later. By continuing, you consent to receive an OTP by text or WhatsApp."}
                            </AppText>)}

                            {isOtp && (<AppText className="text-sm text-center text-[var(--text-muted)] mt-5">
                                {"You consent to receive a OTP\nby text or WhatsApp."}
                            </AppText>)}

                            {isVehicle && (<AppText className="text-sm text-center text-[var(--text-muted)] mt-5">
                                {"Next you'll add your photo and the car's documents."}
                            </AppText>)}
                        </View>
                    </View>}
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

export default Signup
