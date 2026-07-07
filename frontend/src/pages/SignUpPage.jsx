// import { useSignUp } from "@clerk/clerk-react"; // replaced by WhatsApp OTP + Clerk ticket flow
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

const SignUpPage = () => {
  // const { signUp, isLoaded } = useSignUp(); // replaced
  const { signIn, setActive } = useSignIn();
  const { isSignedIn } = useAuth();
  const navigate = useViewNavigate();
  const [username, setUsername] = useState("");
  const phone = useData(state=>state.phone);
  const setPhone = useData(state => state.setPhone);
  const [otp, setOtp] = useState("");
  const otpRefs = useRef([]);
  const OTP_LENGTH = 4;
  // Username is collected FIRST and held in state, so the DB user is created in the
  // same step as OTP verification — there is no post-OTP "enter your name" screen to
  // abandon, which is what previously left a signed-in session without a profile.
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

  // Signing up is for a fresh number — start the phone field blank rather than
  // pre-filling the remembered (persisted) login number.
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

      if(!(otp.length === 4) ){
        setError("OTP should be exactly 4 digit");
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
      // Hold the red-cross animation before clearing, matching LoginPage.
      setError(data.error);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setOtp("");
      return;
    }

    const result = await signIn.create({ strategy: "ticket", ticket: data.ticket });
    if (result.status !== "complete") { setError("Verification failed. Please try again."); return; }

    // Activate the session so the createMe request below is authenticated.
    await setActive({ session: result.createdSessionId });

    // Create the DB user immediately, using the name collected up front. No
    // interactive step in between means no abandonable, profile-less session.
    const created = await api.createMe(username);
    if (created?.error) {
      // Don't leave a session without a profile — sign out and send them back to
      // the name step to retry (e.g. number already registered to another account).
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
        {/* While finalizing (loading) the session may already be active; keep showing
            the form so the "already logged in" screen doesn't flash mid-signup. */}
        { isSignedIn && !loading
        ?
        <div className="flex flex-col justify-center items-center gap-6">
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
        :
          <form
            className="flex flex-col justify-center items-center gap-12"
            noValidate
            onSubmit={isUsername ? handleUsernameSubmit : isPhone ? handleSubmit : handleOTPSubmit}
          >
            <div className="flex flex-col justify-center items-center gap-2 sm:gap-3">
              <h2 className="text-[var(--text)] ">
                {isUsername
                  ? <>Make it yours.</>
                  : isPhone
                  ? <>Looks like you're <br /> new here.</>
                  : <>One code away.</>}
              </h2>
              <p className="text-[var(--text-muted)] ">
                {isUsername
                  ? <>This is how drivers will identify you.</>
                  : isPhone
                  ? <>Let's get you set up. <br /> We'll send an OTP to verify.</>
                  : "Enter the OTP we sent to your phone."}
              </p>
            </div>
            <div className="flex flex-col justify-center items-center gap-2 sm:gap-4">

              {error && (
                <p className="text-red-400 text-sm">
                  {error}
                </p>
              )}

              {isOtp
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
                        relative flex justify-center text-center items-center font-medium text-3xl my-1
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
                : <Input
                  prop={{
                    type: isUsername ? "text" : "tel",
                    name: isUsername ? "username" : "phone-number",
                    id: isUsername ? "username" : "phone-number",
                    placeholder: isUsername ? "Full Name" : "XXXXX XXXXX",
                    value: isUsername ? username : phone,
                    onChangeFn: isUsername ? handleUsernameChange : handlePhoneChange,
                    error: isUsername
                      ? error === "Enter your name" || error === "Name must be at least 2 characters" || error === "Username is already taken"
                      : error === "Enter a Phone Number" || error === "Number should be exactly 10 digits",
                  }}
                  className="scale-[1] sm:scale-[1.1]"
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
                    : otp.length !== 4,
                }}
                className="scale-[1] sm:scale-[1.1]"
              >
                {isUsername
                  ? "Continue"
                  : isPhone
                  ? (showLogin ? "Login" : (loading ? "Sending OTP..." : "Continue"))
                  : (loading ? "Verifying..." : "Verify")}
              </Button>

              {!isPhone && !isUsername && (
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
          </form>
        }
    </div>
  );
};

export default SignUpPage
