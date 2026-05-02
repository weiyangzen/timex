"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "../../../components/theme-toggle";
import { Badge, Button, Card, CapacityMeter, DataTable, StateBlock, StatusChip } from "../../../components/ui";
import { formatMoney, formatShortDateTime, timexApi } from "../../../lib/api";
import { demoKnowledgeBases, demoSlots, demoTickets, demoTickers, demoWindows } from "../../../lib/demo-data";
import { createTranslator, type Lang } from "../../../lib/i18n";
import type { CapacityWindow, KnowledgeBase, Slot, Ticker, TimeTicket, TimeXUser } from "../../../lib/types";
import { ProfileEditor } from "../../personal-center/profile-editor";
import { PublicProfileView, type ProfileFallback } from "../../profile/[symbol]/profile-client";

type PersonalTab = "preview" | "edit" | "assets";

type AuthState =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "authenticated"; user: TimeXUser; balanceCents: number };

type AssetState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; ticker: Ticker | null; slots: Slot[]; windows: CapacityWindow[]; tickets: TimeTicket[]; knowledgeBases: KnowledgeBase[] }
  | { kind: "offline"; ticker: Ticker | null; slots: Slot[]; windows: CapacityWindow[]; tickets: TimeTicket[]; knowledgeBases: KnowledgeBase[] };

export function PersonalCenterClient({ lang }: { lang: Lang }) {
  const [authState, setAuthState] = useState<AuthState>({ kind: "loading" });
  const [assetState, setAssetState] = useState<AssetState>({ kind: "idle" });
  const [activeTab, setActiveTab] = useState<PersonalTab>("preview");
  const t = createTranslator(lang);
  const loginHref = `/${lang}/login?next=${encodeURIComponent(`/${lang}/personal-center`)}`;

  useEffect(() => {
    let active = true;
    timexApi
      .me()
      .then((state) => {
        if (!active) return;
        if (state.authenticated) {
          setAuthState({ kind: "authenticated", user: state.user, balanceCents: state.balanceCents });
        } else {
          setAuthState({ kind: "anonymous" });
        }
      })
      .catch(() => {
        if (!active) return;
        setAuthState({ kind: "anonymous" });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authState.kind !== "authenticated") return;
    let active = true;
    const symbol = normalizeSymbol(authState.user.tickerSymbol);
    const fallback = scopedFallbackAssets(symbol);

    if (!symbol) {
      const timer = window.setTimeout(() => {
        if (active) setAssetState({ kind: "ready", ticker: null, slots: [], windows: [], tickets: [], knowledgeBases: [] });
      }, 0);
      return () => {
        active = false;
        window.clearTimeout(timer);
      };
    }

    const loadingTimer = window.setTimeout(() => {
      if (active) setAssetState({ kind: "loading" });
    }, 0);

    timexApi
      .calendar(symbol)
      .then((result) => {
        window.clearTimeout(loadingTimer);
        if (!active) return;
        const ticker = result.ticker.symbol ? result.ticker : fallback.ticker;
        const tickerId = ticker?.id ?? result.ticker.id;
        setAssetState({
          kind: "ready",
          ticker: ticker ?? null,
          slots: result.slots.length ? result.slots : fallback.slots,
          windows: filterByTicker(result.windows.length ? result.windows : fallback.windows, tickerId, symbol),
          tickets: filterByTicker(result.tickets.length ? result.tickets : fallback.tickets, tickerId, symbol),
          knowledgeBases: filterKnowledgeBases(result.knowledgeBases.length ? result.knowledgeBases : fallback.knowledgeBases, result.slots.length ? result.slots : fallback.slots)
        });
      })
      .catch(() => {
        window.clearTimeout(loadingTimer);
        if (!active) return;
        setAssetState({ kind: "offline", ticker: fallback.ticker, slots: fallback.slots, windows: fallback.windows, tickets: fallback.tickets, knowledgeBases: fallback.knowledgeBases });
      });

    return () => {
      active = false;
      window.clearTimeout(loadingTimer);
    };
  }, [authState]);

  if (authState.kind === "loading") {
    return (
      <div className="modulePage">
        <PersonalHeader t={t} />
        <Card title={t("personal.professionalProfile")}>
          <StateBlock state="loading" title={t("profile.loading")} detail={t("editor.checkingSession")} />
        </Card>
      </div>
    );
  }

  if (authState.kind === "anonymous") {
    return (
      <div className="modulePage">
        <PersonalHeader t={t} />
        <Card title={t("personal.professionalProfile")}>
          <div className="profileAuthRequired">
            <StateBlock state="disabled" title={t("auth.signInRequired")} detail={t("profile.signInDetail")} />
            <Link className="txButton txButton-primary txButton-md" href={loginHref}>
              {t("auth.signIn")}
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const previewPanel = <PreviewPanel user={authState.user} assetState={assetState} />;

  const editPanel = (
    <section className="dashboardGrid">
      <Card title={t("personal.professionalProfile")} className="spanTwo">
        <ProfileEditor />
      </Card>
      <Card title={t("personal.balance")}>
        <div className="personalBalanceBlock">
          <Badge tone="success">{t("personal.demoBalance")}</Badge>
          <strong className="bigNumber">{formatMoney(authState.balanceCents, lang)}</strong>
        </div>
      </Card>
    </section>
  );

  return (
    <div className="modulePage">
      <PersonalHeader t={t} />
      <div className="personalTabBar" role="tablist" aria-label={t("personal.tabs")}>
        <button className={activeTab === "preview" ? "isActive" : ""} type="button" role="tab" onClick={() => setActiveTab("preview")}>
          {t("personal.previewTab")}
        </button>
        <button className={activeTab === "edit" ? "isActive" : ""} type="button" role="tab" onClick={() => setActiveTab("edit")}>
          {t("personal.profileTab")}
        </button>
        <button className={activeTab === "assets" ? "isActive" : ""} type="button" role="tab" onClick={() => setActiveTab("assets")}>
          {t("personal.assetsTab")}
        </button>
      </div>
      {activeTab === "preview" ? previewPanel : activeTab === "edit" ? editPanel : <AssetsPanel assetState={assetState} lang={lang} t={t} />}
    </div>
  );
}

function PersonalHeader({ t }: { t: ReturnType<typeof createTranslator> }) {
  return (
    <header className="moduleHeader personalHeader">
      <div>
        <span className="eyebrow">{t("personal.eyebrow")}</span>
        <h1>{t("nav.personalCenter")}</h1>
      </div>
      <div className="personalHeaderTools">
        <ThemeToggle />
        <Badge tone="success">{t("personal.demoBalance")}</Badge>
      </div>
    </header>
  );
}

function PreviewPanel({ user, assetState }: { user: TimeXUser; assetState: AssetState }) {
  return <PublicProfileView fallback={profileFallbackFromUser(user, assetState)} profile={user} canEdit embedded />;
}

function AssetsPanel({ assetState, lang, t }: { assetState: AssetState; lang: Lang; t: ReturnType<typeof createTranslator> }) {
  const slotsById = useMemo(() => new Map((assetState.kind === "ready" || assetState.kind === "offline" ? assetState.slots : []).map((slot) => [slot.id, slot])), [assetState]);

  if (assetState.kind === "idle" || assetState.kind === "loading") {
    return (
      <Card title={t("personal.assetsTab")}>
        <StateBlock state="loading" title={t("personal.loadingAssets")} detail={t("editor.checkingSession")} />
      </Card>
    );
  }

  if (!assetState.ticker) {
    return (
      <Card title={t("personal.assetsTab")}>
        <StateBlock state="empty" title={t("personal.noScopedTicker")} detail={t("personal.noScopedTickerDetail")} />
      </Card>
    );
  }

  return (
    <section className="dashboardGrid">
      {assetState.kind === "offline" ? (
        <div className="spanTwo">
          <StateBlock state="error" title={t("personal.assetsOffline")} detail={t("personal.assetsOfflineDetail")} />
        </div>
      ) : null}

      <Card title={t("personal.myTickers")}>
        <DataTable
          rows={[assetState.ticker]}
          emptyLabel={t("personal.noTickers")}
          columns={[
            { key: "symbol", header: t("personal.symbol"), render: (ticker) => ticker.symbol },
            { key: "name", header: t("personal.name"), render: (ticker) => ticker.displayName },
            { key: "base", header: t("profile.base"), render: (ticker) => formatMoney(ticker.basePriceCents, lang) }
          ]}
        />
      </Card>

      <Card title={t("personal.availability")} className="spanTwo">
        {assetState.windows.length ? (
          <div className="windowStack">
            {assetState.windows.map((window) => {
              const slot = slotsById.get(window.slotId);
              return (
                <article key={window.id} className="compactWindow">
                  <div>
                    <strong>{slot?.slotName ?? t("personal.windowCapacity")}</strong>
                    {slot ? <Badge>{slot.slotType}</Badge> : <StatusChip status={window.status} lang={lang} />}
                  </div>
                  <span>{formatShortDateTime(window.startsAt, lang)}</span>
                  <span>{t("personal.unifiedBase", { price: formatMoney(slot?.unifiedBasePriceCents ?? window.basePriceCents, lang) })}</span>
                  <CapacityMeter sold={window.soldCount} capacity={window.capacityLimit} lang={lang} />
                </article>
              );
            })}
          </div>
        ) : (
          <StateBlock state="empty" title={t("personal.noWindows")} detail={t("personal.noWindowsDetail")} />
        )}
      </Card>

      <Card title={t("personal.knowledgeBases")}>
        {assetState.knowledgeBases.length ? (
          <div className="kbList">
            {assetState.knowledgeBases.map((kb) => (
              <Badge key={kb.id} tone="mock">
                {kb.name} - {t("calendar.docs", { count: kb.documentCount })}
              </Badge>
            ))}
          </div>
        ) : (
          <StateBlock state="empty" title={t("personal.noKnowledgeBases")} detail={t("personal.noKnowledgeBasesDetail")} />
        )}
        <Button variant="primary">{t("personal.oneClickImport")}</Button>
      </Card>

      <Card title={t("personal.issuedTickets")} className="spanTwo">
        <DataTable
          rows={assetState.tickets}
          emptyLabel={t("personal.noTickets")}
          columns={[
            { key: "title", header: t("personal.ticket"), render: (ticket) => ticket.title },
            { key: "price", header: t("persona.price"), render: (ticket) => formatMoney(ticket.currentPriceCents, lang) },
            { key: "status", header: t("personal.status"), render: (ticket) => <StatusChip status={ticket.status} lang={lang} /> }
          ]}
        />
      </Card>

      <Card title={t("personal.sessionHistory")}>
        <StateBlock state="empty" title={t("personal.noEnded")} detail={t("personal.noEndedDetail")} />
      </Card>
    </section>
  );
}

function normalizeSymbol(value?: string) {
  return (value ?? "").trim().toUpperCase();
}

function profileFallbackFromUser(user: TimeXUser, assetState: AssetState): ProfileFallback {
  const ticker = assetState.kind === "ready" || assetState.kind === "offline" ? assetState.ticker : null;
  const symbol = normalizeSymbol(user.tickerSymbol || ticker?.symbol) || "YOU";
  const basePriceCents = ticker?.basePriceCents ?? user.agentBasePriceCents ?? 12000;
  const activitySeed = symbol.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const priceChangePercent = 8 + (activitySeed % 24);
  const currentPriceCents = Math.round(basePriceCents * (1 + priceChangePercent / 100));

  return {
    symbol,
    displayName: user.displayName || user.loginName || symbol,
    tagline: user.headline || ticker?.tagline || user.offer || "",
    bio: user.bio || user.initialInfo || ticker?.bio || "",
    portraitUrl: user.portraitUrl || "",
    basePriceCents,
    currentPriceCents,
    priceChangePercent,
    heatScore: 55 + (activitySeed % 40),
    nextAvailableAt: ticker?.nextAvailableAt ?? fallbackDate(18 + (activitySeed % 24))
  };
}

function fallbackDate(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function scopedFallbackAssets(symbol: string) {
  const ticker = demoTickers.find((item) => item.symbol === symbol) ?? null;
  const tickerIds = new Set(ticker ? [ticker.id] : []);
  const slots = demoSlots.filter((slot) => tickerIds.has(slot.tickerId));
  const slotIds = new Set(slots.map((slot) => slot.id));
  return {
    ticker,
    slots,
    windows: demoWindows.filter((window) => tickerIds.has(window.tickerId) || slotIds.has(window.slotId)),
    tickets: demoTickets.filter((ticket) => tickerIds.has(ticket.tickerId) || ticket.title.toUpperCase().startsWith(symbol)),
    knowledgeBases: filterKnowledgeBases(demoKnowledgeBases, slots)
  };
}

function filterByTicker<Item extends { tickerId: string }>(items: Item[], tickerId: string | undefined, symbol: string) {
  const normalizedSymbol = symbol.toLowerCase();
  return items.filter((item) => item.tickerId === tickerId || item.tickerId.toLowerCase().includes(normalizedSymbol));
}

function filterKnowledgeBases(kbs: KnowledgeBase[], slots: Slot[]) {
  const slotIds = new Set(slots.map((slot) => slot.id));
  return kbs.filter((kb) => slotIds.has(kb.slotId));
}
