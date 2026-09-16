import Skeleton from "./ui/Skeleton";

const Line = ({ className = "" }) => (
    <Skeleton tone="light" className={className} />
);

const BookingCardSkeleton = () => (
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
                <div className="mt-3 grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                    <div className="min-w-0">
                        <Line className="h-3 w-16" />
                        <Line className="mt-2 h-4 w-24" />
                        <Line className="mt-2 h-3 w-20" />
                    </div>
                    <div className="min-w-0">
                        <Line className="h-3 w-14" />
                        <Line className="mt-2 h-4 w-24" />
                        <Line className="mt-2 h-3 w-20" />
                    </div>
                </div>
            </div>
        </div>
    </div>
);

const DriverCardSkeleton = () => (
    <div className="w-full min-w-0 overflow-hidden rounded-2xl bg-surface-muted p-3 sm:p-4">
        <div className="flex min-w-0 items-center gap-3">
            <Line className="h-12 w-12 shrink-0 rounded-full sm:h-14 sm:w-14" />
            <div className="min-w-0">
                <Line className="h-5 w-28" />
                <Line className="mt-2 h-4 w-24" />
            </div>
            <div className="ml-auto flex shrink-0 flex-col items-end">
                <Line className="h-4 w-24" />
                <Line className="mt-2 h-4 w-16" />
            </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-border/50 pt-2.5">
            <Line className="h-6 w-20 rounded-lg" />
            <Line className="h-4 w-16" />
            <Line className="h-4 w-24" />
            <Line className="ml-auto h-4 w-4" />
        </div>
    </div>
);

const UserCardSkeleton = () => (
    <div className="w-full min-w-0 overflow-hidden rounded-2xl bg-surface-muted p-3 sm:p-4">
        <div className="flex items-center gap-3">
            <Line className="h-14 w-14 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
                <Line className="h-6 w-32" />
                <Line className="mt-2 h-4 w-24" />
            </div>
            <Line className="h-10 w-px shrink-0 rounded-none" />
            <div className="flex min-w-[5.25rem] shrink-0 flex-col items-end">
                <Line className="h-5 w-8" />
                <Line className="mt-2 h-3 w-12" />
            </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/50 pt-3">
            <Line className="h-4 w-16" />
            <Line className="h-4 w-28" />
            <Line className="ml-auto h-4 w-4" />
        </div>
    </div>
);

const AdminDashboardSkeleton = ({ variant = "bookings" }) => (
    <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((item) => (
            variant === "bookings"
                ? <BookingCardSkeleton key={item} />
                : variant === "drivers"
                    ? <DriverCardSkeleton key={item} />
                    : <UserCardSkeleton key={item} />
        ))}
    </div>
);

export default AdminDashboardSkeleton;
