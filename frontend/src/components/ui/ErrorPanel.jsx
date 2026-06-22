import errorIcon from "../../assets/cross.webp";
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
                <img className="-my-8 w-[150px]" src={errorIcon} alt="icon" />
                <h2 className="w-[70%]"> {lastError} </h2>
                <p> Please try again or reach out to<br /> us if this keeps happening. </p>
                <Button
                    onClick={() => navigate(prop.setError(null))}
                    prop={{
                        type: "submit",
                    }}
                    className="mt-4 scale-[1] sm:scale-[1.1] "
                >
                    Okay
                </Button>
            </BackgroundPanel>
            <div className={`${prop.error ? "block" : "hidden"} absolute z-2 sm:z-1 bottom-0 bg-black/40 w-[100vw] h-[100vh]`} />
        </>

    )
}

export default ErrorPanel