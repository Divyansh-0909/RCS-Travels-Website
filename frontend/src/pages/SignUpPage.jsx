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

// Signing up never touches Clerk's signUp — the account already exists by the time
// we get here, created backend-side against the fake phone email during verify-otp.
// This page only redeems the ticket and attaches a name.
const SignUpPage = () => {
  const { signIn, setActive } = useSignIn();
  const { isSignedIn } = useAuth();
  const navigate = useViewNavigate();
  const [username, setUsername] = useState("");
  const phone = useData(state=>state.phone);
  const setPhone = useData(state => state.setPhone);
  const [otp, setOtp] = useState("");
  const otpRefs = useRef([]);
  const OTP_LENGTH = 6;
  const OTP_TTL = 300; // seconds until the OTP expires — matches the backend's 5-minute window
  const [expiresIn, setExpiresIn] = useState(0);
  // Username is collected FIRST so the DB user is created in the same step as OTP
  // verification — no post-OTP name screen to abandon into a profile-less session.
  const [step, setStep] = useState("username"); // "username" | "phone" | "otp"
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [showLogin, setShowLogin] = useState(false);
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

  // Signing up is for a fresh number — don't pre-fill the persisted login number.
  useEffect(() => {
    setPhone("");
  }, []);

  function handleUsernameSubmit(e) {
    e.preventDefault();

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

  const back = () => {
    if (step === "otp") { setStep("phone"); return; }
    if (step === "phone") { setStep("username"); return; }
    navigate("/");
  };

  async function handleSubmit(e) {
      e.preventDefault();

      if (!phone) {
        setError("Enter a Phone Number");
        return;
      }

      if(!(phone.length === 10) ){
        setError("Number should be exactly 10 digits");
        return;
      }

      try {
        setError(null);
        setLoading(true);
        await sendOtp()
      } catch (err) {
        console.error(err);
        setError("Something went wrong");
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

      if(!(otp.length === OTP_LENGTH) ){
        setError("OTP should be exactly 6 digit");
        return;
      }

      try {
        setError(null);
        setLoading(true);
        await verifyOtp()
      } catch (err) {
        console.error(err);
        setError("Something went wrong");
      } finally {
        setLoading(false);
      }
  }

  const sendOtp = async () => {
    const data = await api.sendOtp(phone);
    if (data.error) { setError(data.error); return; }
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
      setOtp("");
      return;
    }

    const result = await signIn.create({ strategy: "ticket", ticket: data.ticket });
    if (result.status !== "complete") { setError("Verification failed. Please try again."); return; }

    // Activate the session so the createMe request below is authenticated.
    await setActive({ session: result.createdSessionId });

    // Create the DB user immediately, using the name collected up front.
    const created = await api.createMe(username);
    if (created?.error) {
      // Don't leave a session without a profile — sign out and retry from the name step.
      await api.logout();
      setError(created.error);
      setStep("username");
      return;
    }

    navigate(pickupLocation ? "/book" : "/");
  };

  const isUsername = step === "username";
  const isPhone = step === "phone";
  const isOtp = step === "otp";
  const busy = loading;

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
      error === "Enter a Phone Number" ||
      error === "Number should be exactly 10 digits"
    ) {
      setError(null);
    }
  };

  const clearOtpError = () => {
    if (error) setError(null);
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
        {/* The session may be active while finalizing — keep the form so the
            "already logged in" screen doesn't flash mid-signup. */}
        { isSignedIn && !loading
        ?
        <div className="flex flex-col justify-center items-center">
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
        :
          <form
            className="flex flex-col justify-center items-center"
            noValidate
            onSubmit={isUsername ? handleUsernameSubmit : isPhone ? handleSubmit : handleOTPSubmit}
          >
            <div className="flex flex-col justify-center items-center gap-2 sm:gap-3">
              <h2 className="font-bold text-[var(--text)]">
                {isUsername
                  ? <>Make it yours.</>
                  : isPhone
                  ? <>Looks like <br className="sm:hidden block"/> you're new here.</>
                  : <>One code away.</>}
              </h2>
              <p className="text-base sm:text-lg text-[var(--text-muted)]">
                {isUsername
                  ? <>This is how drivers will identify you.</>
                  : isPhone
                  ? <>Let's get you set up. <br className="sm:hidden block"/> We'll send an OTP to verify.</>
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
                : <Input
                  prop={{
                    type: isUsername ? "text" : "tel",
                    name: isUsername ? "username" : "phone-number",
                    id: isUsername ? "username" : "phone-number",
                    placeholder: isUsername ? "Full Name" : "Phone Number",
                    value: isUsername ? username : phone,
                    onChangeFn: isUsername ? handleUsernameChange : handlePhoneChange,
                    error: isUsername
                      ? error === "Enter your name" || error === "Name must be at least 2 characters" || error === "Username is already taken"
                      : error === "Enter a Phone Number" || error === "Number should be exactly 10 digits",
                    bg: "var(--background-muted)",
                  }}
                  className="scale-[1] sm:scale-[1.3]"
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
                    : otp.length !== OTP_LENGTH,
                }}
                className="scale-[1] sm:scale-[1.3] mt-1 sm:mt-5"
              >
                {isUsername
                  ? "Continue"
                  : isPhone
                  ? (showLogin ? "Login" : (loading ? "Sending OTP..." : "Continue"))
                  : (loading ? "Verifying..." : "Verify")}
              </Button>

              {isOtp && (
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

              {isUsername && (
                <p className="text-[var(--text-muted)] text-sm mt-3 sm:mt-5">Your name can't be changed later, <br /> so we suggest using your full name.</p>
              )}

              {isPhone && (
                <p className="text-[var(--text-muted)] text-sm mt-3 sm:mt-5 max-w-[290px] sm:max-w-[340px]">Your number can't be changed later. By continuing, you consent to receive an OTP by text or WhatsApp.</p>
              )}

              {isOtp && (
                <p className="text-[var(--text-muted)] text-sm mt-3 sm:mt-5">You consent to receive a OTP <br /> by text or WhatsApp.</p>
              )}
            </div>
          </form>
        }
    </div>
  );
};

export default SignUpPage
