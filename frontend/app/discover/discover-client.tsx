"use client";

import { ArrowDownUp, Flame, Search, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DiscoverPersonaCard } from "../../components/discover-persona-card";
import { useI18n } from "../../components/i18n-provider";
import { Badge, LoadingRows } from "../../components/ui";
import { API_BASE, timexApi } from "../../lib/api";
import { isSelfConversationTarget } from "../../lib/default-conversations";
import { demoDiscoverPersonas } from "../../lib/demo-data";
import type { DiscoverPersona, TimeXUser } from "../../lib/types";

type SortKey = "trending" | "heat" | "price" | "gain";

type RawRegisteredPersona = {
  id?: string;
  symbol?: string;
  display_name?: string;
  displayName?: string;
  tagline?: string;
  bio?: string;
  portrait_url?: string;
  portraitUrl?: string;
  avatar_url?: string;
  avatarUrl?: string;
  chat_avatar_url?: string;
  chatAvatarUrl?: string;
  trade_logo_url?: string;
  tradeLogoUrl?: string;
  verified_badge?: boolean;
  verifiedBadge?: boolean;
  base_price_cents?: number;
  basePriceCents?: number;
  current_price_cents?: number;
  currentPriceCents?: number;
  price_change_percent?: number;
  priceChangePercent?: number;
  heat_score?: number;
  heatScore?: number;
  trending_score?: number;
  trendingScore?: number;
  next_available_at?: string;
  nextAvailableAt?: string;
  chat_available_at?: string;
  chatAvailableAt?: string;
};

const sortOptions: Array<{ key: SortKey; labelKey: string }> = [
  { key: "trending", labelKey: "discover.sort.trending" },
  { key: "heat", labelKey: "discover.sort.heat" },
  { key: "price", labelKey: "discover.sort.price" },
  { key: "gain", labelKey: "discover.sort.gain" }
];

function absolutePortraitUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/avatar/")) return value;
  if (value.startsWith("/")) return `${API_BASE}${value}`;
  return value;
}

function fallbackDate(hours: number): string {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function normalizeRegisteredPersona(raw: RawRegisteredPersona, index: number): DiscoverPersona {
  const id = raw.id ?? `registered-${index}`;
  const displayName = raw.display_name ?? raw.displayName ?? `User ${index + 1}`;
  const basePriceCents = raw.base_price_cents ?? raw.basePriceCents ?? 8000 + index * 1500;
  const currentPriceCents = raw.current_price_cents ?? raw.currentPriceCents ?? Math.round(basePriceCents * (1.12 + index * 0.04));
  const gain = raw.price_change_percent ?? raw.priceChangePercent ?? Math.max(8, Math.round(((currentPriceCents - basePriceCents) / basePriceCents) * 100));
  const heat = raw.heat_score ?? raw.heatScore ?? 55 + ((index * 11) % 38);
  const nextAt = raw.next_available_at ?? raw.nextAvailableAt ?? fallbackDate(12 + index * 6);

  return {
    id,
    symbol: (raw.symbol ?? displayName.slice(0, 4)).replace(/[^a-z0-9]/gi, "").toUpperCase() || `U${index + 1}`,
    displayName,
    tagline: raw.tagline ?? "",
    bio: raw.bio ?? "",
    portraitUrl: absolutePortraitUrl(raw.portrait_url ?? raw.portraitUrl),
    avatarUrl: absolutePortraitUrl(raw.trade_logo_url ?? raw.tradeLogoUrl ?? raw.chat_avatar_url ?? raw.chatAvatarUrl ?? raw.avatar_url ?? raw.avatarUrl),
    verifiedBadge: raw.verified_badge ?? raw.verifiedBadge ?? false,
    basePriceCents,
    currentPriceCents,
    priceChangePercent: gain,
    heatScore: heat,
    trendingScore: raw.trending_score ?? raw.trendingScore ?? heat + gain,
    nextAvailableAt: nextAt,
    chatAvailableAt: raw.chat_available_at ?? raw.chatAvailableAt ?? nextAt,
    source: "registered"
  };
}

function isDiscoverRegisteredPersona(persona: DiscoverPersona): boolean {
  const symbol = persona.symbol.toUpperCase();
  const name = persona.displayName.toLowerCase();
  return (
    symbol !== "AYUAN" &&
    symbol !== "WEIYANG" &&
    !symbol.startsWith("SMK") &&
    !name.includes("smoke") &&
    !name.includes("buyer")
  );
}

export function DiscoverClient() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("trending");
  const [registeredPersonas, setRegisteredPersonas] = useState<DiscoverPersona[]>([]);
  const [currentUser, setCurrentUser] = useState<TimeXUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadRegisteredPersonas() {
      try {
        const response = await fetch(`${API_BASE}/api/discover`, {
          credentials: "include",
          headers: { Accept: "application/json" }
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { registered_users?: RawRegisteredPersona[] };
        if (!active) return;
        setRegisteredPersonas((payload.registered_users ?? []).map(normalizeRegisteredPersona).filter(isDiscoverRegisteredPersona));
      } finally {
        if (active) setIsLoading(false);
      }
    }

    loadRegisteredPersonas();
    timexApi
      .me()
      .then((state) => {
        if (!active) return;
        setCurrentUser(state.authenticated ? state.user : null);
      })
      .catch(() => {
        if (active) setCurrentUser(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const personas = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const merged = [...demoDiscoverPersonas, ...registeredPersonas];
    const filtered = normalizedQuery
      ? merged.filter((persona) =>
          [persona.displayName, persona.symbol, persona.tagline].some((value) => value.toLowerCase().includes(normalizedQuery))
        )
      : merged;

    return [...filtered].sort((a, b) => {
      if (sortKey === "price") return a.currentPriceCents - b.currentPriceCents;
      if (sortKey === "gain") return b.priceChangePercent - a.priceChangePercent;
      if (sortKey === "heat") return b.heatScore - a.heatScore;
      return b.trendingScore - a.trendingScore;
    });
  }, [query, registeredPersonas, sortKey]);

  return (
    <section className="discoverSurface">
      <div className="discoverControls">
        <label className="discoverSearch">
          <Search size={16} />
          <input
            aria-label={t("discover.searchAria")}
            placeholder={t("discover.searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="discoverSort" aria-label={t("discover.sortAria")}>
          {sortOptions.map((option) => {
            const active = sortKey === option.key;
            const Icon = option.key === "trending" ? TrendingUp : option.key === "heat" ? Flame : ArrowDownUp;
            return (
              <button key={option.key} className={active ? "isActive" : ""} type="button" onClick={() => setSortKey(option.key)}>
                <Icon size={14} />
                <span>{t(option.labelKey)}</span>
              </button>
            );
          })}
        </div>
        <Badge tone="neutral">{t("discover.cards", { count: personas.length })}</Badge>
      </div>

      {isLoading ? <LoadingRows /> : null}

      <div className="discoverGrid">
        {personas.map((persona) => (
          <DiscoverPersonaCard key={persona.id} persona={persona} isSelf={isSelfConversationTarget(currentUser, persona.symbol)} />
        ))}
      </div>
    </section>
  );
}
