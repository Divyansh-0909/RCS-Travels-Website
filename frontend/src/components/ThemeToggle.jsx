import { useTranslation } from "react-i18next";
import Icon from "@mdi/react";
import { mdiCheck } from "@mdi/js";
import { useTheme } from "../context/ThemeContext";
import SettingRow from "./ui/SettingRow";

const options = [
  { value: "system", label: "themeSystem", description: "themeSystemDescription" },
  { value: "light", label: "themeLight", description: "themeLightDescription" },
  { value: "dark", label: "themeDark", description: "themeDarkDescription" },
];

export default function ThemeToggle({ className = "", tone = "bg-tone-primary" }) {
  const { t } = useTranslation("website");
  const { theme, setTheme } = useTheme();

  const chooseWithKeyboard = (event, option) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setTheme(option);
  };

  return (
    <ul className={`flex w-full flex-col items-start justify-center gap-4 ${className}`} role="radiogroup" aria-label={t("settings.theme")}>
      {options.map((option) => {
        const selected = theme === option.value;
        return (
          <SettingRow
            key={option.value}
            role="radio"
            aria-checked={selected}
            tabIndex={0}
            onClick={() => setTheme(option.value)}
            onKeyDown={(event) => chooseWithKeyboard(event, option.value)}
            tone={tone}
            className="outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            trailing={(
              <span
                aria-hidden="true"
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${selected ? "border-strong bg-strong text-on-strong" : "border-border bg-surface text-transparent"}`}
              >
                <Icon path={mdiCheck} size={0.8} />
              </span>
            )}
          >
            <h4 className="break-words text-lg font-medium">{t(`settings.${option.label}`)}</h4>
            <p className="break-words text-base text-ink-muted">{t(`settings.${option.description}`)}</p>
          </SettingRow>
        );
      })}
    </ul>
  );
}
