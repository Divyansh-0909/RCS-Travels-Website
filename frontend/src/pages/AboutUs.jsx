const AboutUs = () => {
    return (
        <div className="bg-primary-dark text-[var(--text)] py-15 flex flex-col items-center justify-center">
            <div className="text-left flex flex-col w-[82%] md:w-[90%] xl:w-[74%] justify-center gap-8 sm:gap-12 items-start">
                <h1 className="text-[var(--text)] bg-[var(--background)] px-4 py-3 sm:pb-4 rounded-xl shadow-[4px_6px_0_rgba(0,0,0,0.25)] sm:shadow-[8px_10px_0_rgba(0,0,0,0.25)] rotate-[-1deg]">Why we started RCS</h1>
                <div className="flex flex-col gap-6">
                    <h3 className="sm:text-xl lg:text-2xl text-[var(--text)]">
                        RCS Travels started with a simple observation: getting a dependable cab for your
                        daily commute shouldn't be a daily gamble. Whether it's the morning run to campus,
                        a flight you can't miss, or the trip back home every weekend, a ride you've
                        planned should be a ride you can count on.
                    </h3>
                    <h3 className="sm:text-xl lg:text-2xl text-[var(--text)]">
                        So we built a service around scheduling, fixed fares, and drivers we've personally
                        verified. No surge pricing, no last-minute scramble, no strangers behind the
                        wheel. Just a cab that shows up when you booked it, at the price you agreed to.
                    </h3>
                </div>
            </div>
        </div>
    )
}

export default AboutUs
