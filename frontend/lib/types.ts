export type ProfileLink = {
  type: "linkedin" | "twitter" | "github" | "website" | "linktree" | "substack" | "medium" | "youtube" | "product" | "other";
  url: string;
};

export type TimeXUser = {
  id: string;
  loginName: string;
  email?: string;
  displayName: string;
  tickerSymbol?: string;
  avatarUrl?: string;
  initialInfo?: string;
  headline?: string;
  organization?: string;
  mbti?: string;
  expertise?: string[];
  bio?: string;
  links?: ProfileLink[];
  offer?: string;
  portraitUrl?: string;
  chatAvatarUrl?: string;
  tradeLogoUrl?: string;
  agentBasePriceCents?: number;
  balanceCents: number;
  createdAt: string;
};

export type AnonymousSession = {
  kind: "anonymous";
  label: string;
  balanceCents: null;
};

export type AuthenticatedSession = {
  kind: "authenticated";
  user: TimeXUser;
  balanceCents: number;
};

export type TimeXSession = AnonymousSession | AuthenticatedSession;

export type SlotType = "human" | "agent" | "hybrid" | "agent_vs_agent";

export type TicketStatus =
  | "draft"
  | "listed"
  | "owned"
  | "relisted"
  | "halted"
  | "defaulting"
  | "cut_in_available"
  | "in_session"
  | "completed"
  | "cancelled";

export type Ticker = {
  id: string;
  symbol: string;
  displayName: string;
  tagline: string;
  bio: string;
  avatarUrl?: string;
  verifiedBadge: boolean;
  basePriceCents: number;
  nextAvailableAt: string;
  activityLabel: string;
};

export type TradeMarket = {
  id: string;
  symbol: string;
  displayName: string;
  tagline: string;
  avatarUrl?: string;
  verifiedBadge: boolean;
  basePriceCents: number;
  lastPriceCents: number;
  changePercent: number;
  volumeSeats: number;
  nextAvailableAt: string;
  activityLabel: string;
};

export type DiscoverPersona = {
  id: string;
  symbol: string;
  displayName: string;
  tagline: string;
  bio: string;
  portraitUrl?: string;
  avatarUrl?: string;
  verifiedBadge: boolean;
  basePriceCents: number;
  currentPriceCents: number;
  priceChangePercent: number;
  heatScore: number;
  trendingScore: number;
  nextAvailableAt: string;
  chatAvailableAt: string;
  source: "default" | "registered";
};

export type ExperiencePersona = {
  id: string;
  symbol: string;
  displayName: string;
  tagline: string;
  bio: string;
  portraitUrl?: string;
  avatarUrl?: string;
  verifiedBadge: boolean;
  experiencePriceCents: number;
  basePriceCents: number;
  nextAvailableAt: string;
  conversationOwnerId: string;
};

export type Slot = {
  id: string;
  tickerId: string;
  slotName: string;
  slotType: SlotType;
  tokenBudget: number;
  privacyLevel: "public" | "private" | "seller_private";
  knowledgeBaseId?: string;
  unifiedBasePriceCents: number;
  defaultCapacityLimit: number;
  isActive: boolean;
};

export type CapacityWindow = {
  id: string;
  tickerId: string;
  slotId: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  capacityLimit: number;
  soldCount: number;
  remainingCapacity: number;
  basePriceCents: number;
  minSalePriceCents: number;
  currentPriceCents: number;
  status: TicketStatus;
  tradeHaltsAt: string;
  demandScore: number;
};

export type TimeTicket = {
  id: string;
  tickerId: string;
  slotId: string;
  capacityWindowId: string;
  issuerUserId: string;
  ownerUserId?: string;
  title: string;
  interactionType: SlotType;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  basePriceCents: number;
  currentPriceCents: number;
  listPriceCents: number;
  seatIndex: number;
  status: TicketStatus;
  tradeHaltsAt: string;
  resaleCount: number;
};

export type TicketReceipt = {
  id: string;
  ticketId: string;
  receiptCode: string;
  buyerUserId: string;
  sellerUserId: string;
  sessionId: string;
  priceCents: number;
  sellerFeeCents: number;
  platformFeeCents: number;
  timezone: string;
  issuedAt: string;
};

export type MarketEvent = {
  id: string;
  ticketId?: string;
  eventType: "primary" | "secondary" | "buy" | "buy_seat" | "relist" | "halt" | "default" | "cut_in" | "timing" | "experience";
  priceCents?: number;
  message: string;
  createdAt: string;
};

export type TimingOrder = {
  id: string;
  tickerId: string;
  orderType: "speed_up" | "extension";
  targetTime: string;
  limitPriceCents: number;
  allowNegativePrice: boolean;
  status: "open" | "matched" | "cancelled";
};

export type KnowledgeBase = {
  id: string;
  slotId: string;
  name: string;
  summary: string;
  documentCount: number;
  demoSourceNames: string[];
  status: "ready" | "importing" | "empty";
  importedByOneClick: boolean;
};

export type ConversationTopic = {
  id: string;
  title: string;
  summary: string;
  confidence: number;
};

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant" | "agent" | "buyer_agent" | "seller_agent";
  content: string;
  created_at: string;
};

export type ConversationSession = {
  id: string;
  sessionId: string;
  ticketId: string;
  buyerUserId: string;
  sellerUserId: string;
  sessionType: SlotType;
  status: "preview" | "idle" | "thinking" | "speaking" | "active" | "completed" | "ended";
  modelId?: string;
  tokensUsed: number;
  tokenBudget: number;
  transcript: ConversationMessage[];
  topics: ConversationTopic[];
  summary?: string;
  agentState?: "idle" | "thinking" | "speaking";
  createdAt?: string;
  updatedAt?: string;
};

export type RuntimeModelConfig = {
  id: string;
  name: string;
  provider: string;
  api_format: string;
  base_url?: string;
  model: string;
  max_tokens: number;
  temperature: number;
  status: "ready" | "missing_key" | string;
  configured_by_environment: boolean;
  created_at: string;
};

export type RuntimeConfig = {
  id: string;
  provider: string;
  status: string;
  configured_by_environment: boolean;
  mock_enabled: boolean;
  last_health_check_at: string;
  user_facing_runtime_setup_flow: boolean;
  default_model_id?: string;
  configured_models?: RuntimeModelConfig[];
};

export type UiState = "loading" | "empty" | "error" | "success" | "disabled";
