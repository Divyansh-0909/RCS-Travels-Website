const Services = () => {
    const data = [
        {
            title: "Daily college commute",
            description: "Share a ride with others heading to the same campus and pay less per trip. Prefer the safer, well-lit route by default, especially useful for early morning or late evening classes.",
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
            title: "Outstation trips",
            description: "Heading out of the city? Book an outstation ride in advance and get a driver assigned closer to your departure time.",
        },
        {
            title: "Office commute",
            description: "Set a recurring pickup time for work and rely on a fixed fare every day instead of checking prices each morning.",
        },
        {
            title: "Late night travel",
            description: "Coming back late from a friend's place or a night shift? Choose the safer route option and share your live trip details with someone you trust.",
        },
        {
            title: "Group and shared travel",
            description: "Traveling with friends going the same direction? Split a shared ride instead of booking separate cabs.",
        },
    ];

    return (
        <div className="bg-[var(--foreground)] text-[var(--text-foreground)] gap-15 py-15 sm:py-20 flex flex-col items-center justify-center">
            <div className="text-left flex flex-col w-[80%] sm:w-[77%] justify-center gap-8 sm:gap-12 items-start">
                <h1 className="font-bold text-4xl sm:text-6xl">A ride for wherever you're headed</h1>
                <ul className="w-full flex flex-wrap items-center justify-left gap-10">
                    {data.map((item, index) => {
                        return (
                            <li key={index} className="w-[48%] h-[38vh] bg-[var(--foreground-muted)] rounded-xl p-10 flex flex-col items-start justify-left gap-3 border-dashed">
                                <h2 className="text-3xl sm:text-4xl font-semibold">{item.title}</h2>
                                <h3 className="text-xl sm:text-2xl">{item.description}</h3>
                            </li>
                        )
                    })}
                </ul>
            </div>
        </div>
    )
}

export default Services