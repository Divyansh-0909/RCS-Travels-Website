import Skeleton from "./ui/Skeleton";

// Bar wrapped in a container with the exact line-box height of the text it
// stands in for, so skeleton cards match the real cards' height exactly.
const Line = ({ h, bar, w }) => (
    <div className={`${h} flex items-center`}>
        <Skeleton tone="light" className={`${bar} ${w}`} />
    </div>
);

// One placeholder booking card — clones the admin booking card's structure.
const BookingCardSkeleton = () => (
    <div className="bg-[var(--foreground-muted)] bg-[linear-gradient(to_bottom,transparent_50%,rgba(146,146,139,0.10)_100%)] shadow-[inset_0_2px_2px_rgba(255,255,255,0.25)] py-5 px-5 sm:py-6 sm:px-8 rounded-2xl my-4 sm:my-6 flex flex-col justify-center items-start gap-4">
        <div className="flex justify-between items-start gap-4 w-full">
            {/* route: pickup → drop */}
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
            {/* fare (h3) + status chip */}
            <div className="flex flex-col items-end gap-1.5 shrink-0">
                <Line h="h-7" bar="h-4" w="w-16" />
                <Skeleton tone="light" rounded="rounded-full" className="h-6 w-20" />
            </div>
        </div>

        <div className="w-full border-t border-[var(--background-primary)]/10"></div>

        {/* meta line (text-base) */}
        <Line h="h-6" bar="h-4" w="w-64 sm:w-80" />

        {/* people columns: label (text-xs, mb-0.5) + value (h4) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            <div>
                <div className="h-4 mb-0.5 flex items-center"><Skeleton tone="light" className="h-2.5 w-16" /></div>
                <Line h="h-5 sm:h-7" bar="h-3.5 sm:h-4" w="w-44 sm:w-52" />
            </div>
            <div>
                <div className="h-4 mb-0.5 flex items-center"><Skeleton tone="light" className="h-2.5 w-12" /></div>
                <Line h="h-5 sm:h-7" bar="h-3.5 sm:h-4" w="w-44 sm:w-52" />
            </div>
        </div>

        {/* ride id (text-sm) */}
        <Line h="h-5" bar="h-3" w="w-28" />
    </div>
);

// One placeholder driver card — name + online dot, phone, divider, meta line, chip.
const DriverCardSkeleton = () => (
    <div className="bg-[var(--foreground-muted)] bg-[linear-gradient(to_bottom,transparent_50%,rgba(146,146,139,0.10)_100%)] shadow-[inset_0_2px_2px_rgba(255,255,255,0.25)] py-5 px-5 sm:py-6 sm:px-8 rounded-2xl my-4 sm:my-6 flex flex-col justify-center items-start gap-4">
        <div className="flex justify-between items-start gap-4 w-full">
            <div>
                {/* name (h3) + online dot + status (text-sm) */}
                <div className="flex items-center gap-2">
                    <Line h="h-6 sm:h-7" bar="h-4" w="w-36 sm:w-44" />
                    <Skeleton tone="light" rounded="rounded-full" className="w-2 h-2 shrink-0" />
                    <Line h="h-5" bar="h-3" w="w-12" />
                </div>
                {/* phone (p, text-sm) */}
                <Line h="h-5" bar="h-3" w="w-28" />
            </div>
            <Skeleton tone="light" rounded="rounded-full" className="h-6 w-20 shrink-0" />
        </div>

        <div className="w-full border-t border-[var(--background-primary)]/10"></div>

        {/* meta line (text-base) */}
        <Line h="h-6" bar="h-4" w="w-72 sm:w-96" />
    </div>
);

// First-load placeholder for the admin list — 3 cards of the active tab's shape.
const AdminDashboardSkeleton = ({ variant = "bookings" }) => (
    <div className="w-full">
        {[0, 1, 2].map((i) =>
            variant === "bookings" ? <BookingCardSkeleton key={i} /> : <DriverCardSkeleton key={i} />
        )}
    </div>
);

export default AdminDashboardSkeleton;
