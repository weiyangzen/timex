import { ConversationsClient } from "../conversations-client";

export const dynamic = "force-dynamic";

export default async function ConversationSessionPage({
  params
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ConversationsClient initialSessionId={sessionId} />;
}
