"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, formatMoney, formatShortDateTime, timexApi } from "../../lib/api";
import type { TimeTicket } from "../../lib/types";
import { Button, StateBlock, StatusChip } from "../../components/ui";
import { useI18n } from "../../components/i18n-provider";

export function InventoryPanel({ fallbackTickets }: { fallbackTickets: TimeTicket[] }) {
  const { lang, t } = useI18n();
  const [tickets, setTickets] = useState<TimeTicket[]>(fallbackTickets);
  const [mode, setMode] = useState<"loading" | "live" | "anonymous" | "offline">("loading");

  const loadInventory = useCallback(async () => {
    setMode((current) => (current === "live" ? current : "loading"));
    try {
      const result = await timexApi.holdings();
      setTickets(result.tickets);
      setMode("live");
    } catch (error) {
      setMode(error instanceof ApiError && error.status === 401 ? "anonymous" : "offline");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadInventory, 0);
    window.addEventListener("timex-auth-changed", loadInventory);
    window.addEventListener("timex-inventory-changed", loadInventory);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("timex-auth-changed", loadInventory);
      window.removeEventListener("timex-inventory-changed", loadInventory);
    };
  }, [loadInventory]);

  if (mode === "loading") {
    return <StateBlock state="loading" title={t("inventory.loading")} detail={t("inventory.loadingDetail")} />;
  }

  if (mode === "anonymous") {
    return <StateBlock state="disabled" title={t("inventory.signInRequired")} detail={t("inventory.signInDetail")} />;
  }

  const visibleTickets = mode === "live" ? tickets : fallbackTickets;

  if (visibleTickets.length === 0) {
    return (
      <div className="windowStack">
        <StateBlock state="empty" title={t("inventory.none")} detail={t("inventory.noneDetail")} />
        <Button size="sm" onClick={loadInventory}>
          {t("inventory.refresh")}
        </Button>
      </div>
    );
  }

  return (
    <div className="windowStack">
      {mode === "offline" ? (
        <StateBlock state="error" title={t("inventory.unavailable")} detail={t("inventory.unavailableDetail")} />
      ) : null}
      {visibleTickets.map((ticket) => (
        <article key={ticket.id} className="compactWindow">
          <div>
            <strong>{ticket.title}</strong>
            <StatusChip status={ticket.status} lang={lang} />
          </div>
          <span>
            {t("trade.seatLine", { seat: ticket.seatIndex, time: formatShortDateTime(ticket.startsAt, lang) })}
          </span>
          <span>{t("inventory.paidLine", { paid: formatMoney(ticket.currentPriceCents, lang), base: formatMoney(ticket.basePriceCents, lang) })}</span>
          <div className="buttonRow">
            <Button size="sm">{t("inventory.relist")}</Button>
            <Button size="sm">{t("inventory.speedUp")}</Button>
            <Button size="sm">{t("inventory.extend")}</Button>
            <Button size="sm">{t("inventory.default")}</Button>
            <Button size="sm">{t("inventory.startChat")}</Button>
          </div>
        </article>
      ))}
      <Button size="sm" onClick={loadInventory}>
        {t("inventory.refresh")}
      </Button>
    </div>
  );
}
