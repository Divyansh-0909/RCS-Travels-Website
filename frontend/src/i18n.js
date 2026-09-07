import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "../../shared/i18n/locales/en/common.json";
import hiCommon from "../../shared/i18n/locales/hi/common.json";
import hiLatnCommon from "../../shared/i18n/locales/hi-Latn/common.json";
import enWebsite from "../../shared/i18n/locales/en/website.json";
import hiWebsite from "../../shared/i18n/locales/hi/website.json";
import hiLatnWebsite from "../../shared/i18n/locales/hi-Latn/website.json";
import enLegal from "../../shared/i18n/locales/en/legal.json";
import hiLegal from "../../shared/i18n/locales/hi/legal.json";
import hiLatnLegal from "../../shared/i18n/locales/hi-Latn/legal.json";

export const LANGUAGE_CODES = ["en", "hi-Latn", "hi"];

export function normalizeLanguage(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "hi" || normalized === "hindi") return "hi";
  if (["hi-latn", "hinglish"].includes(normalized)) return "hi-Latn";
  return "en";
}

const storedLanguage = (() => {
  try {
    const data = JSON.parse(localStorage.getItem("rcs-data"));
    return normalizeLanguage(data?.state?.language);
  } catch {
    return "en";
  }
})();

i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon, website: enWebsite, legal: enLegal },
    hi: { common: hiCommon, website: hiWebsite, legal: hiLegal },
    "hi-Latn": { common: hiLatnCommon, website: hiLatnWebsite, legal: hiLatnLegal },
  },
  lng: storedLanguage,
  fallbackLng: "en",
  defaultNS: "website",
  fallbackNS: "common",
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

document.documentElement.lang = storedLanguage;

i18n.on("languageChanged", (language) => {
  document.documentElement.lang = normalizeLanguage(language);
});

export default i18n;
