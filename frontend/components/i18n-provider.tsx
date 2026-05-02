"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { createTranslator, localeForLang, normalizeLang, type Lang } from "../lib/i18n";

type I18nContextValue = {
  lang: Lang;
  locale: string;
  t: ReturnType<typeof createTranslator>;
};

const I18nContext = createContext<I18nContextValue>({
  lang: "en",
  locale: "en-US",
  t: createTranslator("en")
});

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const safeLang = normalizeLang(lang);
  const value = useMemo(
    () => ({
      lang: safeLang,
      locale: localeForLang(safeLang),
      t: createTranslator(safeLang)
    }),
    [safeLang]
  );

  useEffect(() => {
    document.documentElement.lang = safeLang === "zh" ? "zh-CN" : "en";
  }, [safeLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
