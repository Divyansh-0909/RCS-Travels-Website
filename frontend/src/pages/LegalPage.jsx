import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Icon from '@mdi/react';
import { mdiKeyboardBackspace } from '@mdi/js';
import { useViewNavigate } from "../hooks/useViewNavigate";
import { legalDocs, legalPaths, sectionId, DRAFT, LEGAL_UPDATED } from "../constants/legal";
import { callSupport, emailSupport, openSupportWhatsApp, supportPhoneDisplay, supportEmail } from "../constants/support";

/* One component behind four routes — /terms, /privacy, /refunds, /grievance —
   picking its document from the path. Four URLs because a legal document has to
   be citable on its own (a signup consent line, a payment gateway's onboarding
   form, a support reply), and one component because the four are identical apart
   from their copy, which lives in constants/legal.js.

   Deliberately NOT built on AccountLayout, which the account screens share.
   That layout pins itself to h-[100dvh] and scrolls an inner pane, which is right
   for settings rows and wrong for a document: these pages get printed, deep
   linked to a section, and read on a phone, and all three want the page itself to
   scroll. Its 16%-wide tab rail also can't hold "Grievance" on a narrow screen. */

const railBase = "w-full text-left cursor-pointer select-none py-3 px-4 rounded-2xl transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/* Renders the [TO CONFIRM: …] markers from the copy as something nobody can
   publish by accident. They're plain text in the source so `grep` still finds
   them; the highlight is only so they can't be skim-read past on the page. */
const Text = ({ children }) => {
    const parts = String(children).split(/(\[TO CONFIRM[^\]]*\])/g);
    return parts.map((part, i) =>
        part.startsWith("[TO CONFIRM")
            ? <mark key={i} className="bg-status-danger/10 text-status-danger rounded px-1.5 py-0.5 mx-0.5 box-decoration-clone">{part}</mark>
            : part
    );
};

const LegalPage = () => {
    const { t } = useTranslation("legal");
    const navigate = useViewNavigate();
    const { pathname } = useLocation();

    const path = legalDocs[pathname] ? pathname : legalPaths[0];
    const sourceDoc = legalDocs[path];
    const localized = t(`documents.${path.slice(1)}`, { returnObjects: true });
    const doc = localized?.sections ? localized : sourceDoc;
    const tabLabel = (p) => t(`documents.${p.slice(1)}.tab`, { defaultValue: legalDocs[p].tab });

    return (
        <div className="min-h-[100dvh] bg-canvas text-ink px-5 sm:px-10 pb-20">

            {/* Same header as the account screens, so arriving here from the footer
                still feels like the same site. */}
            <div className="flex w-full justify-start items-center gap-3 py-6">
                <h3 onClick={() => navigate('/')} className="sm:block hidden cursor-pointer text-ink text-2xl pl-1 opacity-[0.85] transition-opacity duration-300 hover:opacity-[1]"><span className="font-semibold">RCS</span> travels</h3>
                <Icon onClick={() => navigate('/')} className="sm:hidden block cursor-pointer text-ink opacity-[0.85] transition-opacity duration-300 hover:opacity-[1]" path={mdiKeyboardBackspace} size={1.2} />
                <span className="text-ink/25 text-xl font-light select-none">/</span>
                <h3 className="text-ink-muted text-xl">{t('ui.legal')}</h3>
            </div>

            {/* Mobile: the four documents as a scrollable rail. Nothing truncates
                and nothing needs a menu. */}
            <nav aria-label={t('ui.documents')} className="sm:hidden -mx-5 px-5 overflow-x-auto">
                <ul className="flex gap-2 w-max pb-1">
                    {legalPaths.map((p) => (
                        <li key={p}>
                            <button
                                type="button"
                                onClick={() => navigate(p)}
                                aria-current={p === path ? "page" : undefined}
                                className={`${railBase} w-auto whitespace-nowrap text-base ${p === path
                                     ? "bg-strong text-on-strong"
                                     : "bg-surface-muted text-ink"}`}
                            >
                                {tabLabel(p)}
                            </button>
                        </li>
                    ))}
                </ul>
            </nav>

            <div className="flex gap-6 lg:gap-10 pt-6 sm:pt-4">

                {/* Desktop: a rail that stays put while a long document scrolls past it. */}
                <nav aria-label={t('ui.documents')} className="hidden sm:block w-[30%] lg:w-[22%] shrink-0">
                    <ul className="sticky top-6 flex flex-col gap-1">
                        {legalPaths.map((p) => (
                            <li key={p}>
                                <button
                                    type="button"
                                    onClick={() => navigate(p)}
                                    aria-current={p === path ? "page" : undefined}
                                    className={`${railBase} text-xl lg:text-2xl ${p === path
                                     ? "bg-strong text-on-strong"
                                     : "text-ink hover:bg-surface-muted"}`}
                                >
                                    {tabLabel(p)}
                                </button>
                            </li>
                        ))}
                    </ul>
                </nav>

                {/* 68ch is a reading measure. These are the only pages on the site
                    with paragraphs long enough to need one. */}
                <article className="min-w-0 flex-1 max-w-[68ch]">

                    {DRAFT && (
                        <p className="mb-8 rounded-2xl border border-status-danger/25 bg-status-danger/5 px-5 py-4 text-sm text-status-danger leading-relaxed">
                            <span className="font-semibold">{t('ui.draft')}</span>{" "}
                            {t('ui.draftDetail')}
                        </p>
                    )}

                    <header className="pb-8 mb-8 border-b border-border">
                        <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-ink">{doc.title}</h2>
                        <p className="pt-3 text-base sm:text-lg text-ink-muted leading-[1.7]">{doc.standfirst}</p>
                        <p className="pt-5 text-sm text-ink-muted">
                            {t('ui.lastUpdated')}{" "}<Text>{LEGAL_UPDATED}</Text>
                        </p>
                    </header>

                    <div className="flex flex-col gap-10">
                        {doc.sections.map((section, index) => (
                            <section key={index} id={sectionId(sourceDoc.sections[index].heading)} className="scroll-mt-6">
                                <h4 className="text-lg sm:text-xl font-medium text-ink pb-3">{section.heading}</h4>

                                {section.body?.map((para, i) => (
                                    <p key={i} className="text-base text-ink-muted leading-[1.75] pb-3 last:pb-0">
                                        <Text>{para}</Text>
                                    </p>
                                ))}

                                {section.list && (
                                    <ul className="flex flex-col gap-2 pt-2 pl-1">
                                        {section.list.map((item, i) => (
                                            <li key={i} className="flex gap-3 text-base text-ink-muted leading-[1.75]">
                                                <span aria-hidden="true" className="select-none pt-[0.6em] shrink-0 w-1 h-1 rounded-full bg-ink/30" />
                                                <span className="min-w-0"><Text>{item}</Text></span>
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                {section.after?.map((para, i) => (
                                    <p key={i} className="text-base text-ink-muted leading-[1.75] pt-3">
                                        <Text>{para}</Text>
                                    </p>
                                ))}
                            </section>
                        ))}
                    </div>

                    {/* Every legal document has to end somewhere a person can be
                        reached, so all four end in the same place. */}
                    <footer className="mt-12 pt-8 border-t border-border">
                        <h4 className="text-lg font-medium text-[var(--text-foreground)] pb-2">{t('ui.reachingPerson')}</h4>
                        <p className="text-base text-ink-muted leading-[1.75] pb-4">
                            {t('ui.contactPrompt')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {[
                                [t('ui.callUs'), supportPhoneDisplay(), callSupport],
                                [t('ui.whatsappUs'), supportPhoneDisplay(), () => openSupportWhatsApp()],
                                [t('ui.emailUs'), supportEmail(), emailSupport],
                            ].map(([label, value, onClick]) => (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={onClick}
                                    className="cursor-pointer rounded-2xl bg-[var(--background-primary)]/5 px-5 py-3 text-left transition-colors duration-300 hover:bg-[var(--background-primary)]/10 active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--background-primary)]"
                                >
                                    <span className="block text-base text-[var(--text-foreground)]">{label}</span>
                                    <span className="block text-sm text-ink-muted">{value}</span>
                                </button>
                            ))}
                        </div>
                    </footer>
                </article>
            </div>
        </div>
    );
};

export default LegalPage;
