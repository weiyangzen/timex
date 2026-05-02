import type { TimeXUser } from "./types";

const WEIYANG_AYUAN_SESSION_ID = "sess_57f9260d6a1947ab";

export function userConversationSymbol(user?: TimeXUser | null): string {
  return (user?.tickerSymbol || user?.loginName || user?.displayName || "").toUpperCase();
}

export function isSelfConversationTarget(user: TimeXUser | null | undefined, peerSymbol: string): boolean {
  const self = userConversationSymbol(user);
  return Boolean(self && self === peerSymbol.toUpperCase());
}

export function defaultConversationSessionId(user: TimeXUser | null | undefined, peerSymbol: string): string | undefined {
  const self = userConversationSymbol(user);
  const peer = peerSymbol.toUpperCase();

  if (self === "WEIYANG" && peer === "AYUAN") {
    return WEIYANG_AYUAN_SESSION_ID;
  }

  if (self === "AYUAN" && peer === "WEIYANG") {
    return WEIYANG_AYUAN_SESSION_ID;
  }

  return undefined;
}
