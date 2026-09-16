import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AccountLayout from "../components/ui/AccountLayout";
import { useViewNavigate } from "../hooks/useViewNavigate";
import { legalDocs, legalPaths, sectionId, DRAFT, LEGAL_UPDATED } from "../constants/legal";
import { callSupport, emailSupport, openSupportWhatsApp, supportPhoneDisplay, supportEmail } from "../constants/support";

const Text = ({ children }) => {
    const parts = String(children).split(/(\[TO CONFIRM[^\]]*\])/g);
    return parts.map((part, i) =>
        part.startsWith("[TO CONFIRM")
            ? <mark key={i} className="mx-0.5 rounded bg-status-danger/10 px-1.5 py-0.5 text-status-danger box-decoration-clone">{part}</mark>
            : part
    );
};

const LegalPage = () => {
    const { t } = useTranslation("legal");
    const navigate = useViewNavigate();
    const { pathname } = useLocation();

    const path = legalDocs[pathname] ? pathname : legalPaths[0];
    const selected = Math.max(0, legalPaths.indexOf(path));
    const sourceDoc = legalDocs[path];
    const localized = t(`documents.${path.slice(1)}`, { returnObjects: true });
    const doc = localized?.sections ? localized : sourceDoc;
    const items = legalPaths.map((p) => t(`documents.${p.slice(1)}.tab`, { defaultValue: legalDocs[p].tab }));

    return (
        <AccountLayout
            items={items}
            selected={selected}
            onSelect={(index) => navigate(legalPaths[index])}
            title={t("ui.legal")}
            startOnContent
        >
            <div className="min-h-0 w-full flex-1 overflow-y-auto px-4 pb-8 sm:px-5">
                <article key={path} className="account-panel-motion flex w-full max-w-[78ch] flex-col gap-4 text-left">
                    {DRAFT && (
                        <div className="rounded-3xl border border-status-danger/25 bg-status-danger/5 px-5 py-4 text-sm leading-relaxed text-status-danger sm:px-6">
                            <span className="font-semibold">{t("ui.draft")}</span>{" "}
                            {t("ui.draftDetail")}
                        </div>
                    )}

                    <header className="py-6 sm:py-7">
                        <p className="text-base leading-[1.7] text-ink-muted sm:text-lg">{doc.standfirst}</p>
                        <p className="pt-5 text-sm text-ink-muted">
                            {t("ui.lastUpdated")}{" "}<Text>{LEGAL_UPDATED}</Text>
                        </p>
                    </header>

                    <div className="flex flex-col gap-6">
                        {doc.sections.map((section, index) => (
                            <section
                                key={index}
                                id={sectionId(sourceDoc.sections[index].heading)}
                                className="account-panel-motion scroll-mt-6 py-4"
                                style={{ animationDelay: `${Math.min(index, 3) * 40}ms` }}
                            >
                                <h3 className="pb-3 text-lg font-medium text-ink sm:text-xl">{section.heading}</h3>

                                {section.body?.map((para, i) => (
                                    <p key={i} className="pb-3 text-base leading-[1.75] text-ink-muted last:pb-0">
                                        <Text>{para}</Text>
                                    </p>
                                ))}

                                {section.list && (
                                    <ul className="flex flex-col gap-2 pt-2 pl-1">
                                        {section.list.map((item, i) => (
                                            <li key={i} className="flex gap-3 text-base leading-[1.75] text-ink-muted">
                                                <span aria-hidden="true" className="mt-[0.7em] h-1 w-1 shrink-0 rounded-full bg-ink/30" />
                                                <span className="min-w-0"><Text>{item}</Text></span>
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                {section.after?.map((para, i) => (
                                    <p key={i} className="pt-3 text-base leading-[1.75] text-ink-muted">
                                        <Text>{para}</Text>
                                    </p>
                                ))}
                            </section>
                        ))}
                    </div>

                    <footer className="py-6">
                        <h3 className="pb-2 text-lg font-medium text-ink">{t("ui.reachingPerson")}</h3>
                        <p className="pb-4 text-base leading-[1.75] text-ink-muted">{t("ui.contactPrompt")}</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {[
                                [t("ui.callUs"), supportPhoneDisplay(), callSupport],
                                [t("ui.whatsappUs"), supportPhoneDisplay(), () => openSupportWhatsApp()],
                                [t("ui.emailUs"), supportEmail(), emailSupport],
                            ].map(([label, value, onClick]) => (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={onClick}
                                    className="cursor-pointer rounded-2xl bg-surface px-4 py-3 text-left transition-transform duration-150 ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                >
                                    <span className="block text-base font-medium text-ink">{label}</span>
                                    <span className="block break-all pt-0.5 text-sm text-ink-muted">{value}</span>
                                </button>
                            ))}
                        </div>
                    </footer>
                </article>
            </div>
        </AccountLayout>
    );
};

export default LegalPage;
