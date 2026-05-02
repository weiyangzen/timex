import { redirect } from "next/navigation";
import { normalizeLang } from "../../../lib/i18n";

export default async function ConversationPage({
  params
}: {
  params: Promise<{ lang: string }> | { lang: string };
}) {
  const resolvedParams = await params;
  redirect(`/${normalizeLang(resolvedParams.lang)}/conversations`);
}
