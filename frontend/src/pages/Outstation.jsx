import Icon from "@mdi/react";
import { mdiPhone, mdiWhatsapp, mdiClose, mdiArrowRight } from "@mdi/js";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import NavBar from "../components/ui/NavBar";
import Footer from "../components/Footer";
import { useViewNavigate } from "../hooks/useViewNavigate";
import { useSmoothScroll } from "../hooks/useSmoothScroll";
import { useExitAnim } from "../hooks/useExitAnim";
import { callSupport, openSupportWhatsApp, supportPhoneDisplay } from "../constants/support";

// Same rail as the landing sections (HowItWorks / Services / WhyUs) so this
// page sits on the site's column. The type scale is this page's own — longer
// prose than a landing section, set a step smaller.
const RAIL = "w-[82%] md:w-[90%] xl:w-[74%]";
const SECTION_TITLE = "font-bold text-3xl sm:text-5xl";
// The numbered checklist rows, at regular weight: they run the full width of
// the column with a rule under each, which separates them well enough on its
// own. Semibold on top of that read as five competing headlines.
const SUBHEAD = "text-3xl sm:text-4xl font-normal";
// A step under SUBHEAD, and it keeps the weight — a panel heading sits in a box
// with its body text directly beneath, so it has that box to hold together.
const PANEL_TITLE = "text-2xl sm:text-3xl font-semibold";
const BODY = "text-lg sm:text-xl leading-[1.75]";

const summary = [
    "Priced by the day",
    "Return already included",
    "Booked through Raju",
];

const sections = [
    {
        heading: "The return is already in it",
        body: "The package covers the whole trip, however many days you're there and back. There's no separate return to book and no round-trip discount to work out.",
    },
    {
        heading: "Plains and hills are priced apart",
        body: "The same distance costs more when it climbs. Hill routes are slower and harder on the vehicle, so they carry their own rate. We'll tell you which one your route falls under.",
    },
    {
        heading: "The vehicle matters more than it does in the city",
        body: "Hatchback, sedan and SUV are all available. On a long trip the extra room is for luggage and for the hours, not just for the seats.",
    },
    {
        heading: "Booked ahead, not on the spot",
        body: "A driver is committed hours before you leave, not minutes. Give us a day's notice where you can, and more around festivals and long weekends.",
    },
];

const confirmed = [
    "The rate per day for your vehicle and your route",
    "How much distance each day covers, and the rate past it",
    "How much distance is priced as plains or as hills",
    "Anything payable on the road, and who settles it",
    "The vehicle, the driver and when they reach you",
];

// The two ways to reach us, used twice: as the closing band's list, and inside
// the panel the header's Book a trip button opens. `bookLabel` is the panel's
// wording — by then you've asked to book, so the row names who picks up.
const contacts = [
    { label: "Call us", bookLabel: "Call Raju", icon: mdiPhone, onClick: callSupport },
    {
        label: "WhatsApp us",
        bookLabel: "WhatsApp Raju",
        icon: mdiWhatsapp,
        onClick: () => openSupportWhatsApp("Hi, I'd like to book an outstation trip."),
    },
];

const ContactButton = ({ label, icon, onClick, surface }) => (
    <button
        type="button"
        onClick={onClick}
        className={`w-full cursor-pointer rounded-xl px-5 py-4 flex items-center gap-4 text-left transition-colors duration-300 active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)] ${surface}`}
    >
        <Icon path={icon} size={1} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0">
            <span className="block text-base">{label}</span>
            <span className="block text-sm text-[var(--text-muted)]">{supportPhoneDisplay()}</span>
        </span>
    </button>
);

// The booking panel. Portalled to <body> rather than rendered in place:
// ScrollSmoother transforms #smooth-content, and a transformed ancestor
// re-anchors position:fixed to itself, so an overlay inside it would scroll
// with the page instead of covering the viewport.
const BookPanel = ({ open, onClose }) => {
    // 300ms = the length of animate-datetime-out, the slower of the two exits.
    const { mounted, closing } = useExitAnim(open, 300);
    const panelRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    // Lock the page behind the panel. Cleanup covers unmount too, so leaving the
    // route with it open can't leave the body frozen.
    useEffect(() => {
        if (!open) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = previous; };
    }, [open]);

    useEffect(() => { if (mounted) panelRef.current?.focus(); }, [mounted]);

    if (!mounted) return null;

    return createPortal(
        <>
            <div
                onClick={onClose}
                className={`fixed inset-0 z-110 bg-black/50 backdrop-blur-[2px] ${closing ? "animate-panel-fade-out" : "animate-backdrop"} motion-reduce:animate-none`}
            />
            <div className="fixed inset-0 z-120 flex items-center justify-center p-6 pointer-events-none">
                <div
                    ref={panelRef}
                    tabIndex={-1}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="book-panel-title"
                    className={`pointer-events-auto w-full max-w-md outline-none rounded-3xl border border-[var(--foreground)]/15 bg-[var(--background-primary)] text-[var(--text)] p-6 sm:p-8 flex flex-col gap-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] ${closing ? "animate-datetime-out" : "animate-datetime"} motion-reduce:animate-none`}
                >
                    <div className="flex items-start justify-between gap-4">
                        <h2 id="book-panel-title" className="text-2xl font-semibold">Book an outstation trip</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="shrink-0 cursor-pointer rounded-full p-1 opacity-60 transition-opacity duration-300 hover:opacity-100 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]"
                        >
                            <Icon path={mdiClose} size={1} aria-hidden="true" />
                        </button>
                    </div>
                    <p className="text-base sm:text-lg leading-[1.6] text-[var(--text-muted)]">
                        Send us the destination, your dates and how many of you are travelling. You'll
                        get the full cost back before anything is confirmed.
                    </p>
                    <ul className="flex flex-col gap-3">
                        {contacts.map(({ bookLabel, icon, onClick }) => (
                            <li key={bookLabel}>
                                <ContactButton
                                    label={bookLabel}
                                    icon={icon}
                                    onClick={onClick}
                                    surface="bg-[var(--foreground)]/8 hover:bg-[var(--foreground)]/14"
                                />
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </>,
        document.body,
    );
};

const Outstation = () => {
    const navigate = useViewNavigate();
    const [booking, setBooking] = useState(false);
    // Focus goes back to the button that opened the panel, so closing doesn't
    // drop a keyboard user back at the top of the page.
    const bookButtonRef = useRef(null);
    const closeBooking = () => {
        setBooking(false);
        bookButtonRef.current?.focus();
    };
    // The other window-scrolling route besides "/". Same structure it uses: the
    // navbar stays outside #smooth-content, because ScrollSmoother transforms
    // the content and a transformed ancestor re-anchors position:fixed to
    // itself. The page background lives on #smooth-content rather than an
    // ancestor — the wrapper goes position:fixed, so anything wrapping it
    // collapses to no height and its background would never paint.
    useSmoothScroll();

    return (
        <>
            <div className="fixed inset-x-0 top-0 z-100 flex justify-center pointer-events-none">
                <NavBar invert hideExpanded className="pointer-events-auto" />
            </div>

            <div id="smooth-wrapper">
                <div id="smooth-content" className="min-h-[100dvh] bg-[var(--foreground)] text-[var(--text-foreground)]">

                    {/* Clear the destination-first navbar in its expanded state.
                        It now shares the flush-to-top position used on Home and
                        Booking; the hero keeps its own air in the gaps below. */}
                    <div className="flex flex-col items-center gap-15 pt-44 sm:gap-20 sm:pt-48">

                        <header className={`${RAIL} text-left flex flex-col items-start justify-center gap-6 sm:gap-8`}>
                            <h1 className="font-bold text-4xl sm:text-6xl max-w-[16ch]">Going further than a city ride?</h1>
                            {/* The pills read as a caption on the heading, so they sit
                                closer to the subhead than the header's own gap allows. */}
                            <div className="flex flex-col items-start gap-4">
                                <ul className="flex flex-wrap gap-2">
                                    {summary.map((item) => (
                                        <li key={item} className="rounded-full bg-[var(--foreground-muted)] px-4 py-2 text-sm sm:text-base text-[var(--background-primary)]/70">
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                                <h2 className="text-lg sm:text-2xl leading-[1.6] text-[var(--background-primary)]/60 max-w-[52ch]">
                                    Outstation trips leave the city and come back with you. They're priced by the
                                    day rather than by the route, so they're arranged with us directly instead of
                                    through the booking form.
                                </h2>
                            </div>
                            {/* The page's one action, so it carries its own weight: the
                                ask on top, what happens when you press it underneath,
                                and it keeps the panel's wording so the two read as one
                                step rather than two. */}
                            <button
                                ref={bookButtonRef}
                                type="button"
                                onClick={() => setBooking(true)}
                                className="group w-full sm:w-auto cursor-pointer rounded-2xl bg-primary text-[var(--text)] px-6 py-5 sm:px-8 flex items-center justify-between gap-8 text-left transition-opacity duration-300 hover:opacity-90 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--background-primary)]"
                            >
                                <span className="min-w-0">
                                    <span className="block text-lg sm:text-xl font-semibold">Book an outstation trip</span>
                                    <span className="block text-sm sm:text-base text-[var(--text)]/85">
                                        Call or WhatsApp Raju. You'll have the price before you confirm.
                                    </span>
                                </span>
                                <Icon
                                    path={mdiArrowRight}
                                    size={1.1}
                                    aria-hidden="true"
                                    className="shrink-0 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none"
                                />
                            </button>
                        </header>

                        {/* Full-bleed band, same device AboutUs uses on the landing page:
                    the one idea the rest of the page rests on, lifted out of the
                    white column so it can't be skimmed past. */}
                        <section className="w-full flex items-center justify-center bg-[var(--background-primary)] text-[var(--text)] py-12 sm:py-16">
                            <div className={`${RAIL} text-left flex flex-col items-start justify-center gap-8 sm:gap-12`}>
                                <h2 className={`${SECTION_TITLE} max-w-[20ch]`}>A day is the unit, not the kilometre</h2>
                                <div className="flex flex-col sm:flex-row gap-8 sm:gap-16">
                                    <p className={`flex-1 ${BODY} text-[var(--text-muted)]`}>
                                        City rides are priced route by route, you tell us where you're going and
                                        the fare is fixed before you book. An outstation trip is priced by the day
                                        instead: the vehicle and the driver are yours for it, and each day covers a
                                        set distance.
                                    </p>
                                    <p className={`flex-1 ${BODY} text-[var(--text-muted)]`}>
                                        Go past the 250KM per day limit and the extra is charged on top, at a rate you'll
                                        know before you leave. It's the difference between hiring a cab and hiring
                                        a car with someone to drive it.
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section className={`${RAIL} text-left flex flex-col items-start justify-center gap-8 sm:gap-12`}>
                            <h2 className={`${SECTION_TITLE} max-w-[18ch]`}>What to know before you book one</h2>
                            <ul className="w-full flex flex-wrap items-start justify-left gap-10">
                                {sections.map(({ heading, body }) => (
                                    <li
                                        key={heading}
                                        className="w-full lg:w-[calc(50%-1.25rem)] bg-[var(--foreground-muted)] rounded-xl p-6 sm:p-8 flex flex-col items-start justify-start gap-3"
                                    >
                                        <h3 className={PANEL_TITLE}>{heading}</h3>
                                        <p className={`${BODY} text-[var(--background-primary)]/65`}>{body}</p>
                                    </li>
                                ))}
                            </ul>
                        </section>

                        {/* What the call actually settles. Same numbered, dashed-rule
                    rows as WhyUs — it is one checklist, and cards would suggest
                    five separate things to chase rather than one conversation. */}
                        <section className={`${RAIL} text-left flex flex-col items-start justify-center gap-8 sm:gap-12`}>
                            <h2 className={`${SECTION_TITLE} max-w-[20ch]`}>What we'll settle with you</h2>
                            <ul className="w-full flex flex-col items-start justify-center gap-10">
                                {confirmed.map((item, index) => (
                                    <li key={item} className="w-full border-b-2 pb-10 flex flex-col items-start justify-center gap-0 border-dashed">
                                        <div className="flex h-full text-2xl sm:text-3xl gap-2 justify-start items-start font-normal">
                                            <h2 className="text-2xl h-full sm:text-3xl font-normal">0{index + 1}.</h2>
                                            <h2 className="text-2xl h-full sm:text-3xl font-normal">{item}</h2>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </section>

                        {/* Handover. The page exists to reach this, so it closes on the
                    blue band AboutUs uses — the ask on one side, the two ways to
                    make it on the other. */}
                        <section className="w-full flex items-center justify-center bg-primary-dark text-[var(--text)] py-12 sm:py-16">
                            <div className={`${RAIL} text-left flex flex-col items-start justify-center gap-8 sm:gap-12`}>
                                <h2 className={`${SECTION_TITLE} max-w-[20ch]`}>Tell us where you're headed</h2>
                                <div className="w-full flex flex-col sm:flex-row gap-8 sm:gap-16">
                                    <div className="flex-1 flex flex-col gap-4">
                                        <p className={`${BODY} text-[var(--text)]/80`}>
                                            Outstation trips are booked with us, not through the app. Send us the
                                            destination, your dates and how many of you are travelling, and you'll get
                                            the full cost back before anything is confirmed.
                                        </p>
                                        <p className="text-sm sm:text-base text-[var(--text)]/70">
                                            Travelling inside the city instead?{" "}
                                            <button
                                                type="button"
                                                onClick={() => navigate("/")}
                                                className="cursor-pointer rounded underline underline-offset-2 text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]"
                                            >
                                                Book that here
                                            </button>
                                            , with the fare fixed before you confirm.
                                        </p>
                                    </div>
                                    <ul className="flex-1 flex flex-col gap-3">
                                        {contacts.map(({ label, icon, onClick }) => (
                                            <li key={label} className="w-full">
                                                <ContactButton
                                                    label={label}
                                                    icon={icon}
                                                    onClick={onClick}
                                                    surface="bg-[var(--background-primary)] hover:bg-[var(--background)]"
                                                />
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </section>
                    </div>

                    <Footer />

                </div>
            </div>

            <BookPanel open={booking} onClose={closeBooking} />
        </>
    );
};

export default Outstation;
