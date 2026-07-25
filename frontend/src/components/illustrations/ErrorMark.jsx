/* ErrorMark — animated error badge (Lottie).
   Red circle with an exclamation mark; the error counterpart to SuccessCheck. */

import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import errorAnimation from "../../assets/Error.json";

// Stringify once at module load — inline data avoids a runtime JSON fetch delay.
const ERROR_DATA = JSON.stringify(errorAnimation);

const ErrorMark = ({
    size = 150,
    loop = false,
    autoplay = true,
    speed = 1.4,
    className = "",
    style,
}) => {
    return (
        <div
            className={className}
            style={{ width: size, height: size, ...style }}
            role="img"
            aria-label="Error"
        >
            <DotLottieReact
                data={ERROR_DATA}
                loop={loop}
                autoplay={autoplay}
                speed={speed}
                style={{ width: "100%", height: "100%" }}
            />
        </div>
    );
};

export default ErrorMark;
