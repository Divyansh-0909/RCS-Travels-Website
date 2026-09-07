import { useTranslation } from "react-i18next";
import { useData } from "../hooks/useData";
import { normalizeLanguage } from "../i18n";

const choices = [
  { code: "en", native: "English", prompt: "Can read this? Tap here" },
  { code: "hi-Latn", native: "Hinglish", prompt: "Ye padh sakte hain? Yahan dabayein" },
  { code: "hi", native: "हिन्दी", prompt: "यह पढ़ सकते हैं? यहाँ दबाएँ" },
];

export default function LanguageSelector({ className = "" }) {
  const { i18n, t } = useTranslation("common");
  const language = normalizeLanguage(useData((state) => state.language));
  const setLanguage = useData((state) => state.setLanguage);

  const choose = (code) => {
    setLanguage(code);
    i18n.changeLanguage(code);
  };

  return (
    <div className={`grid w-full grid-cols-1 gap-3 md:grid-cols-3 ${className}`} role="radiogroup" aria-label={t("language.select")}>
      {choices.map(({ code, native, prompt }) => (
        <button
          key={code}
          type="button"
          role="radio"
          aria-checked={language === code}
          onClick={() => choose(code)}
          className={`min-h-24 min-w-0 rounded-2xl border p-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${language === code ? "border-primary bg-primary text-white" : "border-[var(--background-primary)]/20 bg-[var(--foreground-muted)] text-[var(--text-foreground)]"}`}
        >
          <span lang={code} className="block break-words text-lg font-semibold leading-snug">{native}</span>
          <span lang={code} className="mt-1 block break-words text-sm leading-relaxed opacity-75">{prompt}</span>
        </button>
      ))}
    </div>
  );
}
