import { useSignIn } from "@clerk/clerk-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Input from "../components/ui/Input";
import Button from "../components/ui/button";
import { useApi } from "../hooks/useApi";
import Icon from '@mdi/react';
import { mdiKeyboardBackspace } from '@mdi/js';

const LoginPage = () => {
  const { signIn, isLoaded } = useSignIn();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("phone"); // "phone" | "otp"
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const api = useApi();

  const back = ()=>{
     navigate(step === "phone" ? "/on-boarding" : "/login")
  }
  
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
    if (!isLoaded) return;
    try {
      await signIn.create({
        identifier: `+91${phone}`,
      });
      await signIn.prepareFirstFactor({
        strategy: "phone_code",
        phoneNumberId: signIn.supportedFirstFactors[0].phoneNumberId,
      });
      setStep("otp");
    } catch (err) {
      setError(err.errors?.[0]?.message || "Failed to send OTP");
    }
  };

  const verifyOtp = async () => {
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "phone_code",
        code: otp,
      });
      if (result.status === "complete") {
        // check if new or existing user
        const res = await fetch("/api/users/me", {
          headers: { Authorization: `Bearer ${await result.createdSessionId}` }
        });
        navigate(res.ok ? "/book" : "/login");
      }
    } catch (err) {
      setError(err.errors?.[0]?.message || "Invalid OTP");
    }
  };

  return (
    <div className="relative bg-transparent text-center flex justify-center items-center w-[100vw] h-[100vh] bg-panel-gradient">
        <div onClick={back} className="block sm:hidden absolute right-3 top-3 text-[var(--text)]"><Icon path={mdiKeyboardBackspace} size={1.2} /></div>
        {step === "phone" ? ( 
            <form 
              className="flex flex-col justify-center items-center gap-6" 
              noValidate
              onSubmit={handleSubmit}
            > 
              <div className="flex flex-col justify-center items-center gap-2 sm:gap-3">
                <h2 className="text-[var(--text)] ">Let's start with your <br /> phone number.</h2>
                <p className="text-[var(--text-muted)] ">We'll send a OTP to this number.</p>
              </div>
              <div className="flex flex-col justify-center items-center gap-2 sm:gap-3">
                <Input
                  prop={{
                    type: "tel",
                    name: "phone-number",
                    id: "phone-number",
                    placeholder: "XXXXX XXXXX",
                    value: phone,
                    onChangeFn: (value) => {
                      const digits = value.replace(/\D/g, "").slice(0, 10);

                      setPhone(digits);

                      if (
                        error === "Enter a Phone Number" ||
                        error === "Number should be exactly 10 digits"
                      ) {
                        setError(null);
                      }
                    },
                    error:
                      error === "Enter a Phone Number" ||
                      error === "Number should be exactly 10 digits",
                  }}
                  className="scale-[1] sm:scale-[1.1]"
                />

                {error && (
                  <p className="text-red-400 text-sm">
                    {error}
                  </p>
                )}

                <Button
                  prop={{
                    type: "submit",
                  }}
                  className="scale-[1] sm:scale-[1.1]"
                >
                  {loading ? "Sending OTP..." : "Continue"}
                </Button>

                <p className="text-[var(--text-muted)] text-xs">You consent to receive a OTP <br /> by text or WhatsApp.</p>
              </div>
            </form>
        ) : (
            <div> 
            <form 
              className="flex flex-col justify-center items-center gap-4" 
              noValidate
              onSubmit={handleOTPSubmit}
            > 
              <div className="flex flex-col justify-center items-center gap-2 sm:gap-3">
                <h2 className="text-[var(--text)] ">Confirm your code.</h2>
                <p className="text-[var(--text-muted)] ">Enter the OTP we sent to your phone.</p>
              </div>
              
              <div className="flex flex-col justify-center items-center gap-2 sm:gap-3">
                <Input
                  prop={{
                    type: "tel",
                    name: "otp-number",
                    id: "otp-number",
                    placeholder: "XX XX XX XX",
                    value: otp,
                    onChangeFn: (value) => {
                      const digits = value.replace(/\D/g, "").slice(0, 6);

                      setOtp(digits);

                      if (
                        error === "Enter OTP" ||
                        error === "Incorrect OTP"
                      ) {
                        setError(null);
                      }
                    },
                    error:
                      error === "Enter OTP" ||
                      error === "Incorrect OTP",
                  }}
                  className="scale-[1] sm:scale-[1.1]"
                />

                {error && (
                  <p className="text-red-400 text-sm">
                    {error}
                  </p>
                )}

                <Button
                  prop={{
                    type: "submit",
                  }}
                  className="scale-[1] sm:scale-[1.1]"
                >
                  {loading ? "Confirming..." : "Confirm"}
                </Button>
              </div>
            </form>
          </div>
        )
        }
    </div>
  );
};

export default LoginPage