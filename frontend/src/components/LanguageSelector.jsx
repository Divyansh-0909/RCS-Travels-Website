import { useTranslation } from "react-i18next";
import Icon from "@mdi/react";
import { mdiCheck } from "@mdi/js";
import { useData } from "../hooks/useData";
import { normalizeLanguage } from "../i18n";
import SettingRow from "./ui/SettingRow";

const choices = [
  { code: "en", native: "English", prompt: "Can read this? Tap here" },
  { code: "hi-Latn", native: "Hinglish", prompt: "Ye padh sakte hain? Yahan dabayein" },
  { code: "hi", native: "हिन्दी", prompt: "यह पढ़ सकते हैं? यहाँ दबाएँ" },
];

export default function LanguageSelector({ className = "", tone = "bg-tone-primary" }) {
  const { i18n, t } = useTranslation("common");
  const language = normalizeLanguage(useData((state) => state.language));
  const setLanguage = useData((state) => state.setLanguage);

  const choose = (code) => {
    setLanguage(code);
    i18n.changeLanguage(code);
  };

  const chooseWithKeyboard = (event, code) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    choose(code);
  };

  return (
    <ul className={`flex w-full flex-col items-start justify-center gap-4 ${className}`} role="radiogroup" aria-label={t("language.select")}>
      {choices.map(({ code, native, prompt }) => (
        <SettingRow
          key={code}
          role="radio"
          aria-checked={language === code}
          tabIndex={0}
          onClick={() => choose(code)}
          onKeyDown={(event) => chooseWithKeyboard(event, code)}
          tone={tone}
          className="outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          trailing={(
            <span
              aria-hidden="true"
              className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${language === code ? "border-strong bg-strong text-on-strong" : "border-border bg-surface text-transparent"}`}
            >
              <Icon path={mdiCheck} size={0.8} />
            </span>
          )}
        >
          <h4 lang={code} className="break-words text-lg font-medium">{native}</h4>
          <p lang={code} className="break-words text-base text-ink-muted">{prompt}</p>
        </SettingRow>
      ))}
    </ul>
  );
}
