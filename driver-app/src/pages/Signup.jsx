
import { driverCopy as dc } from "../lib/copy";
import { useSignIn, useAuth } from "@clerk/clerk-expo";
import { useState, useEffect, useRef } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { CaretDownIcon, CheckIcon } from "phosphor-react-native";
import { useNavigate, useLocation } from "react-router-native";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import BackButton from "../components/ui/BackButton";
import InlineError from "../components/ui/InlineError";
import AppText from "../components/AppText";
import { useApi } from "../hooks/useApi";
import { useData } from "../hooks/useData";
import { useOtpClipboard } from "../hooks/useOtpClipboard";
import { useDriver } from "../hooks/useDriver";
import { VEHICLE_NUMBER_INPUT_MAX_LENGTH, VEHICLE_NUMBER_MAX_LENGTH, VEHICLE_NUMBER_MIN_LENGTH, validateVehicleNumber } from "../lib/vehicleNumber";
import { vehicleLabel } from "../constants/booking";
import CheckMarkOutline from "../components/illustrations/CheckMarkOutline";
import CrossOutline from "../components/illustrations/CrossOutline";
import LanguageSelector from '../components/LanguageSelector';
import { useLanguage } from '../i18n';
import { useTheme } from '../theme/ThemeContext';
import { openExternalUrl } from '../lib/externalLinks';


const ERROR_TEXT = "#E86A6A";
const BOX_BG = "#1d1d27";
const BOX_BORDER = "rgba(255,255,255,0.3)";
const BOX_BORDER_ERROR = "rgba(185,28,28,0.5)";
const BOX_BORDER_ERROR_FOCUS = "rgba(185,28,28,0.8)";
const BOX_BG_ERROR = "rgba(185,28,28,0.1)";
const BOX_PASS = "#16A34A";
const BOX_FAIL = "#DC2626";
const LEGAL_BASE_URL = 'https://www.rcstravels.co.in';

// The four classes POST /driver/me accepts, smallest first — the order a captain
// scanning for his own car expects to read them in.
const VEHICLE_CLASSES = ["hatchback", "sedan", "suv", "suv_premium"];

const BOX_SIZE = 46;  // w-[46px]/h-[46px] on the inputs
const BOX_GAP = 8;    // gap-2 on the row holding them
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const CONVERGE = { duration: 220, easing: EASE_OUT, reduceMotion: ReduceMotion.System };
const CONTENT_ENTER = FadeInDown.duration(220).easing(EASE_OUT).reduceMotion(ReduceMotion.System);
const CONTENT_EXIT = FadeOut.duration(140).easing(EASE_OUT).reduceMotion(ReduceMotion.System);
const ERROR_ENTER = FadeInDown.duration(160).easing(EASE_OUT).reduceMotion(ReduceMotion.System);
const CARD_ENTER = FadeIn.duration(180).easing(EASE_OUT).withInitialValues({ opacity: 0, transform: [{ scale: 0.97 }] }).reduceMotion(ReduceMotion.System);
const MODAL_ENTER = FadeIn.duration(180).easing(EASE_OUT).withInitialValues({ opacity: 0, transform: [{ scale: 0.96 }] }).reduceMotion(ReduceMotion.System);

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
    const activeInputRef = useRef(null);
    const vehicleNumberInputRef = useRef(null);
    const otpRefs = useRef([]);
    const OTP_LENGTH = 6;
    const OTP_TTL = 300; // seconds until the OTP expires — matches the backend's 5-minute window
    const RESEND_COOLDOWN = 45; // matches the backend's per-phone cooldown, which 429s early resends
    const [expiresIn, setExpiresIn] = useState(0);
    const [step, setStep] = useState("language"); // "language" | "username" | "phone" | "existing" | "otp" | "vehicle"
    const [verdict, setVerdict] = useState(null); // null | "pass" | "fail"
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [resendIn, setResendIn] = useState(0);
    const [otpIntent, setOtpIntent] = useState("signup");
    const [focusedBox, setFocusedBox] = useState(-1);
    const [redirecting, setRedirecting] = useState(false);
    const [username, setUsername] = useState("");
    const [vehicleClass, setVehicleClass] = useState(null);
    const [vehicleNumber, setVehicleNumber] = useState("");
    const [vehicleModel, setVehicleModel] = useState("");
    const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
    const [vehicleClassStatus, setVehicleClassStatus] = useState("idle");
    const vehicleClassRequestRef = useRef(0);

    const api = useApi();
    const { profile, notRegistered, loading: driverLoading, refresh } = useDriver();
    const { language, setLanguage, t } = useLanguage();
    const { colors } = useTheme();
    const [pendingLanguage, setPendingLanguage] = useState(language);
    const categoryCaret = useSharedValue(0);

    useEffect(() => {
        categoryCaret.set(withTiming(categoryPickerOpen ? 1 : 0, {
            duration: 170,
            easing: EASE_OUT,
            reduceMotion: ReduceMotion.System,
        }));
    }, [categoryPickerOpen, categoryCaret]);

    const categoryCaretStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${categoryCaret.get() * 180}deg` }],
    }));

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
        if (location.state?.entry === "login") setStep("username");
    }, [location.state?.entry, location.state?.phone, setPhone]);

    // Signed in with Clerk and unknown to the fleet — he verified his phone but
    // the Driver row was never created. The session survived, so only collect the
    // name needed to create that profile; personal documents come immediately
    // after profile creation and vehicle details are intentionally later.
    useEffect(() => {
        if (isSignedIn && notRegistered) setStep("username");
    }, [isSignedIn, notRegistered]);

    const back = () => {
        // The phone is already verified by the time we reach `vehicle`, so going
        // back means editing the registration details that are still changeable.
        // `handleUsernameSubmit` detects this signed-in/no-row state and resumes
        // directly at vehicle instead of asking for another OTP.
        if (step === "vehicle") { setError(null); setStep("username"); return; }
        if (step === "otp") {
            setOtp("");
            setVerdict(null);
            setError(null);
            setRedirecting(false);
            setStep(otpIntent === "login" ? "existing" : "phone");
            return;
        }
        if (step === "existing") { setError(null); setStep("phone"); return; }
        if (step === "phone") { setStep("username"); return; }
        if (step === "username") {
            if (location.state?.entry === "login") {
                navigate("/login", { state: { phone } });
                return;
            }
            setStep("language");
            return;
        }
        navigate("/");
    };


    // Was written, never wired, and its absence left the username step broken in
    // three separate ways — see the Button below. `e.preventDefault()` is gone
    // with the wiring: that is a web idiom, and React Native hands onPress a
    // GestureResponderEvent which has no such method to call.
    async function handleUsernameSubmit() {
        if (!username?.trim()) {
            setError(t('driver.signup.nameRequired'));
            return;
        }
        if (username.trim().length < 2) {
            setError(t('driver.signup.nameShort'));
            return;
        }

        try {
            setError(null);
            setLoading(true);
            const availability = await api.checkName(username.trim());
            if (availability?.error) {
                setError(availability.code === "NAME_TAKEN"
                    ? t('driver.signup.nameTaken')
                    : availability.error);
                return;
            }
            if (isSignedIn && notRegistered) {
                const created = await api.createMe({ name: username.trim() });
                if (created?.error) {
                    setError(created.code === "NAME_TAKEN"
                        ? t('driver.signup.nameTaken')
                        : created.error);
                    return;
                }
                await refresh();
                navigate("/document", { replace: true });
                return;
            }

            setStep("phone");
        } catch (err) {
            console.error(err);
            setError(t('driver.auth.generic'));
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit() {
        if (!phone) {
            setError(t('driver.signup.phoneRequired'));
            return;
        }

        if (!(phone.length === 10)) {
            setError(t('driver.signup.phoneInvalid'));
            return;
        }

        try {
            setError(null);
            setLoading(true);
            await sendOtp()
        } catch (err) {
            console.error(err);
            setError(err?.message || t('driver.auth.generic'));
        } finally {
            setLoading(false);
        }
    }

    async function handleOTPSubmit() {
        if (!otp) {
            setError(t('driver.auth.otpRequired'));
            return;
        }

        if (!(otp.length === OTP_LENGTH)) {
            setError(t('driver.auth.otpInvalid'));
            return;
        }

        // Before the request, not after. verify-otp burns the code server-side and
        // hands back a 60s ticket, so bailing out further down would cost the user
        // their code and force a resend for something that resolves on its own.
        if (!isLoaded) {
            setError(t('driver.auth.connecting'));
            return;
        }

        try {
            setError(null);
            setVerdict(null);
            setLoading(true);
            await verifyOtp()
        } catch (err) {
            console.error(err);
            setError(err?.message || t('driver.auth.generic'));
            // Backend-declared OTP failures are handled inside verifyOtp(). Anything
            // that throws here is a transport/session failure, so don't label it as a
            // wrong code and don't leave the screen stuck in the redirecting state.
            setVerdict(null);
            setRedirecting(false);
        } finally {
            setLoading(false);
        }
    }

    const sendOtp = async () => {
        setOtpIntent("signup");
        const data = await api.sendOtp(phone, "signup");
        if (data.status === 429) {
            setStep("otp");
            setResendIn(RESEND_COOLDOWN);
            setExpiresIn(OTP_TTL - RESEND_COOLDOWN);
            return;
        }
        if (data.status === 409) {
            setError(null);
            setStep("existing");
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

    const continueWithExistingAccount = async () => {
        try {
            setError(null);
            setLoading(true);
            setOtpIntent("login");
            const data = await api.sendOtp(phone, "login");
            if (data.status === 429) {
                setOtp("");
                setVerdict(null);
                setStep("otp");
                setResendIn(RESEND_COOLDOWN);
                setExpiresIn(OTP_TTL - RESEND_COOLDOWN);
                return;
            }
            if (data.error) {
                setError(data.error);
                return;
            }
            setOtp("");
            setVerdict(null);
            setStep("otp");
            setResendIn(RESEND_COOLDOWN);
            setExpiresIn(OTP_TTL);
        } catch (err) {
            console.error(err);
            setError(t('driver.auth.generic'));
        } finally {
            setLoading(false);
        }
    };

    async function handleResend() {
        if (resendIn > 0 || resending) return;

        try {
            setError(null);
            setResending(true);
            const data = await api.sendOtp(phone, otpIntent);
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
            setError(t('driver.auth.generic'));
        } finally {
            setResending(false);
        }
    }

    const verifyOtp = async () => {
        const data = await api.verifyOtp(phone, otp, otpIntent);
        if (data.error) {
            setError(data.error);
            setVerdict("fail");
            await new Promise((resolve) => setTimeout(resolve, 900));
            setOtp("")
            return;
        }

        setVerdict("pass");
        setRedirecting(true);

        let result;
        try {
            result = await signIn.create({ strategy: "ticket", ticket: data.ticket });
        } catch (err) {
            console.error('Driver Clerk ticket sign-in failed', err);
            setError(t('driver.auth.signInFailed'));
            setVerdict(null);
            setRedirecting(false);
            return;
        }

        if (result.status !== "complete") {
            setError(t('driver.auth.signInFailed'));
            setVerdict(null);
            setRedirecting(false);
            return;
        }

        await setActive({ session: result.createdSessionId });

        if (otpIntent === "login") {
            navigate("/", { replace: true });
            return;
        }

        const created = await api.createMe({ name: username.trim() });
        if (created?.error) {
            setVerdict(null);
            setRedirecting(false);
            if (created.code === "NAME_TAKEN") {
                setStep("username");
                setError(t('driver.signup.nameTaken'));
                return;
            }
            setError(created.error);
            return;
        }

        // The Driver row now exists without a car. Refresh before routing so the
        // provider no longer sees this authenticated session as notRegistered.
        await refresh();
        navigate("/document", { replace: true });
    };

    const handleVehicleSubmit = async () => {
        if (!vehicleClass) { setError(t('driver.auth.vehicleClass')); return; }

        const plate = validateVehicleNumber(vehicleNumber);
        if (!plate.valid) {
            setError(
                plate.reason === 'missing'
                    ? t('driver.auth.plate')
                    : plate.reason === 'too_short'
                        ? dc("Registration number must be at least {{value0}} characters", { value0: VEHICLE_NUMBER_MIN_LENGTH })
                        : plate.reason === 'too_long'
                            ? dc("Registration number can be at most {{value0}} characters", { value0: VEHICLE_NUMBER_MAX_LENGTH })
                            : plate.reason === 'characters'
                                ? dc("Use only letters, numbers, spaces, and hyphens")
                                : plate.reason === 'bh_format'
                                    ? dc("Check the BH-series registration number")
                                    : dc("Check the registration number"),
            );
            return;
        }

        // Required, like the plate. A rider meeting this car at a gate is looking
        // for "the white Innova Crysta" — the class alone does not pick it out of
        // a queue, and this is the one moment the captain is already typing.
        if (vehicleModel.trim().length < 2) { setError(t('driver.auth.model')); return; }

        try {
            setError(null);
            setLoading(true);

            const created = await api.createMe({
                name: username.trim(),
                vehicleClass,
                vehicleNumber: plate.number,
                vehicleModel: vehicleModel.trim(),
            });

            if (created?.error) {
                if (created.code === "NAME_TAKEN") {
                    await api.logout();
                    setVerdict(null);
                    setRedirecting(false);
                    setStep("username");
                    setError(t('driver.signup.nameTaken'));
                    return;
                }
                setError(created.error);
                return;
            }

            // The provider has to learn about the new row before the router asks
            // it who this is — without the refresh, VerifiedRoute still holds
            // `notRegistered` and would bounce him straight back here.
            await refresh();
            navigate("/onboarding/status", { replace: true });
        } catch (err) {
            console.error(err);
            setError(err?.message || t('driver.auth.generic'));
        } finally {
            setLoading(false);
        }
    };

    const isLanguage = step === "language";
    const isUsername = step === "username";
    const isPhone = step === "phone";
    const isOtp = step === "otp";
    const isExisting = step === "existing";
    const isVehicle = step === "vehicle";

    const busy = loading || redirecting;

    useEffect(() => {
        if (isLanguage || isExisting) return;
        const activeInput = isOtp
            ? otpRefs.current[0]
            : isVehicle
                ? vehicleNumberInputRef.current
                : activeInputRef.current;
        activeInput?.focus();
    }, [step, isLanguage, isOtp, isExisting, isVehicle]);

    // The collapse reports an answer, so it waits for one. busy alone starts on the
    // press, which would have the boxes merging over a request that might still
    // come back rejected. Both halves are needed: verdict outlives the request it
    // came from, and without busy the mark would stay up after the row reopens.
    const settled = busy && Boolean(verdict);
    const usernameFieldError = isUsername && [
        t('driver.signup.nameRequired'),
        t('driver.signup.nameShort'),
        t('driver.signup.nameTaken'),
    ].includes(error);
    const phoneFieldError = isPhone && [
        t('driver.signup.phoneRequired'),
        t('driver.signup.phoneInvalid'),
    ].includes(error);
    const otpFieldError = isOtp && Boolean(error) && (
        [t('driver.auth.otpRequired'), t('driver.auth.otpInvalid')].includes(error) || verdict === "fail"
    );
    const vehicleNumberFieldError = isVehicle && [
        t('driver.auth.plate'),
        dc("Registration number must be at least {{value0}} characters", { value0: VEHICLE_NUMBER_MIN_LENGTH }),
        dc("Registration number can be at most {{value0}} characters", { value0: VEHICLE_NUMBER_MAX_LENGTH }),
        dc("Use only letters, numbers, spaces, and hyphens"),
        dc("Check the BH-series registration number"),
        dc("Check the registration number"),
    ].includes(error);
    const vehicleModelFieldError = isVehicle && error === t('driver.auth.model');
    const vehicleClassFieldError = isVehicle && error === t('driver.auth.vehicleClass');
    const formError = error
        && !usernameFieldError
        && !phoneFieldError
        && !otpFieldError
        && !vehicleNumberFieldError
        && !vehicleModelFieldError
        && !vehicleClassFieldError
        ? error
        : null;

    const formatMMSS = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

    const phoneDisplay = phone ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : "+91 XXXXX XXXXX";
    const maskedPhone = phone.length === 10 ? `+91 ••••• ••${phone.slice(-3)}` : phoneDisplay;
    const otpBody = t('driver.auth.otpBody', { phone: phoneDisplay });
    const phoneOffset = otpBody.indexOf(phoneDisplay);

    const handleUsernameChange = (value) => {
        setUsername(value);
        if (error) setError(null);
    };

    const handlePhoneChange = (value) => {
        const digits = value.replace(/\D/g, "").slice(0, 10);

        setPhone(digits);

        if (
            error === t('driver.signup.phoneRequired') ||
            error === t('driver.signup.phoneInvalid')
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
    useOtpClipboard({
        enabled: isOtp && !busy && otp.length === 0,
        length: OTP_LENGTH,
        onCode: (code) => {
            setOtp(code);
            clearOtpError();
            focusBox(OTP_LENGTH - 1);
        },
    });

    const boxStyle = (i) => {
        const focused = focusedBox === i;

        // Only once the answer is in. While the boxes are still converging there is
        // nothing to report, so the top of the stack stays the neutral fill below
        // rather than going green on the way to turning red.
        if (settled && i === 0) {
            return { backgroundColor: verdict === "fail" ? BOX_FAIL : BOX_PASS, borderColor: "transparent" };
        }
        if (otpFieldError) {
            return {
                backgroundColor: BOX_BG_ERROR,
                borderColor: focused ? BOX_BORDER_ERROR_FOCUS : BOX_BORDER_ERROR,
            };
        }
        return {
            backgroundColor: BOX_BG,
            borderColor: focused ? colors.primary : colors.borderUi,
        };
    };

    const handleVehicleModelChange = (value) => {
        vehicleClassRequestRef.current += 1;
        setVehicleModel(value);
        if (error) setError(null);
    };

    useEffect(() => {
        if (step !== "vehicle") return;

        const model = vehicleModel.trim();
        const requestId = ++vehicleClassRequestRef.current;

        if (model.length < 2) {
            setVehicleClass(null);
            setVehicleClassStatus("idle");
            setCategoryPickerOpen(false);
            return;
        }

        setVehicleClass(null);
        setVehicleClassStatus("finding");
        setCategoryPickerOpen(false);

        const timer = setTimeout(async () => {
            const result = await api.classifyVehicleModel(model);
            if (vehicleClassRequestRef.current !== requestId) return;

            if (result?.vehicleClass && VEHICLE_CLASSES.includes(result.vehicleClass)) {
                setVehicleClass(result.vehicleClass);
                setVehicleClassStatus("found");
                return;
            }

            setVehicleClass(null);
            setVehicleClassStatus("error");
        }, 300);

        return () => clearTimeout(timer);
    }, [api, step, vehicleModel]);

    return (
        <KeyboardAvoidingView
            className="flex-1 w-full py-12"
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <View className="absolute left-2 right-2 top-10 z-10 h-12 items-center justify-center">
                <AppText className="text-xl font-normal text-[var(--text)]">
                    <AppText className="font-semibold">RCS</AppText> captains
                </AppText>
                <BackButton
                    onPress={back}
                    className="absolute left-0 rounded-full bg-[var(--input-background)]"
                    iconClassName="text-[var(--text)]"
                    iconSize={24}
                    weight="regular"
                />
            </View>

            <ScrollView
                contentContainerClassName="flex-grow justify-start items-start px-6 pt-20"
                keyboardShouldPersistTaps="handled"
            >
                {/* Only for somebody who is signed in AND already has a driver
                    row. Signed-in-with-no-row is the half-finished sign-up this
                    screen exists to finish, and `driverLoading` holds the answer
                    back rather than flashing "already logged in" at him for the
                    length of one request. */}
                {isLanguage
                    ? <Animated.View key="language" entering={CONTENT_ENTER} exiting={CONTENT_EXIT} className="w-full max-w-[440px] justify-start items-start">
                        <View className="w-full items-start gap-1 mb-7">
                            <AppText className="text-2xl font-semibold text-left">{t('driver.language.title')}</AppText>
                            <AppText className="text-base text-left text-[var(--text-muted)]">{t('driver.language.body')}</AppText>
                        </View>
                        <LanguageSelector
                            value={pendingLanguage}
                            onSelect={setPendingLanguage}
                        />
                        <Button
                            onPress={async () => {
                                try { await setLanguage(pendingLanguage); } catch { /* use this session's selected language */ }
                                setStep('username');
                            }}
                            className="mt-5"
                        >{t('driver.auth.confirm')}</Button>
                    </Animated.View>
                    : isSignedIn && !redirecting && !isVehicle && !driverLoading && profile
                    ? <View className="justify-center items-center">
                        <AppText className="text-2xl font-semibold text-center">
                            {dc("You are already logged in.")}
                        </AppText>
                        <Button
                            onPress={() => navigate("/")}
                            prop={{ width: 220 }}
                            className="mt-6"
                        >{dc("Back")}</Button>
                    </View>

                    : <Animated.View key={step} entering={CONTENT_ENTER} exiting={CONTENT_EXIT} className="w-full justify-start items-start gap-5">
                        <View className="w-full justify-center items-start gap-1">
                            <AppText className="text-2xl font-semibold text-left">
                                {isUsername
                                    ? t('driver.signup.nameTitle')
                                    : isPhone
                                        ? t('driver.signup.phoneTitle')
                                        : isExisting
                                            ? t('driver.signup.existingTitle')
                                            : isOtp
                                            ? t('driver.auth.confirmTitle')
                                            : t('driver.signup.vehicleTitle')}
                            </AppText>
                            <AppText className="text-base text-left text-[var(--text-muted)]">
                                {isUsername
                                    ? t('driver.signup.nameBody')
                                    : isPhone
                                        ? t('driver.signup.phoneBody')
                                        : isExisting
                                            ? t('driver.signup.existingBody')
                                        : isVehicle
                                            ? t('driver.signup.vehicleBody')
                                            : phoneOffset >= 0
                                                ? <>
                                                    {otpBody.slice(0, phoneOffset)}
                                                    <AppText className="text-[var(--text)]">{phoneDisplay}</AppText>
                                                    {otpBody.slice(phoneOffset + phoneDisplay.length)}
                                                  </>
                                                : otpBody}
                            </AppText>
                        </View>

                        <View className="w-full justify-center items-start">
                            {/* Explicitly `isOtp`, not `!isPhone`. The old
                                condition also caught the USERNAME step — isPhone
                                is false there as well — so the name step
                                rendered six OTP boxes and no name field,
                                and its Input branch below was unreachable. A
                                fourth step made that impossible to leave alone. */}
                            {isOtp
                                ? <View className="justify-center items-start">
                                    <View className="relative flex-row justify-center items-center gap-2">
                                        {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                                            <OtpBox key={i} index={i} count={OTP_LENGTH} collapsed={settled}>
                                                <TextInput
                                                    ref={(el) => { otpRefs.current[i] = el; }}
                                                    keyboardType="number-pad"
                                                    autoFocus={i === 0}
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
                                                    ? <CrossOutline size={38} delay={220} />
                                                    : <CheckMarkOutline size={38} delay={220} />}
                                            </Animated.View>
                                        )}
                                    </View>

                                    {otpFieldError && (
                                        <Animated.View entering={ERROR_ENTER} exiting={CONTENT_EXIT} className="mt-1 w-full">
                                            <InlineError message={error} color={ERROR_TEXT} />
                                        </Animated.View>
                                    )}

                                    <Animated.View key={`${loading}-${verdict}-${expiresIn > 0}`} entering={FadeIn.duration(140).easing(EASE_OUT).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(100).reduceMotion(ReduceMotion.System)}>
                                    <AppText className="text-sm text-left text-[var(--text-muted)] mt-2 mb-3">
                                        {loading
                                            ? t('driver.auth.verifying')
                                            : verdict === "pass"
                                                ? t('driver.auth.success')
                                                : verdict === "fail"
                                                    ? t('driver.auth.wrongOtp')
                                                    : expiresIn > 0
                                                        ? t('driver.auth.expires', { time: formatMMSS(expiresIn) })
                                                        : t('driver.auth.expired')}
                                    </AppText>
                                    </Animated.View>
                                </View>
                                : isExisting
                                    ? <Animated.View
                                        entering={CARD_ENTER}
                                        className="w-full rounded-2xl border p-4 flex-row items-center gap-3"
                                        style={{ backgroundColor: BOX_BG, borderColor: BOX_BORDER }}
                                    >
                                        <View
                                            accessible={false}
                                            className="h-12 w-12 shrink-0 items-center justify-center rounded-full"
                                            style={{ backgroundColor: colors.canvas }}
                                        >
                                            <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
                                                <Circle cx="12" cy="8" r="4" fill={colors.inkMuted} />
                                                <Path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8H4Z" fill={colors.inkMuted} />
                                            </Svg>
                                        </View>
                                        <View className="min-w-0 flex-1 gap-1">
                                            <AppText className="font-semibold text-[var(--text)]">
                                                {t('driver.signup.existingNameFallback')}
                                            </AppText>
                                            <AppText className="text-sm text-[var(--text-muted)]">
                                                {maskedPhone}
                                            </AppText>
                                        </View>
                                    </Animated.View>
                                : isVehicle
                                    ? <View className="w-full gap-3">
                                        <View className="w-full gap-1">
                                            <Input
                                                prop={{
                                                    type: "text",
                                                    inputRef: vehicleNumberInputRef,
                                                    autoFocus: true,
                                                    get "placeholder"() { return dc("Registration number"); },
                                                value: vehicleNumber,
                                                onChangeFn: (value) => { setVehicleNumber(value.toUpperCase()); if (error) setError(null); },
                                                maxLength: VEHICLE_NUMBER_INPUT_MAX_LENGTH,
                                                error: vehicleNumberFieldError,
                                                bg: BOX_BG,
                                            }}
                                            />
                                            {vehicleNumberFieldError && (
                                                <Animated.View entering={ERROR_ENTER} exiting={CONTENT_EXIT} className="w-full">
                                                    <InlineError message={error} color={ERROR_TEXT} />
                                                </Animated.View>
                                            )}
                                        </View>

                                        <View className="w-full gap-1">
                                            <Input
                                                prop={{
                                                    type: "text",
                                                    get "placeholder"() { return dc("Model"); },
                                                    value: vehicleModel,
                                                    onChangeFn: handleVehicleModelChange,
                                                    maxLength: 60,
                                                    error: vehicleModelFieldError,
                                                    bg: BOX_BG,
                                                }}
                                            />
                                            {vehicleModelFieldError && (
                                                <Animated.View entering={ERROR_ENTER} exiting={CONTENT_EXIT} className="w-full">
                                                    <InlineError message={error} color={ERROR_TEXT} />
                                                </Animated.View>
                                            )}
                                        </View>

                                        <View className="w-full gap-1">
                                            <Pressable
                                                role="button"
                                                aria-label={t('driver.signup.vehicleCategory')}
                                                disabled={vehicleClassStatus === "finding"}
                                                onPress={() => setCategoryPickerOpen(true)}
                                                className="w-full my-1 flex-row items-center justify-between rounded-xl border px-4 py-3"
                                                style={{
                                                    backgroundColor: BOX_BG,
                                                    borderColor: vehicleClassFieldError ? BOX_BORDER_ERROR : colors.borderUi,
                                                }}
                                            >
                                                <Animated.View
                                                    key={`${vehicleClassStatus}-${vehicleClass ?? "empty"}`}
                                                    entering={FadeIn.duration(150).easing(EASE_OUT).reduceMotion(ReduceMotion.System)}
                                                    exiting={FadeOut.duration(100).reduceMotion(ReduceMotion.System)}
                                                >
                                                <AppText
                                                    className="text-base"
                                                    style={{ color: vehicleClass ? colors.ink : colors.inkMuted }}
                                                >
                                                    {vehicleClassStatus === "finding"
                                                        ? `${dc("Classifing vehicle type")}…`
                                                        : vehicleClass
                                                            ? vehicleLabel(vehicleClass)
                                                            : dc("Choose car type")}
                                                </AppText>
                                                </Animated.View>
                                                <Animated.View style={categoryCaretStyle}>
                                                    <CaretDownIcon size={18} weight="bold" color={colors.inkMuted} />
                                                </Animated.View>
                                            </Pressable>
                                            {vehicleClassFieldError && (
                                                <Animated.View entering={ERROR_ENTER} exiting={CONTENT_EXIT} className="w-full">
                                                    <InlineError message={error} color={ERROR_TEXT} />
                                                </Animated.View>
                                            )}
                                            {vehicleClassStatus === "found" ? (
                                                <Animated.View key="classification-found" entering={FadeIn.duration(150).easing(EASE_OUT).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(100).reduceMotion(ReduceMotion.System)}>
                                                <AppText className="text-xs" style={{ color: colors.inkMuted }}>
                                                    {dc("Suggested from model · Tap to change")}
                                                </AppText>
                                                </Animated.View>
                                            ) : vehicleClassStatus === "error" ? (
                                                <Animated.View key="classification-error" entering={FadeIn.duration(150).easing(EASE_OUT).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(100).reduceMotion(ReduceMotion.System)}>
                                                <AppText className="text-xs" style={{ color: colors.inkMuted }}>
                                                    {dc("Couldn't identify it · Choose the car type")}
                                                </AppText>
                                                </Animated.View>
                                            ) : null}
                                        </View>
                                    </View>
                                : <View className="w-full gap-1">
                                    <Input
                                        prop={{
                                            type: isUsername ? "text" : "tel",
                                            inputRef: activeInputRef,
                                            autoFocus: true,
                                            placeholder: isUsername ? dc("Full Name") : dc("Mobile number"),
                                            value: isUsername ? username : phone,
                                            onChangeFn: isUsername ? handleUsernameChange : handlePhoneChange,
                                            maxLength: isUsername ? null : 10,
                                            error: isUsername ? usernameFieldError : phoneFieldError,
                                            bg: BOX_BG,
                                        }}
                                    />
                                    {(usernameFieldError || phoneFieldError) && (
                                        <Animated.View entering={ERROR_ENTER} exiting={CONTENT_EXIT} className="w-full">
                                            <InlineError message={error} color={ERROR_TEXT} />
                                        </Animated.View>
                                    )}
                                </View>
                            }

                            <Button
                                onPress={isExisting
                                    ? continueWithExistingAccount
                                    : isUsername
                                        ? handleUsernameSubmit
                                        : isVehicle
                                            ? handleVehicleSubmit
                                            : (isPhone ? handleSubmit : handleOTPSubmit)}
                                prop={{
                                    disabled: isExisting
                                        ? loading
                                        : isUsername
                                            ? loading || username.trim().length < 2
                                            // Validated on press rather than
                                            // disabled: three fields behind one
                                            // button makes a dead control that
                                            // never says which is the problem.
                                            : isVehicle
                                                ? loading || vehicleClassStatus === "finding"
                                                : isPhone
                                                    ? loading || phone.length !== 10
                                                    : loading || otp.length !== OTP_LENGTH,
                                }}
                                className={isExisting ? "mt-6" : "mt-3"}
                            >
                                {isExisting
                                    ? (loading ? t('driver.auth.sendingOtp') : t('driver.signup.continueExisting'))
                                    : isPhone
                                    ? (loading ? dc("Sending OTP...") : t('common.actions.continue'))
                                    : isUsername
                                        ? (loading ? t('driver.signup.checkingName') : t('common.actions.continue'))
                                        : isVehicle
                                            ? (loading ? t('driver.auth.saving') : t('driver.signup.addDocuments'))
                                            : ((loading || verdict) ? t('driver.auth.continue') : t('driver.auth.submit'))}
                            </Button>

                            {formError && (
                                <Animated.View entering={ERROR_ENTER} exiting={CONTENT_EXIT} className="mt-2 w-full">
                                    <InlineError message={formError} color={ERROR_TEXT} />
                                </Animated.View>
                            )}

                            {isExisting && (
                <AppText className="mt-3 text-sm text-[var(--text-muted)]">
                                    {t('driver.signup.notYourAccount')}{" "}
                                    <AppText
                                        onPress={() => { setError(null); setStep("phone"); }}
                                        className="text-[var(--text)] underline"
                                    >
                                        {t('driver.signup.useAnotherNumber')}
                                    </AppText>
                                </AppText>
                            )}

                            {isPhone && (
                                <AppText className="mt-3 text-sm text-left text-[var(--text-muted)]">
                                    <AppText className="text-[var(--text)]">{t('driver.signup.haveAccount')}</AppText>{" "}
                                    <AppText
                                        onPress={() => navigate("/login")}
                                        className="font-semibold text-[var(--text)] underline"
                                    >
                                        {t('driver.signup.logIn')}
                                    </AppText>
                                </AppText>
                            )}

                            {isOtp && (
                                <AppText className={`mt-3 text-sm text-left text-[var(--text-muted)] ${busy ? "opacity-0" : ""}`}>
                                    <AppText className="text-[var(--text-muted)]">{t('driver.auth.didntGet')}</AppText>{" "}
                                    {resending
                                        ? t('driver.auth.sending')
                                        : resendIn > 0
                                            ? <AppText className="underline" style={{ fontVariant: ["tabular-nums"] }}>{t('driver.auth.resendIn', { seconds: resendIn })}</AppText>
                                            : <AppText
                                                onPress={handleResend}
                                                className="font-semibold text-[var(--text)] underline"
                                            >
                                                {t('driver.auth.resend')}
                                            </AppText>}
                                </AppText>
                            )}

                            {isUsername && (<AppText className="text-sm text-left text-[var(--text-muted)] mt-5">
                                {t('driver.auth.usernameHint')}
                            </AppText>)}

                            {isPhone && (<AppText className="text-sm text-left text-[var(--text-muted)] mt-5">
                                {t('driver.auth.phoneHint')}
                            </AppText>)}

                            {isPhone && (<View className="mt-2">
                                <AppText className="text-sm text-left text-[var(--text-muted)]">
                                    {dc("Please review the draft driver terms and driver privacy policy before continuing.")}
                                </AppText>
                                <View className="flex-row items-center mt-1">
                                    <AppText
                                        accessibilityRole="link"
                                        className="text-sm font-semibold text-[var(--text)] underline"
                                        onPress={() => openExternalUrl(`${LEGAL_BASE_URL}/driver-terms`)}
                                    >
                                        {dc("Terms of service")}
                                    </AppText>
                                    <AppText className="text-sm text-[var(--text-muted)]"> · </AppText>
                                    <AppText
                                        accessibilityRole="link"
                                        className="text-sm font-semibold text-[var(--text)] underline"
                                        onPress={() => openExternalUrl(`${LEGAL_BASE_URL}/driver-privacy`)}
                                    >
                                        {dc("Privacy policy")}
                                    </AppText>
                                </View>
                            </View>)}

                            {isVehicle && (<AppText className="text-sm text-left text-[var(--text-muted)] mt-5">
                                {t('driver.auth.vehicleHint')}
                            </AppText>)}
                        </View>
                    </Animated.View>}
            </ScrollView>

            <Modal
                visible={categoryPickerOpen}
                transparent
                animationType="none"
                onRequestClose={() => setCategoryPickerOpen(false)}
            >
                <Animated.View
                    entering={FadeIn.duration(160).easing(EASE_OUT).reduceMotion(ReduceMotion.System)}
                    className="flex-1"
                    style={{ backgroundColor: "rgba(0,0,0,0.68)" }}
                >
                    <Pressable
                        className="flex-1 items-center justify-center px-6"
                        onPress={() => setCategoryPickerOpen(false)}
                    >
                    <Animated.View entering={MODAL_ENTER} className="w-full">
                    <Pressable
                        accessibilityViewIsModal
                        className="w-full rounded-3xl border p-5"
                        style={{
                            maxWidth: 420,
                            backgroundColor: colors.surfaceRaised,
                            borderColor: colors.borderUi,
                        }}
                        onPress={() => {}}
                    >
                        <AppText className="text-xl font-semibold text-[var(--text)] mb-4">
                            {t('driver.signup.vehicleCategory')}
                        </AppText>

                        <View className="gap-2">
                            {VEHICLE_CLASSES.map((option) => {
                                const selected = vehicleClass === option;

                                return (
                                    <Pressable
                                        key={option}
                                        role="radio"
                                        aria-checked={selected}
                                        onPress={() => {
                                            setVehicleClass(option);
                                            setVehicleClassStatus("manual");
                                            setCategoryPickerOpen(false);
                                            if (error) setError(null);
                                        }}
                                        className="flex-row items-center justify-between rounded-xl border px-4 py-3"
                                        style={{
                                            backgroundColor: selected ? colors.canvas : BOX_BG,
                                            borderColor: selected ? colors.primary : colors.borderUi,
                                        }}
                                    >
                                        <AppText className="text-base font-semibold text-[var(--text)]">
                                            {vehicleLabel(option)}
                                        </AppText>
                                        {selected ? (
                                            <Animated.View entering={FadeIn.duration(150).easing(EASE_OUT).reduceMotion(ReduceMotion.System)}>
                                                <CheckIcon size={18} weight="bold" color={colors.primary} />
                                            </Animated.View>
                                        ) : null}
                                    </Pressable>
                                );
                            })}
                        </View>
                    </Pressable>
                    </Animated.View>
                    </Pressable>
                </Animated.View>
            </Modal>
        </KeyboardAvoidingView>
    );
};

export default Signup
