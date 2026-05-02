import { normalizeLang } from "../../../lib/i18n";
import { PersonalCenterClient } from "./personal-center-client";

export default async function PersonalCenterPage({
  params
}: {
  params: Promise<{ lang: string }> | { lang: string };
}) {
  const resolvedParams = await params;
  const lang = normalizeLang(resolvedParams.lang);

  return <PersonalCenterClient lang={lang} />;
}
