import { DiscoverClient } from "../../discover/discover-client";
import { RuleBadges } from "../../../components/ui";
import { createTranslator, normalizeLang } from "../../../lib/i18n";

export default async function DiscoverPage({
  params
}: {
  params: Promise<{ lang: string }> | { lang: string };
}) {
  const { lang: rawLang } = await params;
  const lang = normalizeLang(rawLang);
  const t = createTranslator(lang);

  return (
    <div className="modulePage discoverPage">
      <header className="moduleHeader discoverHeader">
        <div>
          <span className="eyebrow">{t("discover.eyebrow")}</span>
          <h1>{t("discover.title")}</h1>
        </div>
        <RuleBadges lang={lang} />
      </header>

      <DiscoverClient />
    </div>
  );
}
