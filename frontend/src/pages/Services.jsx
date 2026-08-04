import { useState } from "react";

const Services = () => {
    const [openIndex, setOpenIndex] = useState(null);
    const data = [
        {
            title: "Daily college commute",
            description: "Heading home from uni and coming back every day or every weekend? Book both rides in advance and share the cab with students on the same route to pay less.",
        },
        {
            title: "Airport drops and pickups",
            description: "Book your ride to the airport days in advance, lock in a fixed fare, and skip the last-minute scramble for a cab before an early flight.",
        },
        {
            title: "Exams and interviews",
            description: "Schedule your ride the night before so you're not depending on finding a cab the morning it matters most.",
        },
        {
            title: "Late night travel",
            description: "Coming back late from a friend's place or a night flight? Choose the safer route option and share your live trip details.",
        },
        {
            title: "Group and shared travel",
            description: "Traveling with friends going the same direction? Split a shared ride instead of booking separate cabs.",
        },
    ];

    return (
        <div className="bg-[var(--foreground)] text-[var(--text-foreground)] gap-15 py-15 sm:py-20 flex flex-col items-center justify-center">
            <div className="text-left flex flex-col w-[82%] md:w-[90%] xl:w-[74%] justify-center gap-8 sm:gap-12 items-start">
                <h1 className="font-bold text-3xl sm:text-5xl">A ride for wherever you're headed</h1>
                <ul className="w-full flex flex-wrap items-start justify-left gap-5 sm:gap-10">
                    {data.map((item, index) => {
                        return (
                            <li key={index} className="w-full lg:w-[calc(50%-1.25rem)] bg-[var(--foreground-muted)] rounded-xl p-6 sm:p-8 flex flex-col items-start justify-start gap-0 sm:gap-3 border-dashed">
                                <button
                                    type="button"
                                    aria-expanded={openIndex === index}
                                    onClick={() => setOpenIndex(openIndex === index ? null : index)}
                                    className="w-full flex items-center justify-between gap-4 text-left cursor-pointer sm:cursor-default rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current active:opacity-70 sm:active:opacity-100"
                                >
                                    <h2 className="text-2xl sm:text-3xl font-semibold">{item.title}</h2>
                                    <svg
                                        className={`w-6 h-6 shrink-0 sm:hidden transition-transform duration-300 ${openIndex === index ? "rotate-180" : ""}`}
                                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                                    >
                                        <path d="m6 9 6 6 6-6" />
                                    </svg>
                                </button>
                                <div className={`grid w-full transition-[grid-template-rows] duration-300 ease-out sm:block ${openIndex === index ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                                    <div className="min-h-0 overflow-hidden sm:overflow-visible">
                                        <h3 className={`pt-3 sm:pt-0 text-lg sm:text-xl leading-[1.75] text-[var(--background-primary)]/65 transition-opacity duration-300 ${openIndex === index ? "opacity-100" : "opacity-0"} sm:opacity-100`}>{item.description}</h3>
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

export default Services