import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../i18nCopy";
import { useSignIn, useAuth } from "@clerk/clerk-react";
import { useState, useEffect, useRef } from "react";
import { useViewNavigate } from "../hooks/useViewNavigate";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import { useApi } from "../hooks/useApi";
import Icon from '@mdi/react';
import { mdiKeyboardBackspace } from '@mdi/js';
import { useData } from "../hooks/useData";
import { useOtpClipboard } from "../hooks/useOtpClipboard";
import { useWebsiteCopy } from "../hooks/useWebsiteCopy";

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
  const [showSignUp, setShowSignUp] = useState(false);
  const [continueTo, setContinueTo] = useState(null);
  const pickupLocation = useData(state => state.pickupLocation);

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
    // 429 means an OTP went out less than 45s ago and is still valid (the backend
    // rejects before generating a new one) — e.g. after a page refresh. Advance to
    // the OTP step so that code can be used, instead of stranding the user here.
    if (data.status === 429) {
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
      setError(data.error);
      setShowSignUp(true);
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
        if (data.status === 429) setResendIn(RESEND_COOLDOWN);
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

    const user = await api.getMe();
    setContinueTo(user.error ? "/signup" : (pickupLocation ? "/book" : "/"));
    setVerdict("pass");
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

  const formatMMSS = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const phoneDisplay = phone ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : "+91 XXXXX XXXXX";

  const handlePhoneChange = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);

    setPhone(digits);
    setShowSignUp(false);

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
    <div className="relative bg-transparent text-center flex justify-center items-center w-[100vw] h-[100dvh] bg-panel-gradient">
      <div onClick={back} className="flex cursor-pointer justify-center items-center gap-2 sm:gap-3 absolute left-3 top-3 text-[var(--text)] sm:opacity-80 hover:opacity-100 transition-opacity duration-300">
        <Icon path={mdiKeyboardBackspace} size={1.2} />
      </div>
      {isSignedIn && !loading && verdict !== "pass"
        ? <div className="flex flex-col justify-center items-center">
          <h2 className="font-bold text-[var(--text)]">
            {tr("You are already logged in.")}
          </h2>
          <Button
            onClick={() => navigate('/')}
            prop={{
              type: "button",
            }}
            className="scale-[1] sm:scale-[1.3] mt-6 sm:mt-9"
          >
            {tr("Back")}
          </Button>
        </div>

        : <form
          className="flex flex-col justify-start sm:justify-center h-full py-15 items-start gap-5 sm:gap-7"
          noValidate
          onSubmit={isPhone ? handleSubmit : handleOTPSubmit}
        >
          <div className="w-full flex flex-col justify-center items-start sm:items-center sm:text-center text-left gap-2 sm:gap-3">
            <h2 className="font-bold text-[var(--text)]">
              {isPhone ? tr("Login to continue.") : tr("OTP Verification.")}
            </h2>
            <p className="text-base sm:text-lg text-[var(--text-muted)]">
              {isPhone
                ? tr("We'll send a OTP to this number.")
                : <>{tr("Enter the 6-digit OTP we sent to")} <br/> <span className="font-semibold text-[var(--text)]">{phoneDisplay}</span></>}
            </p>
          </div>
          <div className="flex flex-col justify-center items-start sm:items-center">

            {!isPhone
              ? <div className="flex flex-col justify-center items-center">
                <div className="relative flex justify-center items-center gap-2 sm:gap-2.5">
                {Array.from({ length: OTP_LENGTH }).map((_, i) => {
                  const otpError = Boolean(error);
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
                      className={`
                      relative flex justify-center text-center items-center font-medium text-2xl sm:text-3xl my-1
                      text-ink
                      py-2 w-[46px] h-[46px] sm:w-[55px] sm:h-[55px] rounded-xl transition-all duration-300 ease-in-out
                      ${otpError
                          ? "border border-negative/50 bg-negative/10 focus:border-negative/80"
                          : "border border-[var(--foreground)]/30 bg-[var(--background-muted)] focus:border-primary"
                        }
                      focus:outline-none
                      transition-all duration-200
                    `}
                    />
                  );
                })}
                </div>
                <p
                  aria-live="polite"
                  className={`text-sm mt-1 sm:mt-2 mb-3 sm:mb-3 ${
                    verdict === "pass"
                      ? "text-status-success"
                      : verdict === "fail"
                        ? "text-status-danger"
                        : "text-[var(--text-muted)]"
                  }`}
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
                  error: error === tr("Enter a Mobile Number") ||
                    error === tr("Number should be exactly 10 digits"),
                  bg: "var(--background-muted)",
                }}
                className="scale-[1] sm:scale-[1.3] mb-2"
              />
            }
            <Button
              onClick={isPhone && showSignUp
                // Carry the number over so signup can prefill its phone step —
                // it was just typed here and the backend confirmed it's unclaimed.
                ? () => navigate('/signup', { state: { phone } })
                : undefined}
              prop={{
                type: isPhone && showSignUp ? "button" : "submit",
                disabled: (isPhone && showSignUp)
                  ? false
                  : (isPhone
                    ? phone.length !== 10
                    : loading || verdict === "fail" || (!otpReadyToContinue && otp.length !== OTP_LENGTH)),
              }}
              className="scale-[1] sm:scale-[1.3] mt-1 sm:mt-5"
            >
              {isPhone
                ? (showSignUp ? tr("Sign Up") : (loading ? tr("Sending OTP...") : tr("Continue")))
                : (loading || verdict ? tr("Continue") : tr("Submit"))}
            </Button>
            {!isPhone && (
              <p className={`mt-3 sm:mt-6 text-sm text-[var(--text-muted)] ${busy ? "invisible" : ""}`}>
                <span className="text-[var(--text-muted)]">{dc("Didn't get it or expired?")}</span>{" "}
                {resending
                  ? dc("Sending...")
                  : resendIn > 0
                    ? <span className="tabular-nums underline underline-offset-4">{dc("Resend in") + " "}{resendIn}s</span>
                    : <button
                      type="button"
                      onClick={handleResend}
                      className="cursor-pointer text-[var(--text)] underline underline-offset-2 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70"
                    >{dc("Resend")}</button>}
              </p>
            )}

            <p className={`${!isPhone? "hidden" : "block"} text-[var(--text-muted)] text-sm mt-3 sm:mt-5 sm:text-center text-left`}>{dc("You consent to receive a OTP by text or") + " "}<br />{" " + dc("WhatsApp.")}</p>
          </div>
        </form>}
    </div>
  );
};

export default LoginPage
