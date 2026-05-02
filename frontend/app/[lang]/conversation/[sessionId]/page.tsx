import { redirect } from "next/navigation";
import { normalizeLang } from "../../../../lib/i18n";

export default async function ConversationRedirectPage({
  params
}: {
  params: Promise<{ lang: string; sessionId: string }> | { lang: string; sessionId: string };
}) {
  const resolvedParams = await params;
  redirect(`/${normalizeLang(resolvedParams.lang)}/conversations/${resolvedParams.sessionId}`);
}
