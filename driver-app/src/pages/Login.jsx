
import { driverCopy as dc } from "../lib/copy";
import { useSignIn, useAuth } from "@clerk/clerk-expo";
import { useState, useEffect, useRef } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, ReduceMotion, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useNavigate } from "react-router-native";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import BackButton from "../components/ui/BackButton";
import InlineError from "../components/ui/InlineError";
import AppText from "../components/AppText";
import { useApi } from "../hooks/useApi";
import { useData } from "../hooks/useData";
import { useOtpClipboard } from "../hooks/useOtpClipboard";
import CheckMarkOutline from "../components/illustrations/CheckMarkOutline";
import CrossOutline from "../components/illustrations/CrossOutline";
import { useLanguage } from '../i18n';
import { useTheme } from '../theme/ThemeContext';

const ERROR_TEXT = "#E86A6A";   
const BOX_BG = "#1d1d27";     
const BOX_BORDER_ERROR = "rgba(185,28,28,0.5)";
const BOX_BORDER_ERROR_FOCUS = "rgba(185,28,28,0.8)";
const BOX_BG_ERROR = "rgba(185,28,28,0.1)";
const BOX_PASS = "#16A34A";
const BOX_FAIL = "#DC2626";

const BOX_SIZE = 46;  // w-[46px]/h-[46px] on the inputs
const BOX_GAP = 8;    // gap-2 on the row holding them
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const CONVERGE = { duration: 220, easing: EASE_OUT, reduceMotion: ReduceMotion.System };
const CONTENT_ENTER = FadeInDown.duration(220).easing(EASE_OUT).reduceMotion(ReduceMotion.System);
const CONTENT_EXIT = FadeOut.duration(140).easing(EASE_OUT).reduceMotion(ReduceMotion.System);
const ERROR_ENTER = FadeInDown.duration(160).easing(EASE_OUT).reduceMotion(ReduceMotion.System);

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

const Login = () => {

  const { isLoaded, signIn, setActive } = useSignIn();
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const phone = useData(state => state.phone);
  const setPhone = useData(state => state.setPhone);
  const [otp, setOtp] = useState("");
  const phoneInputRef = useRef(null);
  const otpRefs = useRef([]);
  const OTP_LENGTH = 6;
  const OTP_TTL = 300; // seconds until the OTP expires — matches the backend's 5-minute window
  const RESEND_COOLDOWN = 45; // matches the backend's per-phone cooldown, which 429s early resends
  const [expiresIn, setExpiresIn] = useState(0);
  const [step, setStep] = useState("phone"); // "phone" | "otp"
  const [verdict, setVerdict] = useState(null); // null | "pass" | "fail"
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [focusedBox, setFocusedBox] = useState(-1);
  const [redirecting, setRedirecting] = useState(false);

  const api = useApi();
  const { t } = useLanguage();
  const { colors, scheme } = useTheme();
  const inputBackground = scheme === "dark" ? BOX_BG : colors.surface;

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

  const back = () => {
    if (step === "otp") {
      setStep("phone");
      setOtp("");
      setVerdict(null);
      setError(null);
      setRedirecting(false);
      return;
    }
    navigate("/")
  }

  async function handleSubmit() {
    if (!phone) {
      setError(t('driver.auth.phoneRequired'));
      return;
    }

    if (!(phone.length === 10)) {
      setError(t('driver.auth.phoneInvalid'));
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
    const data = await api.sendOtp(phone, "login");
    if (data.status === 429) {
      setStep("otp");
      setResendIn(RESEND_COOLDOWN);
      setExpiresIn(OTP_TTL - RESEND_COOLDOWN);
      return;
    }
    if (data.status === 404) {
      navigate("/signup", { state: { phone, entry: "login" } });
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
      const data = await api.sendOtp(phone, "login");
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
    const data = await api.verifyOtp(phone, otp, "login");
    if (data.error) {
      setError(data.error);
      setVerdict("fail");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setOtp("")
      return;
    }

    setVerdict("pass");
    setRedirecting(true);

    if (!isSignedIn) {
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
    }

    // Home unconditionally, and VerifiedRoute decides from there. It already
    // knows the difference between "no driver row yet" (-> the vehicle details),
    // "documents not approved" (-> the status screen) and "cleared to drive"
    // (-> Home), and it reads that from one server-computed answer. Guessing
    // here off a getMe() error would be a second copy of that rule, and the two
    // would eventually disagree about where a half-onboarded captain belongs.
    navigate("/", { replace: true });
  };

  const isPhone = step === "phone";

  const busy = loading || redirecting;

  useEffect(() => {
    const activeInput = isPhone ? phoneInputRef.current : otpRefs.current[0];
    activeInput?.focus();
  }, [isPhone]);

  // The collapse reports an answer, so it waits for one. busy alone starts on the
  // press, which would have the boxes merging over a request that might still
  // come back rejected. Both halves are needed: verdict outlives the request it
  // came from, and without busy the mark would stay up after the row reopens.
  const settled = busy && Boolean(verdict);
  const phoneFieldError = isPhone && [
    t('driver.auth.phoneRequired'),
    t('driver.auth.phoneInvalid'),
  ].includes(error);
  const otpFieldError = !isPhone && Boolean(error) && (
    [t('driver.auth.otpRequired'), t('driver.auth.otpInvalid')].includes(error) || verdict === "fail"
  );
  const formError = error && !phoneFieldError && !otpFieldError ? error : null;

  const formatMMSS = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const phoneDisplay = phone ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : "+91 XXXXX XXXXX";
  const otpBody = t('driver.auth.otpBody', { phone: phoneDisplay });
  const phoneOffset = otpBody.indexOf(phoneDisplay);

  const handlePhoneChange = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);

    setPhone(digits);

    if (
      error === dc("Enter a Phone Number") ||
      error === dc("Number should be exactly 10 digits")
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
  // reaches the app — SMS autofill can't see it. Only while the boxes are empty:
  // a code already typed or already filled is not one to overwrite.
  useOtpClipboard({
    enabled: !isPhone && !busy && otp.length === 0,
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
      backgroundColor: inputBackground,
      borderColor: focused ? colors.primary : colors.borderUi,
    };
  };

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
        {isSignedIn && !redirecting
          ? <View className="justify-center items-center">
            <AppText className="text-2xl font-semibold text-center">
              {t('driver.auth.alreadyIn')}
            </AppText>
            <Button
              onPress={() => navigate("/")}
              prop={{ width: 220 }}
              className="mt-6"
            >
              {t('common.actions.back')}
            </Button>
          </View>

          : <Animated.View key={step} entering={CONTENT_ENTER} exiting={CONTENT_EXIT} className="w-full justify-start items-start gap-5">
            <View className="w-full justify-center items-start gap-1">
              <AppText className="text-2xl font-semibold text-left">
                {isPhone ? t('driver.auth.loginTitle') : t('driver.auth.confirmTitle')}
              </AppText>
              <AppText className="text-base text-left text-[var(--text-muted)]">
                {isPhone
                  ? t('driver.auth.phoneBody')
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
              {!isPhone
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
                          className="font-sans text-[24px] text-center text-[var(--text)] w-[46px] h-[46px] my-1 rounded-xl border"
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
                :
                <Input
                  prop={{
                    type: "tel",
                    inputRef: phoneInputRef,
                    autoFocus: true,
                    get "placeholder"() { return dc("Mobile number"); },
                    value: phone,
                    onChangeFn: handlePhoneChange,
                    maxLength: 10,
                    error: phoneFieldError,
                    bg: inputBackground,
                  }}
                />
              }

              {phoneFieldError && (
                <Animated.View entering={ERROR_ENTER} exiting={CONTENT_EXIT} className="mt-1 w-full">
                  <InlineError message={error} color={ERROR_TEXT} />
                </Animated.View>
              )}

              <Button
                onPress={isPhone ? handleSubmit : handleOTPSubmit}
                prop={{
                  disabled: isPhone
                    ? loading || phone.length !== 10
                    : loading || otp.length !== OTP_LENGTH,
                }}
                className="mt-3"
              >
                {isPhone
                  ? (loading ? t('driver.auth.sendingOtp') : t('common.actions.continue'))
                : ((loading || verdict) ? t('driver.auth.continue') : t('driver.auth.submit'))}
              </Button>

              {formError && (
                <Animated.View entering={ERROR_ENTER} exiting={CONTENT_EXIT} className="mt-2 w-full">
                  <InlineError message={formError} color={ERROR_TEXT} />
                </Animated.View>
              )}

              {!isPhone && (
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

              {isPhone && (
                <AppText className="text-sm text-left text-[var(--text-muted)] mt-5">
                  {t('driver.auth.consent')}
                </AppText>
              )}
            </View>
          </Animated.View>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default Login
