import Skeleton from "./ui/Skeleton";

// One placeholder card — clones a booking row's structure exactly (same
// paddings, gaps, margins, car-thumbnail aspect, and plus-button size).
const CardSkeleton = () => (
    <div className="bg-[var(--foreground-muted)] bg-[linear-gradient(to_bottom,transparent_50%,rgba(146,146,139,0.10)_100%)] shadow-[inset_0_2px_2px_rgba(255,255,255,0.25)] py-5 px-5 sm:py-6 sm:px-8 rounded-2xl my-4 sm:my-6 flex flex-col justify-center items-start gap-2 sm:gap-3">
        <div className="flex justify-between items-center gap-1 sm:gap-2 w-full">
            <div className="flex flex-col justify-center items-start">
                {/* drop address (h3) */}
                <div className="mb-1"><Skeleton tone="light" className="h-5 sm:h-6 w-44 sm:w-60" /></div>
                {/* ride id (p) */}
                <div className="mb-2"><Skeleton tone="light" className="h-3.5 w-28" /></div>
                {/* car thumbnail + date/fare lines */}
                <div className="flex gap-2 justify-start items-center">
                    <Skeleton tone="light" rounded="rounded-xl" className="w-20 sm:w-30 -ml-1 aspect-[3/2]" />
                    <div className="flex flex-col gap-1.5">
                        <Skeleton tone="light" className="h-4 sm:h-5 w-28 sm:w-32" />
                        <Skeleton tone="light" className="h-4 sm:h-5 w-24 sm:w-28" />
                    </div>
                </div>
            </div>
            {/* expand (+) button */}
            <Skeleton tone="light" rounded="rounded-full" className="w-8 h-8 shrink-0" />
        </div>
    </div>
);

// First-load placeholder for the ride history list — heading + exactly 3 cards.
const RideHistorySkeleton = () => {
    return (
        <div className="pt-30 sm:pt-40">
            <Skeleton tone="light" className="h-11 md:h-13 lg:h-16 w-46 sm:w-80 mb-8" />
            {[0, 1, 2].map((i) => (
                <CardSkeleton key={i} />
            ))}
        </div>
    );
};

export default RideHistorySkeleton;
