import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../i18nCopy";
import { useSignIn, useAuth } from "@clerk/clerk-react";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useViewNavigate } from "../hooks/useViewNavigate";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import { useApi } from "../hooks/useApi";
import Icon from '@mdi/react';
import { mdiKeyboardBackspace } from '@mdi/js';
import { useData } from "../hooks/useData";
import { useOtpClipboard } from "../hooks/useOtpClipboard";
import { useWebsiteCopy } from "../hooks/useWebsiteCopy";

// Signing up never touches Clerk's signUp — the account already exists by the time
// we get here, created backend-side against the fake phone email during verify-otp.
// This page only redeems the ticket and attaches a name.
const SignUpPage = () => {
    useCopyLanguage();
  const tr = useWebsiteCopy();
  const { signIn, setActive } = useSignIn();
  const { isSignedIn } = useAuth();
  const navigate = useViewNavigate();
  const [username, setUsername] = useState("");
  const phone = useData(state=>state.phone);
  const setPhone = useData(state => state.setPhone);
  const [otp, setOtp] = useState("");
  const activeInputRef = useRef(null);
  const otpRefs = useRef([]);
  const OTP_LENGTH = 6;
  const OTP_TTL = 300; // seconds until the OTP expires — matches the backend's 5-minute window
  const RESEND_COOLDOWN = 45; // matches the backend's per-phone cooldown, which 429s early resends
  const [expiresIn, setExpiresIn] = useState(0);
  // Username is collected FIRST so the DB user is created in the same step as OTP
  // verification — no post-OTP name screen to abandon into a profile-less session.
  const [step, setStep] = useState("username"); // "username" | "phone" | "otp"
  const [verdict, setVerdict] = useState(null); // null | "pass" | "fail"
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [showLogin, setShowLogin] = useState(false);
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

  const location = useLocation();

  // Signing up is for a fresh number — don't pre-fill the persisted login number.
  // The one exception is arriving from login's "no account" redirect, which hands
  // the number over in route state: it was just typed and confirmed unclaimed.
  useEffect(() => {
    setPhone(location.state?.phone ?? "");
  }, []);

  function handleUsernameSubmit(e) {
    e.preventDefault();

    if (!username?.trim()) {
      setError(dc("Enter your name"));
      return;
    }
    if (username.trim().length < 2) {
      setError(dc("Name must be at least 2 characters"));
      return;
    }

    setError(null);
    setStep("phone");
  }

  const back = () => {
    if (step === "otp") { setStep("phone"); return; }
    if (step === "phone") { setStep("username"); return; }
    navigate("/");
  };

  async function handleSubmit(e) {
      e.preventDefault();

      if (!phone) {
        setError(tr("Enter a Phone Number"));
        return;
      }

      if(!(phone.length === 10) ){
        setError(tr("Number should be exactly 10 digits"));
        return;
      }

      try {
        setError(null);
        setLoading(true);
        await sendOtp()
      } catch (err) {
        console.error(err);
        setError(tr("Something went wrong"));
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
        setError(dc("Enter OTP"));
        return;
      }

      if(!(otp.length === OTP_LENGTH) ){
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
        setError(tr("Something went wrong"));
        setVerdict("fail");
      } finally {
        setLoading(false);
      }
  }

  const sendOtp = async () => {
    const data = await api.sendOtp(phone, "signup");
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
    // This number already has an account — mirror of login's 404: no OTP went
    // out, so flip the button into the Login escape hatch. The store keeps the
    // typed number, which login reads, so it arrives prefilled over there.
    if (data.status === 409) {
      setError(data.error);
      setShowLogin(true);
      return;
    }
    if (data.error) { setError(data.error); return; }
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
      const data = await api.sendOtp(phone, "signup");
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
    const data = await api.verifyOtp(phone, otp, "signup");
    if (data.error) {
      setError(data.error);
      setVerdict("fail");
      return;
    }

    const result = await signIn.create({ strategy: "ticket", ticket: data.ticket });
    if (result.status !== "complete") {
      setError(dc("Verification failed. Please try again."));
      setVerdict("fail");
      return;
    }

    // Activate the session so the createMe request below is authenticated.
    await setActive({ session: result.createdSessionId });

    // Create the DB user immediately, using the name collected up front.
    const created = await api.createMe(username);
    if (created?.error) {
      // Don't leave a session without a profile — sign out and retry from the name step.
      await api.logout();
      setError(created.error);
      setVerdict("fail");
      setStep("username");
      return;
    }

    setContinueTo(pickupLocation ? "/book" : "/");
    setVerdict("pass");
  };

  const isUsername = step === "username";
  const isPhone = step === "phone";
  const isOtp = step === "otp";
  const busy = loading;
  const otpReadyToContinue = verdict === "pass" && Boolean(continueTo);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const activeInput = isOtp ? otpRefs.current[0] : activeInputRef.current;
      activeInput?.focus({ preventScroll: true });
    });

    return () => cancelAnimationFrame(frame);
  }, [step, isOtp]);

  const formatMMSS = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const phoneDisplay = phone ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : "+91 XXXXX XXXXX";

  const handleUsernameChange = (value) => {
    setUsername(value);
    if (error) setError(null);
  };

  const handlePhoneChange = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);

    setPhone(digits);
    setShowLogin(false);

    if (
      error === tr("Enter a Phone Number") ||
      error === tr("Number should be exactly 10 digits")
    ) {
      setError(null);
    }
  };

  const clearOtpError = () => {
    if (error) setError(null);
    if (verdict) setVerdict(null);
    if (continueTo) setContinueTo(null);
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
    enabled: isOtp && !busy && otp.length === 0,
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
        {/* The session may be active while finalizing — keep the form so the
            "already logged in" screen doesn't flash mid-signup. */}
        { isSignedIn && !loading && !(isOtp && verdict === "pass")
        ?
        <div className="flex flex-col justify-center items-center">
          <h2 className="font-bold text-[var(--text)]">{dc("You are already") + " "}<br />{" " + dc("logged in.")}</h2>
          <Button
            onClick={() => navigate('/')}
            prop={{
              type: "button",
            }}
            className="scale-[1] sm:scale-[1.3] mt-6 sm:mt-9"
          >{dc("Back")}</Button>
        </div>
        :
          <form
            className="flex flex-col justify-start sm:justify-center h-full py-15 items-start gap-5 sm:gap-7 max-sm:w-[86vw]"
            noValidate
            onSubmit={isUsername ? handleUsernameSubmit : isPhone ? handleSubmit : handleOTPSubmit}
          >
            <div className="w-full flex flex-col justify-center items-start sm:items-center sm:text-center text-left gap-2 sm:gap-3">
              <h2 className="font-bold text-[var(--text)]">
                {isUsername
                  ? <>{tr("Make it yours.")}</>
                  : isPhone
                  ? <>{tr("Looks like you're new here.")}</>
                  : <>{tr("One code away.")}</>}
              </h2>
              <p className="text-base sm:text-lg text-[var(--text-muted)]">
                {isUsername
                  ? <>{tr("This is how drivers will identify you.")}</>
                  : isPhone
                  ? <>{tr("Let's get you set up. We'll send an OTP to verify.")}</>
                  : <>{tr("Enter the 6-digit code we sent to")} <span className="font-semibold text-[var(--text)]">{phoneDisplay}</span></>}
              </p>
            </div>
            <div className="flex flex-col justify-center items-start sm:items-center">

              {error && !isOtp && (
                <div className="mt-2 sm:mt-4 mb-1 sm:mb-2 flex items-center justify-start sm:justify-center">
                  <p className="text-status-danger text-sm">
                    {error}
                  </p>
                </div>
              )}

              {isOtp
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
                : <Input
                  prop={{
                    type: isUsername ? "text" : "tel",
                    name: isUsername ? "username" : "phone-number",
                    id: isUsername ? "username" : "phone-number",
                    inputRef: activeInputRef,
                    autoFocus: true,
                    placeholder: isUsername ? tr("Full Name") : tr("Mobile number"),
                    value: isUsername ? username : phone,
                    onChangeFn: isUsername ? handleUsernameChange : handlePhoneChange,
                    error: isUsername
                      ? error === "Enter your name" || error === "Name must be at least 2 characters" || error === "Username is already taken"
                      : error === tr("Enter a Phone Number") || error === tr("Number should be exactly 10 digits"),
                    bg: "var(--background-muted)",
                  }}
                  className="scale-[1] sm:scale-[1.3] mb-2"
                />}

              <Button
                onClick={isPhone && showLogin ? () => navigate('/login') : undefined}
                prop={{
                  type: isPhone && showLogin ? "button" : "submit",
                  disabled: (isPhone && showLogin)
                    ? false
                    : isUsername
                    ? username.trim().length < 2
                    : isPhone
                    ? phone.length !== 10
                    : loading || verdict === "fail" || (!otpReadyToContinue && otp.length !== OTP_LENGTH),
                }}
                className="scale-[1] sm:scale-[1.3] mt-1 sm:mt-5"
              >
                {isUsername
                  ? tr("Continue")
                  : isPhone
                  ? (showLogin ? tr("Login") : (loading ? tr("Sending OTP...") : tr("Continue")))
                  : (loading || verdict ? tr("Continue") : tr("Submit"))}
              </Button>

              {/* Mirror of login's "No account?" link, on both pre-OTP steps
                  since signup opens on the name screen. Hidden once the 409
                  flips the main button into "Login" — two login actions on
                  one screen would compete. */}
              {!isOtp && !showLogin && (
                <p className="mt-3 sm:mt-6 text-sm text-[var(--text-muted)] text-left sm:text-center">
                  <span className="text-[var(--text)]">{tr("Have an account?")}</span>{" "}
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="cursor-pointer text-[var(--text)] underline underline-offset-4 decoration-[var(--foreground)]/40 hover:decoration-[var(--foreground)] transition-colors duration-300 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70"
                  >{tr("Log in")}</button>
                </p>
              )}
              {isOtp && (
                <p className={`mt-3 sm:mt-6 text-sm text-[var(--text-muted)] text-left sm:text-center ${busy ? "invisible" : ""}`}>
                  <span className="text-[var(--text-muted)]">{tr("Didn't get it or expired?")}</span>{" "}
                  {resending
                    ? tr("Sending...")
                    : resendIn > 0
                      ? <span className="tabular-nums underline underline-offset-4">{tr("Resend in")} {resendIn}s</span>
                      : <button
                        type="button"
                        onClick={handleResend}
                        className="cursor-pointer text-[var(--text)] underline underline-offset-2 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70"
                      >{tr("Resend")}</button>}
                </p>
              )}

              {isUsername && (
                <p className="text-[var(--text-muted)] text-sm mt-3 sm:mt-5 text-left sm:text-center">{tr("Your name can't be changed later, so we suggest using your full name.")}</p>
              )}

              {isPhone && (
                <p className="text-[var(--text-muted)] text-sm mt-3 sm:mt-5 max-sm:max-w-[min(86vw,100%)] sm:max-w-[340px] text-left sm:text-center">{tr("Your number can't be changed later. By continuing, you consent to receive an OTP by text or WhatsApp.")}</p>
              )}

              {isOtp && (
                <p className="text-[var(--text-muted)] text-sm mt-3 sm:mt-5 text-left sm:text-center">{tr("You consent to receive a OTP by text or WhatsApp.")}</p>
              )}
            </div>
          </form>
        }
    </div>
  );
};

export default SignUpPage
