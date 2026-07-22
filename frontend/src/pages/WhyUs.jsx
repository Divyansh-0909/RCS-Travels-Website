const WhyUs = () => {
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
            title: "Let someone know your trip status",
            description: "Keep a trusted contact updated on how your ride is going, especially useful for late-night trips or traveling alone.",
        },
        {
            title: "Safer routes, your choice",
            description: "Prefer a well-lit, busier road over the shortest path, especially useful for late nights or unfamiliar areas. Toggle it anytime while booking.",
        },
        {
            title: "Verified drivers, every time",
            description: "Every driver is manually vetted: license, ID, and vehicle checked before approval. You'll see their name, phone number, and car details before they arrive.",
        },
        {
            title: "Pay your way",
            description: "Cash or online, straight to the driver. No forced in-app wallet, no hidden platform fee sitting between you and your fare.",
        },
        {
            title: "Share the ride, split the cost",
            description: "Heading the same direction as someone else? Book a shared seat instead of the whole vehicle and pay less for the same trip.",
        },
        {
            title: "Real humans if something's wrong",
            description: "If a driver asks for anything beyond your fare, our support team is one message away, not a buried ticket system.",
        },
    ];

    return (
        <div className="bg-[var(--foreground)] text-[var(--text-foreground)] gap-15 py-15 sm:py-20 flex flex-col items-center justify-center">
            <div className="text-left flex flex-col w-[80%] sm:w-[77%] justify-center gap-8 sm:gap-12 items-start">
                <h1 className="font-bold text-4xl sm:text-6xl">Why Choose Us?</h1>
                <ul className="w-full flex flex-col items-start justify-center gap-10">
                    {data.map((item, index) => {
                        return (
                            <li key={index} className="w-full border-b-2 pb-10 flex flex-col items-start justify-center gap-2 border-dashed">
                                <h2 className="text-3xl sm:text-4xl font-semibold">0{index + 1}. {item.title}</h2>
                                <h3 className="text-xl sm:text-2xl">{item.description}</h3>
                            </li>
                        )
                    })}
                </ul>
            </div>
        </div>
    )
}

export default WhyUs