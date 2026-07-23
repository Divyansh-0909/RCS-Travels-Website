import { useSignIn, useAuth } from "@clerk/clerk-react";
import { useState, useEffect, useRef } from "react";
import { useViewNavigate } from "../hooks/useViewNavigate";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import { useApi } from "../hooks/useApi";
import Icon from '@mdi/react';
import { mdiKeyboardBackspace } from '@mdi/js';
import { useData } from "../hooks/useData";
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
  const [expiresIn, setExpiresIn] = useState(0);
  const [step, setStep] = useState("phone"); // "phone" | "otp"
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [showSignUp, setShowSignUp] = useState(false);
  // Latches once the OTP is verified so we hold the success state through the
  // async getMe + view-transition redirect, instead of flashing the
  // "already logged in" screen while isSignedIn flips true mid-flow.
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
      setLoading(true);
      await verifyOtp()
    } catch (err) {
      console.error(err);
      setError(err?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const sendOtp = async () => {
    const data = await api.sendOtp(phone);
    if (data.error) {
      setError(data.error);
      return;
    }
    setStep("otp");
    setResendIn(30);
    setExpiresIn(OTP_TTL);
  };

  async function handleResend() {
    if (resendIn > 0 || resending) return;

    try {
      setError(null);
      setResending(true);
      const data = await api.sendOtp(phone);
      if (data.error) {
        setError(data.error);
        return;
      }
      setOtp("");
      setResendIn(30);
      setExpiresIn(OTP_TTL);
    } catch (err) {
      console.error(err);
      setError("Something went wrong");
    } finally {
      setResending(false);
    }
  }

  const verifyOtp = async () => {
    const data = await api.verifyOtp(phone, otp);
    if (data.error) {
      setError(data.error);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setOtp("")
      return;
    }

    setRedirecting(true);

    if (!isSignedIn) {
      const result = await signIn.create({ strategy: "ticket", ticket: data.ticket });
      if (result.status !== "complete") {
        setError("Sign in failed. Please try again.");
        return;
      }
      await setActive({ session: result.createdSessionId });
    }

    const user = await api.getMe();
    navigate(user.error ? "/signup" : (pickupLocation ? "/book" : "/"));
  };

  const isPhone = step === "phone";
 
  const busy = loading || redirecting;

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
    const char = value.replace(/\D/g, "").slice(-1);
    if (!char) return;

    const chars = Array.from({ length: OTP_LENGTH }, (_, idx) => otp[idx] ?? "");
    chars[i] = char;
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

  return (
    <div className="relative bg-transparent text-center flex justify-center items-center w-[100vw] h-[100vh] bg-panel-gradient">
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
                      maxLength={1}
                      value={otp[i] ?? ""}
                      onChange={(e) => handleOtpDigit(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      onPaste={handleOtpPaste}
                      style={{ "--i": i }}
                      className={`
                      relative flex justify-center text-center items-center font-medium text-2xl sm:text-3xl my-1
                      ${busy ? "text-transparent placeholder-transparent" : "text-white"}
                      py-2 w-[42px] h-[42px] sm:w-[55px] sm:h-[55px] rounded-xl transition-all duration-600 ease-in-out
                      ${busy && `animate-otp-box-in ${i === 0 && `${otpError ? "bg-red-600!" : "bg-green-600!"}`}`}
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
                  {busy && (
                    <span className="animate-otp-badge absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                      {error
                        ? <CrossOutline size={38} />
                        : <CheckMarkOutline size={38} />}
                    </span>
                  )}
                </div>
                <p className={`text-[var(--text-muted)] text-sm mt-1 sm:mt-2 mb-3 sm:mb-5 ${busy ? "invisible" : ""}`}>
                  {expiresIn > 0
                    ? <>Code expires in <span className="tabular-nums text-[var(--text)]">{formatMMSS(expiresIn)}</span></>
                    : "Your code has expired."}
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
              onClick={isPhone && showSignUp ? () => navigate('/signup') : undefined}
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