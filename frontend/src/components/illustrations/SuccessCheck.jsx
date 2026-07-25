/* SuccessCheck — animated success checkmark (Lottie).
   Replaces the static tick.webp confirmation icon. */

import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import successAnimation from "../../assets/Success.json";

// Stringify once at module load — inline data avoids a runtime JSON fetch delay.
const SUCCESS_DATA = JSON.stringify(successAnimation);

const SuccessCheck = ({
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
            aria-label="Success"
        >
            <DotLottieReact
                data={SUCCESS_DATA}
                loop={loop}
                autoplay={autoplay}
                speed={speed}
                style={{ width: "100%", height: "100%" }}
            />
        </div>
    );
};

export default SuccessCheck;
