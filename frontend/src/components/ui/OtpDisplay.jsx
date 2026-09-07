import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../../i18nCopy";
import Skeleton from "./Skeleton";

const OTP_LENGTH = 4;

// Read-only customer OTP. Tracking and the onboarding trip summary share this
// component so the same code cannot drift back into two visual languages.
const OtpDisplay = ({ code, tone = "sheet", loading = false, className = "" }) => {
    useCopyLanguage();
    const digits = code
        ? String(code).slice(0, OTP_LENGTH).split("")
        : Array(OTP_LENGTH).fill(null);
    const digitSurface = tone === "card"
        ? "bg-[var(--background)]"
        : "bg-[var(--background-muted)]";

    return (
        <div className={`flex w-full items-center justify-between gap-2.5 text-left sm:gap-3 ${className}`}>
            <span className="text-base text-[var(--text-muted)] sm:text-xl">OTP</span>
            <div
                className="flex gap-2"
                role="group"
                aria-label={code ? dc("OTP {{value0}}", {value0: (String(code).split("").join(" "))}) : dc("OTP loading")}
            >
                {digits.map((digit, index) => (
                    <div
                        key={index}
                        aria-hidden="true"
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${digitSurface}`}
                    >
                        {digit
                            ? <span className="text-base font-semibold leading-none sm:text-xl">{digit}</span>
                            : loading
                                ? <Skeleton className="h-[16px] w-3 sm:h-[20px] sm:w-3.5" />
                                : null}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default OtpDisplay;
