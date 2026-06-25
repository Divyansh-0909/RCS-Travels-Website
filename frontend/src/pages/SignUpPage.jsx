// import { useSignUp } from "@clerk/clerk-react"; // replaced by WhatsApp OTP + Clerk ticket flow
import { useSignIn, useAuth } from "@clerk/clerk-react";
import { useState, useEffect } from "react";
import { useViewNavigate } from "../hooks/useViewNavigate";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import { useApi } from "../hooks/useApi";
import Icon from '@mdi/react';
import { mdiKeyboardBackspace } from '@mdi/js';
import { useData } from "../hooks/useData";

const SignUpPage = () => {
  // const { signUp, isLoaded } = useSignUp(); // replaced
  const { signIn, setActive } = useSignIn();
  const { isSignedIn } = useAuth();
  const navigate = useViewNavigate();
  const [username, setUsername] = useState("");
  const phone = useData(state=>state.phone);
  const setPhone = useData(state => state.setPhone);
  const [otp, setOtp] = useState("");
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

      if(!(otp.length === 6) ){
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
    if (data.error) { setError(data.error); return; }

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

  const handleOtpChange = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 6);

    setOtp(digits);

    if (
      error === "Enter OTP" ||
      error === "Incorrect OTP"
    ) {
      setError(null);
    }
  };

  return (
    <div className="relative bg-transparent text-center flex justify-center items-center w-[100vw] h-[100vh] bg-panel-gradient">
        <div onClick={back} className="block sm:hidden flex justify-center items-center gap-2 sm:gap-3 absolute left-3 top-3 text-[var(--text)]">
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
                  : <>One code <br /> away.</>}
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

              <Input
                prop={{
                  type: isUsername ? "text" : "tel",
                  name: isUsername ? "username" : isPhone ? "phone-number" : "otp-number",
                  id: isUsername ? "username" : isPhone ? "phone-number" : "otp-number",
                  placeholder: isUsername ? "Full Name" : isPhone ? "XXXXX XXXXX" : "XX XX XX XX",
                  value: isUsername ? username : isPhone ? phone : otp,
                  onChangeFn: isUsername ? handleUsernameChange : isPhone ? handlePhoneChange : handleOtpChange,
                  error: isUsername
                    ? error === "Enter your name" || error === "Name must be at least 2 characters" || error === "Username is already taken"
                    : isPhone
                    ? error === "Enter a Phone Number" || error === "Number should be exactly 10 digits"
                    : error === "Enter OTP" || error === "Incorrect OTP",
                }}
                className="scale-[1] sm:scale-[1.1]"
              />

              <Button
                onClick={isPhone && showLogin ? () => navigate('/login') : undefined}
                prop={{
                  type: isPhone && showLogin ? "button" : "submit",
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
