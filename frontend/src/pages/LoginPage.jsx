import { useSignIn, useAuth } from "@clerk/clerk-react";
import { useState, useEffect } from "react";
import { useViewNavigate } from "../hooks/useViewNavigate";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import { useApi } from "../hooks/useApi";
import Icon from '@mdi/react';
import { mdiKeyboardBackspace } from '@mdi/js';
import { useData } from "../hooks/useData";

const LoginPage = () => {
  const { signIn, setActive } = useSignIn();
  const { isSignedIn } = useAuth();
  const navigate = useViewNavigate();
  const phone = useData(state => state.phone);
  const setPhone = useData(state => state.setPhone);
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("phone"); // "phone" | "otp"
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [showSignUp, setShowSignUp] = useState(false);
  const pickupLocation = useData(state => state.pickupLocation);

  const api = useApi();

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => {
      setResendIn((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

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

    if (!(otp.length === 6)) {
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
    if (data.error) {
      setError(data.error);
      return;
    }
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
      setError(data.error);
      return;
    }

    if (!isSignedIn) {
      const result = await signIn.create({ strategy: "ticket", ticket: data.ticket });
      if (result.status !== "complete") {
        setError("Sign in failed. Please try again.");
        return;
      }
      // Activate the session so the getMe request below is authenticated, instead
      // of relying on the session happening to be active by the time it fires.
      await setActive({ session: result.createdSessionId });
    }

    const user = await api.getMe();
    navigate(user.error ? "/signup" : (pickupLocation ? "/book" : "/"));
  };

  const isPhone = step === "phone";

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
      {isSignedIn
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

            <Input
              prop={{
                type: "tel",
                name: isPhone ? "phone-number" : "otp-number",
                id: isPhone ? "phone-number" : "otp-number",
                placeholder: isPhone ? "XXXXX XXXXX" : "XX XX XX XX",
                value: isPhone ? phone : otp,
                onChangeFn: isPhone ? handlePhoneChange : handleOtpChange,
                error: isPhone
                  ? error === "Enter a Phone Number" ||
                  error === "Number should be exactly 10 digits"
                  : error === "Enter OTP" ||
                  error === "Incorrect OTP",
              }}
              className="scale-[1] sm:scale-[1.1] mb-5"
            />

            <Button
              onClick={isPhone && showSignUp ? () => navigate('/signup') : undefined}
              prop={{
                type: isPhone && showSignUp ? "button" : "submit",
              }}
              className="scale-[1] sm:scale-[1.1]"
            >
              {isPhone
                ? (showSignUp ? "Sign Up" : (loading ? "Sending OTP..." : "Continue"))
                : (loading ? "Confirming..." : "Confirm")}
            </Button>
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