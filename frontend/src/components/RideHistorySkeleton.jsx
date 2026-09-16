import Skeleton from "./ui/Skeleton";

const Line = ({ className = "" }) => <Skeleton tone="light" className={className} />;

const CardSkeleton = () => (
    <div className="w-full min-w-0 rounded-2xl bg-surface-muted p-4">
        <div className="flex min-h-[7.75rem] flex-col gap-3">
            <div className="flex items-center gap-3">
                <Line className="h-16 w-24 shrink-0 rounded-xl sm:h-20 sm:w-28" />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Line className="h-6 w-20 rounded-lg" />
                        <Line className="h-3 w-24" />
                    </div>
                    <Line className="mt-3 h-5 w-3/4" />
                    <Line className="mt-2 h-4 w-1/2" />
                </div>
            </div>
            <div>
                <div className="mt-3 flex items-center gap-2">
                    <Line className="h-5 w-16" />
                    <Line className="h-3 w-14" />
                </div>
            </div>
        </div>
    </div>
);

const RideHistorySkeleton = () => {
    return (
        <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
                <CardSkeleton key={i} />
            ))}
        </div>
    );
};

export default RideHistorySkeleton;
