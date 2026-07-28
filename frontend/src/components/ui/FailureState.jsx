import ErrorMark from "../illustrations/ErrorMark";
import Button from "./Button";
import { toneOf, alignOf, SecondaryButton } from "./stateChrome";

// Something broke and the content could not be shown. Distinct from EmptyState
// (nothing to show, nothing wrong) and from RefreshNotice (stale content IS on
// screen). Keeps ErrorMark, already this project's error badge in ErrorPanel,
// and adds the thing every one of these surfaces was missing: a way to try
// again without reloading the page.
//
// The copy contract: `title` says what failed in the user's terms, `detail`
// carries the server's own words underneath it. No apology, and never just
// "Something went wrong" on its own, which tells a rider nothing they can act on.

/**
 * @param {object} props
 * @param {"dark"|"light"} [props.tone]
 * @param {string} props.title                what failed, in the rider's terms
 * @param {string} [props.detail]             the server's message, verbatim
 * @param {"center"|"sm-left"} [props.align]  sm-left follows the booking-flow column
 * @param {() => void} [props.onRetry]        re-runs the same request
 * @param {boolean} [props.retrying]          disables the button and swaps its label
 * @param {string} [props.retryLabel]
 * @param {{label: string, onClick: () => void}} [props.secondaryAction]
 * @param {number} [props.size]               ErrorMark size; drop it on tight surfaces
 * @param {string} [props.className]
 */
const FailureState = ({
    tone = "dark",
    align = "center",
    title,
    detail,
    onRetry,
    retrying = false,
    retryLabel = "Try again",
    secondaryAction,
    // 108, not ErrorPanel's 140: that badge owns a full-screen sheet, while this
    // one sits inline in a list, where 140 of solid red swamped the copy beside it.
    size = 108,
    className = "",
}) => {
    const t = toneOf(tone);
    const a = alignOf(align);

    return (
        <div
            role="status"
            aria-live="polite"
            className={`${className} ${a.box} w-full min-h-full flex flex-col justify-center py-8`}
        >
            {/* The Lottie canvas carries a lot of its own padding, so the top is
                pulled back in tight while the bottom is left open: the badge and
                the sentence it introduces were crowding each other. */}
            <ErrorMark className="-mt-4 sm:-mt-5 mb-2 sm:mb-3" size={size} />

            <div className="flex flex-col gap-0.5 sm:gap-1 max-w-[32ch] sm:max-w-[42ch]">
                <h3 className={`${t.title} text-xl sm:text-2xl font-semibold leading-tight`}>{title}</h3>
                {detail && <p className={`${t.body} text-sm sm:text-base leading-relaxed`}>{detail}</p>}
            </div>

            {(onRetry || secondaryAction) && (
                <div className={`${a.actions} flex flex-col gap-2 mt-3`}>
                    {onRetry && (
                        <Button
                            onClick={onRetry}
                            className="my-0!"
                            prop={{ variant: "", width: "240px", disabled: retrying }}
                        >
                            <span className="text-base">{retrying ? "Retrying…" : retryLabel}</span>
                        </Button>
                    )}
                    {secondaryAction && (
                        <SecondaryButton tone={tone} label={secondaryAction.label} onClick={secondaryAction.onClick} />
                    )}
                </div>
            )}
        </div>
    );
};

export default FailureState;
