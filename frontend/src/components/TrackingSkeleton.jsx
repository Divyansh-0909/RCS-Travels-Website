import Button from "./ui/Button";
import BackgroundPanel from "./ui/BackgroundPanel";
import Skeleton from "./ui/Skeleton";

// First-load placeholder for the tracking page — mirrors the live panel 1:1
// (same panel classes, same column tokens, same real Button) so the content
// lands with no layout shift. Kept in the same order the live panel renders:
// OTP, driver card, drop row, notices, then the two actions.
const COL = "w-[290px] sm:w-[377px]";
const STACK = "gap-6 sm:gap-8";
const PAIR = "gap-0.5 sm:gap-1";

const TrackingSkeleton = () => {
    return (
        <BackgroundPanel className={"py-6 sm:overflow-hidden justify-center items-center flex flex-col sm:flex-row sm:justify-center lg:justify-between text-left sm:px-[9%] md:px-[5%] xl:px-[13%]"}>
            <div className={`relative z-10 sm:order-1 flex flex-col justify-center items-center sm:items-start w-full sm:w-auto ${STACK}`}>
                {/* headline + detail, matching TITLE's two lines and SUBTITLE */}
                <div className={`flex flex-col justify-center items-center sm:items-start ${PAIR} ${COL}`}>
                    <Skeleton className="h-[30px] sm:h-[48px] w-[75%]" />
                    <Skeleton className="h-[30px] sm:h-[48px] w-[45%]" />
                    <Skeleton className="mt-2 h-[22px] sm:h-[30px] w-[65%]" />
                </div>

                <div className={`flex flex-col justify-center items-start gap-3 ${COL}`}>
                    {/* OTP card */}
                    <div className="w-full rounded-xl border border-[var(--foreground)]/30 bg-[var(--background-muted)] px-3.5 sm:px-4">
                        <div className="flex items-center justify-between w-full py-3">
                            <Skeleton className="h-[22px] sm:h-[30px] w-12" />
                            <Skeleton className="h-[26px] sm:h-[38px] w-24" />
                        </div>
                    </div>

                    {/* driver card */}
                    <Button
                        className="w-full pointer-events-none"
                        prop={{ variant: "input", width: "100%", bg: "var(--background-muted)", innerClassName: "flex justify-between items-center w-full px-4 py-3 gap-3" }}
                    >
                        <Skeleton rounded="rounded-full" className="w-16 h-16 sm:w-20 sm:h-20 shrink-0" />
                        <div className="flex flex-col items-end justify-center gap-1">
                            <Skeleton className="h-[17px] sm:h-[20px] w-24" />
                            <Skeleton className="h-[22px] sm:h-[30px] w-32" />
                            <Skeleton className="h-[17px] sm:h-[20px] w-20" />
                        </div>
                    </Button>

                    {/* "Drop to:" + Ride details pill */}
                    <div className="flex w-full justify-between items-center gap-2.5 sm:gap-3">
                        <div className="flex flex-col gap-1 text-left">
                            <Skeleton className="h-3 w-12" />
                            <Skeleton className="h-[21px] sm:h-[27px] w-28" />
                        </div>
                        <Button prop={{ variant: "input", bg: "var(--background-muted)", rounded: "999px" }} className="pointer-events-none px-3 shrink-0">
                            <Skeleton className="h-4 w-16" />
                        </Button>
                    </div>

                    {/* notices */}
                    <div className="w-full flex flex-col gap-2 mt-4">
                        <Skeleton rounded="rounded-full" className="h-[35px] sm:h-[37px] w-[232px] sm:w-[267px]" />
                    </div>

                    {/* Message + Call driver */}
                    <div className="flex justify-between w-full gap-2 items-center mt-1">
                        <Button prop={{ variant: "input", width: "100%", bg: "var(--background-muted)" }} className="flex-1 pointer-events-none">
                            <Skeleton className="h-6 w-24" />
                        </Button>
                        <Button prop={{ variant: "input", width: "100%", bg: "var(--background-muted)" }} className="flex-1 pointer-events-none">
                            <Skeleton className="h-6 w-20" />
                        </Button>
                    </div>
                </div>
            </div>
        </BackgroundPanel>
    );
};

export default TrackingSkeleton;
