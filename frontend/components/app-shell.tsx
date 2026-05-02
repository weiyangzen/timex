"use client";

import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Compass,
  Languages,
  MessageSquare,
  PanelLeftClose,
  Triangle,
  WalletCards
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatMoney, timexApi } from "../lib/api";
import { defaultConversationSessionId } from "../lib/default-conversations";
import { otherLang, stripLangPrefix, switchLangHref, withLang } from "../lib/i18n";
import { templateConversationHistories, templateTradeHistories } from "../lib/template-history";
import type { ConversationSession, Ticker, TimeTicket, TimeXSession, TimeXUser } from "../lib/types";
import { useI18n } from "./i18n-provider";
import { Badge, Button } from "./ui";

const navItems = [
  { href: "/discover", labelKey: "nav.discover", icon: Compass },
  { href: "/calendar", labelKey: "nav.calendar", icon: CalendarDays },
  { href: "/trade", labelKey: "nav.trade", icon: PanelLeftClose },
  { href: "/conversations", labelKey: "nav.conversations", icon: MessageSquare },
  { href: "/personal-center", labelKey: "nav.personalCenter", icon: CircleUserRound }
];

type NavConversationTarget = {
  sessionId: string;
  updatedAt: string;
};

function isReusableConversationSession(session: ConversationSession): boolean {
  return session.status !== "completed" && session.status !== "ended";
}

function conversationSymbol(
  session: ConversationSession,
  tickets: TimeTicket[],
  tickers: Ticker[],
  profiles: TimeXUser[]
): string {
  const ticket = tickets.find((candidate) => candidate.id === session.ticketId);

  if (ticket) {
    return (
      tickers.find((ticker) => ticker.id === ticket.tickerId)?.symbol ??
      profiles.find((profile) => profile.id === ticket.issuerUserId)?.tickerSymbol ??
      ""
    ).toUpperCase();
  }

  return (profiles.find((profile) => profile.id === session.sellerUserId)?.tickerSymbol ?? "").toUpperCase();
}

function conversationTargetsBySymbol({
  sessions,
  tickets,
  tickers,
  profiles
}: {
  sessions: ConversationSession[];
  tickets: TimeTicket[];
  tickers: Ticker[];
  profiles: TimeXUser[];
}): Record<string, NavConversationTarget> {
  const out: Record<string, NavConversationTarget> = {};

  for (const session of sessions.filter(isReusableConversationSession)) {
    const symbol = conversationSymbol(session, tickets, tickers, profiles);
    if (!symbol) continue;

    const updatedAt = session.updatedAt ?? session.createdAt ?? "";
    const current = out[symbol];
    if (!current || new Date(updatedAt || 0).getTime() > new Date(current.updatedAt || 0).getTime()) {
      out[symbol] = { sessionId: session.sessionId, updatedAt };
    }
  }

  return out;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { lang, t } = useI18n();
  const basePathname = stripLangPrefix(pathname);
  const [session, setSession] = useState<TimeXSession>({ kind: "anonymous", label: t("auth.anonymous"), balanceCents: null });
  const [conversationTargets, setConversationTargets] = useState<Record<string, NavConversationTarget>>({});
  const [authBusy, setAuthBusy] = useState(false);
  const [expandedNav, setExpandedNav] = useState<Record<string, boolean>>({ conversations: true, trade: true });
  const nextLang = otherLang(lang);

  const activeLabel = useMemo(() => {
    const active = navItems.find((item) => basePathname === item.href || basePathname.startsWith(`${item.href}/`));
    return t(active?.labelKey ?? "nav.discover");
  }, [basePathname, t]);

  useEffect(() => {
    let ignore = false;

    async function loadSession() {
      try {
        const state = await timexApi.me();
          if (ignore) return;
          if (state.authenticated) {
            setSession({ kind: "authenticated", user: state.user, balanceCents: state.balanceCents });
            timexApi
              .holdings()
              .then((holdings) => {
                if (ignore) return;
                setConversationTargets(conversationTargetsBySymbol(holdings));
              })
              .catch(() => {
                if (!ignore) setConversationTargets({});
              });
          } else {
            setSession({ kind: "anonymous", label: t("auth.anonymous"), balanceCents: null });
            setConversationTargets({});
          }
      } catch {
        if (ignore) return;
        setSession({ kind: "anonymous", label: t("auth.anonymous"), balanceCents: null });
        setConversationTargets({});
      }
    }

    void loadSession();
    window.addEventListener("timex-auth-changed", loadSession);

    return () => {
      ignore = true;
      window.removeEventListener("timex-auth-changed", loadSession);
    };
  }, [t]);

  async function logout() {
    setAuthBusy(true);
    try {
      await timexApi.logout();
    } finally {
      window.dispatchEvent(new Event("timex-auth-changed"));
      setSession({ kind: "anonymous", label: t("auth.anonymous"), balanceCents: null });
      setAuthBusy(false);
    }
  }

  const search = searchParams.toString();
  const loginHref = withLang(lang, `/login?next=${encodeURIComponent(`${pathname || withLang(lang, "/discover")}${search ? `?${search}` : ""}`)}`);
  const langSwitchHref = switchLangHref(pathname, nextLang, search ? `?${search}` : "");
  const conversationHistory = session.kind === "authenticated" ? templateConversationHistories(session.user, lang) : [];
  const tradeHistory = session.kind === "authenticated" ? templateTradeHistories(lang) : [];
  const tradeTargets = tradeHistory.filter((trade, index, entries) => entries.findIndex((entry) => entry.symbol === trade.symbol) === index);

  function toggleNavSection(key: "conversations" | "trade") {
    setExpandedNav((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="appShell">
      <aside className="leftNav" aria-label={t("nav.primary")}>
        <div className="brandRow">
          <Link href={withLang(lang, "/discover")} className="brandLink" aria-label="TimeX Discover">
            <span className="triangleMark">
              <Triangle size={21} />
            </span>
            <span>
              <strong>TimeX</strong>
            </span>
          </Link>
          <Link className="langButton" href={langSwitchHref} aria-label={t("nav.switchLang")} title={t("nav.switchLang")}>
            <Languages size={16} />
            <span>{nextLang === "zh" ? "中" : "En"}</span>
          </Link>
        </div>

        <nav className="primaryNav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = basePathname === item.href || basePathname.startsWith(`${item.href}/`);
            const sectionKey = item.href === "/conversations" ? "conversations" : item.href === "/trade" ? "trade" : null;
            const canExpand = sectionKey === "conversations" ? conversationHistory.length > 0 : sectionKey === "trade" ? tradeTargets.length > 0 : false;
            const expanded = sectionKey ? expandedNav[sectionKey] : false;
            return (
              <div key={item.href} className={sectionKey && canExpand ? "navGroup" : undefined}>
                <div className="navItemRow">
                  <Link href={withLang(lang, item.href)} className={active ? "navItem isActive" : "navItem"}>
                    <Icon size={18} />
                    <span>{t(item.labelKey)}</span>
                  </Link>
                  {sectionKey && canExpand ? (
                    <button
                      className="navExpandButton"
                      type="button"
                      onClick={() => toggleNavSection(sectionKey)}
                      aria-label={t(expanded ? "nav.collapseSection" : "nav.expandSection", { section: t(item.labelKey) })}
                      aria-expanded={expanded}
                    >
                      {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                  ) : null}
                </div>
                {sectionKey === "conversations" && canExpand && expanded ? (
                  <div className="navSubList" aria-label={t("nav.historyConversations")}>
                    {conversationHistory.map((history) => (
                      <Link
                        key={history.id}
                        href={withLang(
                          lang,
                          defaultConversationSessionId(session.kind === "authenticated" ? session.user : null, history.symbol)
                            ? `/conversations/${defaultConversationSessionId(session.kind === "authenticated" ? session.user : null, history.symbol)}`
                            : conversationTargets[history.symbol]?.sessionId
                            ? `/conversations/${conversationTargets[history.symbol].sessionId}`
                            : `/conversations?start=${history.symbol}`
                        )}
                        className="navSubItem"
                      >
                        <span>{t("conversations.historyWith", { name: history.peerName })}</span>
                        <small>{formatShortDateTimeForNav(conversationTargets[history.symbol]?.updatedAt || history.updatedAt, lang)}</small>
                      </Link>
                    ))}
                  </div>
                ) : null}
                {sectionKey === "trade" && canExpand && expanded ? (
                  <div className="navSubList" aria-label={t("nav.recentTrades")}>
                    {tradeTargets.slice(0, 4).map((trade) => (
                      <Link key={trade.symbol} href={withLang(lang, `/trade/${trade.symbol}`)} className="navSubItem">
                        <span>
                          {t("nav.trade")} {trade.symbol}
                        </span>
                        <small>{formatShortDateTimeForNav(trade.executedAt, lang)}</small>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <section className="accountShell" aria-label={t("auth.signIn")}>
          {session.kind === "authenticated" ? (
            <>
              <div className="accountIdentity">
                <CircleUserRound size={18} />
                <div>
                  <strong>{session.user.displayName}</strong>
                  <span>{session.user.loginName}</span>
                </div>
              </div>
              <div className="balanceLine">
                <WalletCards size={17} />
                <span>{formatMoney(session.balanceCents, lang)}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={logout} disabled={authBusy}>
                {t("auth.signOut")}
              </Button>
            </>
          ) : (
            <Link className="txButton txButton-primary txButton-sm" href={loginHref}>
              {t("auth.signIn")}
            </Link>
          )}
        </section>
      </aside>

      <header className="mobileTopbar">
        <Link href={withLang(lang, "/discover")} className="mobileBrand" aria-label="TimeX">
          <Triangle size={20} />
          <span>{activeLabel}</span>
        </Link>
        <Link className="langButton mobileLangButton" href={langSwitchHref} aria-label={t("nav.switchLang")} title={t("nav.switchLang")}>
          <Languages size={16} />
          <span>{nextLang === "zh" ? "中" : "En"}</span>
        </Link>
        <div className="mobileAccountActions">
          <Badge tone={session.kind === "authenticated" ? "success" : "neutral"}>
            {session.kind === "authenticated" ? formatMoney(session.balanceCents, lang) : t("auth.anonymous")}
          </Badge>
          {session.kind === "authenticated" ? (
            <Button size="sm" variant="ghost" onClick={logout} disabled={authBusy}>
              {t("auth.out")}
            </Button>
          ) : (
            <Link className="txButton txButton-primary txButton-sm" href={loginHref}>
              {t("auth.in")}
            </Link>
          )}
        </div>
      </header>

      <main className="contentShell">{children}</main>

      <nav className="bottomNav" aria-label={t("nav.mobilePrimary")}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = basePathname === item.href || basePathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={withLang(lang, item.href)} className={active ? "bottomNavItem isActive" : "bottomNavItem"}>
              <Icon size={18} />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function formatShortDateTimeForNav(value: string, lang: "en" | "zh") {
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}
