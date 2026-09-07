import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../i18nCopy";
import { useState } from "react";
import step1_Illustration from "../assets/step-1-illustration.webp";
import step2_Illustration from "../assets/step-2-illustration.webp";
import step3_Illustration from "../assets/step-3-illustration.webp";
import step4_Illustration from "../assets/step-4-illustration.webp";
import { useWebsiteCopy } from "../hooks/useWebsiteCopy";

const HowItWorks = () => {
    useCopyLanguage();
    const tr = useWebsiteCopy();
    const [current, setCurrent] = useState(0);

    const steps = [
        {
            illustration: step1_Illustration,
            number: "01",
            get "title"() { return dc("Tell us your trip"); },
            get "description"() { return dc("Enter your pickup location, destination, date, and time. Booking takes less than a minute."); },
            detail: "Works for local, outstation, and airport rides.",
        },
        {
            illustration: step2_Illustration,
            number: "02",
            get "title"() { return dc("Choose your ride"); },
            get "description"() { return dc("Compare car options and get an upfront, fixed price. No surge pricing, no hidden charges."); },
            detail: "Sedans or SUV's you decide.",
        },
        {
            illustration: step3_Illustration,
            number: "03",
            get "title"() { return dc("Confirm your booking"); },
            get "description"() { return dc("Get matched with a verified driver. We share their name, photo, and car details before pickup."); },
            detail: "Every driver is background checked.",
        },
        {
            illustration: step4_Illustration,
            number: "04",
            get "title"() { return dc("Ride with confidence"); },
            get "description"() { return dc("Track your driver in real time, enjoy a smooth trip, and pay by cash or online, whatever suits you."); },
            detail: "Live tracking on every ride.",
        },
    ];

    const arrowButtonClass = `
        flex items-center justify-center w-11 h-11 rounded-xl cursor-pointer
        bg-[var(--background)] text-[var(--text)]
        transition-transform duration-200 motion-reduce:transition-none
        hover:-translate-y-0.5 active:translate-y-0.5
        disabled:opacity-40 disabled:pointer-events-none
        outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
    `;

    return (
        <div className="bg-[var(--foreground)] text-[var(--text-foreground)] gap-10 flex flex-col items-center justify-center">
            <div className="text-left flex flex-col w-[82%] md:w-[90%] xl:w-[74%] justify-center gap-2 items-start">
                <h1 className="font-bold text-3xl sm:text-5xl">{tr("Book a ride in four simple steps")}</h1>
            </div>

            <div
                className="w-[82%] md:w-[90%] xl:w-[74%] overflow-hidden"
                role="region"
                aria-roledescription="carousel"
                aria-label={tr("How it works, four steps")}
                aria-live="polite"
            >
                <ul
                    className="flex transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                    style={{ transform: `translateX(-${current * 100}%)` }}
                >
                    {steps.map((step, index) => {
                        return (
                            <li
                                key={step.number}
                                aria-hidden={index !== current}
                                className="flex flex-col sm:flex-row w-full shrink-0 px-1 sm:px-3 pb-3 gap-4 justify-between items-center"
                            >
                                <img src={step.illustration} alt={tr("illustration")} className="md:w-90 lg:w-110 xl:w-120 rounded-xl" />
                                <div className="lg:w-[48%] flex flex-col justify-center items-start text-left gap-4 sm:gap-6">
                                    <h1 className="relative text-3xl sm:text-4xl font-semibold text-[var(--text-foreground)] flex flex-col sm:items-start justify-center">
                                        <span className="w-fit z-1 relative text-[var(--text)] bg-[var(--background)] px-4 py-2 rounded-xl shadow-[4px_6px_0_rgba(0,0,0,0.25)] sm:shadow-[8px_10px_0_rgba(0,0,0,0.25)] ">{step.number}</span>
                                        <span className="text-[var(--text)] bg-primary px-4 py-2 pb-3 sm:pb-4 rounded-xl shadow-[4px_6px_0_rgba(0,0,0,0.25)] sm:shadow-[8px_10px_0_rgba(0,0,0,0.25)] rotate-[1deg]">{tr(step.title)}</span>
                                    </h1>
                                    <h2 className="text-lg sm:text-xl leading-[1.75] flex flex-col items-start justify-center gap-2 text-[var(--background-primary)]">
                                        {tr(step.description)} <br />
                                        <span className="xl:block hidden">{tr(step.detail)}</span>
                                    </h2>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            </div>

            <div className="-mt-7 sm:mt-0 flex items-center justify-center gap-6">
                <button
                    type="button"
                    onClick={() => setCurrent((c) => c - 1)}
                    disabled={current === 0}
                    aria-label={tr("Previous step")}
                    className={arrowButtonClass}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </button>

                <div className="flex items-center gap-2.5">
                    {steps.map((step, index) => {
                        return (
                            <button
                                key={step.number}
                                type="button"
                                onClick={() => setCurrent(index)}
                                aria-label={dc("Go to step {{value0}}", {value0: (index + 1)})}
                                aria-current={index === current}
                                className={`w-2.5 h-2.5 rounded-full cursor-pointer transition-transform duration-300 motion-reduce:transition-none outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${index === current ? "bg-primary scale-125" : "bg-black/20 hover:bg-black/35 hover:scale-110 active:scale-95"}`}
                            />
                        )
                    })}
                </div>

                <button
                    type="button"
                    onClick={() => setCurrent((c) => c + 1)}
                    disabled={current === steps.length - 1}
                    aria-label={tr("Next step")}
                    className={arrowButtonClass}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                </button>
            </div>
        </div>
    )
}

export default HowItWorks
