import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../i18nCopy";
import { useLocation } from "react-router-dom";
import { useViewNavigate } from "../hooks/useViewNavigate";
import { scrollToSection, scrollToTop } from "../hooks/useSmoothScroll";
import { callSupport, emailSupport, openSupportWhatsApp } from "../constants/support";
import { useWebsiteCopy } from "../hooks/useWebsiteCopy";

const linkClass = "text-left text-[var(--text)]/90 hover:text-[var(--text)] active:opacity-70 cursor-pointer transition-colors duration-300 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current";

const Footer = () => {
    useCopyLanguage();
    const tr = useWebsiteCopy();
    const navigate = useViewNavigate();
    // The footer also sits on routes that don't have the home page's sections
    // (Outstation). Scrolling to an id that isn't in the document is a dead
    // link, so off the home route these navigate there and let App's scrollTo
    // effect finish the job.
    const { pathname } = useLocation();
    const onHome = pathname === "/";
    const goToSection = (id) => () => {
        if (onHome) scrollToSection(id);
        else navigate("/", { state: { scrollTo: id } });
    };

    // A link to the top of a page: the route change lands there by itself
    // (PageMeta resets the scroll), but on the page it names it has to scroll.
    // This footer is on Outstation too, where that's the "Outstation" link.
    const goToTopOf = (path) => {
        if (pathname === path) scrollToTop();
        else navigate(path);
    };

    const columns = [
        {
            heading: "Pages",
            links: [
                { get "label"() { return dc("Book a ride"); }, onClick: () => goToTopOf("/") },
                { get "label"() { return dc("How it works"); }, onClick: goToSection("how-it-works") },
                { get "label"() { return dc("Services"); }, onClick: goToSection("services") },
                // A route, not a section — the only entry here that leaves the
                // page, because outstation is the one product with nowhere on
                // the home page to scroll to.
                { get "label"() { return dc("Outstation"); }, onClick: () => goToTopOf("/outstation") },
                { get "label"() { return dc("Why us"); }, onClick: goToSection("why-us") },
                { get "label"() { return dc("About"); }, onClick: goToSection("about") },
            ],
        },
        {
            heading: "Support",
            links: [
                { get "label"() { return dc("Call Us"); }, onClick: callSupport },
                { get "label"() { return dc("WhatsApp Us"); }, onClick: () => openSupportWhatsApp() },
                { get "label"() { return dc("Email Us"); }, onClick: emailSupport },
                { get "label"() { return dc("Help"); }, onClick: () => navigate("/help") },
            ],
        },
        {
            heading: "Legal",
            links: [
                { get "label"() { return dc("Terms of Service"); }, onClick: () => navigate("/terms") },
                { get "label"() { return dc("Privacy Policy"); }, onClick: () => navigate("/privacy") },
                { get "label"() { return dc("Refund & Cancellation"); }, onClick: () => navigate("/refunds") },
                { get "label"() { return dc("Grievance Redressal"); }, onClick: () => navigate("/grievance") },
            ],
        },
        {
            heading: "Register",
            links: [
                { get "label"() { return dc("Sign Up"); }, onClick: () => navigate("/signup") },
                { get "label"() { return dc("Login"); }, onClick: () => navigate("/login") },
                { get "label"() { return dc("Manage Account"); }, onClick: () => navigate("/manage-account") },
            ],
        },
    ];

    return (
        <footer className="bg-[var(--background-primary)] text-[var(--text)] pt-16 pb-6 sm:pb-4 flex justify-center">
            <div className="w-[82%] md:w-[90%] xl:w-[74%] flex flex-col items-center gap-6 ">

                {/* Brand */}
                <div
                    onClick={() => navigate("/")}
                    className="self-start flex items-center cursor-pointer w-fit opacity-[1] hover:opacity-[0.85] transition-opacity duration-300"
                >
                    <h3 className="text-2xl sm:text-3xl"><span className="font-semibold">RCS</span> travels</h3>
                </div>

                {/* Link columns */}
                <div className="w-full mt-6 sm:mt-8 grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-12 sm:gap-x-20">
                    {columns.map((col) => (
                        <div key={col.heading} className="flex flex-col gap-8">
                            <h4 className="break-words text-base sm:text-lg font-semibold">{tr(col.heading)}</h4>
                            <ul className="flex flex-col gap-5">
                                {col.links.map((link) => (
                                    <li key={link.label}>
                                        {link.href
                                            ? <a
                                                href={link.href}
                                                {...(link.href.startsWith("http") && { target: "_blank", rel: "noreferrer" })}
                                                className={linkClass}
                                            >{tr(link.label)}</a>
                                            : <button type="button" onClick={link.onClick} className={linkClass}>{tr(link.label)}</button>
                                        }
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Copyright */}
                <p className="text-sm sm:text-base text-[var(--text-muted)]/50 leading-relaxed text-center">{dc("© copyright RCS Travels") + " "}{new Date().getFullYear()}{dc(". All rights reserved.")}</p>
            </div>
        </footer>
    );
};

export default Footer;
