import { CalendarDashboard } from "../../../components/calendar-dashboard";
import { createTranslator, normalizeLang } from "../../../lib/i18n";

export default async function CalendarPage({
  params
}: {
  params: Promise<{ lang?: string }> | { lang?: string };
}) {
  const resolvedParams = await params;
  const lang = normalizeLang(resolvedParams?.lang);
  const t = createTranslator(lang);

  return (
    <div className="modulePage">
      <header className="moduleHeader">
        <div>
          <span className="eyebrow">{t("calendar.eyebrow")}</span>
          <h1>{t("calendar.dashboard.title")}</h1>
        </div>
      </header>

      <CalendarDashboard />
    </div>
  );
}
