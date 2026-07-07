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
  const OTP_LENGTH = 4;
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
      setError("OTP should be exactly 4 digit");
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
        ? <div className="flex flex-col justify-center items-center gap-6">
          <h2 className="text-[var(--text)] ">
            You are already <br /> logged in.
          </h2>
          <Button
            onClick={() => navigate('/')}
            prop={{
              type: "button",
            }}
            className="scale-[1] sm:scale-[1.1]"
          >
            Back
          </Button>
        </div>

        : <form
          className="flex flex-col justify-center items-center gap-12"
          noValidate
          onSubmit={isPhone ? handleSubmit : handleOTPSubmit}
        >
          <div className="flex flex-col justify-center items-center gap-2 sm:gap-3">
            <h2 className="text-[var(--text)] ">
              {isPhone ? <>Let's get you back <br /> on the road.</> : "Confirm your code."}
            </h2>
            <p className="text-[var(--text-muted)] ">
              {isPhone ? "We'll send a OTP to this number." : "Enter the OTP we sent to your phone."}
            </p>
          </div>
          <div className="flex flex-col justify-center items-center gap-2 sm:gap-4">

            {error && (
              <p className="text-red-400 text-sm">
                {error}
              </p>
            )}

            {!isPhone
              ? <div className="relative flex justify-center items-center gap-3 mb-5">
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
                      placeholder="X"
                      maxLength={1}
                      value={otp[i] ?? ""}
                      onChange={(e) => handleOtpDigit(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      onPaste={handleOtpPaste}
                      style={{ "--i": i }}
                      className={`
                      relavtive flex justify-center text-center items-center font-medium text-3xl my-1
                      ${busy ? "text-transparent placeholder-transparent" : "text-white"}
                      py-2 w-[55px] h-[65px] rounded-2xl transition-all duration-600 ease-in-out
                      ${busy && `animate-otp-box-in ${i === 0 && `${otpError ? "bg-red-600 " : "bg-green-600"}`}`}
                      ${otpError
                          ? `
                            border-b-2 border-[rgba(239,68,68,0.3)]
                            bg-[linear-gradient(to_bottom,transparent_50%,rgba(239,68,68,0.25)_100%)]
                            shadow-[inset_0_2px_2px_rgba(239,68,68,0.35)]
                            focus:border-[rgba(239,68,68,0.5)]
                            focus:shadow-[inset_0_2px_2px_rgba(255,255,255,0.35)]
                          `
                          : `
                            border-b-2 border-[rgba(255,255,255,0.05)]
                            bg-[linear-gradient(to_bottom,transparent_50%,rgba(146,146,139,0.10)_100%)]
                            shadow-[inset_0_2px_2px_rgba(255,255,255,0.25)]
                            focus:border-[rgba(255,255,255,0.15)]
                            focus:shadow-[inset_0_2px_2px_rgba(255,255,255,0.35)]
                          `
                        }
                      
                      focus:outline-none
                      focus:opacity-[0.8]
                      active:opacity-[0.8]
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
                }}
                className="scale-[1] sm:scale-[1.1] mb-5"
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
              className="scale-[1] sm:scale-[1.1]"
            >
              {isPhone
                ? (showSignUp ? "Sign Up" : (loading ? "Sending OTP..." : "Continue"))
                : (loading ? "Confirming..." : "Confirm")}
            </Button>
            {!isPhone && !busy && (
              <p className="text-[var(--text-muted)] text-sm -mt-1">
                {expiresIn > 0
                  ? <>Code expires in <span className="tabular-nums text-[var(--text)]">{formatMMSS(expiresIn)}</span></>
                  : "Your code has expired. Resend to get a new one."}
              </p>
            )}
            {!isPhone && (
              <Button
                onClick={handleResend}
                prop={{
                  width: "290px",
                  type: "button",
                  variant: "input",
                }}
                className={`scale-[1] sm:scale-[1.1] -mt-1 ${resendIn > 0 || resending ? "pointer-events-none opacity-60" : ""}`}
              >
                {resending
                  ? "Sending..."
                  : resendIn > 0
                    ? `Resend OTP in ${resendIn}s`
                    : "Resend OTP"}
              </Button>
            )}

            {isPhone && (
              <p className="text-[var(--text-muted)] text-sm">You consent to receive a OTP <br /> by text or WhatsApp.</p>
            )}
          </div>
        </form>}
    </div>
  );
};

export default LoginPage