"use client";

import { Moon, Sun } from "lucide-react";
import { useI18n } from "./i18n-provider";
import { useTheme } from "./theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

  return (
    <section className="themeControl" aria-label={t("theme.mode")}>
      <div>
        <strong>{t("theme.title")}</strong>
        <span>{theme === "dark" ? t("theme.darkDetail") : t("theme.lightDetail")}</span>
      </div>
      <div className="themeSwitch" role="group" aria-label={t("theme.choose")}>
        <button className={theme === "light" ? "isActive" : ""} type="button" onClick={() => setTheme("light")}>
          <Sun size={15} />
          <span>{t("theme.light")}</span>
        </button>
        <button className={theme === "dark" ? "isActive" : ""} type="button" onClick={() => setTheme("dark")}>
          <Moon size={15} />
          <span>{t("theme.dark")}</span>
        </button>
      </div>
    </section>
  );
}
