import { useLocation } from "react-router-dom";
import { useViewNavigate } from "../hooks/useViewNavigate";
import { scrollToSection, scrollToTop } from "../hooks/useSmoothScroll";
import { callSupport, emailSupport, openSupportWhatsApp } from "../constants/support";

const linkClass = "text-left text-[var(--text)]/90 hover:text-[var(--text)] active:opacity-70 cursor-pointer transition-colors duration-300 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current";

const Footer = () => {
    const navigate = useViewNavigate();
    // The footer also sits on routes that don't have the home page's sections
    // (Outstation). Scrolling to an id that isn't in the document is a dead
    // link, so off the home route these navigate there and let App's scrollTo
    // effect finish the job.
    const onHome = useLocation().pathname === "/";
    const goToSection = (id) => () => {
        if (onHome) scrollToSection(id);
        else navigate("/", { state: { scrollTo: id } });
    };

    const columns = [
        {
            heading: "Pages",
            links: [
                { label: "Book a ride", onClick: () => (onHome ? scrollToTop() : navigate("/")) },
                { label: "How it works", onClick: goToSection("how-it-works") },
                { label: "Services", onClick: goToSection("services") },
                // A route, not a section — the only entry here that leaves the
                // page, because outstation is the one product with nowhere on
                // the home page to scroll to.
                { label: "Outstation", onClick: () => navigate("/outstation") },
                { label: "Why us", onClick: goToSection("why-us") },
                { label: "About", onClick: goToSection("about") },
            ],
        },
        {
            heading: "Support",
            links: [
                { label: "Call Us", onClick: callSupport },
                { label: "WhatsApp Us", onClick: () => openSupportWhatsApp() },
                { label: "Email Us", onClick: emailSupport },
                { label: "Help", onClick: () => navigate("/help") },
            ],
        },
        {
            heading: "Legal",
            links: [
                { label: "Terms of Service", onClick: () => navigate("/terms") },
                { label: "Privacy Policy", onClick: () => navigate("/privacy") },
                { label: "Refund & Cancellation", onClick: () => navigate("/refunds") },
                { label: "Grievance Redressal", onClick: () => navigate("/grievance") },
            ],
        },
        {
            heading: "Register",
            links: [
                { label: "Sign Up", onClick: () => navigate("/signup") },
                { label: "Login", onClick: () => navigate("/login") },
                { label: "Manage Account", onClick: () => navigate("/manage-account") },
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
                            <h4 className="text-base sm:text-lg font-semibold">{col.heading}</h4>
                            <ul className="flex flex-col gap-5">
                                {col.links.map((link) => (
                                    <li key={link.label}>
                                        {link.href
                                            ? <a
                                                href={link.href}
                                                {...(link.href.startsWith("http") && { target: "_blank", rel: "noreferrer" })}
                                                className={linkClass}
                                            >{link.label}</a>
                                            : <button type="button" onClick={link.onClick} className={linkClass}>{link.label}</button>
                                        }
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Copyright */}
                <p className="text-sm sm:text-base text-[var(--text-muted)]/50 leading-relaxed text-center">
                    © copyright RCS Travels {new Date().getFullYear()}. All rights reserved.
                </p>
            </div>
        </footer>
    );
};

export default Footer;
