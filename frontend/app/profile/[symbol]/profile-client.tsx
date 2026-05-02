"use client";

import { CalendarDays, Edit3, MessageSquare, Repeat2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChromaKeyPortrait } from "../../../components/chroma-key-portrait";
import { useI18n } from "../../../components/i18n-provider";
import { Badge, Button, Card, InlineNotice, StateBlock } from "../../../components/ui";
import { API_BASE, formatMoney, formatShortDateTime, timexApi } from "../../../lib/api";
import { withLang } from "../../../lib/i18n";
import type { TimeXUser } from "../../../lib/types";

export type ProfileFallback = {
  symbol: string;
  displayName: string;
  tagline: string;
  bio: string;
  portraitUrl: string;
  basePriceCents: number;
  currentPriceCents: number;
  priceChangePercent: number;
  heatScore: number;
  nextAvailableAt: string;
};

export function PublicProfileView({
  fallback,
  profile,
  canEdit,
  embedded = false
}: {
  fallback: ProfileFallback;
  profile: TimeXUser | null;
  canEdit: boolean;
  embedded?: boolean;
}) {
  const { lang, t } = useI18n();
  const symbol = profile?.tickerSymbol || fallback.symbol.toUpperCase();
  const displayName = profile?.displayName || fallback.displayName || symbol;
  const headline = profile?.headline || fallback.tagline || t("profile.defaultHeadline");
  const bio = profile?.bio || fallback.bio || t("profile.defaultBio");
  const portrait = absoluteProfileImageUrl(profile?.portraitUrl || fallback.portraitUrl);
  const base = profile?.agentBasePriceCents || fallback.basePriceCents;
  const current = fallback.currentPriceCents || base;
  const gain = fallback.priceChangePercent;
  const bookingParams = new URLSearchParams({
    intent: "book",
    name: displayName,
    tagline: headline,
    base: String(base),
    next: fallback.nextAvailableAt,
    verified: "true"
  });

  return (
    <div className={embedded ? "profilePage profilePreviewPage" : "modulePage profilePage"}>
      <header className="profileHero">
        <div className="profileHeroPortrait">
          <ChromaKeyPortrait src={portrait} alt={`${displayName} portrait`} />
        </div>
        <div className="profileHeroCopy">
          <span className="eyebrow">{t("profile.title")}</span>
          <h1>{displayName}</h1>
          <div className="profileBadgeRow">
            <Badge tone="accent">${symbol}</Badge>
            {profile?.mbti ? <Badge>{profile.mbti}</Badge> : null}
            {canEdit ? <Badge tone="success">{t("profile.editable")}</Badge> : <Badge tone="neutral">{t("profile.public")}</Badge>}
          </div>
          <strong>{headline}</strong>
          <p>{bio}</p>
          <div className="profileActionGrid">
            {canEdit ? (
              <Link className="txButton txButton-secondary txButton-md" href={withLang(lang, "/personal-center")}>
                <Edit3 size={16} />
                <span>{t("profile.edit")}</span>
              </Link>
            ) : (
              <Link className="txButton txButton-secondary txButton-md" href={withLang(lang, `/profile/${symbol}`)}>
                <Edit3 size={16} />
                <span>{t("persona.profile")}</span>
              </Link>
            )}
            <Link className="txButton txButton-secondary txButton-md" href={withLang(lang, `/calendar/${symbol}?${bookingParams.toString()}`)}>
              <CalendarDays size={16} />
              <span>{t("persona.book")}</span>
            </Link>
            <Link className="txButton txButton-secondary txButton-md" href={withLang(lang, `/trade/${symbol}`)}>
              <Repeat2 size={16} />
              <span>{t("persona.trade")}</span>
            </Link>
            {canEdit ? null : (
              <Link className="txButton txButton-primary txButton-md" href={withLang(lang, `/conversations?start=${symbol}`)}>
                <MessageSquare size={16} />
                <span>{t("persona.chat")}</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="profileDetailGrid">
        <Card title={t("profile.trading")}>
          <dl className="profileStats">
            <div>
              <dt>{t("profile.base")}</dt>
              <dd>{formatMoney(base || 0, lang)}</dd>
            </div>
            <div>
              <dt>{t("profile.market")}</dt>
              <dd>{formatMoney(current || base || 0, lang)}</dd>
            </div>
            <div>
              <dt>{t("persona.gain")}</dt>
              <dd>{gain ? `+${gain}%` : t("profile.new")}</dd>
            </div>
            <div>
              <dt>{t("persona.heat")}</dt>
              <dd>{fallback.heatScore || t("profile.new")}</dd>
            </div>
          </dl>
          {fallback.nextAvailableAt ? (
            <InlineNotice>{t("profile.nextAvailable", { time: formatShortDateTime(fallback.nextAvailableAt, lang) })}</InlineNotice>
          ) : null}
        </Card>

        <Card title={t("profile.expertise")}>
          <div className="profileTagList">
            {(profile?.expertise?.length ? profile.expertise : ["TimeX", "Conversation", "Agent"]).map((item) => (
              <Badge key={item} tone="accent">
                {item}
              </Badge>
            ))}
          </div>
          {profile?.offer ? <p className="profileOffer">{profile.offer}</p> : null}
        </Card>

        <Card title={t("profile.links")}>
          {profile?.links?.length ? (
            <div className="profileLinks">
              {profile.links.map((link) => (
                <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                  {link.type}
                </a>
              ))}
            </div>
          ) : (
            <StateBlock state="empty" title={t("profile.noLinks")} detail={t("profile.noLinksDetail")} />
          )}
        </Card>
      </section>
    </div>
  );
}

function absoluteProfileImageUrl(value?: string) {
  if (!value) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/avatar/")) return value;
  if (value.startsWith("/")) return `${API_BASE}${value}`;
  return value;
}

export function PublicProfileClient({ fallback }: { fallback: ProfileFallback }) {
  const { t } = useI18n();
  const [profile, setProfile] = useState<TimeXUser | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "fallback" | "error">("loading");

  useEffect(() => {
    let active = true;
    timexApi
      .publicProfile(fallback.symbol)
      .then((payload) => {
        if (!active) return;
        setProfile(payload.profile);
        setCanEdit(payload.canEdit);
        setState("ready");
      })
      .catch(() => {
        if (!active) return;
        setState(fallback.displayName ? "fallback" : "error");
      });
    return () => {
      active = false;
    };
  }, [fallback.displayName, fallback.symbol]);

  if (state === "loading") {
    return (
      <div className="modulePage profilePage">
        <StateBlock state="loading" title={t("profile.loading")} detail={t("profile.loadingDetail")} />
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="modulePage profilePage">
        <StateBlock state="error" title={t("profile.notFound")} detail={t("profile.notFoundDetail")} />
      </div>
    );
  }

  return <PublicProfileView fallback={fallback} profile={profile} canEdit={canEdit} />;
}
