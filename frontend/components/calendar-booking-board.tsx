"use client";

import { CalendarDays, Check, Clock3, Globe2, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "./i18n-provider";
import { ChromaKeyPortrait } from "./chroma-key-portrait";
import { Badge, CapacityMeter, HaltCountdownRing, InlineNotice, StateBlock } from "./ui";
import { ProtectedActionButton } from "./protected-action-button";
import { ApiError, formatMoney, timexApi } from "../lib/api";
import { localeForLang, withLang, type Lang } from "../lib/i18n";
import type { CapacityWindow, KnowledgeBase, Ticker } from "../lib/types";

const TIME_ZONE = "Asia/Shanghai";
const CALENDAR_START = new Date("2026-05-01T00:00:00+08:00");

function dateKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatDay(value: string | Date, lang: Lang): string {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat(localeForLang(lang), {
    timeZone: TIME_ZONE,
    weekday: "short"
  }).format(date);
}

function formatDate(value: string | Date, lang: Lang): string {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat(localeForLang(lang), {
    timeZone: TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(date);
}

function formatMonth(value: string | Date, lang: Lang): string {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat(localeForLang(lang), {
    timeZone: TIME_ZONE,
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatTime(value: string, lang: Lang): string {
  return new Intl.DateTimeFormat(localeForLang(lang), {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function initials(value: string): string {
  return value
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function CalendarBookingBoard({
  ticker,
  windows,
  knowledgeBases
}: {
  ticker: Ticker;
  windows: CapacityWindow[];
  knowledgeBases: KnowledgeBase[];
}) {
  const { lang, t } = useI18n();
  const [calendarTicker, setCalendarTicker] = useState(ticker);
  const [calendarWindows, setCalendarWindows] = useState(windows);
  const [calendarKnowledgeBases, setCalendarKnowledgeBases] = useState(knowledgeBases);
  const [inventoryMode, setInventoryMode] = useState<"live" | "preview">("preview");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "warning" | "error">("success");
  const [isReserving, setIsReserving] = useState(false);

  const sortedWindows = useMemo(
    () => [...calendarWindows].sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()),
    [calendarWindows]
  );
  const firstBookableWindow = sortedWindows.find((window) => window.remainingCapacity > 0) ?? sortedWindows[0];
  const defaultDateKey = firstBookableWindow ? dateKey(firstBookableWindow.startsAt) : dateKey(CALENDAR_START);
  const [selectedDate, setSelectedDate] = useState(defaultDateKey);
  const [selectedWindowId, setSelectedWindowId] = useState(firstBookableWindow?.id ?? "");

  const windowsByDate = useMemo(() => {
    return sortedWindows.reduce<Record<string, CapacityWindow[]>>((acc, window) => {
      const key = dateKey(window.startsAt);
      acc[key] = [...(acc[key] ?? []), window];
      return acc;
    }, {});
  }, [sortedWindows]);

  const days = useMemo(
    () =>
      Array.from({ length: 21 }, (_, index) => {
        const date = addDays(CALENDAR_START, index);
        const key = dateKey(date);
        const dayWindows = windowsByDate[key] ?? [];

        return {
          key,
          date,
          windows: dayWindows,
          remaining: dayWindows.reduce((sum, window) => sum + window.remainingCapacity, 0)
        };
      }),
    [windowsByDate]
  );

  const windowsForSelectedDay = windowsByDate[selectedDate] ?? [];
  const selectedWindow =
    sortedWindows.find((window) => window.id === selectedWindowId) ??
    windowsForSelectedDay.find((window) => window.remainingCapacity > 0) ??
    windowsForSelectedDay[0];

  useEffect(() => {
    let active = true;

    async function loadLiveCalendar() {
      try {
        const live = await timexApi.calendar(ticker.symbol);
        if (!active || live.windows.length === 0) return;
        setCalendarTicker(live.ticker);
        setCalendarWindows(live.windows);
        setCalendarKnowledgeBases(live.knowledgeBases);
        setInventoryMode("live");
      } catch {
        if (active) setInventoryMode("preview");
      }
    }

    loadLiveCalendar();
    return () => {
      active = false;
    };
  }, [ticker.symbol]);

  useEffect(() => {
    if (!firstBookableWindow) return;
    const currentStillExists = sortedWindows.some((window) => window.id === selectedWindowId);
    if (currentStillExists) return;
    const timer = window.setTimeout(() => {
      setSelectedDate(dateKey(firstBookableWindow.startsAt));
      setSelectedWindowId(firstBookableWindow.id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [firstBookableWindow, selectedWindowId, sortedWindows]);

  function selectDate(key: string) {
    const dayWindows = windowsByDate[key] ?? [];
    const nextWindow = dayWindows.find((window) => window.remainingCapacity > 0) ?? dayWindows[0];

    setSelectedDate(key);
    setSelectedWindowId(nextWindow?.id ?? "");
  }

  async function reserveSelectedWindow() {
    if (!selectedWindow || isReserving) return;
    if (inventoryMode !== "live") {
      setMessageTone("warning");
      setMessage(t("calendar.liveRequired"));
      return;
    }

    setIsReserving(true);
    setMessage("");
    try {
      const result = await timexApi.buySeat(selectedWindow.id, selectedWindow.currentPriceCents, TIME_ZONE);
      setMessageTone("success");
      setMessage(t("calendar.reserved", { seat: result.ticket.seatIndex, price: formatMoney(result.receipt.priceCents, lang) }));
      window.dispatchEvent(new Event("timex-auth-changed"));
      window.dispatchEvent(new Event("timex-inventory-changed"));

      const live = await timexApi.calendar(calendarTicker.symbol);
      setCalendarTicker(live.ticker);
      setCalendarWindows(live.windows);
      setCalendarKnowledgeBases(live.knowledgeBases);
      setInventoryMode("live");
    } catch (error) {
      setMessageTone(error instanceof ApiError && error.status === 404 ? "warning" : "error");
      setMessage(
        error instanceof ApiError && error.status === 404
          ? t("calendar.previewMissing")
          : t("calendar.reserveFailed")
      );
    } finally {
      setIsReserving(false);
    }
  }

  return (
    <section className="bookingShell" aria-label={t("calendar.reserveTitle", { name: calendarTicker.displayName })}>
      <aside className="bookingProfile">
        <div className="hostAvatar" aria-hidden="true">
          {calendarTicker.avatarUrl ? <ChromaKeyPortrait src={calendarTicker.avatarUrl} alt={`${calendarTicker.displayName} avatar`} /> : initials(calendarTicker.displayName)}
        </div>
        <span className="eyebrow">{t("calendar.eventType", { symbol: calendarTicker.symbol })}</span>
        <h2>{calendarTicker.displayName}</h2>
        <p>{calendarTicker.tagline}</p>
        <div className="eventFacts" aria-label={t("calendar.details")}>
          <span>
            <Clock3 size={16} />
            {t("calendar.minutes")}
          </span>
          <span>
            <UsersRound size={16} />
            {t("calendar.seatsPerWindow", { count: firstBookableWindow?.capacityLimit ?? 1 })}
          </span>
          <span>
            <Globe2 size={16} />
            {TIME_ZONE}
          </span>
          <span>
            <ShieldCheck size={16} />
            {t("calendar.baseFloor", { price: formatMoney(calendarTicker.basePriceCents, lang) })}
          </span>
        </div>
        <div className="ruleStack">
          <Badge tone={calendarTicker.verifiedBadge ? "success" : "neutral"}>
            {calendarTicker.verifiedBadge ? t("calendar.verifiedHost") : t("calendar.openHost")}
          </Badge>
          <Badge tone={inventoryMode === "live" ? "success" : "warning"}>
            {inventoryMode === "live" ? t("calendar.liveInventory") : t("calendar.previewInventory")}
          </Badge>
          {calendarKnowledgeBases.slice(0, 2).map((kb) => (
            <Badge key={kb.id} tone="mock">
              {t("calendar.docs", { count: kb.documentCount })}
            </Badge>
          ))}
        </div>
        <InlineNotice>{t("calendar.reserveNotice")}</InlineNotice>
      </aside>

      <div className="bookingCalendarPanel">
        <div className="bookingPanelHeader">
          <div>
            <span className="eyebrow">{t("calendar.selectDay")}</span>
            <h2>{formatMonth(CALENDAR_START, lang)}</h2>
          </div>
          <Badge tone="accent">{t("calendar.bookable30")}</Badge>
        </div>
        <div className="calendarWeekdays" aria-hidden="true">
          {days.slice(0, 7).map((day) => (
            <span key={day.key}>{formatDay(day.date, lang)}</span>
          ))}
        </div>
        <div className="calendarMonthGrid">
          {days.map((day) => {
            const active = day.key === selectedDate;
            const hasTimes = day.windows.length > 0;

            return (
              <button
                key={day.key}
                type="button"
                className={`monthDay${active ? " isActive" : ""}${hasTimes ? " hasTimes" : ""}`}
                onClick={() => selectDate(day.key)}
                aria-pressed={active}
              >
                <span>{formatDay(day.date, lang)}</span>
                <strong>{new Intl.DateTimeFormat(localeForLang(lang), { timeZone: TIME_ZONE, day: "numeric" }).format(day.date)}</strong>
                {hasTimes ? <i>{day.remaining > 0 ? t("calendar.left", { count: day.remaining }) : t("calendar.full")}</i> : null}
              </button>
            );
          })}
        </div>
      </div>

      <aside className="bookingTimesPanel">
        <div className="bookingPanelHeader">
          <div>
            <span className="eyebrow">{t("calendar.availableTimes")}</span>
            <h2>{formatDate(`${selectedDate}T12:00:00+08:00`, lang)}</h2>
          </div>
        </div>

        <div className="timeList">
          {windowsForSelectedDay.length === 0 ? (
            <div className="noTimes">
              <CalendarDays size={20} />
              <strong>{t("calendar.noWindows")}</strong>
              <span>{t("calendar.selectAnother")}</span>
            </div>
          ) : (
            windowsForSelectedDay.map((window) => {
              const active = window.id === selectedWindow?.id;
              const disabled = window.remainingCapacity <= 0;

              return (
                <button
                  key={window.id}
                  type="button"
                  className={`timeOption${active ? " isActive" : ""}`}
                  disabled={disabled}
                  onClick={() => setSelectedWindowId(window.id)}
                  aria-pressed={active}
                >
                  <span>{formatTime(window.startsAt, lang)}</span>
                  <strong>{formatMoney(window.currentPriceCents, lang)}</strong>
                  <i>{disabled ? t("calendar.full") : t("calendar.seatsLeft", { count: window.remainingCapacity })}</i>
                </button>
              );
            })
          )}
        </div>

        <div className="selectedBooking">
          <div className="selectedBookingHeader">
            <span className="eyebrow">{t("calendar.reserveTime")}</span>
            <HaltCountdownRing label="12H" percent={selectedWindow?.status === "halted" ? 92 : 34} lang={lang} />
          </div>
          {selectedWindow ? (
            <>
              <strong>
                {formatDate(selectedWindow.startsAt, lang)}, {formatTime(selectedWindow.startsAt, lang)}
              </strong>
              <CapacityMeter sold={selectedWindow.soldCount} capacity={selectedWindow.capacityLimit} lang={lang} />
              <dl className="bookingQuote">
                <div>
                  <dt>{t("calendar.quantity")}</dt>
                  <dd>{t("calendar.oneSeat")}</dd>
                </div>
                <div>
                  <dt>{t("profile.base")}</dt>
                  <dd>{formatMoney(selectedWindow.basePriceCents, lang)}</dd>
                </div>
                <div>
                  <dt>{t("calendar.currentAsk")}</dt>
                  <dd>{formatMoney(selectedWindow.currentPriceCents, lang)}</dd>
                </div>
              </dl>
              {message ? (
                <StateBlock
                  state={messageTone === "success" ? "success" : messageTone === "warning" ? "disabled" : "error"}
                  title={messageTone === "success" ? t("calendar.reserveComplete") : t("calendar.reserveIncomplete")}
                  detail={message}
                />
              ) : null}
              <ProtectedActionButton
                action="reserve-time"
                loginLabel={t("calendar.loginToReserve")}
                variant="primary"
                disabled={inventoryMode !== "live" || selectedWindow.remainingCapacity <= 0 || isReserving}
                reason={
                  inventoryMode !== "live"
                    ? t("calendar.liveRequired")
                    : selectedWindow.remainingCapacity <= 0
                      ? t("calendar.thisTimeFull")
                      : undefined
                }
                onAuthenticated={reserveSelectedWindow}
              >
                <Check size={16} />
                {isReserving ? t("calendar.reserving") : t("calendar.reserveThisTime")}
              </ProtectedActionButton>
              {messageTone === "success" && message ? (
                <Link className="txButton txButton-secondary txButton-md" href={withLang(lang, "/personal-center")}>
                  {t("calendar.viewInventory")}
                </Link>
              ) : null}
            </>
          ) : (
            <span>{t("calendar.noSelectedTime")}</span>
          )}
        </div>
      </aside>
    </section>
  );
}
