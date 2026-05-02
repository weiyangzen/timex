"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  ChartCandlestick,
  ChevronDown,
  ChevronRight,
  Clock3,
  Search,
  Settings2,
  Star,
  WalletCards,
  X
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type UTCTimestamp
} from "lightweight-charts";
import { Badge, Button, CapacityMeter, HaltCountdownRing, StatusChip } from "../../components/ui";
import { ChromaKeyPortrait } from "../../components/chroma-key-portrait";
import { ProtectedActionButton } from "../../components/protected-action-button";
import { useI18n } from "../../components/i18n-provider";
import { useTheme } from "../../components/theme-provider";
import { ApiError, formatMoney, formatShortDateTime, timexApi } from "../../lib/api";
import { demoEvents, demoTickets, demoTickers, demoWindows } from "../../lib/demo-data";
import { withLang } from "../../lib/i18n";
import { templateTradeHistories } from "../../lib/template-history";
import type { CapacityWindow, MarketEvent, Ticker, TimeTicket, TradeMarket } from "../../lib/types";

type IntervalKey = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
type PositionTab = "tickets" | "orders" | "funds";
type OrderType = "limit" | "market" | "timing";
type MarketFilter = "quote" | "time" | "hot";

type OrderBookRow = {
  price: number;
  qty: number;
  total: number;
  depth: number;
};

const intervals: Array<{ key: IntervalKey; label: string; seconds: number; points: number }> = [
  { key: "1m", label: "1m", seconds: 60, points: 120 },
  { key: "5m", label: "5m", seconds: 300, points: 110 },
  { key: "15m", label: "15m", seconds: 900, points: 96 },
  { key: "1h", label: "1h", seconds: 3600, points: 96 },
  { key: "4h", label: "4h", seconds: 14400, points: 86 },
  { key: "1d", label: "1D", seconds: 86400, points: 72 }
];

const fallbackMarketRows: TradeMarket[] = [
  {
    id: "ticker-ayuan",
    symbol: "AYUAN",
    displayName: "AYuan",
    tagline: "",
    avatarUrl: "/avatar/AYuan.png",
    verifiedBadge: true,
    basePriceCents: 12000,
    lastPriceCents: 16800,
    changePercent: 12.84,
    volumeSeats: 428,
    nextAvailableAt: demoTickers[0]?.nextAvailableAt ?? new Date().toISOString(),
    activityLabel: "42 trades today"
  },
  {
    id: "ticker-weiyang",
    symbol: "WEIYANG",
    displayName: "Weiyang",
    tagline: "",
    avatarUrl: "/avatar/Weiyang.png",
    verifiedBadge: true,
    basePriceCents: 9000,
    lastPriceCents: 11700,
    changePercent: 5.22,
    volumeSeats: 184,
    nextAvailableAt: demoTickers[1]?.nextAvailableAt ?? new Date().toISOString(),
    activityLabel: "18 bookings"
  }
];

function toTimestamp(value: number): UTCTimestamp {
  return value as UTCTimestamp;
}

function symbolSeed(symbol: string): number {
  return Array.from(symbol).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 997, 17);
}

function tickerFallback(symbol: string): Ticker {
  const normalized = symbol.toUpperCase();
  const demoTicker = demoTickers.find((item) => item.symbol === normalized);
  if (demoTicker) return demoTicker;
  return {
    id: `ticker-${normalized.toLowerCase()}`,
    symbol: normalized,
    displayName: normalized,
    tagline: "",
    bio: "",
    verifiedBadge: true,
    basePriceCents: 12000,
    nextAvailableAt: new Date().toISOString(),
    activityLabel: "mock market"
  };
}

function marketFromTicker(ticker: Ticker): TradeMarket {
  const seed = symbolSeed(ticker.symbol);
  const basePriceCents = ticker.basePriceCents || 12000;
  const changePercent = 6 + (seed % 28);
  return {
    id: ticker.id || ticker.symbol,
    symbol: ticker.symbol,
    displayName: ticker.displayName,
    tagline: ticker.tagline,
    avatarUrl: ticker.avatarUrl,
    verifiedBadge: ticker.verifiedBadge,
    basePriceCents,
    lastPriceCents: basePriceCents + Math.round((basePriceCents * changePercent) / 100),
    changePercent,
    volumeSeats: 24 + (seed % 180),
    nextAvailableAt: ticker.nextAvailableAt,
    activityLabel: ticker.activityLabel
  };
}

function generateCandles(interval: IntervalKey, symbol: string, lastPrice: number): {
  candles: CandlestickData<UTCTimestamp>[];
  volumes: HistogramData<UTCTimestamp>[];
} {
  const config = intervals.find((item) => item.key === interval) ?? intervals[2];
  const end = Math.floor(new Date("2026-05-01T09:30:00+08:00").getTime() / 1000);
  const seed = symbolSeed(symbol);
  let close = Math.max(12, lastPrice || 120) * (0.94 + (seed % 9) / 100);

  const candles: CandlestickData<UTCTimestamp>[] = [];
  const volumes: HistogramData<UTCTimestamp>[] = [];

  for (let index = 0; index < config.points; index += 1) {
    const time = toTimestamp(end - (config.points - index) * config.seconds);
    const wave = Math.sin((index + seed) / 5.4) * 2.8 + Math.cos((index + seed / 2) / 11) * 1.7;
    const drift = index * 0.075;
    const open = close;
    close = Math.max(98, open + wave * 0.28 + drift * 0.035 + (index % 9 === 0 ? 1.7 : -0.18));
    const high = Math.max(open, close) + 1.2 + Math.abs(Math.sin(index / 3)) * 2.1;
    const low = Math.min(open, close) - 1.1 - Math.abs(Math.cos(index / 4)) * 1.6;
    const volume = 320 + Math.round(Math.abs(close - open) * 130 + (index % 7) * 42);
    const rising = close >= open;

    candles.push({
      time,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2))
    });
    volumes.push({
      time,
      value: volume,
      color: rising ? "rgba(14, 203, 129, 0.38)" : "rgba(246, 70, 93, 0.38)"
    });
  }

  return { candles, volumes };
}

function buildOrderBook(lastPrice: number, symbol: string): { asks: OrderBookRow[]; bids: OrderBookRow[] } {
  const seed = symbolSeed(symbol);
  const center = Math.max(1, lastPrice || 100);
  const asks = Array.from({ length: 9 }, (_, index) => {
    const qty = 1 + index + ((index + seed) % 3);
    const price = center + 0.18 + index * (0.22 + (seed % 5) * 0.03);
    return {
      price,
      qty,
      total: qty * price,
      depth: 92 - index * 7
    };
  }).reverse();

  const bids = Array.from({ length: 9 }, (_, index) => {
    const qty = 1 + index + ((index + seed) % 2);
    const price = center - 0.16 - index * (0.2 + (seed % 4) * 0.03);
    return {
      price,
      qty,
      total: qty * price,
      depth: 88 - index * 6
    };
  });

  return { asks, bids };
}

function priceClass(value: number) {
  return value >= 0 ? "positivePrice" : "negativePrice";
}

function ExchangeChart({ interval, symbol, lastPrice }: { interval: IntervalKey; symbol: string; lastPrice: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chartColors =
      theme === "dark"
        ? {
            background: "#0d1b16",
            text: "#91aa9c",
            grid: "rgba(29, 58, 49, 0.7)",
            border: "#1d3a31",
            volumeUp: "rgba(14, 203, 129, 0.38)",
            volumeDown: "rgba(246, 70, 93, 0.38)"
          }
        : {
            background: "#fbfffc",
            text: "#5d7063",
            grid: "rgba(203, 220, 205, 0.85)",
            border: "#cbdccd",
            volumeUp: "rgba(10, 143, 90, 0.26)",
            volumeDown: "rgba(209, 63, 79, 0.26)"
          };

    const chart: IChartApi = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: chartColors.background },
        textColor: chartColors.text,
        attributionLogo: true
      },
      grid: {
        vertLines: { color: chartColors.grid },
        horzLines: { color: chartColors.grid }
      },
      crosshair: {
        mode: CrosshairMode.Magnet
      },
      rightPriceScale: {
        borderColor: chartColors.border,
        scaleMargins: { top: 0.08, bottom: 0.24 }
      },
      timeScale: {
        borderColor: chartColors.border,
        timeVisible: true,
        secondsVisible: interval === "1m",
        rightOffset: 8,
        barSpacing: interval === "1d" ? 8 : 6
      }
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#0ecb81",
      downColor: "#f6465d",
      borderUpColor: "#0ecb81",
      borderDownColor: "#f6465d",
      wickUpColor: "#0ecb81",
      wickDownColor: "#f6465d",
      priceFormat: { type: "price", precision: 2, minMove: 0.01 }
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: ""
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 }
    });
    const { candles, volumes } = generateCandles(interval, symbol, lastPrice);

    candleSeries.setData(candles);
    volumeSeries.setData(
      volumes.map((item, index) => ({
        ...item,
        color: candles[index]?.close >= candles[index]?.open ? chartColors.volumeUp : chartColors.volumeDown
      }))
    );
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [interval, lastPrice, symbol, theme]);

  return <div ref={containerRef} className="tradeChartCanvas" aria-label="Candlestick chart" />;
}

function OrderBookSide({ rows, side }: { rows: OrderBookRow[]; side: "ask" | "bid" }) {
  return (
    <div className="orderBookSide">
      {rows.map((row) => (
        <div key={`${side}-${row.price}`} className={`orderBookRow ${side}`}>
          <span className="depthBar" style={{ width: `${row.depth}%` }} />
          <strong>{row.price.toFixed(2)}</strong>
          <span>{row.qty.toLocaleString()}</span>
          <span>{row.total.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

export default function TradeTerminal({ initialSymbol = "AYUAN" }: { initialSymbol?: string }) {
  const { lang, t } = useI18n();
  const searchParams = useSearchParams();
  const tradeHistoryPanelRef = useRef<HTMLElement | null>(null);
  const targetSymbol = initialSymbol.toUpperCase();
  const fallbackTicker = useMemo(() => tickerFallback(targetSymbol), [targetSymbol]);
  const requestedTradeHistoryId = searchParams.get("tradeHistory") ?? "";
  const [interval, setInterval] = useState<IntervalKey>("15m");
  const [orderMode, setOrderMode] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [positionTab, setPositionTab] = useState<PositionTab>("tickets");
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [orderPercent, setOrderPercent] = useState<number | null>(null);
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("quote");
  const [marketQuery, setMarketQuery] = useState("");
  const [tradeHistoryOpen, setTradeHistoryOpen] = useState(Boolean(requestedTradeHistoryId));
  const [marketTickets, setMarketTickets] = useState<TimeTicket[]>(
    demoTickets.filter((ticket) => ticket.tickerId === fallbackTicker.id)
  );
  const [marketWindows, setMarketWindows] = useState<CapacityWindow[]>(demoWindows);
  const [marketTicker, setMarketTicker] = useState<Ticker | null>(null);
  const [tradeMarkets, setTradeMarkets] = useState<TradeMarket[]>(fallbackMarketRows);
  const [marketEvents, setMarketEvents] = useState<MarketEvent[]>(demoEvents);
  const [tradeMessage, setTradeMessage] = useState("");
  const [tradeMessageTone, setTradeMessageTone] = useState<"success" | "warning" | "error">("success");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const ticker = marketTicker ?? fallbackTicker;
  const activeMarketSymbol = `${ticker.symbol}/USDT`;
  const activeMarket = useMemo(() => {
    return tradeMarkets.find((item) => item.symbol === ticker.symbol) ?? marketFromTicker(ticker);
  }, [ticker, tradeMarkets]);
  const visibleMarkets = useMemo(() => {
    const merged = new Map<string, TradeMarket>();
    for (const row of fallbackMarketRows) merged.set(row.symbol, row);
    for (const row of tradeMarkets) merged.set(row.symbol, row);
    merged.set(activeMarket.symbol, activeMarket);
    const query = marketQuery.trim().toUpperCase();
    return Array.from(merged.values())
      .filter((row) => !query || row.symbol.includes(query) || row.displayName.toUpperCase().includes(query))
      .sort((a, b) => {
        if (marketFilter === "time") {
          return new Date(a.nextAvailableAt).getTime() - new Date(b.nextAvailableAt).getTime();
        }
        if (marketFilter === "quote") {
          return a.symbol.localeCompare(b.symbol);
        }
        return b.volumeSeats - a.volumeSeats;
      });
  }, [activeMarket, marketFilter, marketQuery, tradeMarkets]);
  const lastPrice = activeMarket.lastPriceCents / 100;
  const change = activeMarket.changePercent;
  const { asks, bids } = useMemo(() => buildOrderBook(lastPrice, ticker.symbol), [lastPrice, ticker.symbol]);
  const currentWindow = marketWindows.find((item) => item.tickerId === ticker.id) ?? demoWindows.find((item) => item.tickerId === ticker.id) ?? demoWindows[0];
  const visibleTickets = marketTickets.length > 0 ? marketTickets : demoTickets.filter((ticket) => ticket.tickerId === ticker.id);
  const purchasableTickets = visibleTickets.filter((ticket) => ticket.status === "listed" || ticket.status === "relisted");
  const sortedPurchasableTickets = [...purchasableTickets].sort((a, b) => a.listPriceCents - b.listPriceCents || new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const clampedOrderQuantity = Math.max(1, Math.min(orderQuantity, Math.max(1, purchasableTickets.length)));
  const selectedOrderTickets = (orderType === "market" ? sortedPurchasableTickets : purchasableTickets).slice(0, clampedOrderQuantity);
  const selectedOrderTotal = selectedOrderTickets.reduce((sum, ticket) => sum + ticket.listPriceCents, 0);
  const tradeHistories = templateTradeHistories(lang);
  const tickerTradeHistories = tradeHistories.filter((trade) => trade.symbol === ticker.symbol);
  const listedInventoryValue = purchasableTickets.reduce((sum, ticket) => sum + ticket.listPriceCents, 0);
  const estimatedFeeReserve = Math.round(selectedOrderTotal * 0.2);

  useEffect(() => {
    if (!requestedTradeHistoryId) return;
    const timer = window.setTimeout(() => {
      setTradeHistoryOpen(true);
      tradeHistoryPanelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [requestedTradeHistoryId]);

  useEffect(() => {
    let active = true;

    async function loadMarket() {
      try {
        const market = await timexApi.market(targetSymbol);
        if (!active) return;
        setMarketTicker(market.ticker);
        setMarketTickets(market.tickets);
        setMarketWindows(market.windows);
        setMarketEvents(market.events.length > 0 ? market.events : demoEvents);
      } catch {
        if (!active) return;
        setMarketTicker(null);
        setMarketTickets(demoTickets.filter((ticket) => ticket.tickerId === fallbackTicker.id));
        setMarketWindows(demoWindows);
        setMarketEvents(demoEvents);
      }
    }

    loadMarket();
    function onProfileImagesStorage(event: StorageEvent) {
      if (event.key === "timex-profile-images-version") loadMarket();
    }
    window.addEventListener("timex-inventory-changed", loadMarket);
    window.addEventListener("timex-profile-images-changed", loadMarket);
    window.addEventListener("storage", onProfileImagesStorage);
    return () => {
      active = false;
      window.removeEventListener("timex-inventory-changed", loadMarket);
      window.removeEventListener("timex-profile-images-changed", loadMarket);
      window.removeEventListener("storage", onProfileImagesStorage);
    };
  }, [fallbackTicker.id, targetSymbol]);

  useEffect(() => {
    let active = true;
    timexApi
      .tradeMarkets()
      .then((result) => {
        if (!active) return;
        setTradeMarkets(result.markets.length > 0 ? result.markets : fallbackMarketRows);
      })
      .catch(() => {
        if (!active) return;
        setTradeMarkets(fallbackMarketRows);
      });
    return () => {
      active = false;
    };
  }, []);

  function setIntegerQuantity(value: string) {
    const parsed = Number.parseInt(value, 10);
    setOrderPercent(null);
    setOrderQuantity(Number.isFinite(parsed) ? Math.max(1, parsed) : 1);
  }

  function setQuantityPercent(percent: number) {
    setOrderPercent(percent);
    const available = purchasableTickets.length;
    if (available <= 0) {
      setOrderQuantity(1);
      return;
    }
    setOrderQuantity(Math.max(1, Math.min(available, Math.ceil((available * percent) / 100))));
  }

  function toggleTradeHistory() {
    setTradeHistoryOpen((current) => {
      const next = !current;
      if (next) {
        window.requestAnimationFrame(() => {
          tradeHistoryPanelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
      }
      return next;
    });
  }

  async function submitTradeOrder() {
    if (orderMode === "sell") {
      setTradeMessageTone("warning");
      setTradeMessage(t("trade.sellInventory"));
      return;
    }
    if (orderType === "timing") {
      setTradeMessageTone("success");
      setTradeMessage(t("trade.timingQueued", { count: clampedOrderQuantity, symbol: ticker.symbol }));
      return;
    }
    if (selectedOrderTickets.length !== clampedOrderQuantity) {
      setTradeMessageTone("warning");
      setTradeMessage(t("trade.notEnoughSeats"));
      return;
    }

    setIsSubmittingOrder(true);
    setTradeMessage("");
    try {
      for (const ticket of selectedOrderTickets) {
        await timexApi.buyTicket(ticket.id, ticket.listPriceCents);
      }
      setTradeMessageTone("success");
      setTradeMessage(
        t("trade.bought", {
          count: selectedOrderTickets.length,
          seatWord: t(selectedOrderTickets.length === 1 ? "trade.seatSingular" : "trade.seatPlural"),
          total: formatMoney(selectedOrderTotal, lang)
        })
      );
      window.dispatchEvent(new Event("timex-auth-changed"));
      window.dispatchEvent(new Event("timex-inventory-changed"));
      const market = await timexApi.market(ticker.symbol);
      setMarketTicker(market.ticker);
      setMarketTickets(market.tickets);
      setMarketWindows(market.windows);
      setMarketEvents(market.events.length > 0 ? market.events : demoEvents);
    } catch (error) {
      setTradeMessageTone(error instanceof ApiError && error.status === 404 ? "warning" : "error");
      setTradeMessage(t("trade.failed"));
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  return (
    <div className="modulePage tradePage">
      <header className="tradeTopbar">
        <div className="tradeIdentity">
          <ChromaKeyPortrait src={ticker.avatarUrl} alt={`${ticker.displayName} avatar`} />
          <div>
            <div className="symbolLine">
              <strong>{ticker.symbol}/USDT</strong>
              <Badge tone="success">{t("trade.verifiedHuman")}</Badge>
            </div>
            <span>{ticker.displayName} · {ticker.tagline}</span>
          </div>
        </div>

        <dl className="tickerStats">
          <div>
            <dt>{t("trade.lastPrice")}</dt>
            <dd>{formatMoney(activeMarket.lastPriceCents, lang)}</dd>
          </div>
          <div>
            <dt>{t("trade.change24h")}</dt>
            <dd className={priceClass(change)}>+{change.toFixed(2)}%</dd>
          </div>
          <div>
            <dt>{t("trade.high24h")}</dt>
            <dd>{formatMoney(Math.round(activeMarket.lastPriceCents * 1.08), lang)}</dd>
          </div>
          <div>
            <dt>{t("trade.low24h")}</dt>
            <dd>{formatMoney(Math.max(activeMarket.basePriceCents, Math.round(activeMarket.lastPriceCents * 0.88)), lang)}</dd>
          </div>
          <div>
            <dt>{t("trade.volume24h")}</dt>
            <dd>{t("trade.marketVolume", { count: activeMarket.volumeSeats })}</dd>
          </div>
          <div>
            <dt>{t("trade.nextWindow")}</dt>
            <dd>{formatShortDateTime(activeMarket.nextAvailableAt, lang)}</dd>
          </div>
        </dl>
        <button
          className="txButton txButton-secondary txButton-sm tradeHistoryToggle"
          type="button"
          onClick={toggleTradeHistory}
          aria-expanded={tradeHistoryOpen}
          aria-controls="trade-history-panel"
        >
          {tradeHistoryOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>{tradeHistoryOpen ? t("trade.historyToggleHide") : t("trade.historyToggleShow")}</span>
        </button>
      </header>

      <section className="tradeWorkspace">
        <aside className="marketRail">
          <div className="railHeader">
            <strong>{t("trade.markets")}</strong>
            <button type="button" aria-label={t("trade.favorite")}>
              <Star size={16} />
            </button>
          </div>
          <label className="marketSearch">
            <Search size={15} />
            <input
              aria-label={t("trade.searchTicker")}
              placeholder={t("trade.searchPlaceholder")}
              value={marketQuery}
              onChange={(event) => setMarketQuery(event.target.value)}
            />
          </label>
          <div className="marketTabs" aria-label={t("trade.quoteFilters")}>
            <button className={marketFilter === "quote" ? "isActive" : undefined} type="button" onClick={() => setMarketFilter("quote")}>
              USDT
            </button>
            <button className={marketFilter === "time" ? "isActive" : undefined} type="button" onClick={() => setMarketFilter("time")}>
              {t("trade.time")}
            </button>
            <button className={marketFilter === "hot" ? "isActive" : undefined} type="button" onClick={() => setMarketFilter("hot")}>
              {t("trade.hot")}
            </button>
          </div>
          <div className="marketList">
            {visibleMarkets.map((row) => (
              <Link
                key={row.symbol}
                href={withLang(lang, `/trade/${row.symbol}`)}
                className={`${row.symbol}/USDT` === activeMarketSymbol ? "marketRow isActive" : "marketRow"}
              >
                <div>
                  <strong>{row.symbol}/USDT</strong>
                  <span>{row.displayName}</span>
                </div>
                <div>
                  <strong>{(row.lastPriceCents / 100).toFixed(2)}</strong>
                  <span className={priceClass(row.changePercent)}>
                    {row.changePercent > 0 ? "+" : ""}
                    {row.changePercent.toFixed(2)}%
                  </span>
                </div>
                <span>{t("trade.marketVolume", { count: row.volumeSeats })}</span>
              </Link>
            ))}
          </div>
        </aside>

        <main className="chartColumn">
          <section className="chartPanel">
            <header className="chartToolbar">
              <div className="chartTitle">
                <ChartCandlestick size={18} />
                <strong>{t("trade.chartTitle", { symbol: ticker.symbol })}</strong>
              </div>
              <div className="intervalTabs" aria-label={t("trade.interval")}>
                {intervals.map((item) => (
                  <button
                    key={item.key}
                    className={interval === item.key ? "isActive" : undefined}
                    type="button"
                    onClick={() => setInterval(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="chartActions">
                <button type="button" aria-label={t("trade.chartAlerts")}>
                  <Bell size={16} />
                </button>
                <button type="button" aria-label={t("trade.chartSettings")}>
                  <Settings2 size={16} />
                </button>
              </div>
            </header>
            <ExchangeChart interval={interval} symbol={ticker.symbol} lastPrice={lastPrice} />
          </section>

          <section className="positionPanel">
            <header className="panelHeader">
              <div className="panelTabs">
                <button className={positionTab === "tickets" ? "isActive" : undefined} type="button" onClick={() => setPositionTab("tickets")}>
                  {t("trade.openTickets")}
                </button>
                <button className={positionTab === "orders" ? "isActive" : undefined} type="button" onClick={() => setPositionTab("orders")}>
                  {t("trade.orderHistory")}
                </button>
                <button className={positionTab === "funds" ? "isActive" : undefined} type="button" onClick={() => setPositionTab("funds")}>
                  {t("trade.funds")}
                </button>
              </div>
              <Badge tone="warning">{t("trade.transferEnabled")}</Badge>
            </header>
            {positionTab === "tickets" ? (
              <div className="ticketRows">
                {visibleTickets.map((ticket) => {
                  const window = marketWindows.find((item) => item.id === ticket.capacityWindowId) ?? currentWindow;

                  return (
                    <article key={ticket.id} className="ticketTradeRow">
                      <div>
                        <strong>{ticket.title}</strong>
                        <span>{t("trade.seatLine", { seat: ticket.seatIndex, time: formatShortDateTime(ticket.startsAt, lang) })}</span>
                      </div>
                      <CapacityMeter sold={window.soldCount} capacity={window.capacityLimit} lang={lang} />
                      <div>
                        <span>{t("trade.ask")}</span>
                        <strong>{formatMoney(ticket.listPriceCents, lang)}</strong>
                      </div>
                      <StatusChip status={ticket.status} lang={lang} />
                      <HaltCountdownRing label="12H" percent={38} lang={lang} />
                    </article>
                  );
                })}
              </div>
            ) : null}
            {positionTab === "orders" ? (
              <div className="positionRows">
                {tickerTradeHistories.length > 0 ? (
                  tickerTradeHistories.map((trade) => (
                    <article key={trade.id} className="positionDataRow">
                      <div>
                        <strong>{trade.title}</strong>
                        <span>{formatShortDateTime(trade.executedAt, lang)}</span>
                      </div>
                      <div>
                        <span>{t("trade.orderSide")}</span>
                        <strong>{t(`trade.side.${trade.side}`)}</strong>
                      </div>
                      <div>
                        <span>{t("trade.orderQuantityShort")}</span>
                        <strong>{trade.quantity}</strong>
                      </div>
                      <div>
                        <span>{t("trade.orderTotal")}</span>
                        <strong>{formatMoney(trade.totalCents, lang)}</strong>
                      </div>
                      <Badge tone={trade.status === "listed" ? "warning" : "success"}>{t(`trade.${trade.status}`)}</Badge>
                    </article>
                  ))
                ) : (
                  <span className="emptyText">{t("trade.noHistory")}</span>
                )}
              </div>
            ) : null}
            {positionTab === "funds" ? (
              <div className="positionRows">
                <article className="positionDataRow">
                  <div>
                    <strong>{t("trade.availableListed")}</strong>
                    <span>{t("trade.marketVolume", { count: purchasableTickets.length })}</span>
                  </div>
                  <div>
                    <span>{t("trade.orderTotal")}</span>
                    <strong>{formatMoney(listedInventoryValue, lang)}</strong>
                  </div>
                  <div>
                    <span>{t("trade.selectedExposure")}</span>
                    <strong>{formatMoney(selectedOrderTotal, lang)}</strong>
                  </div>
                  <div>
                    <span>{t("trade.feeReserve")}</span>
                    <strong>{formatMoney(estimatedFeeReserve, lang)}</strong>
                  </div>
                  <Badge tone="accent">USDT</Badge>
                </article>
              </div>
            ) : null}
          </section>
        </main>

        <aside className="executionRail">
          <section className="orderBookPanel">
            <header className="panelHeader">
              <strong>{t("trade.orderBook")}</strong>
              <span>0.01</span>
            </header>
            <div className="orderBookHead">
              <span>{t("trade.price")}</span>
              <span>{t("trade.amount")}</span>
              <span>{t("trade.total")}</span>
            </div>
            <OrderBookSide rows={asks} side="ask" />
            <div className="spreadLine">
              <strong>{lastPrice.toFixed(2)}</strong>
              <span>{t("trade.spread")}</span>
            </div>
            <OrderBookSide rows={bids} side="bid" />
          </section>

          <section className="orderPanel">
            <div className="orderModeTabs">
              <button className={orderMode === "buy" ? "isActive buy" : "buy"} type="button" onClick={() => setOrderMode("buy")}>
                {t("trade.buy")}
              </button>
              <button className={orderMode === "sell" ? "isActive sell" : "sell"} type="button" onClick={() => setOrderMode("sell")}>
                {t("trade.sell")}
              </button>
            </div>
            <div className="orderTypeTabs">
              <button className={orderType === "limit" ? "isActive" : undefined} type="button" onClick={() => setOrderType("limit")}>
                {t("trade.limit")}
              </button>
              <button className={orderType === "market" ? "isActive" : undefined} type="button" onClick={() => setOrderType("market")}>
                {t("trade.market")}
              </button>
              <button className={orderType === "timing" ? "isActive" : undefined} type="button" onClick={() => setOrderType("timing")}>
                {t("trade.timing")}
              </button>
            </div>
            <label>
              <span>{t("trade.priceUsdt")}</span>
              <input
                value={orderType === "market" ? t("trade.bestAsk") : orderType === "timing" ? t("trade.timingTrigger") : lastPrice.toFixed(2)}
                aria-label={t("trade.orderPrice")}
                readOnly
              />
            </label>
            <label>
              <span>{t("trade.seats")}</span>
              <input
                aria-label={t("trade.orderQuantity")}
                inputMode="numeric"
                min={1}
                max={Math.max(1, purchasableTickets.length)}
                step={1}
                type="number"
                value={clampedOrderQuantity}
                onChange={(event) => setIntegerQuantity(event.target.value)}
              />
            </label>
            <div className="walletLine">
              <WalletCards size={15} />
              <span>
                {orderType === "timing"
                  ? t("trade.timingWallet", { count: clampedOrderQuantity, symbol: ticker.symbol })
                  : t("trade.walletListed", { count: purchasableTickets.length, total: formatMoney(selectedOrderTotal, lang) })}
              </span>
            </div>
            <div className="amountSteps">
              {[25, 50, 75, 100].map((value) => (
                <button
                  key={value}
                  className={orderPercent === value ? "isActive" : undefined}
                  type="button"
                  onClick={() => setQuantityPercent(value)}
                >
                  {value}%
                </button>
              ))}
            </div>
            <div className="feePills">
              <Badge tone="accent">{t("trade.royalty")}</Badge>
              <Badge tone="accent">{t("trade.platform")}</Badge>
            </div>
            <ProtectedActionButton
              action={`trade-${orderMode}`}
              loginLabel={orderMode === "buy" ? t("trade.loginToBuy", { symbol: ticker.symbol }) : t("trade.loginToSell", { symbol: ticker.symbol })}
              variant={orderMode === "buy" ? "primary" : "danger"}
              disabled={isSubmittingOrder || (orderMode === "buy" && orderType !== "timing" && selectedOrderTickets.length === 0)}
              reason={orderMode === "buy" && selectedOrderTickets.length === 0 ? t("trade.noSeats") : undefined}
              onAuthenticated={submitTradeOrder}
            >
              {orderMode === "buy" ? (
                <>
                  <ArrowUpRight size={16} /> {isSubmittingOrder ? t("trade.buying") : t(orderType === "timing" ? "trade.queueTiming" : "trade.buyQuantity", { count: clampedOrderQuantity, symbol: ticker.symbol })}
                </>
              ) : (
                <>
                  <ArrowDownRight size={16} /> {t("trade.sellSymbol", { symbol: ticker.symbol })}
                </>
              )}
            </ProtectedActionButton>
            {tradeMessage ? (
              <div className={`inlineNotice inlineNotice-${tradeMessageTone}`}>
                <Clock3 size={15} />
                <span>{tradeMessage}</span>
              </div>
            ) : null}
            <div className="walletLine">
              <WalletCards size={15} />
              <span>{t("trade.available")}</span>
            </div>
          </section>

          <section className="tradeTapePanel">
            <header className="panelHeader">
              <strong>{t("trade.marketTrades")}</strong>
              <Clock3 size={15} />
            </header>
            <div className="tradeTapeRows">
              {marketEvents.map((event, index) => {
                const signed = event.eventType !== "default" && event.eventType !== "halt";
                const price = event.priceCents ? event.priceCents / 100 : lastPrice - index * 0.24;
                return (
                  <article key={event.id}>
                    <span className={signed ? "positivePrice" : "negativePrice"}>{price.toFixed(2)}</span>
                    <span>{(index + 1).toLocaleString()}</span>
                    <span>{formatShortDateTime(event.createdAt, lang)}</span>
                  </article>
                );
              })}
            </div>
          </section>

          {tradeHistoryOpen ? (
            <section ref={tradeHistoryPanelRef} id="trade-history-panel" className="tradeHistoryPanel" aria-label={t("trade.history")}>
              <header className="historyPanelHeader">
                <div>
                  <strong>{t("trade.history")}</strong>
                  <span>{t("trade.historyDetail")}</span>
                </div>
                <button className="txButton txButton-ghost txButton-sm" type="button" onClick={() => setTradeHistoryOpen(false)} aria-label={t("trade.historyToggleHide")}>
                  <X size={14} />
                </button>
              </header>
              {tradeHistories.length ? (
                <div className="tradeHistoryList">
                  {tradeHistories.map((trade) => (
                    <article key={trade.id} className={requestedTradeHistoryId === trade.id ? "tradeHistoryRow isActive" : "tradeHistoryRow"}>
                      <div>
                        <strong>
                          {t(`trade.side.${trade.side}`)} {trade.symbol}
                        </strong>
                        <small>{trade.title}</small>
                        <div className="tradeHistoryMeta">
                          <span>{formatShortDateTime(trade.executedAt, lang)}</span>
                          <span>{t("trade.quantityShort", { count: trade.quantity })}</span>
                        </div>
                      </div>
                      <div>
                        <strong>{formatMoney(trade.priceCents, lang)}</strong>
                        <small>{t(`trade.${trade.status}`)}</small>
                        <div className="tradeHistoryMeta">
                          <span>{t("trade.totalValue", { total: formatMoney(trade.totalCents, lang) })}</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <span className="emptyText">{t("trade.noHistory")}</span>
              )}
            </section>
          ) : null}
        </aside>
      </section>

      <div className="mobileOrderDock">
        <ProtectedActionButton action="trade-buy" loginLabel={t("trade.loginToBuyShort")} variant="primary">
          <ArrowUpRight size={16} /> {t("trade.buy")}
        </ProtectedActionButton>
        <ProtectedActionButton action="trade-sell" loginLabel={t("trade.loginToSellShort")} variant="danger">
          <ArrowDownRight size={16} /> {t("trade.sell")}
        </ProtectedActionButton>
      </div>
    </div>
  );
}
