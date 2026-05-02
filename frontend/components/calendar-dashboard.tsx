"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, API_BASE, formatMoney, timexApi } from "../lib/api";
import { demoDiscoverPersonas } from "../lib/demo-data";
import { localeForLang, withLang } from "../lib/i18n";
import type { CapacityWindow, DiscoverPersona, Ticker, TimeTicket } from "../lib/types";
import { ChromaKeyPortrait } from "./chroma-key-portrait";
import { useI18n } from "./i18n-provider";
import { Badge, Button, StateBlock, StatusChip } from "./ui";

type TabKey = "incoming" | "outgoing";
type CalendarDayStatus = "free" | "working" | "busy";

type CalendarEntry = {
  id: string;
  startsAt: string;
  endsAt: string;
  title: string;
  counterpart: string;
  symbol: string;
  seatIndex: number;
  status: TimeTicket["status"];
  priceCents: number;
  basePriceCents: number;
  type: TabKey;
};

type MockAppointment = {
  id: string;
  label: string;
  kind: "reserve" | "work";
};

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

function dateKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function addMonths(value: Date, months: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

function monthStart(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function mondayWeekIndex(value: Date): number {
  return (value.getDay() + 6) % 7;
}

function monthLabel(value: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    month: "long",
    year: "numeric"
  }).format(typeof value === "string" ? new Date(value) : value);
}

function dayLabel(value: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    weekday: "short"
  }).format(typeof value === "string" ? new Date(value) : value);
}

function fullDateLabel(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date(`${value}T12:00:00+08:00`));
}

function dateOptionLabel(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    month: "short",
    day: "numeric",
    weekday: "short"
  }).format(new Date(`${value}T12:00:00+08:00`));
}

function slotKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

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

function halfHourSlotsForDay(day: string) {
  return Array.from({ length: 24 }, (_, index) => {
    const hour = 8 + Math.floor(index / 2);
    const minute = index % 2 === 0 ? 0 : 30;
    const label = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return {
      id: `${day}-${label}`,
      label,
      startsAt: `${day}T${label}:00+08:00`
    };
  });
}

function normalizeRegisteredPersona(raw: RawRegisteredPersona, index: number): DiscoverPersona {
  const displayName = raw.display_name ?? raw.displayName ?? `User ${index + 1}`;
  const basePriceCents = raw.base_price_cents ?? raw.basePriceCents ?? 8000 + index * 1500;
  const currentPriceCents = raw.current_price_cents ?? raw.currentPriceCents ?? Math.round(basePriceCents * 1.12);
  const nextAt = raw.next_available_at ?? raw.nextAvailableAt ?? fallbackDate(12 + index * 6);

  return {
    id: raw.id ?? `registered-${index}`,
    symbol: (raw.symbol ?? displayName.slice(0, 4)).replace(/[^a-z0-9]/gi, "").toUpperCase() || `U${index + 1}`,
    displayName,
    tagline: raw.tagline ?? "",
    bio: raw.bio ?? "",
    portraitUrl: absolutePortraitUrl(raw.portrait_url ?? raw.portraitUrl),
    avatarUrl: absolutePortraitUrl(raw.trade_logo_url ?? raw.tradeLogoUrl ?? raw.chat_avatar_url ?? raw.chatAvatarUrl ?? raw.avatar_url ?? raw.avatarUrl),
    verifiedBadge: raw.verified_badge ?? raw.verifiedBadge ?? false,
    basePriceCents,
    currentPriceCents,
    priceChangePercent: raw.price_change_percent ?? raw.priceChangePercent ?? 0,
    heatScore: raw.heat_score ?? raw.heatScore ?? 0,
    trendingScore: raw.trending_score ?? raw.trendingScore ?? 0,
    nextAvailableAt: nextAt,
    chatAvailableAt: raw.chat_available_at ?? raw.chatAvailableAt ?? nextAt,
    source: "registered"
  };
}

function ticketEntry(ticket: TimeTicket, tickers: Ticker[], fallbackName: string, type: TabKey): CalendarEntry {
  const ticker = tickers.find((item) => item.id === ticket.tickerId);
  return {
    id: ticket.id,
    startsAt: ticket.startsAt,
    endsAt: ticket.endsAt,
    title: ticket.title,
    counterpart: ticker?.displayName ?? fallbackName,
    symbol: ticker?.symbol ?? "",
    seatIndex: ticket.seatIndex,
    status: ticket.status,
    priceCents: ticket.currentPriceCents,
    basePriceCents: ticket.basePriceCents,
    type
  };
}

function windowPlaceholderEntry(window: CapacityWindow, ticker: Ticker): CalendarEntry {
  return {
    id: window.id,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    title: ticker.displayName,
    counterpart: ticker.displayName,
    symbol: ticker.symbol,
    seatIndex: 0,
    status: window.status,
    priceCents: window.currentPriceCents,
    basePriceCents: window.basePriceCents,
    type: "incoming"
  };
}

function mockAppointmentsForSlot(day: string, label: string, tab: TabKey): MockAppointment[] {
  const seed = Array.from(`${day}-${label}-${tab}`).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  if (seed % 6 === 0) {
    return [
      { id: `${day}-${label}-void-1`, label: "Void user 017", kind: "reserve" },
      { id: `${day}-${label}-void-2`, label: "Void user 042", kind: "reserve" },
      { id: `${day}-${label}-void-3`, label: "Void user 108", kind: "reserve" }
    ];
  }
  if (seed % 4 === 0) {
    return [{ id: `${day}-${label}-void-work`, label: tab === "incoming" ? "Void user 021" : "Internal focus", kind: "work" }];
  }
  return [];
}

function statusForCounts(realCount: number, mockCount: number): CalendarDayStatus {
  const total = realCount + mockCount;
  if (total >= 3) return "busy";
  if (total >= 1) return "working";
  return "free";
}

function bookingHref(persona: DiscoverPersona, lang: "en" | "zh") {
  const params = new URLSearchParams({
    intent: "book",
    name: persona.displayName,
    tagline: persona.tagline,
    base: String(persona.basePriceCents),
    next: persona.nextAvailableAt,
    verified: String(persona.verifiedBadge),
    avatar: persona.avatarUrl ?? ""
  });
  return withLang(lang, `/calendar/${persona.symbol}?${params.toString()}`);
}

function BookTimePersonaCard({ persona }: { persona: DiscoverPersona }) {
  const { lang, t } = useI18n();

  return (
    <Link className="bookTimeImageCard" href={bookingHref(persona, lang)}>
      <ChromaKeyPortrait className="bookTimeCardPortrait" src={persona.portraitUrl ?? persona.avatarUrl} alt={`${persona.displayName} portrait`} />
      <div className="bookTimeCardShade" />
      <div className="bookTimeCardBody">
        <div>
          <strong>{persona.displayName}</strong>
          <span>${persona.symbol}</span>
        </div>
        <p>{persona.tagline}</p>
        <div className="bookTimeCardMeta">
          <Badge tone={persona.verifiedBadge ? "success" : "neutral"}>{persona.verifiedBadge ? t("persona.verified") : t("persona.open")}</Badge>
          <Badge tone="accent">{formatMoney(persona.currentPriceCents, lang)}</Badge>
        </div>
        <span className="txButton txButton-primary txButton-sm">
          <CalendarDays size={14} />
          <span>{t("persona.book")}</span>
        </span>
      </div>
    </Link>
  );
}

export function CalendarDashboard() {
  const { lang, t } = useI18n();
  const locale = localeForLang(lang);
  const [tab, setTab] = useState<TabKey>("incoming");
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [monthCursor, setMonthCursor] = useState(monthStart(new Date()));
  const [incomingEntries, setIncomingEntries] = useState<CalendarEntry[]>([]);
  const [outgoingEntries, setOutgoingEntries] = useState<CalendarEntry[]>([]);
  const [personas, setPersonas] = useState<DiscoverPersona[]>(demoDiscoverPersonas);
  const [roleQuery, setRoleQuery] = useState("");
  const [isRolePickerOpen, setIsRolePickerOpen] = useState(false);
  const [mode, setMode] = useState<"loading" | "live" | "anonymous" | "offline">("loading");

  const loadCalendar = useCallback(async () => {
    setMode((current) => (current === "live" ? current : "loading"));
    try {
      const me = await timexApi.me();
      if (!me.authenticated) {
        setIncomingEntries([]);
        setOutgoingEntries([]);
        setMode("anonymous");
        return;
      }

      const holdings = await timexApi.holdings();
      const outgoing = holdings.tickets.map((ticket) => ticketEntry(ticket, holdings.tickers, t("calendar.someoneElse"), "outgoing"));
      setOutgoingEntries(outgoing);

      if (me.user?.tickerSymbol) {
        const own = await timexApi.calendar(me.user.tickerSymbol).catch(() => null);
        if (!own) {
          setIncomingEntries([]);
          setMode("live");
          return;
        }
        const booked = own.tickets
          .filter((ticket) => ticket.ownerUserId && ticket.ownerUserId !== me.user?.id)
          .map((ticket) => ticketEntry(ticket, [own.ticker], t("calendar.bookedGuest"), "incoming"));
        const openWindows = own.windows
          .filter((window) => window.remainingCapacity > 0)
          .map((window) => windowPlaceholderEntry(window, own.ticker));
        setIncomingEntries([...booked, ...openWindows]);
      } else {
        setIncomingEntries([]);
      }

      setMode("live");
    } catch (error) {
      setMode(error instanceof ApiError && error.status === 401 ? "anonymous" : "offline");
    }
  }, [t]);

  useEffect(() => {
    let active = true;

    async function loadRoles() {
      try {
        const response = await fetch(`${API_BASE}/api/discover`, {
          credentials: "include",
          headers: { Accept: "application/json" }
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { registered_users?: RawRegisteredPersona[] };
        if (!active) return;
        setPersonas([...demoDiscoverPersonas, ...(payload.registered_users ?? []).map(normalizeRegisteredPersona)]);
      } catch {
        if (active) setPersonas(demoDiscoverPersonas);
      }
    }

    const timer = window.setTimeout(loadCalendar, 0);
    loadRoles();
    window.addEventListener("timex-auth-changed", loadCalendar);
    window.addEventListener("timex-inventory-changed", loadCalendar);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("timex-auth-changed", loadCalendar);
      window.removeEventListener("timex-inventory-changed", loadCalendar);
    };
  }, [loadCalendar]);

  const activeEntries = useMemo(() => {
    const entries = tab === "incoming" ? incomingEntries : outgoingEntries;
    return [...entries].sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  }, [incomingEntries, outgoingEntries, tab]);

  const entriesByDate = useMemo(() => {
    return activeEntries.reduce<Record<string, CalendarEntry[]>>((acc, entry) => {
      const key = dateKey(entry.startsAt);
      acc[key] = [...(acc[key] ?? []), entry];
      return acc;
    }, {});
  }, [activeEntries]);

  const calendarStart = useMemo(() => addDays(monthCursor, -mondayWeekIndex(monthCursor)), [monthCursor]);
  const days = useMemo(
    () =>
      Array.from({ length: 42 }, (_, index) => {
        const date = addDays(calendarStart, index);
        const key = dateKey(date);
        const entries = entriesByDate[key] ?? [];
        const mockCount = halfHourSlotsForDay(key).reduce((count, slot) => count + mockAppointmentsForSlot(key, slot.label, tab).length, 0);
        return {
          key,
          date,
          entries,
          outsideMonth: date.getMonth() !== monthCursor.getMonth(),
          status: statusForCounts(entries.length, mockCount)
        };
      }),
    [calendarStart, entriesByDate, monthCursor, tab]
  );
  const selectedEntries = entriesByDate[selectedDate] ?? [];
  const selectedDaySlots = halfHourSlotsForDay(selectedDate).map((slot) => {
    const realEntries = selectedEntries.filter((entry) => slotKey(entry.startsAt) === slot.label);
    const mockAppointments = mockAppointmentsForSlot(selectedDate, slot.label, tab);
    return {
      ...slot,
      realEntries,
      mockAppointments,
      status: statusForCounts(realEntries.length, mockAppointments.length)
    };
  });
  const filteredPersonas = personas.filter((persona) => {
    const query = roleQuery.trim().toLowerCase();
    if (!query) return true;
    return [persona.displayName, persona.symbol, persona.tagline].some((value) => value.toLowerCase().includes(query));
  });

  function shiftMonth(delta: number) {
    const next = addMonths(monthCursor, delta);
    setMonthCursor(next);
    setSelectedDate(dateKey(next));
  }

  function selectCalendarDay(day: { key: string; date: Date; outsideMonth: boolean }) {
    setSelectedDate(day.key);
    if (day.outsideMonth) {
      setMonthCursor(monthStart(day.date));
    }
  }

  return (
    <section className="calendarDashboard">
      <div className="calendarDashboardToolbar">
        <div className="calendarTabs" aria-label={t("calendar.dashboard.tabs")}>
          <button className={tab === "incoming" ? "isActive" : ""} type="button" onClick={() => setTab("incoming")}>
            {t("calendar.dashboard.incoming")}
          </button>
          <button className={tab === "outgoing" ? "isActive" : ""} type="button" onClick={() => setTab("outgoing")}>
            {t("calendar.dashboard.outgoing")}
          </button>
        </div>
        <Button size="md" variant="primary" onClick={() => setIsRolePickerOpen(true)}>
          <Search size={16} />
          {t("calendar.dashboard.bookOther")}
        </Button>
      </div>

      {mode === "loading" ? <StateBlock state="loading" title={t("calendar.dashboard.loading")} /> : null}
      {mode === "anonymous" ? (
        <StateBlock state="disabled" title={t("auth.signInRequired")} detail={t("calendar.dashboard.signInDetail")} />
      ) : null}
      {mode === "offline" ? (
        <StateBlock state="error" title={t("calendar.dashboard.unavailable")} detail={t("calendar.dashboard.unavailableDetail")} />
      ) : null}

      <div className="calendarDashboardGrid">
        <div className="calendarAgendaPanel">
          <div className="bookingPanelHeader">
            <div>
              <span className="eyebrow">{t("calendar.dashboard.month")}</span>
              <h2>{monthLabel(monthCursor, locale)}</h2>
            </div>
            <div className="calendarMonthNav">
              <Button size="sm" variant="ghost" aria-label={t("calendar.dashboard.prevMonth")} onClick={() => shiftMonth(-1)}>
                <ChevronLeft size={16} />
              </Button>
              <Button size="sm" variant="ghost" aria-label={t("calendar.dashboard.nextMonth")} onClick={() => shiftMonth(1)}>
                <ChevronRight size={16} />
              </Button>
            </div>
            <Badge tone="neutral">{t("calendar.dashboard.eventCount", { count: activeEntries.length })}</Badge>
          </div>
          <div className="calendarWeekdays" aria-hidden="true">
            {Array.from({ length: 7 }, (_, index) => addDays(calendarStart, index)).map((day) => (
              <span key={dateKey(day)}>{dayLabel(day, locale)}</span>
            ))}
          </div>
          <div className="calendarStatusLegend" aria-label={t("calendar.dashboard.statusLegend")}>
            <span><i className="calendarStatusDot calendarStatus-free" />{t("calendar.dashboard.free")}</span>
            <span><i className="calendarStatusDot calendarStatus-working" />{t("calendar.dashboard.working")}</span>
            <span><i className="calendarStatusDot calendarStatus-busy" />{t("calendar.dashboard.busy")}</span>
          </div>
          <div className="calendarMonthGrid calendarDashboardMonth">
            {days.map((day) => {
              const active = day.key === selectedDate;
              const hasEntries = day.entries.length > 0;
              return (
                <button
                  key={day.key}
                  type="button"
                  className={`monthDay${active ? " isActive" : ""}${hasEntries ? " hasTimes" : ""}${day.outsideMonth ? " isOutsideMonth" : ""}`}
                  onClick={() => selectCalendarDay(day)}
                  aria-pressed={active}
                >
                  <strong>{new Intl.DateTimeFormat(locale, { timeZone: "Asia/Shanghai", day: "numeric" }).format(day.date)}</strong>
                  <div className="calendarDayFooter">
                    <i className={`calendarStatusDot calendarStatus-${day.status}`} aria-label={t(`calendar.dashboard.${day.status}`)} />
                    {hasEntries ? <em>{t("calendar.dashboard.items", { count: day.entries.length })}</em> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="calendarDetailPanel">
          <div className="bookingPanelHeader">
            <div>
              <span className="eyebrow">{t("calendar.dashboard.details")}</span>
              <h2>{fullDateLabel(selectedDate, locale)}</h2>
            </div>
          </div>

          <label className="calendarDateSelect">
            <span>{t("calendar.dashboard.selectDate")}</span>
            <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>
              {days.map((day) => (
                <option key={day.key} value={day.key}>
                  {dateOptionLabel(day.key, locale)}
                </option>
              ))}
            </select>
          </label>

          <div className="calendarSlotList">
            {selectedDaySlots.map((slot) => (
              <article key={slot.id} className={`calendarSlotRow calendarSlot-${slot.status}`}>
                <span className="calendarSlotTime">{slot.label}</span>
                <i className={`calendarStatusDot calendarStatus-${slot.status}`} aria-hidden="true" />
                <div className="calendarSlotBody">
                  {slot.realEntries.length > 0 ? (
                    slot.realEntries.map((entry) => (
                      <div key={entry.id} className="calendarSlotBooking">
                        <strong>{entry.title}</strong>
                        <span>
                          <UserRound size={14} />
                          {entry.type === "incoming"
                            ? entry.seatIndex > 0
                              ? t("calendar.dashboard.guestSeat", { seat: entry.seatIndex })
                              : t("calendar.dashboard.openWindow")
                            : t("calendar.dashboard.host", { name: entry.counterpart })}
                        </span>
                        <div className="calendarDetailMeta">
                          {entry.symbol ? <Badge>${entry.symbol}</Badge> : null}
                          <StatusChip status={entry.status} lang={lang} />
                        </div>
                      </div>
                    ))
                  ) : slot.mockAppointments.length > 0 ? (
                    slot.mockAppointments.map((appointment) => (
                      <div key={appointment.id} className="calendarSlotBooking">
                        <strong>{appointment.label}</strong>
                        <span>
                          <UserRound size={14} />
                          {t(appointment.kind === "reserve" ? "calendar.dashboard.mockReserve" : "calendar.dashboard.mockWork")}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="calendarSlotBooking">
                      <strong>{t("calendar.dashboard.free")}</strong>
                      <span>
                        <Clock3 size={14} />
                        {t("calendar.dashboard.emptyHalfHour")}
                      </span>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </aside>
      </div>

      {isRolePickerOpen ? (
        <div className="rolePickerBackdrop" role="presentation" onClick={() => setIsRolePickerOpen(false)}>
          <section className="rolePickerPanel" role="dialog" aria-modal="true" aria-label={t("calendar.dashboard.bookOther")} onClick={(event) => event.stopPropagation()}>
            <div className="txCardHeader">
              <div>
                <span className="eyebrow">{t("calendar.dashboard.roleList")}</span>
                <h2>{t("calendar.dashboard.chooseRole")}</h2>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setIsRolePickerOpen(false)}>
                {t("common.close")}
              </Button>
            </div>
            <label className="discoverSearch">
              <Search size={16} />
              <input
                aria-label={t("discover.searchAria")}
                placeholder={t("discover.searchPlaceholder")}
                value={roleQuery}
                onChange={(event) => setRoleQuery(event.target.value)}
              />
            </label>
            <div className="bookTimeImageGrid">
              {filteredPersonas.map((persona) => (
                <BookTimePersonaCard key={`${persona.source}-${persona.symbol}`} persona={persona} />
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
