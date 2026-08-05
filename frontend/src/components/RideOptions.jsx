import { useEffect, useRef } from "react";
import Icon from "@mdi/react";
import { mdiChevronRight, mdiClose } from "@mdi/js";
import BackgroundPanel from "./ui/BackgroundPanel";
import { useExitAnim } from "../hooks/useExitAnim";

// The three settings that re-price a ride — sharing, roof carrier, safer route.
//
// They used to sit permanently above the Book button as two or three narrow
// columns, which is what forced the type down a step and the switches under
// their own labels: a 360px phone gives each column ~90px once the dividers are
// paid for. One line opens them now, and the options get a surface wide enough
// to say what each one costs. The line itself carries the state, so nothing a
// rider has already turned on is hidden behind the tap.
//
// Two shells over one list: a popover above the trigger from sm up, a bottom
// sheet on phones. The rows are identical in both — see OptionsBody.

// The switch: a white pill riding over a coloured bar.
//
// The 0.9 phone scale is gone with the columns that needed it — every row here
// is full-width, so the switch is painted at its layout size and no caller has
// to reserve a different box than the one it draws into.
export const SliderToggle = ({ on, onClick, className = "" }) => (
    <div
        onClick={onClick}
        // Presentational when the row around it is the switch — two nested
        // elements with role="switch" is one control too many to a screen
        // reader, and the row is the bigger target of the two.
        {...(onClick ? { role: "switch", "aria-checked": on } : { "aria-hidden": "true" })}
        className={`relative w-[50px] h-[22px] flex items-center justify-center ${className}`}
    >
        <div className={`absolute inset-0 ${on ? "-left-2" : "left-5"} border-b-2 border-[rgba(255,255,255,0.05)] bg-white scale-[1] group-hover:scale-[1.1] cursor-pointer [transition:all_300ms,transform_300ms_150ms] bg-[linear-gradient(to_top,transparent_50%,rgba(146,146,139,0.25)_100%)] shadow-[inset_0px_2px_2px_1px_rgba(255,255,255,0.4),0px_0px_10px_rgba(0,0,0,0.6)] w-[40px] rounded-full h-[inherit]`} />
        <div className={`${on ? "bg-green-500" : "bg-gray-500"} rounded-full w-[inherit] h-[14px]`} />
    </div>
);

// One row: what the option is, what it does to the fare, and the switch. The
// whole row is the control rather than just the 50px pill beside it, which is
// the difference between a thumb-sized target and an aimed one.
//
// `disabled` is for an option this trip cannot have — the safer route on a
// destination with no alternative. It stays on the list rather than
// disappearing from it: a row that says why it is off answers the question,
// where a two-row panel on some trips and a three-row panel on others only
// raises it.
const OptionRow = ({ label, note, on, onToggle, disabled = false }) => (
    <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={onToggle}
        className={`group w-full flex items-center justify-between gap-4 py-3.5 text-left rounded-lg outline-none transition-opacity duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70 ${disabled ? "opacity-45 cursor-not-allowed" : "cursor-pointer active:opacity-80"}`}
    >
        <span className="min-w-0 flex flex-col gap-0.5">
            <span className="text-base sm:text-lg font-medium leading-tight text-[var(--text)]">{label}</span>
            <span className="text-sm sm:text-base leading-snug text-[var(--text-muted)]">{note}</span>
        </span>
        <SliderToggle on={on} className="shrink-0" />
    </button>
);

// Everything inside the popover and the sheet, so the two shells can't drift.
const OptionsBody = ({ options, onClose, titleId }) => (
    <>
        {/* text-left explicitly: the vehicle page centres its text, and the
            sheet is a child of that page — inherited, the title and its line
            underneath each centre on their own width and stop agreeing with
            each other or with the rows below. */}
        <div className="flex items-start justify-between gap-4 text-left">
            <div className="flex flex-col gap-0.5">
                <h3 id={titleId} className="text-lg sm:text-xl font-medium leading-tight text-[var(--text)]">Ride options</h3>
                {/* Says why these three are grouped at all: they are the
                    settings the cards behind this get re-priced by. */}
                <p className="text-sm sm:text-base leading-snug text-[var(--text-muted)]">Each one changes your fare.</p>
            </div>
            <button
                type="button"
                onClick={onClose}
                aria-label="Close ride options"
                className="shrink-0 cursor-pointer rounded-full p-1 opacity-60 transition-opacity duration-300 hover:opacity-100 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70"
            >
                <Icon path={mdiClose} size={0.9} aria-hidden="true" />
            </button>
        </div>

        {/* Hairlines between rows, not around each one: this is one list of
            three settings, and three bordered cards would read as three
            unrelated controls that happen to be stacked. */}
        <div className="flex flex-col divide-y divide-[var(--foreground)]/10">
            {options.map(option => (
                <OptionRow
                    key={option.key}
                    label={option.label}
                    note={option.note}
                    on={option.on}
                    onToggle={option.onToggle}
                    disabled={option.disabled}
                />
            ))}
        </div>
    </>
);

// The line that stands in for the three switches. Its second line is the state,
// not a prompt: with nothing on it names what is inside (the only reason to open
// it), and with something on it names what is set — so a rider who has already
// chosen sharing never has to open the panel to check.
export const RideOptionsTrigger = ({ options, open, onClick, buttonRef }) => {
    const active = options.filter(option => option.on).map(option => option.short);
    const summary = active.length
        ? `On: ${active.join(", ")}`
        // Only what this trip can actually have: an option that is disabled
        // inside the panel would be an offer here, where there is no room to
        // say it isn't one.
        : options.filter(option => !option.disabled).map(option => option.short).join(", ");

    return (
        <button
            ref={buttonRef}
            type="button"
            onClick={onClick}
            aria-expanded={open}
            aria-haspopup="dialog"
            className="group w-full flex items-center justify-between gap-3 py-1 text-left cursor-pointer rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70"
        >
            <span className="min-w-0 flex flex-col gap-0.5">
                <span className="text-sm sm:text-base font-medium leading-tight text-[var(--text)]">Ride options</span>
                {/* truncate rather than wrap: this sits directly above the Book
                    button on phones, where a second line would push the CTA
                    down by a row every time an option is switched on. */}
                <span className="truncate text-xs sm:text-sm leading-snug text-[var(--text-muted)] transition-colors duration-300 group-hover:text-[var(--text)]">
                    {summary}
                </span>
            </span>
            <Icon
                path={mdiChevronRight}
                className="w-5 h-5 shrink-0 text-[var(--text-muted)] transition-transform duration-300 group-hover:translate-x-0.5"
                aria-hidden="true"
            />
        </button>
    );
};

// sm and up: the panel rises out of the trigger and covers the fare cards it
// re-prices, which is the honest place for it — the cards are what changes when
// a switch moves. Deliberately not a scrim-backed modal: it is three switches,
// and dimming the whole screen for them would read as a bigger decision than it
// is. Clicking anywhere else, or Escape, closes it.
export const RideOptionsPopover = ({ options, open, onClose, anchorRef }) => {
    // 300ms = the length of animate-datetime-out.
    const { mounted, closing } = useExitAnim(open, 300);
    const panelRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (event) => { if (event.key === "Escape") onClose(); };
        // pointerdown, not click: a click that starts inside the panel and ends
        // outside it (a drag off a switch) is not a dismissal.
        const onPointerDown = (event) => {
            if (panelRef.current?.contains(event.target)) return;
            // The trigger toggles on its own click — closing here as well would
            // close and reopen in the same gesture.
            if (anchorRef?.current?.contains(event.target)) return;
            onClose();
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("pointerdown", onPointerDown);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("pointerdown", onPointerDown);
        };
    }, [open, onClose, anchorRef]);

    // Keyed off `mounted`, not `open`: the panel isn't in the DOM on the render
    // that opens it — useExitAnim mounts it a commit later.
    useEffect(() => { if (mounted) panelRef.current?.focus(); }, [mounted]);

    if (!mounted) return null;

    return (
        <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-labelledby="ride-options-title"
            // The app's floating surface, borrowed from Button's dropdown
            // variant: --background-primary over the --background-muted cards,
            // so the panel separates from what it covers instead of dissolving
            // into it. Deeper shadow than a dropdown's — this one floats over
            // four cards rather than sitting on the page.
            className={`absolute bottom-full inset-x-0 z-30 mb-3 flex flex-col gap-3 rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background-primary)] px-5 py-4 outline-none shadow-[0_24px_60px_rgba(0,0,0,0.65)] ${closing ? "animate-datetime-out" : "animate-datetime"} motion-reduce:animate-none`}
        >
            <OptionsBody options={options} onClose={onClose} titleId="ride-options-title" />
        </div>
    );
};

// Phones: a sheet of its own over the fare sheet, dimmed behind so it is clear
// which surface the taps belong to. Content-sized and dismissible — there is no
// half-open state worth resting at for three rows, so it is either open or
// thrown away (see useBottomSheet's `dismissible`).
export const RideOptionsSheet = ({ options, open, onClose }) => {
    // Matches the sheet's spring exit, which takes longer to settle than the
    // panel wipe BackgroundPanel uses elsewhere.
    const { mounted, closing } = useExitAnim(open, 420);
    if (!mounted) return null;

    return (
        <>
            {/* Above the Book bar (z-2) as well as the fare sheet (z-1): with
                the options open, the CTA underneath is not the next thing to
                press. */}
            <div
                onClick={onClose}
                className={`absolute inset-0 z-5 bg-black/50 ${closing ? "animate-panel-fade-out" : "animate-backdrop"} motion-reduce:animate-none`}
            />
            <BackgroundPanel
                sheet
                dismissible
                onDismiss={onClose}
                initialSnap="expanded"
                duration={420}
                show={open}
                // Re-measure when a note changes length — the carrier's line
                // becomes "Free on this route." on the routes that waive it,
                // and the sheet is sized to its content.
                contentKey={options.map(option => option.note).join("|")}
                // pt-1, not the pt-6 the fare sheet carries: the grabber's own
                // -mt-4 is what eats that padding there, and it can't here.
                // This sheet has no [data-sheet-scroll] child, so the sheet
                // itself becomes the scroller — and content pulled above a
                // scroll container's start edge is unreachable, so the negative
                // margin is simply clipped. Measured: the handle lands at
                // padding + its own py-2, which at pt-1 is 12px under the top
                // edge, with gap-4 then setting the header clear of it.
                className="z-6 flex flex-col gap-4 px-[7vw] pt-1 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-left"
            >
                <OptionsBody options={options} onClose={onClose} titleId="ride-options-sheet-title" />
            </BackgroundPanel>
        </>
    );
};
