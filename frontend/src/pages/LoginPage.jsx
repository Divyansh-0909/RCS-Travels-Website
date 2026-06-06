import { useSignIn } from "@clerk/clerk-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const LoginPage = () => {
  const { signIn, isLoaded } = useSignIn();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("phone"); // "phone" | "otp"
  const [error, setError] = useState("");

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
        navigate(res.ok ? "/book" : "/onboarding");
      }
    } catch (err) {
      setError(err.errors?.[0]?.message || "Invalid OTP");
    }
  };

  return (
    <div className="bg-transparent flex justify-center items-center w-[100vw] h-[100vh]">
        {step === "phone" ? ( 
            <div> 

            </div>
        ) : (
            <div> 

            </div>
        )
        }
    </div>
  );
};

export default LoginPage