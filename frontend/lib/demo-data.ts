import type {
  CapacityWindow,
  ConversationSession,
  DiscoverPersona,
  KnowledgeBase,
  MarketEvent,
  Slot,
  Ticker,
  TicketReceipt,
  TimeTicket
} from "./types";

const now = new Date("2026-05-01T09:30:00+08:00");

function addHours(hours: number): string {
  const date = new Date(now);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

export const demoTickers: Ticker[] = [
  {
    id: "ticker-ayuan",
    symbol: "AYUAN",
    displayName: "AYuan",
    tagline: "",
    bio: "",
    avatarUrl: "/avatar/AYuan.png",
    verifiedBadge: true,
    basePriceCents: 12000,
    nextAvailableAt: addHours(30),
    activityLabel: "42 trades today"
  },
  {
    id: "ticker-weiyang",
    symbol: "WEIYANG",
    displayName: "Weiyang",
    tagline: "",
    bio: "",
    avatarUrl: "/avatar/Weiyang.png",
    verifiedBadge: true,
    basePriceCents: 9000,
    nextAvailableAt: addHours(52),
    activityLabel: "18 bookings"
  }
];

export const demoDiscoverPersonas: DiscoverPersona[] = [
  {
    id: "persona-ayuan",
    symbol: "AYUAN",
    displayName: "AYuan",
    tagline: "",
    bio: "",
    portraitUrl: "/avatar/AYuan.png",
    avatarUrl: "/avatar/AYuan.png",
    verifiedBadge: true,
    basePriceCents: 12000,
    currentPriceCents: 16800,
    priceChangePercent: 40,
    heatScore: 86,
    trendingScore: 92,
    nextAvailableAt: addHours(18),
    chatAvailableAt: addHours(18),
    source: "default"
  },
  {
    id: "persona-weiyang",
    symbol: "WEIYANG",
    displayName: "Weiyang",
    tagline: "",
    bio: "",
    portraitUrl: "/avatar/Weiyang.png",
    avatarUrl: "/avatar/Weiyang.png",
    verifiedBadge: true,
    basePriceCents: 9000,
    currentPriceCents: 11700,
    priceChangePercent: 30,
    heatScore: 78,
    trendingScore: 84,
    nextAvailableAt: addHours(30),
    chatAvailableAt: addHours(30),
    source: "default"
  }
];

export const demoSlots: Slot[] = [
  {
    id: "slot-ayuan-human",
    tickerId: "ticker-ayuan",
    slotName: "Operator session",
    slotType: "human",
    tokenBudget: 18000,
    privacyLevel: "seller_private",
    knowledgeBaseId: "kb-ayuan",
    unifiedBasePriceCents: 12000,
    defaultCapacityLimit: 4,
    isActive: true
  },
  {
    id: "slot-weiyang-human",
    tickerId: "ticker-weiyang",
    slotName: "AI product diagnosis",
    slotType: "human",
    tokenBudget: 9000,
    privacyLevel: "seller_private",
    knowledgeBaseId: "kb-weiyang",
    unifiedBasePriceCents: 9000,
    defaultCapacityLimit: 2,
    isActive: true
  }
];

export const demoWindows: CapacityWindow[] = [
  {
    id: "window-ayuan-01",
    tickerId: "ticker-ayuan",
    slotId: "slot-ayuan-human",
    startsAt: addHours(30),
    endsAt: addHours(30.5),
    durationMinutes: 30,
    capacityLimit: 4,
    soldCount: 3,
    remainingCapacity: 1,
    basePriceCents: 12000,
    minSalePriceCents: 12000,
    currentPriceCents: 16800,
    status: "listed",
    tradeHaltsAt: addHours(18),
    demandScore: 8
  },
  {
    id: "window-ayuan-02",
    tickerId: "ticker-ayuan",
    slotId: "slot-ayuan-human",
    startsAt: addHours(54),
    endsAt: addHours(54.5),
    durationMinutes: 30,
    capacityLimit: 4,
    soldCount: 4,
    remainingCapacity: 0,
    basePriceCents: 12000,
    minSalePriceCents: 12000,
    currentPriceCents: 18200,
    status: "halted",
    tradeHaltsAt: addHours(42),
    demandScore: 10
  },
  {
    id: "window-weiyang-01",
    tickerId: "ticker-weiyang",
    slotId: "slot-weiyang-human",
    startsAt: addHours(76),
    endsAt: addHours(76.5),
    durationMinutes: 30,
    capacityLimit: 2,
    soldCount: 1,
    remainingCapacity: 1,
    basePriceCents: 9000,
    minSalePriceCents: 9000,
    currentPriceCents: 10100,
    status: "listed",
    tradeHaltsAt: addHours(64),
    demandScore: 6
  }
];

export const demoTickets: TimeTicket[] = [
  {
    id: "ticket-ayuan-seat-3",
    tickerId: "ticker-ayuan",
    slotId: "slot-ayuan-human",
    capacityWindowId: "window-ayuan-01",
    issuerUserId: "user-seller-ayuan",
    ownerUserId: "user-demo",
    title: "AYUAN Operator session",
    interactionType: "human",
    startsAt: addHours(30),
    endsAt: addHours(30.5),
    durationMinutes: 30,
    basePriceCents: 12000,
    currentPriceCents: 16800,
    listPriceCents: 16800,
    seatIndex: 3,
    status: "owned",
    tradeHaltsAt: addHours(18),
    resaleCount: 1
  },
  {
    id: "ticket-weiyang-seat-1",
    tickerId: "ticker-weiyang",
    slotId: "slot-weiyang-human",
    capacityWindowId: "window-weiyang-01",
    issuerUserId: "user-seller-weiyang",
    ownerUserId: "user-demo",
    title: "WEIYANG AI product diagnosis",
    interactionType: "human",
    startsAt: addHours(76),
    endsAt: addHours(76.5),
    durationMinutes: 30,
    basePriceCents: 9000,
    currentPriceCents: 10100,
    listPriceCents: 10100,
    seatIndex: 1,
    status: "relisted",
    tradeHaltsAt: addHours(64),
    resaleCount: 0
  }
];

export const demoKnowledgeBases: KnowledgeBase[] = [
  {
    id: "kb-ayuan",
    slotId: "slot-ayuan-human",
    name: "AYuan knowledge base",
    summary: "",
    documentCount: 0,
    demoSourceNames: [],
    status: "empty",
    importedByOneClick: false
  },
  {
    id: "kb-weiyang",
    slotId: "slot-weiyang-human",
    name: "Weiyang knowledge base",
    summary: "",
    documentCount: 0,
    demoSourceNames: [],
    status: "empty",
    importedByOneClick: false
  }
];

export const demoEvents: MarketEvent[] = [
  {
    id: "event-01",
    ticketId: "ticket-ayuan-seat-3",
    eventType: "secondary",
    priceCents: 16800,
    message: "T+0 transfer settled for AYUAN seat 3",
    createdAt: addHours(-1)
  },
  {
    id: "event-02",
    ticketId: "ticket-weiyang-seat-1",
    eventType: "relist",
    priceCents: 10100,
    message: "WEIYANG holder relisted above base floor",
    createdAt: addHours(-2)
  },
  {
    id: "event-03",
    eventType: "timing",
    priceCents: -700,
    message: "Extension queue shows negative net timing price",
    createdAt: addHours(-3)
  }
];

export const demoReceipt: TicketReceipt = {
  id: "receipt-ayuan-seat-3",
  ticketId: "ticket-ayuan-seat-3",
  receiptCode: "TX-AYUAN-3F7K",
  buyerUserId: "user-demo",
  sellerUserId: "user-seller-ayuan",
  sessionId: "sess-ayuan-user-demo-ticket-ayuan-seat-3",
  priceCents: 16800,
  sellerFeeCents: 2520,
  platformFeeCents: 840,
  timezone: "Asia/Shanghai",
  issuedAt: addHours(-1)
};

export const demoConversation: ConversationSession = {
  id: "conversation-ayuan",
  sessionId: "sess-ayuan-user-demo-ticket-ayuan-seat-3",
  ticketId: "ticket-ayuan-seat-3",
  buyerUserId: "user-demo",
  sellerUserId: "user-seller-ayuan",
  sessionType: "human",
  status: "preview",
  tokensUsed: 7200,
  tokenBudget: 18000,
  transcript: [],
  topics: [
    {
      id: "topic-01",
      title: "Market timing",
      summary: "Buyer asks whether to move earlier or accept delayed capacity.",
      confidence: 0.88
    },
    {
      id: "topic-02",
      title: "Base floor",
      summary: "Agent keeps sale, relist, and cut-in prices above unified base.",
      confidence: 0.84
    }
  ],
  summary: "Preview session connected to a valid ticket receipt and seller-private knowledge base."
};
