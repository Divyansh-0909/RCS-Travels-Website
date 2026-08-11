/* CrossOutline — self-contained animated cross/error mark.
   Draws the two cross strokes. No external deps / network. */

// Geometry for viewBox 0 0 52 52
const LINE_LENGTH = 40; // length of each cross stroke (~√((28²)+(28²)))

const CrossOutline = ({
    size = 72,
    color = "#FFFFFF",   // white
    strokeWidth = 6,
    loop = false,
    /* Held back this long (ms) before the pop and the strokes all start, for
       callers that need something else to settle first. The second stroke keeps
       its 0.2s stagger behind the first. */
    delay = 0,
    className = "",
    style,
}) => {
    const iterations = loop ? "infinite" : 1;
    const wait = `${delay}ms`;
    const waitSecond = `${delay + 200}ms`;

    return (
        <span
            className={className}
            style={{ display: "inline-flex", lineHeight: 0, ...style }}
            role="img"
            aria-label="Error"
        >
            <style>{`
                @keyframes cro-line { to { stroke-dashoffset: 0; } }
                @keyframes cro-pop {
                    0%   { transform: scale(0.9); }
                    60%  { transform: scale(1.04); }
                    100% { transform: scale(1); }
                }
                .cro-line-1 {
                    stroke-dasharray: ${LINE_LENGTH};
                    stroke-dashoffset: ${LINE_LENGTH};
                    animation: cro-line 0.25s cubic-bezier(0.65, 0, 0.35, 1) ${wait} forwards ${iterations};
                }
                .cro-line-2 {
                    stroke-dasharray: ${LINE_LENGTH};
                    stroke-dashoffset: ${LINE_LENGTH};
                    animation: cro-line 0.25s cubic-bezier(0.65, 0, 0.35, 1) ${waitSecond} forwards ${iterations};
                }
                .cro-svg {
                    transform-origin: center;
                    animation: cro-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${wait} both ${iterations};
                }
                @media (prefers-reduced-motion: reduce) {
                    .cro-line-1, .cro-line-2 { animation: none; stroke-dashoffset: 0; }
                    .cro-svg { animation: none; }
                }
            `}</style>

            <svg
                className="cro-svg"
                width={size}
                height={size}
                viewBox="0 0 52 52"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    className="cro-line-1"
                    d="M14 14 L38 38"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                />
                <path
                    className="cro-line-2"
                    d="M38 14 L14 38"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                />
            </svg>
        </span>
    );
};

export default CrossOutline;
