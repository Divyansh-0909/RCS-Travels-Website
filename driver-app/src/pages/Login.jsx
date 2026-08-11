import { useSignIn, useAuth } from "@clerk/clerk-expo";
import { useState, useEffect, useRef } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useNavigate } from "react-router-native";
import { cssInterop } from "nativewind";
import { ArrowLeftIcon } from "phosphor-react-native";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import AppText from "../components/AppText";
import { useApi } from "../hooks/useApi";
import { useData } from "../hooks/useData";
import { useOtpClipboard } from "../hooks/useOtpClipboard";
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

const Login = () => {
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
  const [step, setStep] = useState("phone"); // "phone" | "otp"
  const [verdict, setVerdict] = useState(null); // null | "pass" | "fail"
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [showSignUp, setShowSignUp] = useState(false);
  const [focusedBox, setFocusedBox] = useState(-1);
  const [redirecting, setRedirecting] = useState(false);

  const api = useApi();

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
    navigate("/")
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
    const data = await api.sendOtp(phone, "login");
    if (data.status === 429) {
      setStep("otp");
      setResendIn(RESEND_COOLDOWN);
      setExpiresIn(OTP_TTL - RESEND_COOLDOWN);
      return;
    }
    if (data.status === 404) {
      setError(data.error);
      setShowSignUp(true);
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
      setError("Something went wrong");
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
      const result = await signIn.create({ strategy: "ticket", ticket: data.ticket });
      if (result.status !== "complete") {
        setError("Sign in failed. Please try again.");
        // The code was right, so the verdict was already "pass" — but the sign-in
        // it was standing in for did not happen, and leaving a tick over an error
        // message reports the wrong thing.
        setVerdict("fail");
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

  // The collapse reports an answer, so it waits for one. busy alone starts on the
  // press, which would have the boxes merging over a request that might still
  // come back rejected. Both halves are needed: verdict outlives the request it
  // came from, and without busy the mark would stay up after the row reopens.
  const settled = busy && Boolean(verdict);

  const formatMMSS = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const phoneDisplay = phone ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : "+91 XXXXX XXXXX";

  const handlePhoneChange = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);

    setPhone(digits);
    setShowSignUp(false);

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
  // reaches the app — SMS autofill can't see it. Only while the boxes are empty:
  // a code already typed or already filled is not one to overwrite.
  const { canPaste, paste: pasteOtp } = useOtpClipboard({
    enabled: !isPhone && !busy && otp.length === 0,
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
      <Pressable
        role="button"
        aria-label="Back"
        onPress={back}
        className="absolute left-3 top-10 z-10 flex-row justify-center items-center p-2 active:opacity-60"
      >
        <BackIcon size={24} weight="regular" className="text-[var(--text)]" />
      </Pressable>

      <ScrollView
        contentContainerClassName="flex-grow justify-center items-center px-6"
        keyboardShouldPersistTaps="handled"
      >
        {isSignedIn && !redirecting
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
                {isPhone ? "Let's get you back\non the road." : "Confirm your code."}
              </AppText>
              <AppText className="text-base text-center text-[var(--text-muted)]">
                {isPhone
                  ? "We'll send a OTP to this number."
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

              {!isPhone
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
                :
                <Input
                  prop={{
                    type: "tel",
                    placeholder: "XXXXX XXXXX",
                    value: phone,
                    onChangeFn: handlePhoneChange,
                    maxLength: 10,
                    error: error === "Enter a Phone Number" ||
                      error === "Number should be exactly 10 digits",
                    bg: BOX_BG,
                  }}
                />
              }

              <Button
                onPress={isPhone && showSignUp
                  ? () => navigate("/signup", { state: { phone } })
                  : (isPhone ? handleSubmit : handleOTPSubmit)}
                prop={{
                  disabled: (isPhone && showSignUp)
                    ? false
                    : (isPhone ? phone.length !== 10 : otp.length !== OTP_LENGTH),
                }}
                className="mt-5"
              >
                {isPhone
                  ? (showSignUp ? "Sign Up" : (loading ? "Sending OTP..." : "Continue"))
                  : (loading ? "Redirecting..." : "Confirm")}
              </Button>

              {isPhone && !showSignUp && (
                <AppText className="mt-6 text-sm text-center text-[var(--text-muted)]">
                  <AppText className="text-[var(--text)]">No account?</AppText>{" "}
                  <AppText
                    onPress={() => navigate("/signup")}
                    className="font-semibold text-[var(--text)] underline"
                  >
                    Sign up
                  </AppText>
                </AppText>
              )}

              {!isPhone && (
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

              <AppText className="text-sm text-center text-[var(--text-muted)] mt-5">
                {"You consent to receive a OTP\nby text or WhatsApp."}
              </AppText>
            </View>
          </View>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default Login
