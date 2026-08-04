import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@mdi/react';
import { mdiHome, mdiMenu } from '@mdi/js';
import { useViewNavigate } from "../../hooks/useViewNavigate";
import { useExitAnim } from "../../hooks/useExitAnim";


// Every panel these pages float over their content gets the same dim behind it
// as Outstation's booking panel: the page recedes instead of competing with the
// panel for attention, and there is somewhere obvious to click to get out.
// Pages own their panels, so they raise this by passing `panelOpen`.
//
// Portalled to <body> for the same reason Outstation's is — it can't be clipped
// or re-anchored by whatever the page wraps its content in. z-150 sits under the
// panels themselves (z-200) and over the page's own fixed chrome.
const PanelBackdrop = ({ open, onClose }) => {
    // 300ms = the length of animate-datetime-out, the exit every panel over
    // these pages uses. The fade itself is shorter and holds at 0 for the rest,
    // so the dim is gone before the panel it sits behind has finished leaving.
    const { mounted, closing } = useExitAnim(open, 300);

    useEffect(() => {
        if (!open || !onClose) return;
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!mounted) return null;

    return createPortal(
        <div
            onClick={onClose}
            className={`fixed inset-0 z-150 bg-black/50 backdrop-blur-[2px] ${closing ? "animate-panel-fade-out" : "animate-backdrop"} motion-reduce:animate-none`}
        />,
        document.body,
    );
};

const AccountLayout = ({ items, selected, onSelect, title, children, startOnContent = false, panelOpen = false, onPanelClose }) => {
    const navigate = useViewNavigate();
    // On phones the section list and the content take turns on the full screen;
    // on sm+ both columns are always visible and this state is inert. Pages that
    // are opened onto a specific tab (navbar's Ride History) start on content.
    const [menuOpen, setMenuOpen] = useState(!startOnContent);

    return (
        <div className="w-[100vw] h-[100dvh] flex flex-col justify-center items-center px-5 sm:px-10 bg-[var(--foreground)] text-[var(--text-foreground)]">
            <PanelBackdrop open={panelOpen} onClose={onPanelClose} />
            <div className="flex w-full justify-start items-center gap-3 py-6">
                <h3 onClick={() => navigate('/')} className="sm:block hidden cursor-pointer text-[var(--background-primary)] text-2xl pl-1 opacity-[0.85] transition-opacity duration-300 hover:opacity-[1]"><span className="font-semibold">RCS</span> travels</h3>
                <Icon onClick={() => navigate('/')} className="sm:hidden block cursor-pointer text-[var(--background-primary)] opacity-[0.85] transition-opacity duration-300 hover:opacity-[1]" path={mdiHome} size={1.2} />
                {title && (
                    <>
                        <span className="text-[var(--background-primary)]/25 text-xl font-light select-none">/</span>
                        <h3 className="text-[var(--background-primary)]/60 text-xl">{title}</h3>
                    </>
                )}
            </div>
            <div className="w-full flex-1 min-h-0 flex gap-5 justify-center items-center">
                <div className={`${menuOpen ? "flex animate-account-menu" : "hidden"} w-full sm:flex sm:w-[16%] justify-center items-start h-full`}>
                    <ul className="flex flex-col items-start justify-center w-full">
                        {items.map((item, i) => (
                            <li key={i} onClick={() => { onSelect(i); setMenuOpen(false); }} className={`font-normal text-3xl w-full cursor-pointer select-none py-3 px-4 rounded-2xl flex justify-start gap-2 transition-color duration-300 items-center ${selected === i ? "text-[var(--text-foreground)] hover:bg-[var(--background-primary)]/5 sm:bg-[var(--background-primary)] sm:hover:bg-[var(--background-primary)] sm:text-[var(--text)]" : "hover:bg-[var(--background-primary)]/5 text-[var(--text-foreground)]"}`}>
                                <h4 className="text-2xl sm:text-lg max-sm:font-semibold">{item}</h4>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className={`${menuOpen ? "hidden" : "flex animate-account-content"} w-full sm:flex sm:w-[84%] flex-col rounded-3xl justify-start items-start h-full min-h-0`}>
                    <div className="flex items-center gap-3 pb-6 px-4 max-sm:px-0 max-sm:w-full max-sm:pt-3">
                        <button type="button" aria-label="Show sections" onClick={() => setMenuOpen(true)} className="sm:hidden cursor-pointer rounded-lg text-[var(--text-foreground)] opacity-[0.85] transition-opacity duration-300 hover:opacity-[1] active:opacity-[0.7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--background-primary)]">
                            <Icon path={mdiMenu} size={1.2} />
                        </button>
                        <h3 className="text-3xl sm:text-4xl text-[var(--text-foreground)] font-semibold">{items[selected]}</h3>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
};

export default AccountLayout;
