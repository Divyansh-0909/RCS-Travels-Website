import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../i18nCopy";
import { useSignIn, useAuth } from "@clerk/clerk-react";
import { useState, useEffect, useRef } from "react";
import { useViewNavigate } from "../hooks/useViewNavigate";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import InlineError from "../components/ui/InlineError";
import ErrorPanel from "../components/ui/ErrorPanel";
import { useApi } from "../hooks/useApi";
import AuthHeader from "../components/ui/AuthHeader";
import { useData } from "../hooks/useData";
import { useOtpClipboard } from "../hooks/useOtpClipboard";
import { useWebsiteCopy } from "../hooks/useWebsiteCopy";
import CheckMarkOutline from "../components/illustrations/CheckMarkOutline";
import CrossOutline from "../components/illustrations/CrossOutline";

const OTP_REDIRECT_DELAY = 900;

const LoginPage = () => {
    useCopyLanguage();
  const tr = useWebsiteCopy();
  const { signIn, setActive } = useSignIn();
  const { isSignedIn } = useAuth();
  const navigate = useViewNavigate();
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
  const [continueTo, setContinueTo] = useState(null);
  const [profileRetry, setProfileRetry] = useState(false);
  const pickupLocation = useData(state => state.pickupLocation);
  const isOtpCooldown = (data) => data.status === 429 && data.code !== "RATE_LIMITED";

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
    if (step === "otp") {
      setStep("phone");
      setOtp("");
      setVerdict(null);
      setContinueTo(null);
      setError(null);
      return;
    }
    navigate("/")
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!phone) {
      setError(tr("Enter a Phone Number"));
      return;
    }

    if (!(phone.length === 10)) {
      setError(tr("Number should be exactly 10 digits"));
      return;
    }

    try {
      setError(null);
      setLoading(true);
      await sendOtp()
    } catch (err) {
      console.error(err);
      setError(err?.message || tr("Something went wrong"));
    } finally {
      setLoading(false);
    }
  }

  async function handleOTPSubmit(e) {
    e.preventDefault();

    if (verdict === "pass" && continueTo) {
      navigate(continueTo);
      return;
    }

    if (!otp) {
      setError(tr("Enter OTP"));
      return;
    }

    if (!(otp.length === OTP_LENGTH)) {
      setError(tr("OTP should be exactly 6 digit"));
      return;
    }

    try {
      setError(null);
      setVerdict(null);
      setContinueTo(null);
      setLoading(true);
      await verifyOtp()
    } catch (err) {
      console.error(err);
      setError(err?.message || tr("Something went wrong"));
      setVerdict("fail");
    } finally {
      setLoading(false);
    }
  }

  const sendOtp = async () => {
    const data = await api.sendOtp(phone, "login");
    // An unclassified 429 means an OTP went out less than 45s ago and is still
    // valid (the backend rejects before generating a new one) — e.g. after a page
    // refresh. A limiter 429 has code RATE_LIMITED and must remain an error.
    if (isOtpCooldown(data)) {
      setVerdict(null);
      setContinueTo(null);
      setStep("otp");
      setResendIn(RESEND_COOLDOWN);
      setExpiresIn(OTP_TTL - RESEND_COOLDOWN); // true remaining TTL is unknown; assume the worst
      return;
    }
    // No account behind this number — no OTP was sent. Flip the button into the
    // Sign Up escape hatch instead of leaving a dead end; typing again flips back.
    if (data.status === 404) {
      navigate('/signup', { state: { phone, entry: 'login' } });
      return;
    }
    if (data.error) {
      setError(data.error);
      return;
    }
    setVerdict(null);
    setContinueTo(null);
    setStep("otp");
    setResendIn(RESEND_COOLDOWN);
    setExpiresIn(OTP_TTL);
  };

  async function handleResend() {
    if (resendIn > 0 || resending) return;

    try {
      setError(null);
      setVerdict(null);
      setContinueTo(null);
      setResending(true);
      const data = await api.sendOtp(phone, "login");
      if (data.error) {
        setError(data.error);
        // The client timer normally prevents a 429, but clocks can disagree
        // (rejoining a session from another tab) — restart it so the user isn't
        // shown a Resend button that keeps bouncing.
        if (isOtpCooldown(data)) setResendIn(RESEND_COOLDOWN);
        return;
      }
      setOtp("");
      setResendIn(RESEND_COOLDOWN);
      setExpiresIn(OTP_TTL);
    } catch (err) {
      console.error(err);
      setError(tr("Something went wrong"));
    } finally {
      setResending(false);
    }
  }

  const verifyOtp = async () => {
    const data = await api.verifyOtp(phone, otp, "login");
    if (data.error) {
      setError(data.error);
      setVerdict("fail");
      return;
    }

    if (!isSignedIn) {
      const result = await signIn.create({ strategy: "ticket", ticket: data.ticket });
      if (result.status !== "complete") {
        setError(tr("Sign in failed. Please try again."));
        setVerdict("fail");
        return;
      }
      await setActive({ session: result.createdSessionId });
    }

    await finishSignIn();
  };

  const finishSignIn = async () => {
    let user;
    try {
      user = await api.getMe();
    } catch {
      setError(tr("We couldn't refresh your account right now. Please try again shortly."));
      setProfileRetry(true);
      return;
    }
    if (user?.status === 404) {
      setContinueTo("/signup");
    } else if (user?.error) {
      setError(user.status === 429
        ? tr("We couldn't refresh your account right now. Please try again shortly.")
        : user.error);
      setProfileRetry(true);
      return;
    } else {
      setContinueTo(pickupLocation ? "/book" : "/");
    }
    setProfileRetry(false);
    setVerdict("pass");
  };

  const retryProfile = async () => {
    setError(null);
    setLoading(true);
    await finishSignIn();
    setLoading(false);
  };

  const isPhone = step === "phone";

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const activeInput = isPhone ? phoneInputRef.current : otpRefs.current[0];
      activeInput?.focus({ preventScroll: true });
    });

    return () => cancelAnimationFrame(frame);
  }, [isPhone]);

  const busy = loading;
  const otpReadyToContinue = verdict === "pass" && Boolean(continueTo);
  const otpSettled = verdict === "pass" || verdict === "fail";
  const phoneFieldError = isPhone && (
    error === tr("Enter a Phone Number") ||
    error === tr("Number should be exactly 10 digits")
  );
  const otpFieldError = !isPhone && (
    error === tr("Enter OTP") ||
    error === tr("OTP should be exactly 6 digit")
  );
  const formError = error && !phoneFieldError && !otpFieldError ? error : null;

  useEffect(() => {
    if (!otpReadyToContinue) return;

    const timer = setTimeout(() => {
      navigate(continueTo);
    }, OTP_REDIRECT_DELAY);

    return () => clearTimeout(timer);
  }, [continueTo, navigate, otpReadyToContinue]);

  const formatMMSS = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const phoneDisplay = phone ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : "+91 XXXXX XXXXX";

  const handlePhoneChange = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);

    setPhone(digits);

    if (
      error === tr("Enter a Phone Number") ||
      error === tr("Number should be exactly 10 digits")
    ) {
      setError(null);
    }
  };

  const clearOtpError = () => {
    if (error) {
      setError(null);
    }
    if (verdict) setVerdict(null);
    if (continueTo) setContinueTo(null);
  };

  if (profileRetry) {
    return <ErrorPanel prop={{
      error,
      setError,
      onOkay: retryProfile,
      actionLabel: "Retry",
      loading,
    }} />;
  }

  const focusBox = (i) => {
    otpRefs.current[i]?.focus();
  };

  const handleOtpDigit = (i, value) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) return;

    // Phone keyboards paste through onChange, not onPaste — Gboard's clipboard
    // chip and iOS's from-messages autofill insert the whole code as one change
    // event. More than one digit therefore means a paste: fill from the first
    // box, same as handleOtpPaste. This is also why the boxes have no maxLength
    // — it would truncate the insert before this handler ever sees it.
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

  const handleOtpKeyDown = (i, e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const chars = Array.from({ length: OTP_LENGTH }, (_, idx) => otp[idx] ?? "");
      if (chars[i]) {
        chars[i] = "";
      } else if (i > 0) {
        chars[i - 1] = "";
        focusBox(i - 1);
      }
      setOtp(chars.join(""));
      clearOtpError();
    } else if (e.key === "ArrowLeft" && i > 0) {
      focusBox(i - 1);
    } else if (e.key === "ArrowRight" && i < OTP_LENGTH - 1) {
      focusBox(i + 1);
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!digits) return;
    setOtp(digits);
    clearOtpError();
    focusBox(Math.min(digits.length, OTP_LENGTH - 1));
  };

  // The OTP comes over WhatsApp, whose "Copy code" button is the only way it
  // reaches the browser — SMS autofill can't see it. Only while the boxes are
  // empty: a code already typed or already filled is not one to overwrite.
  useOtpClipboard({
    enabled: !isPhone && !busy && otp.length === 0,
    length: OTP_LENGTH,
    onCode: (code) => {
      setOtp(code);
      clearOtpError();
      focusBox(OTP_LENGTH - 1);
    },
  });

  return (
    <div className="relative text-center flex justify-center items-start w-[100vw] h-[100dvh] overflow-y-auto bg-immersive">
      <AuthHeader onBack={back} />
      {isSignedIn && !loading && verdict === null
        ? <div className="self-center flex flex-col justify-center items-center">
          <h2 className="font-bold text-[var(--text)]">
            {tr("You are already logged in.")}
          </h2>
          <Button
            onClick={() => navigate('/')}
            prop={{
              type: "button",
              size: "action",
            }}
            className="mt-6 sm:mt-9"
          >
            {tr("Back")}
          </Button>
        </div>

        : <form
          className="flex shrink-0 flex-col justify-start sm:justify-center min-h-full pt-24 pb-15 items-start gap-6 sm:gap-8 max-sm:w-[86vw]"
          noValidate
          onSubmit={isPhone ? handleSubmit : handleOTPSubmit}
        >
          <div className={`w-full flex flex-col justify-center items-start text-left gap-2 ${isPhone ? "sm:items-center sm:text-center" : "sm:items-start sm:text-left"}`}>
            <h2 className="font-bold text-[var(--text)]">
              {isPhone ? tr("Login to continue.") : tr("OTP Verification.")}
            </h2>
            <p className="text-base sm:text-lg text-[var(--text-muted)]">
              {isPhone
                ? tr("We'll send a OTP to this number.")
                : <>{tr("Enter the 6-digit OTP we sent to")} <br/> <span className="text-[var(--text)]">{phoneDisplay}</span></>}
            </p>
          </div>
          <div className={`flex max-sm:w-full flex-col justify-center items-start gap-4 sm:gap-6 ${isPhone ? "sm:items-center" : "sm:items-start"}`}>

            {!isPhone
              ? <div className="flex flex-col justify-center items-start gap-2">
                <div className="relative flex w-[86vw] max-w-[328px] justify-center items-center gap-2">
                {Array.from({ length: OTP_LENGTH }).map((_, i) => {
                  return (
                    <input
                      key={i}
                      ref={(el) => (otpRefs.current[i] = el)}
                      type="tel"
                      inputMode="numeric"
                      autoFocus={i === 0}
                      autoComplete={i === 0 ? "one-time-code" : "off"}
                      name={`otp-number-${i + 1}`}
                      id={`otp-number-${i + 1}`}
                      value={otp[i] ?? ""}
                      onChange={(e) => handleOtpDigit(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      onPaste={handleOtpPaste}
                      readOnly={loading || verdict === "pass"}
                      style={{ "--i": i, transitionDuration: otpSettled ? "600ms" : undefined }}
                      className={`
                      relative flex min-w-0 justify-center text-center items-center font-medium text-2xl
                      ${otpSettled ? "text-transparent placeholder-transparent" : "text-ink"}
                      p-0 w-12 h-12 rounded-xl transition-all duration-300 ease-in-out
                      ${otpSettled && `animate-otp-box-in ${i === 0 && `${verdict === "fail" ? "bg-red-600!" : "bg-green-600!"}`}`}
                      ${otpFieldError
                          ? "border border-negative/50 bg-negative/10 focus:border-negative/80"
                          : "border border-[var(--input-border)] bg-[var(--input-background)] focus:border-primary"
                        }
                      focus:outline-none
                      transition-all duration-200
                    `}
                    />
                  );
                })}
                  {otpSettled && (
                    <span className="animate-otp-badge absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                      {verdict === "fail"
                        ? <CrossOutline size={38} />
                        : <CheckMarkOutline size={38} />}
                    </span>
                  )}
                </div>
                <InlineError className="w-full">{otpFieldError ? error : null}</InlineError>
                <p
                  aria-live="polite"
                  className="text-sm text-left text-[var(--text-muted)]"
                >
                  {loading
                    ? tr("Verifying...")
                    : verdict === "pass"
                      ? tr("Success!")
                      : verdict === "fail"
                        ? tr("Wrong OTP")
                        : expiresIn > 0
                          ? <>{tr("OTP expires in")} <span className="tabular-nums text-[var(--text)]">{formatMMSS(expiresIn)}</span></>
                          : tr("OTP has expired.")}
                </p>
              </div>
              :
              <div className="flex w-[377px] max-w-full max-sm:w-full flex-col gap-2">
                <Input
                  prop={{
                    type: "tel",
                    name: "phone-number",
                    id: "phone-number",
                    inputRef: phoneInputRef,
                    autoFocus: true,
                    placeholder: tr("Mobile number"),
                    value: phone,
                    onChangeFn: handlePhoneChange,
                    error: phoneFieldError,
                  }}
                  className="my-0!"
                />
                <InlineError>{phoneFieldError ? error : null}</InlineError>
              </div>
            }
            <div className="flex max-w-full flex-col items-start gap-2">
            <Button
              prop={{
                type: "submit",
                size: "action",
                loading,
                disabled: isPhone
                  ? loading || phone.length !== 10
                  : loading || verdict === "fail" || (!otpReadyToContinue && otp.length !== OTP_LENGTH),
              }}
              className="my-0!"
            >
              {isPhone
                ? (loading ? tr("Sending OTP...") : tr("Continue"))
                : (loading || verdict ? tr("Continue") : tr("Submit"))}
            </Button>
            <InlineError className={isPhone ? "w-[377px] max-w-full max-sm:w-full" : "w-full"}>
              {formError}
            </InlineError>
            </div>
            {!isPhone && (
              <p className={`text-sm text-left text-[var(--text-muted)] ${busy ? "invisible" : ""}`}>
                <span className="text-[var(--text-muted)]">{dc("Didn't get it or expired?")}</span>{" "}
                {resending
                  ? dc("Sending...")
                  : resendIn > 0
                    ? <span className="tabular-nums underline underline-offset-4">{dc("Resend in") + " "}{resendIn}s</span>
                    : <button
                      type="button"
                      onClick={handleResend}
                      className="cursor-pointer font-semibold text-[var(--text)] underline underline-offset-2 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70"
                    >{dc("Resend")}</button>}
              </p>
            )}

            <p className={`${!isPhone? "hidden" : "block"} text-[var(--text-muted)] text-sm sm:text-center text-left`}>{dc("You consent to receive a OTP by text or") + " "}<br />{" " + dc("WhatsApp.")}</p>
          </div>
        </form>}
    </div>
  );
};

export default LoginPage
