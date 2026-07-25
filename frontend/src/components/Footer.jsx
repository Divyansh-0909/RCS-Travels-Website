import { useViewNavigate } from "../hooks/useViewNavigate";
import { callSupport, emailSupport, openSupportWhatsApp } from "../constants/support";

const linkClass = "text-left text-[var(--text)]/90 hover:text-[var(--text)] active:opacity-70 cursor-pointer transition-colors duration-300 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current";

const Footer = () => {
    const navigate = useViewNavigate();

    const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

    const columns = [
        {
            heading: "Pages",
            links: [
                { label: "Book a ride", onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }) },
                { label: "How it works", onClick: () => scrollTo("how-it-works") },
                { label: "Services", onClick: () => scrollTo("services") },
                { label: "Why us", onClick: () => scrollTo("why-us") },
                { label: "About", onClick: () => scrollTo("about") },
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
                            <h4 className="font-semibold">{col.heading}</h4>
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
                <p className="text-[var(--text-muted)]/50 leading-relaxed text-center">
                    © copyright RCS Travels {new Date().getFullYear()}. All rights reserved.
                </p>
            </div>
        </footer>
    );
};

export default Footer;
