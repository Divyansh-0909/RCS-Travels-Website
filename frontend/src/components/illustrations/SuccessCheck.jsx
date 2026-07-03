/* SuccessCheck — animated success checkmark (Lottie).
   Replaces the static tick.webp confirmation icon. */

import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import successAnimation from "../../assets/Success.json";

// Stringify once at module load — passing the data inline avoids a runtime
// fetch of the JSON, so the animation starts without a load delay.
const SUCCESS_DATA = JSON.stringify(successAnimation);

const SuccessCheck = ({
    size = 150,
    loop = false,
    autoplay = true,
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
                style={{ width: "100%", height: "100%" }}
            />
        </div>
    );
};

export default SuccessCheck;
