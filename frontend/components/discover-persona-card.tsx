import { CalendarDays, MessageSquare, Repeat2, UserRound } from "lucide-react";
import Link from "next/link";
import { formatMoney, formatShortDateTime } from "../lib/api";
import { withLang } from "../lib/i18n";
import type { DiscoverPersona } from "../lib/types";
import { ChromaKeyPortrait } from "./chroma-key-portrait";
import { useI18n } from "./i18n-provider";
import { Badge } from "./ui";

export function DiscoverPersonaCard({
  persona,
  isSelf = false
}: {
  persona: DiscoverPersona;
  isSelf?: boolean;
}) {
  const { lang, t } = useI18n();
  const gainTone = persona.priceChangePercent >= 25 ? "success" : "neutral";
  const bookingParams = new URLSearchParams({
    intent: "book",
    name: persona.displayName,
    tagline: persona.tagline,
    base: String(persona.basePriceCents),
    next: persona.nextAvailableAt,
    verified: String(persona.verifiedBadge),
    avatar: persona.avatarUrl ?? ""
  });
  const profileParams = new URLSearchParams({
    name: persona.displayName,
    tagline: persona.tagline,
    bio: persona.bio,
    portrait: persona.portraitUrl ?? "",
    base: String(persona.basePriceCents),
    current: String(persona.currentPriceCents),
    gain: String(persona.priceChangePercent),
    heat: String(persona.heatScore),
    next: persona.nextAvailableAt,
    source: persona.source
  });

  return (
    <article className="discoverCard">
      <ChromaKeyPortrait className="discoverPortrait" src={persona.portraitUrl ?? persona.avatarUrl} alt={`${persona.displayName} portrait`} />
      <div className="discoverShade" />
      <div className="discoverCardBody">
        <div className="discoverIdentityRow">
          <span className="discoverAvatar">
            <ChromaKeyPortrait src={persona.avatarUrl} alt={`${persona.displayName} avatar`} />
          </span>
          <div className="discoverIdentity">
            <strong>{persona.displayName}</strong>
            <span>${persona.symbol}</span>
          </div>
          <Badge tone={persona.verifiedBadge ? "success" : "neutral"}>
            {persona.verifiedBadge ? t("persona.verified") : t("persona.open")}
          </Badge>
        </div>
        <div className="discoverTradeRow">
          <div>
            <span>{t("persona.price")}</span>
            <strong>{formatMoney(persona.currentPriceCents, lang)}</strong>
          </div>
          <div>
            <span>{t("persona.gain")}</span>
            <strong>+{persona.priceChangePercent}%</strong>
          </div>
          <div>
            <span>{t("persona.heat")}</span>
            <strong>{persona.heatScore}</strong>
          </div>
          <Badge tone={gainTone}>{t("persona.next", { time: formatShortDateTime(persona.nextAvailableAt, lang) })}</Badge>
        </div>
        <div className="discoverActions">
          <Link className="txButton txButton-secondary txButton-sm" href={withLang(lang, `/profile/${persona.symbol}?${profileParams.toString()}`)}>
            <UserRound size={14} />
            <span>{t("persona.profile")}</span>
          </Link>
          <Link
            className="txButton txButton-secondary txButton-sm"
            href={withLang(lang, `/calendar/${persona.symbol}?${bookingParams.toString()}`)}
            aria-label={t("persona.bookAria", { name: persona.displayName })}
          >
            <CalendarDays size={14} />
            <span>{t("persona.book")}</span>
          </Link>
          <Link className="txButton txButton-secondary txButton-sm" href={withLang(lang, `/trade/${persona.symbol}`)}>
            <Repeat2 size={14} />
            <span>{t("persona.trade")}</span>
          </Link>
          {isSelf ? null : (
            <Link className="txButton txButton-primary txButton-sm" href={withLang(lang, `/conversations?start=${persona.symbol}`)}>
              <MessageSquare size={14} />
              <span>{t("persona.chat")}</span>
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
