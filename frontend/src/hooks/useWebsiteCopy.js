import { useTranslation } from "react-i18next";
import { websiteCopy } from '../i18nCopy';

export function useWebsiteCopy() {
  useTranslation("website");
  return websiteCopy;
}
