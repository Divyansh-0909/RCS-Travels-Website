import Button from "./ui/Button";
import BackgroundPanel from "./ui/BackgroundPanel";
import Skeleton from "./ui/Skeleton";

// First-load placeholder for the tracking page. Clones the active-ride panel
// structure 1:1 — same wrappers, widths, gaps, and the real Button component —
// so the real content drops into the exact same footprint with no layout shift.
const TrackingSkeleton = () => {
    return (
        <BackgroundPanel className={"py-6 justify-center items-center flex sm:text-left sm:px-[9%] md:px-[5%] xl:px-[13%]"}>
            <div className="relative flex flex-col justify-center items-center sm:items-start w-full gap-6 sm:gap-12">
                {/* heading + subheading */}
                <div className="flex flex-col justify-center items-center sm:items-start gap-1 sm:gap-2 w-[290px]">
                    <Skeleton className="h-8 w-[80%]" />
                    <Skeleton className="h-6 w-[55%]" />
                </div>

                <div className="flex flex-col justify-center items-start w-[290px] gap-3 sm:gap-4 ">
                    <div className="w-full flex flex-col gap-1 sm:gap-2">
                        <div className="flex flex-col gap-1 sm:gap-2 justify-center items-start w-full">
                            {/* desktop-only Share button */}
                            <Button prop={{ variant: "input", bg: "var(--background-muted)", border: false }} className="px-3 sm:block hidden pointer-events-none">
                                <Skeleton className="h-4 w-12" />
                            </Button>
                            {/* "Drop to:" text + Ride details button */}
                            <div className="flex w-full justify-between items-center">
                                <div className="flex flex-col gap-1 text-left">
                                    <Skeleton className="h-3 w-12" />
                                    <Skeleton className="h-3.5 w-28" />
                                </div>
                                <Button prop={{ variant: "input", width: "110px", bg: "var(--background-muted)", border: false }} className="pointer-events-none">
                                    <Skeleton className="h-4 w-16" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* driver card */}
                    <Button
                        className="flex justify-between items-center w-full pointer-events-none"
                        prop={{ variant: "input", bg: "var(--background-muted)", border: false, innerClassName: "flex justify-between items-center w-full px-4 py-3" }}
                    >
                        <div className="flex flex-col text-left items-left gap-2 sm:gap-3">
                            <Skeleton rounded="rounded-full" className="w-17 h-17" />
                        </div>
                        <div className="flex flex-col items-end justify-center gap-2">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-5 w-28" />
                            <Skeleton className="h-4 w-20" />
                        </div>
                    </Button>

                    {/* message + call buttons */}
                    <div className="flex justify-between w-[290px] items-center">
                        <Button prop={{ variant: "input", width: "140px", bg: "var(--background-muted)", border: false }} className="pointer-events-none">
                            <Skeleton className="h-6 w-24" />
                        </Button>
                        <Button prop={{ variant: "input", width: "140px", bg: "var(--background-muted)", border: false }} className="pointer-events-none">
                            <Skeleton className="h-6 w-20" />
                        </Button>
                    </div>
                </div>
            </div>
        </BackgroundPanel>
    );
};

export default TrackingSkeleton;
