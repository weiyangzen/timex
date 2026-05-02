import type { CapacityWindow, Ticker } from "../../../lib/types";
import { CalendarBookingBoard } from "../../../components/calendar-booking-board";
import { RuleBadges } from "../../../components/ui";
import { demoDiscoverPersonas, demoKnowledgeBases, demoSlots, demoTickers, demoWindows } from "../../../lib/demo-data";

type CalendarSymbolPageProps = {
  params?: Promise<{ symbol?: string }> | { symbol?: string };
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function queryTicker(symbol: string, searchParams: Record<string, string | string[] | undefined> | undefined): Ticker | undefined {
  const name = singleParam(searchParams?.name);
  if (!name) return undefined;

  const basePriceCents = Number(singleParam(searchParams?.base));
  const verifiedBadge = singleParam(searchParams?.verified) === "true";

  return {
    id: `ticker-${symbol.toLowerCase()}`,
    symbol,
    displayName: name,
    tagline: singleParam(searchParams?.tagline) ?? "Bookable TimeX role",
    bio: "Discover-selected role with reserve-first availability.",
    avatarUrl: singleParam(searchParams?.avatar),
    verifiedBadge,
    basePriceCents: Number.isFinite(basePriceCents) && basePriceCents > 0 ? basePriceCents : 8000,
    nextAvailableAt: singleParam(searchParams?.next) ?? new Date().toISOString(),
    activityLabel: "discover selection"
  };
}

function personaTicker(symbol: string): Ticker | undefined {
  const persona = demoDiscoverPersonas.find((item) => item.symbol === symbol);
  if (!persona) return undefined;

  return {
    id: `ticker-${persona.symbol.toLowerCase()}`,
    symbol: persona.symbol,
    displayName: persona.displayName,
    tagline: persona.tagline,
    bio: persona.bio,
    avatarUrl: persona.avatarUrl,
    verifiedBadge: persona.verifiedBadge,
    basePriceCents: persona.basePriceCents,
    nextAvailableAt: persona.nextAvailableAt,
    activityLabel: `${persona.heatScore} heat`
  };
}

function fallbackWindows(ticker: Ticker): CapacityWindow[] {
  const start = new Date(ticker.nextAvailableAt);
  const later = new Date(start);
  later.setDate(later.getDate() + 1);

  return [
    {
      id: `window-${ticker.symbol.toLowerCase()}-primary`,
      tickerId: ticker.id,
      slotId: `slot-${ticker.symbol.toLowerCase()}-default`,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 30 * 60000).toISOString(),
      durationMinutes: 30,
      capacityLimit: 3,
      soldCount: 1,
      remainingCapacity: 2,
      basePriceCents: ticker.basePriceCents,
      minSalePriceCents: ticker.basePriceCents,
      currentPriceCents: Math.round(ticker.basePriceCents * 1.18),
      status: "listed",
      tradeHaltsAt: new Date(start.getTime() - 12 * 60 * 60000).toISOString(),
      demandScore: 6
    },
    {
      id: `window-${ticker.symbol.toLowerCase()}-followup`,
      tickerId: ticker.id,
      slotId: `slot-${ticker.symbol.toLowerCase()}-default`,
      startsAt: later.toISOString(),
      endsAt: new Date(later.getTime() + 30 * 60000).toISOString(),
      durationMinutes: 30,
      capacityLimit: 3,
      soldCount: 3,
      remainingCapacity: 0,
      basePriceCents: ticker.basePriceCents,
      minSalePriceCents: ticker.basePriceCents,
      currentPriceCents: Math.round(ticker.basePriceCents * 1.32),
      status: "halted",
      tradeHaltsAt: new Date(later.getTime() - 12 * 60 * 60000).toISOString(),
      demandScore: 9
    }
  ];
}

export default async function CalendarSymbolPage({ params, searchParams }: CalendarSymbolPageProps = {}) {
  const resolvedParams = params ? await Promise.resolve(params) : undefined;
  const resolvedSearchParams = searchParams ? await Promise.resolve(searchParams) : undefined;
  const requestedSymbol = resolvedParams?.symbol?.toUpperCase() ?? "AYUAN";
  const ticker =
    queryTicker(requestedSymbol, resolvedSearchParams) ??
    demoTickers.find((item) => item.symbol === requestedSymbol) ??
    personaTicker(requestedSymbol) ??
    demoTickers[0];
  const tickerSlots = demoSlots.filter((slot) => slot.tickerId === ticker.id);
  const seededWindows = demoWindows.filter((window) => window.tickerId === ticker.id);
  const windows = seededWindows.length > 0 ? seededWindows : fallbackWindows(ticker);
  const knowledgeBases = demoKnowledgeBases.filter((kb) => tickerSlots.some((slot) => slot.id === kb.slotId));

  return (
    <div className="modulePage">
      <header className="moduleHeader">
        <div>
          <span className="eyebrow">Calendar</span>
          <h1>Reserve {ticker.displayName}&apos;s time</h1>
        </div>
        <RuleBadges />
      </header>

      <CalendarBookingBoard ticker={ticker} windows={windows} knowledgeBases={knowledgeBases} />
    </div>
  );
}
