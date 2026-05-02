"use client";

import { CalendarDays, ChevronDown, ChevronRight, Clock3, MessageSquare, Send, Sparkles, TicketCheck, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
import { ChromaKeyPortrait } from "../../components/chroma-key-portrait";
import { useI18n } from "../../components/i18n-provider";
import { AvatarStage } from "../../components/avatar-stage";
import { Live2DStage, type Live2DStageState } from "../../components/live2d-stage";
import { MarkdownMessage } from "../../components/markdown-message";
import { Badge, Button, InlineNotice, StateBlock } from "../../components/ui";
import { formatMoney, formatShortDateTime, timexApi } from "../../lib/api";
import { defaultConversationSessionId, isSelfConversationTarget } from "../../lib/default-conversations";
import { withLang } from "../../lib/i18n";
import { templateConversationHistories } from "../../lib/template-history";
import type { CapacityWindow, ConversationSession, ExperiencePersona, RuntimeConfig, Ticker, TimeTicket, TimeXUser } from "../../lib/types";

type ConversationsClientProps = {
  initialSessionId?: string;
};

type HoldingMeta = {
  tickets: TimeTicket[];
  sessions: ConversationSession[];
  tickers: Ticker[];
  windows: CapacityWindow[];
  profiles: TimeXUser[];
};

type UpcomingConversation = {
  id: string;
  symbol: string;
  displayName: string;
  tagline: string;
  portraitUrl?: string;
  avatarUrl?: string;
  window?: CapacityWindow;
  tickets: TimeTicket[];
  availableTickets: TimeTicket[];
  relistedTickets: TimeTicket[];
  startsAt: string;
  endsAt: string;
  statusLabel: "available" | "partial available" | "not available";
};

const emptyHoldings: HoldingMeta = {
  tickets: [],
  sessions: [],
  tickers: [],
  windows: [],
  profiles: []
};

function timeUntil(value: string, now: number, readyLabel: string): string {
  const diff = new Date(value).getTime() - now;
  if (diff <= 0) return readyLabel;
  const minutes = Math.ceil(diff / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function isRelisted(ticket: TimeTicket): boolean {
  return ticket.status === "listed" || ticket.status === "relisted";
}

function isChatAvailable(ticket: TimeTicket): boolean {
  return ticket.status === "owned" || ticket.status === "in_session";
}

function buildUpcoming(meta: HoldingMeta): UpcomingConversation[] {
  const tickerById = new Map(meta.tickers.map((ticker) => [ticker.id, ticker]));
  const windowById = new Map(meta.windows.map((window) => [window.id, window]));
  const profileById = new Map(meta.profiles.map((profile) => [profile.id, profile]));
  const grouped = new Map<string, TimeTicket[]>();

  for (const ticket of meta.tickets) {
    if (ticket.status === "completed" || ticket.status === "cancelled") continue;
    const key = ticket.capacityWindowId || ticket.id;
    grouped.set(key, [...(grouped.get(key) ?? []), ticket]);
  }

  return Array.from(grouped.entries())
    .map(([id, tickets]) => {
      const first = tickets[0];
      const ticker = tickerById.get(first.tickerId);
      const profile = profileById.get(first.issuerUserId);
      const window = windowById.get(first.capacityWindowId);
      const availableTickets = tickets.filter(isChatAvailable);
      const relistedTickets = tickets.filter(isRelisted);
      const statusLabel: UpcomingConversation["statusLabel"] =
        availableTickets.length === 0 && relistedTickets.length > 0
          ? "not available"
          : relistedTickets.length > 0
            ? "partial available"
            : "available";

      return {
        id,
        symbol: ticker?.symbol ?? profile?.tickerSymbol ?? first.tickerId,
        displayName: profile?.displayName ?? ticker?.displayName ?? first.title,
        tagline: profile?.headline ?? ticker?.tagline ?? first.title,
        portraitUrl: profile?.portraitUrl,
        avatarUrl: profile?.avatarUrl ?? profile?.chatAvatarUrl ?? profile?.tradeLogoUrl ?? ticker?.avatarUrl,
        window,
        tickets,
        availableTickets,
        relistedTickets,
        startsAt: window?.startsAt ?? first.startsAt,
        endsAt: window?.endsAt ?? first.endsAt,
        statusLabel
      };
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

function sessionTicket(session: ConversationSession | null, tickets: TimeTicket[]): TimeTicket | undefined {
  if (!session?.ticketId) return undefined;
  return tickets.find((ticket) => ticket.id === session.ticketId);
}

function personaForSession(session: ConversationSession | null, meta: HoldingMeta): UpcomingConversation | undefined {
  const ticket = sessionTicket(session, meta.tickets);
  if (!ticket) return undefined;
  return buildUpcoming(meta).find((item) => item.tickets.some((candidate) => candidate.id === ticket.id));
}

function experienceForSession(session: ConversationSession | null, personas: ExperiencePersona[]): ExperiencePersona | undefined {
  if (!session || session.ticketId) return undefined;
  return personas.find((persona) => persona.conversationOwnerId === session.sellerUserId);
}

function isReusableSession(session: ConversationSession): boolean {
  return session.status !== "completed" && session.status !== "ended";
}

function sessionSymbol(session: ConversationSession, meta: HoldingMeta): string {
  const ticket = sessionTicket(session, meta.tickets);
  const tickerById = new Map(meta.tickers.map((ticker) => [ticker.id, ticker]));
  const profileById = new Map(meta.profiles.map((profile) => [profile.id, profile]));

  if (ticket) {
    return (tickerById.get(ticket.tickerId)?.symbol ?? profileById.get(ticket.issuerUserId)?.tickerSymbol ?? "").toUpperCase();
  }

  return (profileById.get(session.sellerUserId)?.tickerSymbol ?? "").toUpperCase();
}

function reusableSessionForSymbol(symbol: string, meta: HoldingMeta): ConversationSession | undefined {
  const normalized = symbol.toUpperCase();
  if (!normalized) return undefined;

  return [...meta.sessions]
    .filter(isReusableSession)
    .sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime())
    .find((candidate) => sessionSymbol(candidate, meta) === normalized);
}

function mergeProfiles(existing: TimeXUser[], additions: Array<TimeXUser | undefined>): TimeXUser[] {
  const byId = new Map(existing.map((profile) => [profile.id, profile]));
  for (const profile of additions) {
    if (profile) byId.set(profile.id, profile);
  }
  return Array.from(byId.values());
}

function avatarForProfile(profile?: TimeXUser): string | undefined {
  return profile?.avatarUrl ?? profile?.chatAvatarUrl ?? profile?.tradeLogoUrl;
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TX";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function live2DModelUrlsForPersona(symbol: string, name: string, portraitUrl?: string): string[] {
  const key = `${symbol} ${name} ${portraitUrl ?? ""}`.toLowerCase();
  const modelName = key.includes("weiyang")
    ? "Weiyang"
    : key.includes("ayuan") || key.includes("a yuan")
      ? "AYuan"
      : "";
  if (!modelName) return [];

  return [
    `/live2d/generated/see-through-nf4-r1024/${modelName}/${modelName}.model3.json`,
    `/live2d/generated/${modelName}/${modelName}.model3.json`
  ];
}

function ChatAvatar({ label, src }: { label: string; src?: string }) {
  return (
    <span className="chatAvatar" aria-label={label}>
      {src ? <ChromaKeyPortrait src={src} alt={label} /> : <span>{initials(label)}</span>}
    </span>
  );
}

export function ConversationsClient({ initialSessionId }: ConversationsClientProps) {
  const router = useRouter();
  const params = useSearchParams();
  const { lang, t } = useI18n();
  const requestedSymbol = params.get("symbol")?.toUpperCase() ?? "";
  const requestedHistoryId = params.get("history") ?? "";
  const requestedStartSymbol = params.get("start")?.toUpperCase() ?? "";
  const requestedChatSymbol = requestedStartSymbol || requestedSymbol;
  const [meta, setMeta] = useState<HoldingMeta>(emptyHoldings);
  const [currentUser, setCurrentUser] = useState<TimeXUser | null>(null);
  const [experiencePersonas, setExperiencePersonas] = useState<ExperiencePersona[]>([]);
  const [runtime, setRuntime] = useState<RuntimeConfig | null>(null);
  const [session, setSession] = useState<ConversationSession | null>(null);
  const [modelId, setModelId] = useState("");
  const [message, setMessage] = useState("");
  const [experienceOpen, setExperienceOpen] = useState(false);
  const [historyDetailsOpen, setHistoryDetailsOpen] = useState(Boolean(requestedHistoryId));
  const [selectedHistoryId, setSelectedHistoryId] = useState(requestedHistoryId);
  const [now, setNow] = useState(() => Date.now());
  const [state, setState] = useState<"loading" | "ready" | "sending" | "auth" | "error">("loading");
  const [portraitDrag, setPortraitDrag] = useState({ x: 0, y: 0 });
  const [portraitScale, setPortraitScale] = useState(1);
  const [portraitMode, setPortraitMode] = useState<"live2d" | "static">("live2d");
  const [manualLive2DState, setManualLive2DState] = useState<Live2DStageState>("idle");
  const [live2DMotionKey, setLive2DMotionKey] = useState(0);
  const [isPortraitDragging, setIsPortraitDragging] = useState(false);
  const [isPortraitResizing, setIsPortraitResizing] = useState(false);
  const portraitDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const portraitResizeRef = useRef<{ pointerId: number; startX: number; startY: number; originScale: number } | null>(null);
  const live2DResetTimerRef = useRef<number | null>(null);
  const directStartAttemptedRef = useRef("");
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [holdingPayload, runtimePayload, experiencePayload, mePayload] = await Promise.all([
          timexApi.holdings(),
          timexApi.runtimeHealth(),
          timexApi.experienceOptions(),
          timexApi.me()
        ]);
        if (!active) return;
        setMeta(holdingPayload);
        setRuntime(runtimePayload);
        setExperiencePersonas(experiencePayload.personas);
        setCurrentUser(mePayload.authenticated ? mePayload.user : null);
        if (initialSessionId) {
          const sessionPayload = await timexApi.conversation(initialSessionId);
          if (!active) return;
          setSession(sessionPayload.session);
          setMeta((current) => ({
            ...current,
            profiles: mergeProfiles(current.profiles, [sessionPayload.buyerProfile, sessionPayload.sellerProfile])
          }));
          setModelId(sessionPayload.session.modelId || runtimePayload.default_model_id || "");
        } else {
          setSession(null);
          setModelId(runtimePayload.default_model_id || "");
        }
        setState("ready");
      } catch (error) {
        if (!active) return;
        setState((error as { status?: number })?.status === 401 ? "auth" : "error");
      }
    }

    load();
    function onProfileImagesStorage(event: StorageEvent) {
      if (event.key === "timex-profile-images-version") load();
    }
    window.addEventListener("timex-profile-images-changed", load);
    window.addEventListener("storage", onProfileImagesStorage);
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      active = false;
      window.removeEventListener("timex-profile-images-changed", load);
      window.removeEventListener("storage", onProfileImagesStorage);
      window.clearInterval(timer);
    };
  }, [initialSessionId]);

  useEffect(() => {
    if (!requestedHistoryId) return;
    const timer = window.setTimeout(() => {
      setSelectedHistoryId(requestedHistoryId);
      setHistoryDetailsOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [requestedHistoryId]);

  const upcoming = useMemo(() => {
    const items = buildUpcoming(meta);
    if (!requestedSymbol) return items;
    return items.filter((item) => item.symbol.toUpperCase() === requestedSymbol || item.displayName.toUpperCase().includes(requestedSymbol));
  }, [meta, requestedSymbol]);
  const readyModels = runtime?.configured_models ?? [];
  const generatedHistory = useMemo(() => templateConversationHistories(currentUser, lang), [currentUser, lang]);
  const selectedHistory = generatedHistory.find((item) => item.id === selectedHistoryId) ?? generatedHistory[0];
  const visibleExperiencePersonas = useMemo(
    () => experiencePersonas.filter((persona) => !isSelfConversationTarget(currentUser, persona.symbol)),
    [currentUser, experiencePersonas]
  );
  const activePersona = personaForSession(session, meta);
  const activeExperience = experienceForSession(session, experiencePersonas);
  const profileById = useMemo(() => new Map(meta.profiles.map((profile) => [profile.id, profile])), [meta.profiles]);
  const sellerProfile = session ? profileById.get(session.sellerUserId) : undefined;
  const buyerProfile = session ? profileById.get(session.buyerUserId) : undefined;
  const activeName = sellerProfile?.displayName ?? activePersona?.displayName ?? activeExperience?.displayName ?? "AI";
  const activeSymbol = sellerProfile?.tickerSymbol ?? activePersona?.symbol ?? activeExperience?.symbol ?? "";
  const activePortrait = sellerProfile?.portraitUrl ?? activePersona?.portraitUrl ?? activeExperience?.portraitUrl;
  const activeAvatar = avatarForProfile(sellerProfile) ?? activePersona?.avatarUrl ?? activeExperience?.avatarUrl;
  const activeLive2DModelUrls = live2DModelUrlsForPersona(activeSymbol, activeName, activePortrait ?? activeAvatar);
  const buyerName = buyerProfile?.displayName ?? currentUser?.displayName ?? t("conversations.you");
  const buyerAvatar = avatarForProfile(buyerProfile) ?? avatarForProfile(currentUser ?? undefined);
  const activeContextLine = activePersona
    ? `${formatShortDateTime(activePersona.startsAt, lang)} · ${formatMoney(activePersona.tickets[0]?.currentPriceCents ?? 0, lang)}`
    : activeExperience
      ? `${t("conversations.experience")} · ${formatMoney(activeExperience.experiencePriceCents, lang)}`
      : t("conversations.activeSession");
  const live2DStageState: Live2DStageState =
    state === "sending"
      ? "thinking"
      : session?.agentState === "speaking"
        ? "greeting"
        : session?.agentState === "thinking"
          ? "thinking"
          : manualLive2DState;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setManualLive2DState("idle");
      setLive2DMotionKey((value) => value + 1);
      if (live2DResetTimerRef.current) {
        window.clearTimeout(live2DResetTimerRef.current);
        live2DResetTimerRef.current = null;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [session?.sessionId]);

  useEffect(() => {
    return () => {
      if (live2DResetTimerRef.current) {
        window.clearTimeout(live2DResetTimerRef.current);
      }
    };
  }, []);

  function startPortraitDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    portraitDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: portraitDrag.x,
      originY: portraitDrag.y
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPortraitDragging(true);
  }

  function movePortrait(event: PointerEvent<HTMLDivElement>) {
    const drag = portraitDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPortraitDrag({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY
    });
  }

  function stopPortraitDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = portraitDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    portraitDragRef.current = null;
    setIsPortraitDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function resizeComposerTextarea(textarea: HTMLTextAreaElement) {
    textarea.style.height = "44px";
    const nextHeight = Math.min(textarea.scrollHeight, 164);
    textarea.style.height = `${Math.max(44, nextHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 164 ? "auto" : "hidden";
  }

  function changeComposerMessage(event: ChangeEvent<HTMLTextAreaElement>) {
    setMessage(event.currentTarget.value);
    resizeComposerTextarea(event.currentTarget);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!message.trim() || state === "sending") return;
    event.currentTarget.form?.requestSubmit();
  }

  function startPortraitResize(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    portraitResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originScale: portraitScale
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPortraitResizing(true);
  }

  function movePortraitResize(event: PointerEvent<HTMLButtonElement>) {
    const resize = portraitResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const delta = (event.clientX - resize.startX + event.clientY - resize.startY) / 240;
    setPortraitScale(Math.min(2.15, Math.max(0.65, resize.originScale + delta)));
  }

  function stopPortraitResize(event: PointerEvent<HTMLButtonElement>) {
    const resize = portraitResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    portraitResizeRef.current = null;
    setIsPortraitResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function playLive2DAction(nextState: Exclude<Live2DStageState, "idle">) {
    if (live2DResetTimerRef.current) {
      window.clearTimeout(live2DResetTimerRef.current);
    }
    setManualLive2DState(nextState);
    setLive2DMotionKey((value) => value + 1);
    const resetDelay = nextState === "blink" ? 900 : nextState === "thinking" ? 3200 : 2400;
    live2DResetTimerRef.current = window.setTimeout(() => {
      setManualLive2DState("idle");
      setLive2DMotionKey((value) => value + 1);
      live2DResetTimerRef.current = null;
    }, resetDelay);
  }

  async function openExistingConversation(symbol: string): Promise<boolean> {
    if (isSelfConversationTarget(currentUser, symbol)) return true;

    const defaultSessionId = defaultConversationSessionId(currentUser, symbol);
    if (defaultSessionId && state !== "sending") {
      setState("sending");
      try {
        const payload = await timexApi.conversation(defaultSessionId);
        setSession(payload.session);
        setMeta((current) => ({
          ...current,
          profiles: mergeProfiles(current.profiles, [payload.buyerProfile, payload.sellerProfile])
        }));
        setModelId(payload.session.modelId || modelId || runtime?.default_model_id || "");
        setState("ready");
        router.push(withLang(lang, `/conversations/${payload.session.sessionId}`));
      } catch {
        setState("error");
      }
      return true;
    }

    const existing = reusableSessionForSymbol(symbol, meta);
    if (existing && state !== "sending") {
      setState("sending");
      try {
        const payload = await timexApi.conversation(existing.sessionId);
        setSession(payload.session);
        setMeta((current) => ({
          ...current,
          profiles: mergeProfiles(current.profiles, [payload.buyerProfile, payload.sellerProfile])
        }));
        setModelId(payload.session.modelId || modelId || runtime?.default_model_id || "");
        setState("ready");
        router.push(withLang(lang, `/conversations/${payload.session.sessionId}`));
      } catch {
        setState("error");
      }
      return true;
    }

    return false;
  }

  async function startConversation(card: UpcomingConversation) {
    if (await openExistingConversation(card.symbol)) return;

    const ticket = card.availableTickets[0];
    if (!ticket || state === "sending") return;
    setState("sending");
    try {
      const payload = await timexApi.startConversation(ticket.id);
      setSession(payload.session);
      setModelId(payload.session.modelId || modelId || runtime?.default_model_id || "");
      setState("ready");
      router.push(withLang(lang, `/conversations/${payload.session.sessionId}`));
    } catch {
      setState("error");
    }
  }

  async function openHistoryConversation(symbol: string, fallbackHistoryId: string) {
    if (state === "sending") return;
    if (await openExistingConversation(symbol)) return;
    setSelectedHistoryId(fallbackHistoryId);
  }

  async function startExperience(persona: ExperiencePersona) {
    if (state === "sending") return;
    setState("sending");
    try {
      const payload = await timexApi.startExperienceConversation(persona.symbol, modelId || runtime?.default_model_id || "");
      setSession(payload.session);
      setModelId(payload.session.modelId || modelId || runtime?.default_model_id || "");
      setRuntime(payload.runtime);
      setExperienceOpen(false);
      window.dispatchEvent(new Event("timex-auth-changed"));
      setState("ready");
      router.push(withLang(lang, `/conversations/${payload.session.sessionId}`));
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    if (!requestedChatSymbol || initialSessionId || session || state !== "ready" || directStartAttemptedRef.current === requestedChatSymbol) return;

    const defaultSessionId = defaultConversationSessionId(currentUser, requestedChatSymbol);
    const existingSession = reusableSessionForSymbol(requestedChatSymbol, meta);
    const matchingUpcoming = upcoming.find(
      (item) => item.symbol.toUpperCase() === requestedChatSymbol && item.availableTickets.length > 0
    );
    if (isSelfConversationTarget(currentUser, requestedChatSymbol)) return;
    const matchingExperience = visibleExperiencePersonas.find((persona) => persona.symbol.toUpperCase() === requestedChatSymbol);
    if (!defaultSessionId && !existingSession && !matchingUpcoming && !matchingExperience) return;

    let cancelled = false;
    directStartAttemptedRef.current = requestedChatSymbol;

    async function startRequestedSymbol() {
      await Promise.resolve();
      if (cancelled) return;
      setState("sending");
      try {
        if (defaultSessionId) {
          const payload = await timexApi.conversation(defaultSessionId);
          if (cancelled) return;
          setSession(payload.session);
          setMeta((current) => ({
            ...current,
            profiles: mergeProfiles(current.profiles, [payload.buyerProfile, payload.sellerProfile])
          }));
          setModelId(payload.session.modelId || modelId || runtime?.default_model_id || "");
          setState("ready");
          router.push(withLang(lang, `/conversations/${payload.session.sessionId}`));
          return;
        }

        if (existingSession) {
          const payload = await timexApi.conversation(existingSession.sessionId);
          if (cancelled) return;
          setSession(payload.session);
          setMeta((current) => ({
            ...current,
            profiles: mergeProfiles(current.profiles, [payload.buyerProfile, payload.sellerProfile])
          }));
          setModelId(payload.session.modelId || modelId || runtime?.default_model_id || "");
          setState("ready");
          router.push(withLang(lang, `/conversations/${payload.session.sessionId}`));
          return;
        }

        if (matchingUpcoming) {
          const ticket = matchingUpcoming.availableTickets[0];
          const payload = await timexApi.startConversation(ticket.id);
          if (cancelled) return;
          setSession(payload.session);
          setModelId(payload.session.modelId || modelId || runtime?.default_model_id || "");
          setState("ready");
          router.push(withLang(lang, `/conversations/${payload.session.sessionId}`));
          return;
        }

        if (!matchingExperience) return;
        const payload = await timexApi.startExperienceConversation(matchingExperience.symbol, modelId || runtime?.default_model_id || "");
        if (cancelled) return;
        setSession(payload.session);
        setModelId(payload.session.modelId || modelId || runtime?.default_model_id || "");
        setRuntime(payload.runtime);
        setExperienceOpen(false);
        window.dispatchEvent(new Event("timex-auth-changed"));
        setState("ready");
        router.push(withLang(lang, `/conversations/${payload.session.sessionId}`));
      } catch {
        if (!cancelled) setState("error");
      }
    }

    void startRequestedSymbol();

    return () => {
      cancelled = true;
    };
  }, [
    currentUser,
    initialSessionId,
    lang,
    meta,
    modelId,
    requestedChatSymbol,
    router,
    runtime?.default_model_id,
    session,
    state,
    upcoming,
    visibleExperiencePersonas
  ]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = message.trim();
    if (!content || !session || state === "sending") return;
    setMessage("");
    if (composerTextareaRef.current) {
      composerTextareaRef.current.style.height = "44px";
      composerTextareaRef.current.style.overflowY = "hidden";
    }
    setState("sending");
    const optimistic: ConversationSession = {
      ...session,
      transcript: [
        ...session.transcript,
        { id: `local-${Date.now()}`, role: "user", content, created_at: new Date().toISOString() }
      ],
      agentState: "thinking"
    };
    setSession(optimistic);
    try {
      const payload = await timexApi.sendConversationMessage(session.sessionId, content, modelId);
      setSession(payload.session);
      setModelId(payload.session.modelId || modelId);
      setState("ready");
    } catch {
      setSession(session);
      setMessage(content);
      setState("error");
    }
  }

  if (state === "loading") {
    return <StateBlock state="loading" title={t("conversations.loading")} detail={t("conversations.loadingDetail")} />;
  }

  if (state === "auth") {
    return <StateBlock state="disabled" title={t("conversations.signInRequired")} detail={t("conversations.signInDetail")} />;
  }

  return (
    <div className="modulePage conversationsPage">
      <header className="moduleHeader conversationsHeader">
        <div>
          <span className="eyebrow">{t("conversations.title")}</span>
          <h1>{session ? activeName : t("conversations.upcomingTitle")}</h1>
        </div>
        <div className="ruleBadges">
          <button className="txButton txButton-secondary txButton-sm" type="button" onClick={() => setExperienceOpen(true)}>
            <Sparkles size={14} />
            <span>{t("conversations.experience")}</span>
          </button>
          <button
            className="txButton txButton-secondary txButton-sm"
            type="button"
            onClick={() => setHistoryDetailsOpen((current) => !current)}
            aria-expanded={historyDetailsOpen}
          >
            {historyDetailsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>{historyDetailsOpen ? t("conversations.historyToggleHide") : t("conversations.historyToggleShow")}</span>
          </button>
          <Badge tone={runtime?.configured_by_environment ? "success" : "warning"}>
            {runtime?.configured_by_environment ? t("conversations.runtimeConfigured") : t("conversations.mockFallback")}
          </Badge>
          <Badge tone="accent">{modelId || t("conversations.autoModel")}</Badge>
        </div>
      </header>

      <section className={`${session ? "conversationsShell isChatting" : "conversationsShell"}${historyDetailsOpen ? " hasHistoryDetails" : ""}`}>
        <aside className="upcomingRail" aria-label={t("conversations.upcomingAria")}>
          <div className="upcomingRailHeader">
            <strong>{t("conversations.upcomingTitle")}</strong>
            <div className="upcomingRailActions">
              <Badge tone="neutral">{upcoming.length}</Badge>
              <button className="txButton txButton-secondary txButton-sm" type="button" onClick={() => setExperienceOpen(true)}>
                <Sparkles size={14} />
                <span>{t("conversations.experience")}</span>
              </button>
            </div>
          </div>
          {upcoming.length === 0 ? (
            <div className="upcomingEmpty">
              <TicketCheck size={18} />
              <span>{t("conversations.noSlots")}</span>
              <Button size="sm" variant="primary" onClick={() => setExperienceOpen(true)}>
                <Sparkles size={14} />
                {t("conversations.experience")}
              </Button>
            </div>
          ) : (
            <div className="upcomingCardGrid">
              {upcoming.map((card) => {
                const existingSession = reusableSessionForSymbol(card.symbol, meta);
                const resourceAvailable = card.availableTickets.length > 0;
                const disabled = !existingSession && !resourceAvailable;
                const soldLabel = card.window
                  ? t("conversations.sold", { sold: card.window.soldCount, capacity: card.window.capacityLimit })
                  : t("conversations.seatCount", { count: card.tickets.length });
                return (
                  <article key={card.id} className={`upcomingConversationCard ${disabled ? "isDisabled" : ""}`}>
                    <div className="upcomingPortrait">
                      <ChromaKeyPortrait src={card.avatarUrl} alt={`${card.displayName} avatar`} />
                    </div>
                    <div className="upcomingCardBody">
                      <div className="upcomingIdentity">
                        <div>
                          <strong>{card.displayName}</strong>
                          <span>${card.symbol}</span>
                        </div>
                        <span
                          className={resourceAvailable ? "conversationResourceLamp isAvailable" : "conversationResourceLamp isUnavailable"}
                          aria-label={resourceAvailable ? t("conversations.available") : t("conversations.notAvailable")}
                          title={resourceAvailable ? t("conversations.available") : t("conversations.notAvailable")}
                        />
                      </div>
                      <p>{card.tagline || t("conversations.slotFallback")}</p>
                      <div className="upcomingFacts">
                        <span>
                          <Clock3 size={13} />
                          {timeUntil(card.startsAt, now, t("conversations.readyNow"))}
                        </span>
                        <span>
                          <CalendarDays size={13} />
                          {formatShortDateTime(card.startsAt, lang)}
                        </span>
                        <span>
                          <TicketCheck size={13} />
                          {soldLabel}
                        </span>
                      </div>
                      <div className="upcomingActions">
                        <Link className="txButton txButton-secondary txButton-sm" href={withLang(lang, `/profile/${card.symbol}`)}>
                          <UserRound size={14} />
                          {t("persona.profile")}
                        </Link>
                        <Button size="sm" variant="primary" disabled={disabled || state === "sending"} reason={t("conversations.notAvailable")} onClick={() => startConversation(card)}>
                          <MessageSquare size={14} />
                          {t("persona.chat")}
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </aside>

        <section className="minimalChatSurface" aria-label={t("conversations.transcript")}>
          {session ? (
            <>
              <div className="minimalChatTopbar">
                <div className="minimalChatIdentity">
                  <ChatAvatar src={activeAvatar} label={`${activeName} avatar`} />
                  <div>
                    <strong>{activeName}</strong>
                    <span>{activeContextLine}</span>
                  </div>
                </div>
                <select value={modelId} onChange={(event) => setModelId(event.target.value)} aria-label={t("conversations.model")}>
                  {readyModels.map((model) => (
                    <option key={model.id} value={model.id} disabled={model.status !== "ready"}>
                      {model.name} - {model.status}
                    </option>
                  ))}
                </select>
              </div>

              <div className="minimalMessages">
                {session.transcript.length ? (
                  session.transcript.map((item) => {
                    const isBuyer = item.role === "user";
                    return (
                      <article key={item.id} className={isBuyer ? "chatMessageRow buyer" : "chatMessageRow assistant"}>
                        <ChatAvatar src={isBuyer ? buyerAvatar : activeAvatar} label={isBuyer ? `${buyerName} avatar` : `${activeName} avatar`} />
                        <div className={isBuyer ? "chatMessage buyer" : "chatMessage assistant"}>
                          <span>{isBuyer ? t("conversations.you") : activeName}</span>
                          <MarkdownMessage content={item.content} />
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <article className="chatMessageRow assistant">
                    <ChatAvatar src={activeAvatar} label={`${activeName} avatar`} />
                    <div className="chatMessage assistant">
                      <span>{activeName}</span>
                      <MarkdownMessage content={activeExperience ? t("conversations.defaultExperienceAssistant") : t("conversations.defaultAssistant")} />
                    </div>
                  </article>
                )}
                {state === "sending" ? (
                  <article className="chatMessageRow assistant">
                    <ChatAvatar src={activeAvatar} label={`${activeName} avatar`} />
                    <div className="chatMessage assistant">
                      <span>{activeName}</span>
                      <MarkdownMessage content={t("conversations.thinking")} />
                    </div>
                  </article>
                ) : null}
              </div>

              {activePortrait ? (
                <div
                  className={[
                    "conversationPetPortrait",
                    portraitMode === "static" ? "isStaticMode" : "isLive2DMode",
                    portraitMode === "live2d" ? `isMotion-${manualLive2DState}` : "",
                    isPortraitDragging ? "isDragging" : "",
                    isPortraitResizing ? "isResizing" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ transform: `translate3d(${portraitDrag.x}px, ${portraitDrag.y}px, 0) scale(${portraitScale})` }}
                  onPointerDown={startPortraitDrag}
                  onPointerMove={movePortrait}
                  onPointerUp={stopPortraitDrag}
                  onPointerCancel={stopPortraitDrag}
                  aria-label={`${activeName} portrait`}
                  title={`${activeName} portrait`}
                >
                  {activeLive2DModelUrls.length > 0 ? (
                    <div className={portraitMode === "live2d" ? "conversationLive2DLayer isVisible" : "conversationLive2DLayer"}>
                      <Live2DStage
                        key={`${activeName}-${portraitMode}`}
                        modelUrls={activeLive2DModelUrls}
                        fallbackSrc={activePortrait}
                        alt={`${activeName} animated portrait`}
                        state={live2DStageState}
                        motionKey={live2DMotionKey}
                      />
                    </div>
                  ) : null}
                  <div className={portraitMode === "static" || activeLive2DModelUrls.length === 0 ? "conversationStaticStage isVisible" : "conversationStaticStage"}>
                    <AvatarStage src={activePortrait} alt={`${activeName} portrait`} size="full" state={live2DStageState} />
                  </div>
                  <div
                    className="conversationPetControls"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`${activeName} portrait controls`}
                  >
                    <div className="conversationPetModeSwitch" role="group" aria-label="Portrait mode">
                      <Button
                        size="sm"
                        variant={portraitMode === "static" ? "secondary" : "ghost"}
                        className={portraitMode === "static" ? "isActive" : ""}
                        aria-pressed={portraitMode === "static"}
                        onClick={() => setPortraitMode("static")}
                      >
                        Static
                      </Button>
                      <Button
                        size="sm"
                        variant={portraitMode === "live2d" ? "secondary" : "ghost"}
                        className={portraitMode === "live2d" ? "isActive" : ""}
                        aria-pressed={portraitMode === "live2d"}
                        disabled={activeLive2DModelUrls.length === 0}
                        onClick={() => setPortraitMode("live2d")}
                      >
                        Live2D
                      </Button>
                    </div>
                    {portraitMode === "live2d" && activeLive2DModelUrls.length > 0 ? (
                      <div className="conversationPetMotionButtons" role="group" aria-label="Live2D motions">
                        <Button size="sm" variant="ghost" onClick={() => playLive2DAction("blink")}>
                          Blink
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => playLive2DAction("thinking")}>
                          Think
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => playLive2DAction("greeting")}>
                          Greet
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <button
                    className="conversationPetResizeHandle"
                    type="button"
                    aria-label={`${activeName} resize portrait`}
                    title="Resize portrait"
                    onPointerDown={startPortraitResize}
                    onPointerMove={movePortraitResize}
                    onPointerUp={stopPortraitResize}
                    onPointerCancel={stopPortraitResize}
                  />
                </div>
              ) : null}

              {state === "error" ? <InlineNotice tone="warning">{t("conversations.messageFailed")}</InlineNotice> : null}

              <form className="chatComposer minimalComposer" onSubmit={submitMessage}>
                <textarea
                  ref={composerTextareaRef}
                  aria-label={t("conversations.messageAria")}
                  placeholder={t("conversations.messagePlaceholder")}
                  rows={1}
                  value={message}
                  onChange={changeComposerMessage}
                  onKeyDown={handleComposerKeyDown}
                />
                <Button disabled={state === "sending" || !message.trim()} type="submit" variant="primary">
                  <Send size={16} />
                  {t("conversations.send")}
                </Button>
              </form>
            </>
          ) : (
            <div className="chatPlaceholder">
              <MessageSquare size={22} />
              <strong>{t("conversations.select")}</strong>
              <span>{t("conversations.selectDetail")}</span>
              <Button size="sm" variant="primary" onClick={() => setExperienceOpen(true)}>
                <Sparkles size={14} />
                {t("conversations.experience")}
              </Button>
            </div>
          )}
        </section>

        {historyDetailsOpen ? (
          <aside className="conversationHistoryDetails" aria-label={t("conversations.history")}>
            <header className="historyPanelHeader">
              <div>
                <strong>{t("conversations.history")}</strong>
                <span>{t("conversations.historyDetail")}</span>
              </div>
              <button
                className="txButton txButton-ghost txButton-sm"
                type="button"
                onClick={() => setHistoryDetailsOpen(false)}
                aria-label={t("conversations.historyToggleHide")}
              >
                <X size={14} />
              </button>
            </header>
            {generatedHistory.length ? (
              <>
                <div className="historySessionList">
                  {generatedHistory.map((history) => (
                    <button
                      key={history.id}
                      className={history.id === selectedHistory?.id ? "historySessionButton isActive" : "historySessionButton"}
                      type="button"
                      onClick={() => {
                        void openHistoryConversation(history.symbol, history.id);
                      }}
                    >
                      <span>{t("conversations.historyWith", { name: history.peerName })}</span>
                      <small>{formatShortDateTime(history.updatedAt, lang)}</small>
                    </button>
                  ))}
                </div>
                {selectedHistory ? (
                  <article className="historyDetailCard">
                    <div className="historyDetailTitle">
                      <div>
                        <strong>{selectedHistory.title}</strong>
                        <span>${selectedHistory.symbol}</span>
                      </div>
                      <Badge tone={selectedHistory.status === "completed" ? "success" : "accent"}>
                        {t(`conversations.${selectedHistory.status}`)}
                      </Badge>
                    </div>
                    <p>{selectedHistory.summary}</p>
                    <div className="historyMetaLine">
                      <span>{formatShortDateTime(selectedHistory.updatedAt, lang)}</span>
                      <span>{t("conversations.historyMessages", { count: selectedHistory.messageCount })}</span>
                    </div>
                    <div className="historyTranscript">
                      {selectedHistory.transcript.map((message, index) => (
                        <div key={`${selectedHistory.id}-${index}`} className={message.speaker === "user" ? "historyBubble user" : "historyBubble peer"}>
                          <span>{message.speaker === "user" ? t("conversations.you") : selectedHistory.peerName}</span>
                          <p>{message.content}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                ) : null}
              </>
            ) : (
              <StateBlock state="empty" title={t("conversations.historyEmpty")} />
            )}
          </aside>
        ) : null}
      </section>

      {experienceOpen ? (
        <div className="experienceOverlay" role="dialog" aria-modal="true" aria-label={t("conversations.experienceDialog")}>
          <section className="experienceDialog">
            <header>
              <div>
                <span className="eyebrow">{t("conversations.experience")}</span>
                <h2>{t("conversations.experienceTitle")}</h2>
              </div>
              <button className="txButton txButton-ghost txButton-sm" type="button" onClick={() => setExperienceOpen(false)} aria-label={t("common.close")}>
                <X size={15} />
              </button>
            </header>
            <div className="experienceGrid">
              {visibleExperiencePersonas.map((persona) => (
                <article key={persona.id} className="experiencePersonaCard">
                  <div className="experiencePortrait">
                    <ChromaKeyPortrait src={persona.avatarUrl} alt={`${persona.displayName} avatar`} />
                  </div>
                  <div className="experiencePersonaBody">
                    <div>
                      <strong>{persona.displayName}</strong>
                      <span>${persona.symbol}</span>
                    </div>
                    <p>{persona.tagline || persona.bio || t("conversations.experienceFallback")}</p>
                    <div className="experiencePersonaMeta">
                      <Badge tone="accent">{formatMoney(persona.experiencePriceCents, lang)}</Badge>
                      <Badge tone="success">{t("conversations.instant")}</Badge>
                    </div>
                    <Button size="sm" variant="primary" disabled={state === "sending"} onClick={() => startExperience(persona)}>
                      <Sparkles size={14} />
                      {t("conversations.startExperience")}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
            {visibleExperiencePersonas.length === 0 ? <InlineNotice>{t("conversations.noExperienceRoles")}</InlineNotice> : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
