import Skeleton from "./ui/Skeleton";

// Bar wrapped in a container with the exact line-box height of the text it
// stands in for, so skeleton cards match the real cards' height exactly.
const Line = ({ h, bar, w }) => (
    <div className={`${h} flex items-center`}>
        <Skeleton tone="light" className={`${bar} ${w}`} />
    </div>
);

// One placeholder card — clones a collapsed booking card's structure exactly.
const CardSkeleton = () => (
    <div className="my-2 flex flex-col justify-center items-start gap-3 rounded-3xl bg-pastel-primary px-5 py-5 sm:px-6">
        <div className="flex justify-between items-start gap-4 w-full">
            {/* route: pickup → drop, with the car thumbnail on its left on sm+ */}
            <div className="flex items-center gap-4">
                <Skeleton tone="light" rounded="rounded-xl" className="hidden sm:block w-44 -ml-4 aspect-[3/2] shrink-0" />
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <Skeleton tone="light" rounded="rounded-full" className="w-3 h-3 shrink-0" />
                        <div>
                            <Line h="h-5 sm:h-7" bar="h-3.5 sm:h-4" w="w-36 sm:w-48" />
                            <Line h="h-5" bar="h-3" w="w-28 sm:w-40" />
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Skeleton tone="light" rounded="rounded-full" className="w-3 h-3 shrink-0" />
                        <div>
                            <Line h="h-5 sm:h-7" bar="h-3.5 sm:h-4" w="w-40 sm:w-56" />
                            <Line h="h-5" bar="h-3" w="w-24 sm:w-36" />
                        </div>
                    </div>
                </div>
            </div>
            {/* fare (h3) + status chip */}
            <div className="flex flex-col items-end gap-1.5 shrink-0">
                <Line h="h-7" bar="h-4" w="w-16" />
                <Skeleton tone="light" rounded="rounded-full" className="h-6 w-20" />
            </div>
        </div>

        <div className="w-full border-t border-[var(--background-primary)]/10"></div>

        {/* meta line (text-base) + expand toggle */}
        <div className="flex justify-between items-center w-full gap-4">
            <Line h="h-6" bar="h-4" w="w-56 sm:w-72" />
            <Skeleton tone="light" rounded="rounded-full" className="w-8 h-8 shrink-0" />
        </div>
    </div>
);

// First-load placeholder for the ride history list — exactly 3 cards.
const RideHistorySkeleton = () => {
    return (
        <>
            {[0, 1, 2].map((i) => (
                <CardSkeleton key={i} />
            ))}
        </>
    );
};

export default RideHistorySkeleton;
