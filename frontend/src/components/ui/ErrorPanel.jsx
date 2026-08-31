import ErrorMark from "../illustrations/ErrorMark";
import Button from "./Button";
import { useViewNavigate } from "../../hooks/useViewNavigate";
import BackgroundPanel from "./BackgroundPanel";
import { useState, useEffect } from "react";

const ErrorPanel = ({ prop }) => {
    const navigate = useViewNavigate()

    // Keep the last message so it stays visible while the panel animates out.
    const [lastError, setLastError] = useState(prop.error)
    useEffect(() => {
        if (prop.error) setLastError(prop.error)
    }, [prop.error])

    return (
        <>
            <BackgroundPanel show={!!prop.error} className={` z-4 sm:z-3 gap-2 sm:gap-3 py-6 text-center flex flex-col justify-center items-center`}>
                <ErrorMark className="-my-8" size={140} />
                <div className="flex w-[min(86vw,100%)] min-w-0 flex-col items-center gap-1 sm:w-[377px]">
                    <h2 className="w-full min-w-0 [overflow-wrap:anywhere]"> {lastError} </h2>
                    <p className="w-full min-w-0"> Please try again or reach out to us if this keeps happening. </p>
                </div>
                <Button
                    onClick={() => {
                        if (prop.onOkay) {
                            prop.setError(null)
                            prop.onOkay()
                        } else {
                            navigate(prop.setError(null))
                        }
                    }}
                    prop={{
                        type: "submit",
                    }}
                    className="mt-4 scale-[1] sm:scale-[1.1] "
                >
                    Okay
                </Button>
            </BackgroundPanel>
            <div className={`${prop.error ? "block" : "hidden"} absolute z-2 sm:z-1 bottom-0 bg-black/40 w-[100vw] h-[100dvh]`} />
        </>

    )
}

export default ErrorPanel
