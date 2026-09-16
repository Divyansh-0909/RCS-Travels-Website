import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../../i18nCopy";
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@mdi/react';
import { mdiClose, mdiHome, mdiMenu } from '@mdi/js';
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
    useCopyLanguage();
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
            className={`fixed inset-0 z-150 cursor-pointer bg-black/60 ${closing ? "animate-panel-fade-out" : "animate-backdrop"} motion-reduce:animate-none`}
        />,
        document.body,
    );
};

const AccountLayout = ({ items, selected, onSelect, title, children, headerActions = null, startOnContent = false, panelOpen = false, onPanelClose }) => {
    useCopyLanguage();
    const navigate = useViewNavigate();
    // On phones the section list and the content take turns on the full screen;
    // on sm+ both columns are always visible and this state is inert. Pages that
    // are opened onto a specific tab (navbar's Ride History) start on content.
    const [menuOpen, setMenuOpen] = useState(!startOnContent);

    return (
        <div className="box-border w-[100vw] max-w-full h-[100dvh] flex flex-col justify-center items-center overflow-x-hidden px-5 sm:px-10 bg-surface text-ink">
            <PanelBackdrop open={panelOpen} onClose={onPanelClose} />
            <div className="flex w-full justify-start items-center gap-3 py-6">
                <h3 onClick={() => navigate('/')} className="sm:block hidden cursor-pointer text-ink text-2xl pl-1 opacity-[0.85] transition-opacity duration-300 hover:opacity-[1]"><span className="font-semibold">RCS</span> travels</h3>
                <Icon onClick={() => navigate('/')} className="sm:hidden block cursor-pointer text-ink opacity-[0.85] transition-opacity duration-300 hover:opacity-[1]" path={mdiHome} size={1.2} />
                {title && (
                    <>
                        <span className="text-ink-muted/50 text-xl font-light select-none">/</span>
                        <h3 className="text-ink-muted text-xl">{title}</h3>
                    </>
                )}
                <button
                    type="button"
                    aria-label={menuOpen ? dc("Hide sections") : dc("Show sections")}
                    onClick={() => setMenuOpen((open) => !open)}
                    className="ml-auto sm:hidden shrink-0 cursor-pointer rounded-lg text-ink opacity-[0.85] transition-opacity duration-300 hover:opacity-[1] active:opacity-[0.7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                    <Icon path={menuOpen ? mdiClose : mdiMenu} size={1.2} />
                </button>
            </div>
            <div className="w-full min-w-0 flex-1 min-h-0 flex gap-5 justify-center items-center">
                <div className={`${menuOpen ? "flex animate-account-menu" : "hidden"} w-full sm:flex sm:w-[16%] justify-start items-start h-full sm:pt-2 sm:pr-6 sm:border-r sm:border-border/60`}>
                    <div className="flex w-full flex-col items-start gap-4">
                    <ul className="flex w-full flex-col items-start gap-1">
                        {items.map((item, i) => (
                            <li key={i} className="w-full max-w-full">
                                <button
                                    type="button"
                                    onClick={() => { onSelect(i); setMenuOpen(false); }}
                                    className={`flex w-full cursor-pointer select-none items-center justify-start rounded-md px-4 py-2 text-left transition-[background-color,transform] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.99] ${selected === i ? "bg-surface-muted text-ink" : "text-ink sm:hover:bg-surface-muted/60 active:bg-surface-muted/60"}`}
                                >
                                    <h4 className="break-words text-xl font-semibold leading-snug sm:text-lg">{item}</h4>
                                </button>
                            </li>
                        ))}
                    </ul>
                    </div>
                </div>
                <div className={`${menuOpen ? "hidden" : "flex animate-account-content"} w-full min-w-0 sm:flex sm:w-[84%] flex-col justify-start items-start h-full min-h-0 overflow-hidden bg-surface pb-5 [&>ul]:px-4 sm:[&>ul]:px-5`}>
                    <div className="flex w-full flex-col items-stretch gap-4 pb-6 px-5 max-sm:px-4 max-sm:pt-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                            <h3 className="min-w-0 flex-1 break-words text-4xl sm:text-5xl text-ink font-semibold leading-tight tracking-[-0.04em]">{items[selected]}</h3>
                        </div>
                        {headerActions && <div className="shrink-0 max-sm:w-full">{headerActions}</div>}
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
};

export default AccountLayout;
