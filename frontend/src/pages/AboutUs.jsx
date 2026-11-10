import { useWebsiteCopy } from "../hooks/useWebsiteCopy";
import { useTheme } from "../context/ThemeContext";

const AboutUs = () => {
    const tr = useWebsiteCopy();
    const { resolvedTheme } = useTheme();
    return (
        <div data-theme-scope={resolvedTheme} className="bg-[var(--input-background)] text-ink py-15 sm:py-20 flex [clip-path:inset(0_round_3em_3em_0em_0em)] sm:[clip-path:inset(0_round_7em_7em_0em_0em)] flex-col items-center justify-center">
            <div className="text-left flex flex-col w-[82%] md:w-[90%] xl:w-[74%] justify-center gap-8 items-start">
                <h1 className="break-words font-bold text-3xl sm:text-5xl text-[var(--text)] bg-[var(--background)] px-4 py-3 sm:pb-4 rounded-xl">{tr("Why we started RCS")}</h1>
                <div className="flex flex-col gap-4">
                    <h3 className="text-lg sm:text-xl xl:text-2xl leading-[1.75] text-ink/80 bg-[var(--foreground)] p-4 rounded-3xl">
                        {tr("RCS Travels started with a simple observation: getting a dependable cab for your daily commute shouldn't be a daily gamble. Whether it's the morning run to campus, a flight you can't miss, or the trip back home every weekend, a ride you've planned should be a ride you can count on.")}
                    </h3>
                    <h3 className="text-lg sm:text-xl xl:text-2xl leading-[1.75] text-ink/80 bg-[var(--foreground)] p-4 rounded-3xl">
                        {tr("So we built a service around scheduling, fixed fares, and drivers we've personally verified. No surge pricing, no last-minute scramble, no strangers behind the wheel. Just a cab that shows up when you booked it, at the price you agreed to.")}
                    </h3>
                </div>
            </div>
        </div>
    )
}

export default AboutUs
