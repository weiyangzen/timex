import type {
  CapacityWindow,
  ConversationSession,
  ExperiencePersona,
  KnowledgeBase,
  MarketEvent,
  ProfileLink,
  RuntimeConfig,
  Slot,
  Ticker,
  TicketReceipt,
  TimeTicket,
  TimeXUser,
  TradeMarket
} from "./types";
import { localeForLang, type Lang } from "./i18n";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5001";

type ApiUser = {
  id: string;
  login_name?: string;
  email?: string;
  display_name: string;
  ticker_symbol?: string;
  avatar_url?: string;
  initial_info?: string;
  headline?: string;
  organization?: string;
  mbti?: string;
  expertise?: string[];
  bio?: string;
  links?: ProfileLink[];
  offer?: string;
  portrait_url?: string;
  chat_avatar_url?: string;
  trade_logo_url?: string;
  agent_base_price_cents?: number;
  balance_cents: number;
  created_at: string;
};

type MeResponse = {
  authenticated: boolean;
  user?: ApiUser;
  balance_cents?: number;
  anonymous_read_only?: boolean;
};

type AuthResponse = {
  user: ApiUser;
  token: string;
  created?: boolean;
  pending_action?: unknown;
};

export type ProfilePayload = {
  displayName: string;
  tickerSymbol: string;
  avatarUrl: string;
  initialInfo: string;
  headline: string;
  organization: string;
  mbti: string;
  expertise: string[];
  bio: string;
  links: ProfileLink[];
  offer: string;
  portraitUrl: string;
  chatAvatarUrl: string;
  tradeLogoUrl: string;
  agentBasePriceCents: number;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  headers.set("Accept", "application/json");

  const init: RequestInit = {
    ...requestOptions,
    headers,
    credentials: "include"
  };

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, init);

  if (!response.ok) {
    throw new ApiError(`Request failed: ${path}`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function normalizeUser(user: ApiUser): TimeXUser {
  return {
    id: user.id,
    loginName: user.login_name ?? user.email ?? "",
    email: user.email,
    displayName: user.display_name,
    tickerSymbol: user.ticker_symbol,
    avatarUrl: absoluteApiImageUrl(user.avatar_url),
    initialInfo: user.initial_info,
    headline: user.headline,
    organization: user.organization,
    mbti: user.mbti,
    expertise: user.expertise ?? [],
    bio: user.bio,
    links: user.links ?? [],
    offer: user.offer,
    portraitUrl: absoluteApiImageUrl(user.portrait_url),
    chatAvatarUrl: absoluteApiImageUrl(user.chat_avatar_url),
    tradeLogoUrl: absoluteApiImageUrl(user.trade_logo_url),
    agentBasePriceCents: user.agent_base_price_cents,
    balanceCents: user.balance_cents,
    createdAt: user.created_at
  };
}

function absoluteApiImageUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/avatar/")) return value;
  if (value.startsWith("/")) return `${API_BASE}${value}`;
  return value;
}

function profilePayloadBody(payload: ProfilePayload) {
  return {
    display_name: payload.displayName,
    ticker_symbol: payload.tickerSymbol,
    avatar_url: payload.avatarUrl,
    initial_info: payload.initialInfo,
    headline: payload.headline,
    organization: payload.organization,
    mbti: payload.mbti,
    expertise: payload.expertise,
    bio: payload.bio,
    links: payload.links,
    offer: payload.offer,
    portrait_url: payload.portraitUrl,
    chat_avatar_url: payload.chatAvatarUrl,
    trade_logo_url: payload.tradeLogoUrl,
    agent_base_price_cents: payload.agentBasePriceCents
  };
}

type ApiConversationSession = {
  id: string;
  session_id: string;
  ticket_id: string;
  buyer_user_id: string;
  seller_user_id: string;
  session_type: ConversationSession["sessionType"];
  status: ConversationSession["status"];
  model_id?: string;
  tokens_used: number;
  token_budget: number;
  transcript?: ConversationSession["transcript"];
  topics?: ConversationSession["topics"];
  summary?: string;
  agent_state?: ConversationSession["agentState"];
  created_at?: string;
  updated_at?: string;
};

type ApiTicker = Partial<Ticker> & {
  owner_user_id?: string;
  display_name?: string;
  avatar_url?: string;
  verified_badge?: boolean;
  base_price_cents?: number;
  next_available_at?: string;
  activity_label?: string;
};

type ApiTradeMarketSummary = {
  ticker?: ApiTicker;
  base_price_cents?: number;
  next_available_window?: ApiCapacityWindow;
  activity?: number;
};

type ApiCapacityWindow = Partial<CapacityWindow> & {
  ticker_id?: string;
  slot_id?: string;
  starts_at?: string;
  ends_at?: string;
  duration_minutes?: number;
  capacity_limit?: number;
  sold_count?: number;
  remaining_capacity?: number;
  base_price_cents?: number;
  min_sale_price_cents?: number;
  current_price_cents?: number;
  trade_halts_at?: string;
  demand_score?: number;
};

type ApiTimeTicket = Partial<TimeTicket> & {
  ticker_id?: string;
  slot_id?: string;
  capacity_window_id?: string;
  issuer_user_id?: string;
  owner_user_id?: string;
  interaction_type?: TimeTicket["interactionType"];
  starts_at?: string;
  ends_at?: string;
  duration_minutes?: number;
  base_price_cents?: number;
  current_price_cents?: number;
  list_price_cents?: number;
  seat_index?: number;
  trade_halts_at?: string;
  resale_count?: number;
};

type ApiSlot = Partial<Slot> & {
  ticker_id?: string;
  slot_name?: string;
  slot_type?: Slot["slotType"];
  token_budget?: number;
  privacy_level?: Slot["privacyLevel"];
  knowledge_base_id?: string;
  unified_base_price_cents?: number;
  default_capacity_limit?: number;
  is_active?: boolean;
};

type ApiExperiencePersona = Partial<ExperiencePersona> & {
  display_name?: string;
  portrait_url?: string;
  avatar_url?: string;
  chat_avatar_url?: string;
  chatAvatarUrl?: string;
  trade_logo_url?: string;
  tradeLogoUrl?: string;
  verified_badge?: boolean;
  experience_price_cents?: number;
  base_price_cents?: number;
  next_available_at?: string;
  conversation_owner_id?: string;
};

type ApiKnowledgeBase = Partial<KnowledgeBase> & {
  slot_id?: string;
  document_count?: number;
  demo_source_names?: string[];
  imported_by_one_click?: boolean;
};

type ApiTicketReceipt = Partial<TicketReceipt> & {
  ticket_id?: string;
  receipt_code?: string;
  buyer_user_id?: string;
  seller_user_id?: string;
  session_id?: string;
  price_cents?: number;
  seller_royalty_cents?: number;
  seller_fee_cents?: number;
  platform_fee_cents?: number;
  issued_at?: string;
};

type ApiMarketEvent = Partial<MarketEvent> & {
  ticket_id?: string;
  event_type?: MarketEvent["eventType"];
  price_cents?: number;
  created_at?: string;
};

function normalizeConversationSession(session: ApiConversationSession): ConversationSession {
  return {
    id: session.id,
    sessionId: session.session_id,
    ticketId: session.ticket_id,
    buyerUserId: session.buyer_user_id,
    sellerUserId: session.seller_user_id,
    sessionType: session.session_type,
    status: session.status,
    modelId: session.model_id,
    tokensUsed: session.tokens_used,
    tokenBudget: session.token_budget,
    transcript: session.transcript ?? [],
    topics: session.topics ?? [],
    summary: session.summary,
    agentState: session.agent_state,
    createdAt: session.created_at,
    updatedAt: session.updated_at
  };
}

function normalizeTicket(ticket: ApiTimeTicket): TimeTicket {
  return {
    id: ticket.id ?? "",
    tickerId: ticket.tickerId ?? ticket.ticker_id ?? "",
    slotId: ticket.slotId ?? ticket.slot_id ?? "",
    capacityWindowId: ticket.capacityWindowId ?? ticket.capacity_window_id ?? "",
    issuerUserId: ticket.issuerUserId ?? ticket.issuer_user_id ?? "",
    ownerUserId: ticket.ownerUserId ?? ticket.owner_user_id,
    title: ticket.title ?? "Time ticket",
    interactionType: ticket.interactionType ?? ticket.interaction_type ?? "human",
    startsAt: ticket.startsAt ?? ticket.starts_at ?? new Date().toISOString(),
    endsAt: ticket.endsAt ?? ticket.ends_at ?? new Date().toISOString(),
    durationMinutes: ticket.durationMinutes ?? ticket.duration_minutes ?? 30,
    basePriceCents: ticket.basePriceCents ?? ticket.base_price_cents ?? 0,
    currentPriceCents: ticket.currentPriceCents ?? ticket.current_price_cents ?? ticket.list_price_cents ?? ticket.base_price_cents ?? 0,
    listPriceCents: ticket.listPriceCents ?? ticket.list_price_cents ?? ticket.current_price_cents ?? ticket.base_price_cents ?? 0,
    seatIndex: ticket.seatIndex ?? ticket.seat_index ?? 1,
    status: ticket.status ?? "listed",
    tradeHaltsAt: ticket.tradeHaltsAt ?? ticket.trade_halts_at ?? new Date().toISOString(),
    resaleCount: ticket.resaleCount ?? ticket.resale_count ?? 0
  };
}

function normalizeSlot(slot: ApiSlot): Slot {
  return {
    id: slot.id ?? "",
    tickerId: slot.tickerId ?? slot.ticker_id ?? "",
    slotName: slot.slotName ?? slot.slot_name ?? "Time slot",
    slotType: slot.slotType ?? slot.slot_type ?? "human",
    tokenBudget: slot.tokenBudget ?? slot.token_budget ?? 0,
    privacyLevel: slot.privacyLevel ?? slot.privacy_level ?? "seller_private",
    knowledgeBaseId: slot.knowledgeBaseId ?? slot.knowledge_base_id,
    unifiedBasePriceCents: slot.unifiedBasePriceCents ?? slot.unified_base_price_cents ?? 0,
    defaultCapacityLimit: slot.defaultCapacityLimit ?? slot.default_capacity_limit ?? 1,
    isActive: slot.isActive ?? slot.is_active ?? true
  };
}

function normalizeExperiencePersona(persona: ApiExperiencePersona): ExperiencePersona {
  return {
    id: persona.id ?? persona.symbol ?? "",
    symbol: persona.symbol ?? "",
    displayName: persona.displayName ?? persona.display_name ?? persona.symbol ?? "Experience",
    tagline: persona.tagline ?? "",
    bio: persona.bio ?? "",
    portraitUrl: absoluteApiImageUrl(persona.portraitUrl ?? persona.portrait_url),
    avatarUrl: absoluteApiImageUrl(persona.tradeLogoUrl ?? persona.trade_logo_url ?? persona.chatAvatarUrl ?? persona.chat_avatar_url ?? persona.avatarUrl ?? persona.avatar_url),
    verifiedBadge: persona.verifiedBadge ?? persona.verified_badge ?? false,
    experiencePriceCents: persona.experiencePriceCents ?? persona.experience_price_cents ?? 0,
    basePriceCents: persona.basePriceCents ?? persona.base_price_cents ?? 0,
    nextAvailableAt: persona.nextAvailableAt ?? persona.next_available_at ?? new Date().toISOString(),
    conversationOwnerId: persona.conversationOwnerId ?? persona.conversation_owner_id ?? ""
  };
}

function normalizeWindow(window: ApiCapacityWindow, tickets: TimeTicket[] = []): CapacityWindow {
  const matchingTickets = tickets.filter((ticket) => ticket.capacityWindowId === (window.id ?? ""));
  const listedTicket = matchingTickets.find((ticket) => ticket.status === "listed" || ticket.status === "relisted");
  const basePriceCents = window.basePriceCents ?? window.base_price_cents ?? listedTicket?.basePriceCents ?? 0;

  return {
    id: window.id ?? "",
    tickerId: window.tickerId ?? window.ticker_id ?? listedTicket?.tickerId ?? "",
    slotId: window.slotId ?? window.slot_id ?? listedTicket?.slotId ?? "",
    startsAt: window.startsAt ?? window.starts_at ?? listedTicket?.startsAt ?? new Date().toISOString(),
    endsAt: window.endsAt ?? window.ends_at ?? listedTicket?.endsAt ?? new Date().toISOString(),
    durationMinutes: window.durationMinutes ?? window.duration_minutes ?? listedTicket?.durationMinutes ?? 30,
    capacityLimit: window.capacityLimit ?? window.capacity_limit ?? 1,
    soldCount: window.soldCount ?? window.sold_count ?? 0,
    remainingCapacity: window.remainingCapacity ?? window.remaining_capacity ?? 0,
    basePriceCents,
    minSalePriceCents: window.minSalePriceCents ?? window.min_sale_price_cents ?? basePriceCents,
    currentPriceCents: window.currentPriceCents ?? window.current_price_cents ?? listedTicket?.listPriceCents ?? basePriceCents,
    status: window.status ?? "listed",
    tradeHaltsAt: window.tradeHaltsAt ?? window.trade_halts_at ?? listedTicket?.tradeHaltsAt ?? new Date().toISOString(),
    demandScore: window.demandScore ?? window.demand_score ?? Math.min(10, matchingTickets.length)
  };
}

function normalizeTicker(ticker: ApiTicker, windows: CapacityWindow[] = []): Ticker {
  const nextWindow = windows.find((window) => window.remainingCapacity > 0) ?? windows[0];

  return {
    id: ticker.id ?? "",
    symbol: ticker.symbol ?? "",
    displayName: ticker.displayName ?? ticker.display_name ?? ticker.symbol ?? "Ticker",
    tagline: ticker.tagline ?? "",
    bio: ticker.bio ?? "",
    avatarUrl: absoluteApiImageUrl(ticker.avatarUrl ?? ticker.avatar_url),
    verifiedBadge: ticker.verifiedBadge ?? ticker.verified_badge ?? false,
    basePriceCents: ticker.basePriceCents ?? ticker.base_price_cents ?? nextWindow?.basePriceCents ?? 0,
    nextAvailableAt: ticker.nextAvailableAt ?? ticker.next_available_at ?? nextWindow?.startsAt ?? new Date().toISOString(),
    activityLabel: ticker.activityLabel ?? ticker.activity_label ?? `${windows.length} windows`
  };
}

function normalizeTradeMarket(summary: ApiTradeMarketSummary, index: number): TradeMarket | null {
  if (!summary.ticker) return null;
  const nextWindow = summary.next_available_window ? normalizeWindow(summary.next_available_window) : undefined;
  const ticker = normalizeTicker(summary.ticker, nextWindow ? [nextWindow] : []);
  const basePriceCents = summary.base_price_cents ?? ticker.basePriceCents ?? nextWindow?.basePriceCents ?? 0;
  const activity = summary.activity ?? 0;
  const changePercent = 4 + ((activity + index * 7) % 36);
  const lastPriceCents = basePriceCents > 0 ? basePriceCents + Math.round((basePriceCents * changePercent) / 100) : 0;

  return {
    id: ticker.id || ticker.symbol,
    symbol: ticker.symbol,
    displayName: ticker.displayName,
    tagline: ticker.tagline,
    avatarUrl: ticker.avatarUrl,
    verifiedBadge: ticker.verifiedBadge,
    basePriceCents,
    lastPriceCents,
    changePercent,
    volumeSeats: Math.max(1, activity * 7 + 12 + index * 5),
    nextAvailableAt: nextWindow?.startsAt ?? ticker.nextAvailableAt,
    activityLabel: ticker.activityLabel
  };
}

function normalizeKnowledgeBase(kb: ApiKnowledgeBase): KnowledgeBase {
  return {
    id: kb.id ?? "",
    slotId: kb.slotId ?? kb.slot_id ?? "",
    name: kb.name ?? "Knowledge base",
    summary: kb.summary ?? "",
    documentCount: kb.documentCount ?? kb.document_count ?? 0,
    demoSourceNames: kb.demoSourceNames ?? kb.demo_source_names ?? [],
    status: kb.status ?? "empty",
    importedByOneClick: kb.importedByOneClick ?? kb.imported_by_one_click ?? false
  };
}

function normalizeReceipt(receipt: ApiTicketReceipt): TicketReceipt {
  return {
    id: receipt.id ?? "",
    ticketId: receipt.ticketId ?? receipt.ticket_id ?? "",
    receiptCode: receipt.receiptCode ?? receipt.receipt_code ?? "",
    buyerUserId: receipt.buyerUserId ?? receipt.buyer_user_id ?? "",
    sellerUserId: receipt.sellerUserId ?? receipt.seller_user_id ?? "",
    sessionId: receipt.sessionId ?? receipt.session_id ?? "",
    priceCents: receipt.priceCents ?? receipt.price_cents ?? 0,
    sellerFeeCents: receipt.sellerFeeCents ?? receipt.seller_fee_cents ?? receipt.seller_royalty_cents ?? 0,
    platformFeeCents: receipt.platformFeeCents ?? receipt.platform_fee_cents ?? 0,
    timezone: receipt.timezone ?? "Asia/Shanghai",
    issuedAt: receipt.issuedAt ?? receipt.issued_at ?? new Date().toISOString()
  };
}

function normalizeMarketEvent(event: ApiMarketEvent): MarketEvent {
  return {
    id: event.id ?? "",
    ticketId: event.ticketId ?? event.ticket_id,
    eventType: event.eventType ?? event.event_type ?? "primary",
    priceCents: event.priceCents ?? event.price_cents,
    message: event.message ?? "",
    createdAt: event.createdAt ?? event.created_at ?? new Date().toISOString()
  };
}

export const timexApi = {
  health: () => request<{ ok: boolean }>("/healthz"),
  ready: () => request<{ ok: boolean }>("/readyz"),
  me: async () => {
    const response = await request<MeResponse>("/api/me");
    if (!response.authenticated || !response.user) {
      return { authenticated: false as const, user: null, balanceCents: null };
    }
    return {
      authenticated: true as const,
      user: normalizeUser(response.user),
      balanceCents: response.balance_cents ?? response.user.balance_cents
    };
  },
  registerOrLogin: async (loginName: string, password: string) => {
    const response = await request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: { login_name: loginName, password }
    });
    return {
      user: normalizeUser(response.user),
      token: response.token,
      created: response.created === true
    };
  },
  login: async (loginName: string, password: string) => {
    const response = await request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: { login_name: loginName, password }
    });
    return {
      user: normalizeUser(response.user),
      token: response.token
    };
  },
  logout: () => request<{ status: string }>("/api/auth/logout", { method: "POST" }),
  profile: async () => {
    const response = await request<{ profile: ApiUser | { anonymous_read_only?: boolean; display_name?: string } }>("/api/profile");
    if (!("id" in response.profile)) return { profile: null };
    return { profile: normalizeUser(response.profile) };
  },
  publicProfile: async (symbol: string) => {
    const response = await request<{ profile: ApiUser; can_edit?: boolean }>(`/api/profiles/${encodeURIComponent(symbol)}`);
    return { profile: normalizeUser(response.profile), canEdit: response.can_edit === true };
  },
  updateProfile: async (payload: ProfilePayload) => {
    const response = await request<{ profile: ApiUser }>("/api/profile", {
      method: "PATCH",
      body: profilePayloadBody(payload)
    });
    return { profile: normalizeUser(response.profile) };
  },
  importProfileLinks: async (links: string[]) =>
    request<{
      suggestion: {
        display_name?: string;
        avatar_url?: string;
        headline?: string;
        organization?: string;
        expertise?: string[];
        bio?: string;
        links?: ProfileLink[];
        offer?: string;
        imported_from?: number;
      };
      imports: Array<{ url: string; type: string; title?: string; description?: string; status: string }>;
    }>("/api/profile/import-links", {
      method: "POST",
      body: { links }
    }),
  discover: () =>
    request<{
      tickers: Ticker[];
      recentEvents: MarketEvent[];
      soonestWindows: CapacityWindow[];
    }>("/api/discover"),
  tradeMarkets: async () => {
    const response = await request<{
      trending_tickers?: ApiTradeMarketSummary[];
      anonymous_read_only?: boolean;
    }>("/api/discover");
    return {
      markets: (response.trending_tickers ?? [])
        .map((summary, index) => normalizeTradeMarket(summary, index))
        .filter((market): market is TradeMarket => market !== null && market.symbol !== "")
    };
  },
  calendar: async (symbol: string) => {
    const response = await request<{
      ticker: ApiTicker;
      slots?: ApiSlot[];
      windows?: ApiCapacityWindow[];
      tickets?: ApiTimeTicket[];
      knowledge_bases?: ApiKnowledgeBase[];
      knowledgeBases?: ApiKnowledgeBase[];
    }>(`/api/calendar/${encodeURIComponent(symbol)}`);
    const tickets = (response.tickets ?? []).map(normalizeTicket);
    const windows = (response.windows ?? []).map((window) => normalizeWindow(window, tickets));
    return {
      ticker: normalizeTicker(response.ticker, windows),
      slots: (response.slots ?? []).map(normalizeSlot),
      windows,
      tickets,
      knowledgeBases: (response.knowledge_bases ?? response.knowledgeBases ?? []).map(normalizeKnowledgeBase)
    };
  },
  market: async (symbol: string) => {
    const response = await request<{
      ticker: ApiTicker;
      windows?: ApiCapacityWindow[];
      listed_tickets?: ApiTimeTicket[];
      tickets?: ApiTimeTicket[];
      market_events?: ApiMarketEvent[];
      events?: ApiMarketEvent[];
    }>(`/api/market/${encodeURIComponent(symbol)}`);
    const tickets = (response.listed_tickets ?? response.tickets ?? []).map(normalizeTicket);
    const windows = (response.windows ?? []).map((window) => normalizeWindow(window, tickets));
    return {
      ticker: normalizeTicker(response.ticker, windows),
      tickets,
      windows,
      events: (response.market_events ?? response.events ?? []).map(normalizeMarketEvent)
    };
  },
  holdings: async () => {
    const response = await request<{
      tickets?: ApiTimeTicket[];
      holdings?: ApiTimeTicket[];
      sessions?: ApiConversationSession[];
      tickers?: ApiTicker[];
      windows?: ApiCapacityWindow[];
      profiles?: ApiUser[];
    }>("/api/holdings");
    const tickets = (response.tickets ?? response.holdings ?? []).map(normalizeTicket);
    return {
      tickets,
      sessions: (response.sessions ?? []).map(normalizeConversationSession),
      tickers: (response.tickers ?? []).map((ticker) => normalizeTicker(ticker)),
      windows: (response.windows ?? []).map((window) => normalizeWindow(window, tickets)),
      profiles: (response.profiles ?? []).map(normalizeUser)
    };
  },
  buySeat: async (windowId: string, priceCents: number, timezone = "Asia/Shanghai") => {
    const response = await request<{ ticket: ApiTimeTicket; receipt: ApiTicketReceipt }>(
      `/api/windows/${encodeURIComponent(windowId)}/buy-seat`,
      {
        method: "POST",
        body: { price_cents: priceCents, timezone }
      }
    );
    return { ticket: normalizeTicket(response.ticket), receipt: normalizeReceipt(response.receipt) };
  },
  buyTicket: async (ticketId: string, priceCents: number, timezone = "Asia/Shanghai") => {
    const response = await request<{ ticket: ApiTimeTicket; receipt: ApiTicketReceipt }>(
      `/api/tickets/${encodeURIComponent(ticketId)}/buy`,
      {
        method: "POST",
        body: { price_cents: priceCents, timezone }
      }
    );
    return { ticket: normalizeTicket(response.ticket), receipt: normalizeReceipt(response.receipt) };
  },
  runtimeHealth: () => request<RuntimeConfig>("/api/runtime/health"),
  conversation: async (sessionId: string) => {
    const response = await request<{ session: ApiConversationSession; buyer_profile?: ApiUser; seller_profile?: ApiUser }>(`/api/sessions/${sessionId}`);
    return {
      session: normalizeConversationSession(response.session),
      buyerProfile: response.buyer_profile ? normalizeUser(response.buyer_profile) : undefined,
      sellerProfile: response.seller_profile ? normalizeUser(response.seller_profile) : undefined
    };
  },
  startConversation: async (ticketId: string) => {
    const response = await request<{ session: ApiConversationSession }>("/api/sessions/start", {
      method: "POST",
      body: { ticket_id: ticketId }
    });
    return { session: normalizeConversationSession(response.session) };
  },
  startDirectConversation: async (modelId?: string) => {
    const response = await request<{ session: ApiConversationSession; profile: ApiUser; runtime: RuntimeConfig }>(
      "/api/conversation/start",
      {
        method: "POST",
        body: { model_id: modelId ?? "" }
      }
    );
    return {
      session: normalizeConversationSession(response.session),
      profile: normalizeUser(response.profile),
      runtime: response.runtime
    };
  },
  experienceOptions: async () => {
    const response = await request<{ personas?: ApiExperiencePersona[] }>("/api/conversations/experience-options");
    return { personas: (response.personas ?? []).map(normalizeExperiencePersona) };
  },
  startExperienceConversation: async (symbol: string, modelId?: string) => {
    const response = await request<{
      session: ApiConversationSession;
      persona?: ApiExperiencePersona;
      balance_cents?: number;
      runtime: RuntimeConfig;
    }>("/api/conversations/experience", {
      method: "POST",
      body: { symbol, model_id: modelId ?? "" }
    });
    return {
      session: normalizeConversationSession(response.session),
      persona: response.persona ? normalizeExperiencePersona(response.persona) : undefined,
      balanceCents: response.balance_cents ?? 0,
      runtime: response.runtime
    };
  },
  sendConversationMessage: async (sessionId: string, content: string, modelId?: string) => {
    const response = await request<{ session: ApiConversationSession }>(`/api/sessions/${sessionId}/message`, {
      method: "POST",
      body: { content, model_id: modelId ?? "" }
    });
    return { session: normalizeConversationSession(response.session) };
  },
  uploadPortrait: async (file: File) => {
    const body = new FormData();
    body.set("portrait", file);
    const response = await fetch(`${API_BASE}/api/profile/portrait`, {
      method: "POST",
      body,
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new ApiError("Portrait upload failed", response.status);
    }

    const payload = (await response.json()) as { profile: ApiUser; portrait_url: string };
    return { profile: normalizeUser(payload.profile), portrait_url: payload.portrait_url };
  },
  uploadProfileImages: async ({ portrait, avatar, logo }: { portrait?: File; avatar?: File; logo?: File }) => {
    const body = new FormData();
    if (portrait) body.set("portrait", portrait);
    if (avatar) body.set("avatar", avatar);
    if (logo) body.set("logo", logo);
    const response = await fetch(`${API_BASE}/api/profile/portrait`, {
      method: "POST",
      body,
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new ApiError("Profile image upload failed", response.status);
    }

    const payload = (await response.json()) as {
      profile: ApiUser;
      portrait_url: string;
      chat_avatar_url: string;
      trade_logo_url: string;
    };
    return {
      profile: normalizeUser(payload.profile),
      portraitUrl: payload.portrait_url,
      chatAvatarUrl: payload.chat_avatar_url,
      tradeLogoUrl: payload.trade_logo_url
    };
  }
};

export function formatMoney(cents: number, lang: Lang = "en"): string {
  return new Intl.NumberFormat(localeForLang(lang), {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2
  }).format(cents / 100);
}

export function formatShortDateTime(value: string, lang: Lang = "en"): string {
  return new Intl.DateTimeFormat(localeForLang(lang), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function middleEllipsis(value: string, left = 6, right = 4): string {
  if (value.length <= left + right + 3) return value;
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}
