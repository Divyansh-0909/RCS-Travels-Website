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
import CheckMarkOutline from "../components/illustrations/CheckMarkOutline";
import CrossOutline from "../components/illustrations/CrossOutline";

const LoginPage = () => {
  const { signIn, setActive } = useSignIn();
  const { isSignedIn } = useAuth();
  const navigate = useViewNavigate();
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
  // Latches on OTP verification so the success state holds through getMe + redirect,
  // instead of flashing "already logged in" while isSignedIn flips true mid-flow.
  const [redirecting, setRedirecting] = useState(false);
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

  async function handleOTPSubmit(e) {
    e.preventDefault();

    if (!otp) {
      setError("Enter OTP");
      return;
    }

    if (!(otp.length === OTP_LENGTH)) {
      setError("OTP should be exactly 6 digit");
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
    // 429 means an OTP went out less than 45s ago and is still valid (the backend
    // rejects before generating a new one) — e.g. after a page refresh. Advance to
    // the OTP step so that code can be used, instead of stranding the user here.
    if (data.status === 429) {
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

    const user = await api.getMe();
    navigate(user.error ? "/signup" : (pickupLocation ? "/book" : "/"));
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
  const { supported: canPasteOtp, paste: pasteOtp } = useOtpClipboard({
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
      {isSignedIn && !redirecting
        ? <div className="flex flex-col justify-center items-center">
          <h2 className="font-bold text-[var(--text)]">
            You are already <br /> logged in.
          </h2>
          <Button
            onClick={() => navigate('/')}
            prop={{
              type: "button",
            }}
            className="scale-[1] sm:scale-[1.3] mt-6 sm:mt-9"
          >
            Back
          </Button>
        </div>

        : <form
          className="flex flex-col justify-center items-center"
          noValidate
          onSubmit={isPhone ? handleSubmit : handleOTPSubmit}
        >
          <div className="flex flex-col justify-center items-center gap-2 sm:gap-3">
            <h2 className="font-bold text-[var(--text)]">
              {isPhone ? <>Let's get you back <br /> on the road.</> : "Confirm your code."}
            </h2>
            <p className="text-base sm:text-lg text-[var(--text-muted)]">
              {isPhone
                ? "We'll send a OTP to this number."
                : <>Enter the 6-digit code <br className="sm:hidden block" /> we sent to <span className="font-semibold text-[var(--text)]">{phoneDisplay}</span></>}
            </p>
          </div>
          <div className="flex flex-col justify-center items-center">

            {/* Fixed-height slot so an error appearing doesn't shift the form */}
            <div className="mt-2 sm:mt-4 mb-1 sm:mb-2 min-h-5 flex items-center justify-center">
              {error && (
                <p className="text-red-400 text-sm">
                  {error}
                </p>
              )}
            </div>

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
                      autoComplete={i === 0 ? "one-time-code" : "off"}
                      name={`otp-number-${i + 1}`}
                      id={`otp-number-${i + 1}`}
                      value={otp[i] ?? ""}
                      onChange={(e) => handleOtpDigit(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      onPaste={handleOtpPaste}
                      style={{ "--i": i }}
                      className={`
                      relative flex justify-center text-center items-center font-medium text-2xl sm:text-3xl my-1
                      ${settled ? "text-transparent placeholder-transparent" : "text-white"}
                      py-2 w-[42px] h-[42px] sm:w-[55px] sm:h-[55px] rounded-xl transition-all duration-600 ease-in-out
                      ${settled && `animate-otp-box-in ${i === 0 && `${verdict === "fail" ? "bg-red-600!" : "bg-green-600!"}`}`}
                      ${otpError
                          ? "border border-negative/50 bg-negative/10 focus:border-negative/80"
                          : "border border-[var(--foreground)]/30 bg-[var(--background-muted)] hover:border-[var(--foreground)]/50 focus:border-[var(--foreground)]/60 focus:bg-[var(--foreground)]/5"
                        }
                      focus:outline-none
                      transition-all duration-200
                    `}
                    />
                  );
                })}
                  {/* Held until the boxes have finished converging, so the mark
                      lands on the stack rather than over six moving boxes — the
                      delay matches .animate-otp-badge's. Keyed off the verdict,
                      never off error: error is null for the whole round trip,
                      which is not the same thing as the code being right. */}
                  {settled && (
                    <span className="animate-otp-badge absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                      {verdict === "fail"
                        ? <CrossOutline size={38} delay={450} />
                        : <CheckMarkOutline size={38} delay={450} />}
                    </span>
                  )}
                </div>
                <p className={`text-[var(--text-muted)] text-sm mt-1 sm:mt-2 mb-3 sm:mb-5 ${busy ? "invisible" : ""}`}>
                  {expiresIn > 0
                    ? <>Code expires in <span className="tabular-nums text-[var(--text)]">{formatMMSS(expiresIn)}</span></>
                    : "Your code has expired."}
                  {/* Chrome fills the boxes on its own once the clipboard
                      permission is granted; this is where that gets granted,
                      and it stays for the browsers that never grant it. Not
                      offered on an expired code, which pastes to nothing. */}
                  {canPasteOtp && expiresIn > 0 && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        onClick={pasteOtp}
                        className="cursor-pointer text-[var(--text)] underline underline-offset-4 decoration-[var(--foreground)]/40 hover:decoration-[var(--foreground)] transition-colors duration-300 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70"
                      >Paste code</button>
                    </>
                  )}
                </p>
              </div>
              :
              <Input
                prop={{
                  type: "tel",
                  name: "phone-number",
                  id: "phone-number",
                  placeholder: "XXXXX XXXXX",
                  value: phone,
                  onChangeFn: handlePhoneChange,
                  error: error === "Enter a Phone Number" ||
                    error === "Number should be exactly 10 digits",
                  bg: "var(--background-muted)",
                }}
                className="scale-[1] sm:scale-[1.3]"
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
                  : (isPhone ? phone.length !== 10 : otp.length !== OTP_LENGTH),
              }}
              className="scale-[1] sm:scale-[1.3] mt-1 sm:mt-5"
            >
              {isPhone
                ? (showSignUp ? "Sign Up" : (loading ? "Sending OTP..." : "Continue"))
                : (loading ? "Redirecting..." : "Confirm")}
            </Button>
            {/* Hidden once the 404 flips the main button into "Sign Up" —
                two sign-up actions on one screen would compete. */}
            {isPhone && !showSignUp && (
              <p className="mt-3 sm:mt-6 text-sm text-[var(--text-muted)]">
                <span className="text-[var(--text)]">No account?</span>{" "}
                <button
                  type="button"
                  onClick={() => navigate('/signup')}
                  className="cursor-pointer text-[var(--text)] underline underline-offset-4 decoration-[var(--foreground)]/40 hover:decoration-[var(--foreground)] transition-colors duration-300 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70"
                >Sign up</button>
              </p>
            )}
            {!isPhone && (
              <p className={`mt-3 sm:mt-6 text-sm text-[var(--text-muted)] ${busy ? "invisible" : ""}`}>
                <span className="text-[var(--text)]">Didn't get it?</span>{" "}
                {resending
                  ? "Sending..."
                  : resendIn > 0
                    ? <span className="tabular-nums">Resend in {resendIn}s</span>
                    : <button
                      type="button"
                      onClick={handleResend}
                      className="cursor-pointer text-[var(--text)] underline underline-offset-4 decoration-[var(--foreground)]/40 hover:decoration-[var(--foreground)] transition-colors duration-300 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70"
                    >Resend</button>}
              </p>
            )}

            <p className="text-[var(--text-muted)] text-sm mt-3 sm:mt-5">You consent to receive a OTP <br /> by text or WhatsApp.</p>
          </div>
        </form>}
    </div>
  );
};

export default LoginPage