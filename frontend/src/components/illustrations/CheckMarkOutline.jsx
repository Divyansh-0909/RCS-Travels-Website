/* CheckMarkOutline — self-contained animated success checkmark.
   Draws the check stroke. No external deps / network. */

// Geometry for viewBox 0 0 52 52
const CHECK_LENGTH = 48;   // length of the check path

const CheckMarkOutline = ({
    size = 72,
    color = "#FFFFFF",   // white
    strokeWidth = 6,
    loop = false,
    className = "",
    style,
}) => {
    const iterations = loop ? "infinite" : 1;

    return (
        <span
            className={className}
            style={{ display: "inline-flex", lineHeight: 0, ...style }}
            role="img"
            aria-label="Success"
        >
            <style>{`
                @keyframes cmo-check { to { stroke-dashoffset: 0; } }
                @keyframes cmo-pop {
                    0%   { transform: scale(0.9); }
                    60%  { transform: scale(1.04); }
                    100% { transform: scale(1); }
                }
                .cmo-check {
                    stroke-dasharray: ${CHECK_LENGTH};
                    stroke-dashoffset: ${CHECK_LENGTH};
                    animation: cmo-check 0.35s cubic-bezier(0.65, 0, 0.35, 1) 0s forwards ${iterations};
                }
                .cmo-svg {
                    transform-origin: center;
                    animation: cmo-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0s both ${iterations};
                }
                @media (prefers-reduced-motion: reduce) {
                    .cmo-check { animation: none; stroke-dashoffset: 0; }
                    .cmo-svg { animation: none; }
                }
            `}</style>

            <svg
                className="cmo-svg"
                width={size}
                height={size}
                viewBox="0 0 52 52"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    className="cmo-check"
                    d="M12 28 L23 39 L40 15"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </span>
    );
};

export default CheckMarkOutline;
