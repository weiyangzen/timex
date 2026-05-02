import { ConversationsClient } from "../../../conversations/conversations-client";

export const dynamic = "force-dynamic";

export default async function ConversationSessionPage({
  params
}: {
  params: Promise<{ sessionId: string }> | { sessionId: string };
}) {
  const resolvedParams = await params;
  return <ConversationsClient initialSessionId={resolvedParams.sessionId} />;
}
