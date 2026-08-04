import { useState } from "react";

const WhyUs = () => {
    const [openIndex, setOpenIndex] = useState(null);
    const data = [
        {
            title: "Fixed fares, no surprises",
            description: "Know your price before you book. No surge pricing, ever. For destinations outside our fixed-fare list, only tolls are settled directly with the driver.",
        },
        {
            title: "Book days ahead, not just minutes before",
            description: "Schedule a ride up to 7 days in advance and lock in your fare and driver on your schedule. Ideal for flights, exams, or classes you can't be late for.",
        },
        {
            title: "Safer routes, your choice",
            description: "Prefer a well-lit, busier road over the shortest path, especially useful for late nights or unfamiliar areas. Toggle it anytime while booking.",
        },
        {
            title: "Let someone know your trip status",
            description: "Keep a trusted contact updated on how your ride is going, especially useful for late-night trips or traveling alone.",
        },
        {
            title: "Verified drivers, every time",
            description: "Every driver is manually vetted: license, ID, and vehicle checked before approval. You'll see their name, phone number, and car details before they arrive.",
        },
        {
            title: "Share the ride, split the cost",
            description: "Heading the same direction as someone else? Book a shared seat instead of the whole vehicle and pay less for the same trip.",
        },
    ];

    return (
        <div className="bg-[var(--foreground)] text-[var(--text-foreground)] gap-15 py-15 sm:py-20 flex flex-col items-center justify-center">
            <div className="text-left flex flex-col w-[82%] md:w-[90%] xl:w-[74%] justify-center gap-8 sm:gap-12 items-start">
                <h1 className="font-bold text-3xl sm:text-5xl">Reasons to ride with us</h1>
                <ul className="w-full flex flex-col items-start justify-center gap-10">
                    {data.map((item, index) => {
                        return (
                            <li key={index} className="w-full border-b-2 pb-10 flex flex-col items-start justify-center gap-0 border-dashed">
                                <button
                                    type="button"
                                    aria-expanded={openIndex === index}
                                    onClick={() => setOpenIndex(openIndex === index ? null : index)}
                                    className="w-full flex items-center justify-between gap-4 text-left cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current active:opacity-70"
                                >
                                    <div className="flex h-full text-2xl sm:text-3xl gap-2 justify-start items-start font-normal">
                                        <h2 className="text-2xl h-full sm:text-3xl font-normal">0{index + 1}.</h2>
                                        <h2 className="text-2xl h-full sm:text-3xl font-normal">{item.title}</h2>
                                    </div>
                                    <svg
                                        className={`w-6 h-6 shrink-0 transition-transform duration-300 ${openIndex === index ? "rotate-180" : ""}`}
                                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                                    >
                                        <path d="m6 9 6 6 6-6" />
                                    </svg>
                                </button>
                                <div className={`grid w-full transition-[grid-template-rows] duration-300 ease-out ${openIndex === index ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                                    <div className="min-h-0 overflow-hidden">
                                        <h3 className={`pt-2 text-lg sm:text-xl leading-[1.75] text-[var(--background-primary)]/65 transition-opacity duration-300 ${openIndex === index ? "opacity-100" : "opacity-0"}`}>{item.description}</h3>
                                    </div>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            </div>
        </div>
    )
}

export default WhyUs