import step1_Illustration from "../assets/step-1-illustration.webp";
import step2_Illustration from "../assets/step-2-illustration.webp";
import step3_Illustration from "../assets/step-3-illustration.webp";
import step4_Illustration from "../assets/step-4-illustration.webp";

const HowItWorks = () => {
    const steps = [
        {
            illustration: step1_Illustration,
            number: "01",
            title: "Tell us your trip",
            description: "Enter your pickup location, destination, date, and time. Booking takes less than a minute.",
            detail: "Works for local, outstation, and airport rides.",
        },
        {
            illustration: step2_Illustration,
            number: "02",
            title: "Choose your ride",
            description: "Compare car options and get an upfront, fixed price. No surge pricing, no hidden charges.",
            detail: "Sedans or SUV's you decide.",
        },
        {
            illustration: step3_Illustration,
            number: "03",
            title: "Confirm your booking",
            description: "Get matched with a verified driver. We share their name, photo, and car details before pickup.",
            detail: "Every driver is background-checked.",
        },
        {
            illustration: step4_Illustration,
            number: "04",
            title: "Ride with confidence",
            description: "Track your driver in real time, enjoy a smooth trip, and pay by cash or online, whatever suits you.",
            detail: "Live tracking on every ride.",
        },
    ];

    return (
        <div className="bg-[var(--foreground)] text-[var(--text-foreground)] gap-15 py-15 sm:py-20 flex flex-col items-center justify-center">
            <div className="text-left flex flex-col w-[82%] sm:w-[77%] justify-center gap-2 items-start">
                <h1 className="font-bold text-4xl sm:text-6xl">Book a ride in four simple steps</h1>
            </div>
            <ul className="flex flex-col gap-20 sm:gap-25 items-center justify-center sm:[&>*:nth-child(odd)]:flex-row-reverse">
                {steps.map((step) => {
                    return (
                        <li className="flex flex-col sm:flex-row w-[82%] sm:w-[77%] gap-6 justify-between items-center ">
                            <img src={step.illustration} alt="illustration" className="w-130 rounded-xl" />
                            <div className="sm:w-[48%] flex flex-col justify-center items-start text-left gap-4 sm:gap-6">
                                <h1 className="relative sm:text-5xl text-[25px] text-[var(--text-foreground)] flex flex-col sm:items-start justify-center">
                                    <span className="w-fit z-1 relative text-[var(--text)] bg-[var(--background)] px-4 py-2 rounded-xl shadow-[4px_6px_0_rgba(0,0,0,0.25)] sm:shadow-[8px_10px_0_rgba(0,0,0,0.25)] ">{step.number}</span>
                                    <span className="text-[var(--text)] bg-primary px-4 py-2 pb-3 sm:pb-4 rounded-xl shadow-[4px_6px_0_rgba(0,0,0,0.25)] sm:shadow-[8px_10px_0_rgba(0,0,0,0.25)] rotate-[1deg]">{step.title}</span>
                                </h1>
                                <h2 className="sm:text-3xl text-[var(--text-foreground)]">
                                    {step.description}
                                </h2>
                            </div>
                        </li>
                    )
                })}
            </ul>

        </div>
    )
}

export default HowItWorks