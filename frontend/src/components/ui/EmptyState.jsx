import Icon from "@mdi/react";
import { mdiMagnify } from "@mdi/js";
import Button from "./Button";
import { toneOf, alignOf, SecondaryButton } from "./stateChrome";

// The zero-content counterpart to Skeleton (loading) and FailureState (broken).
//
// Nothing here is an error, so it carries no error badge: the copy states what
// is missing and the action is the only thing with any weight. "Nothing here
// yet" needs no illustration to explain itself, so the default renders none.
// `glyph="search"` is the exception, where the mark says which kind of empty
// this is: a query that matched nothing rather than an account with no rides.

/**
 * @param {object} props
 * @param {"dark"|"light"} [props.tone]
 * @param {"none"|"search"} [props.glyph]  search = a query matched nothing
 * @param {"center"|"sm-left"} [props.align]  sm-left follows the booking-flow column
 * @param {string} props.title             what is (not) here, stated plainly
 * @param {string} [props.message]         one line of direction: what to do next
 * @param {{label: string, onClick: () => void}} [props.action]           primary way out
 * @param {{label: string, onClick: () => void}} [props.secondaryAction]  e.g. Clear filters
 * @param {string} [props.className]
 */
const EmptyState = ({
    tone = "dark",
    glyph = "none",
    align = "center",
    title,
    message,
    action,
    secondaryAction,
    className = "",
}) => {
    const t = toneOf(tone);
    const a = alignOf(align);

    // min-h-full + justify-center: these render into a flex-1 scroll container
    // on the account pages, where top-aligned content left the state stranded
    // against the toolbar with the rest of the panel empty below it.
    return (
        <div
            className={`${className} ${a.box} w-full min-h-full flex flex-col justify-center py-8`}
        >
            {glyph === "search" && (
                <div className={`${t.ring} ${t.glyph} flex items-center justify-center w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full border mb-4`}>
                    <Icon path={mdiMagnify} size={1.5} />
                </div>
            )}

            {/* 32ch on phones: at 42 the body ran the full 390px viewport, which
                is a wider measure than anything else in the app sets. */}
            <div className="flex flex-col gap-0.5 sm:gap-1 max-w-[32ch] sm:max-w-[42ch]">
                <h3 className={`${t.title} text-xl sm:text-2xl font-semibold leading-tight`}>{title}</h3>
                {message && <p className={`${t.body} text-sm sm:text-base leading-relaxed`}>{message}</p>}
            </div>

            {/* mt-3 with the buttons' own my-1 cancelled: the action used to sit
                a container gap + mt-2 + my-1 below the copy, which read as a
                detached block rather than the answer to it. */}
            {(action || secondaryAction) && (
                <div className={`${a.actions} flex flex-col gap-2 mt-3`}>
                    {action && (
                        <Button onClick={action.onClick} className="my-0!" prop={{ variant: "", width: "240px" }}>
                            <span className="text-base">{action.label}</span>
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

export default EmptyState;
