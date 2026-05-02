"use client";

import { ImageUp, Link2, Save, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { ChromaKeyPortrait } from "../../components/chroma-key-portrait";
import { useI18n } from "../../components/i18n-provider";
import { InlineNotice, StateBlock } from "../../components/ui";
import { API_BASE, ApiError, timexApi, type ProfilePayload } from "../../lib/api";
import type { ProfileLink, TimeXUser } from "../../lib/types";
import { ProfileImageCropper } from "./profile-image-cropper";

const DEFAULT_PROFILE: ProfilePayload = {
  displayName: "",
  tickerSymbol: "",
  avatarUrl: "",
  initialInfo: "",
  headline: "",
  organization: "",
  mbti: "",
  expertise: [],
  bio: "",
  links: [],
  offer: "",
  portraitUrl: "",
  chatAvatarUrl: "",
  tradeLogoUrl: "",
  agentBasePriceCents: 12000
};

function portraitSrc(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/avatar/")) return value;
  if (value.startsWith("/")) return `${API_BASE}${value}`;
  return value;
}

function profileFromUser(user: TimeXUser | null): ProfilePayload {
  if (!user) return DEFAULT_PROFILE;
  return {
    displayName: user.displayName || DEFAULT_PROFILE.displayName,
    tickerSymbol: user.tickerSymbol || "",
    avatarUrl: user.avatarUrl || user.chatAvatarUrl || DEFAULT_PROFILE.avatarUrl,
    initialInfo: user.initialInfo || user.bio || DEFAULT_PROFILE.initialInfo,
    headline: user.headline || DEFAULT_PROFILE.headline,
    organization: user.organization || DEFAULT_PROFILE.organization,
    mbti: user.mbti || DEFAULT_PROFILE.mbti,
    expertise: user.expertise?.length ? user.expertise.slice(0, 5) : DEFAULT_PROFILE.expertise,
    bio: user.bio || user.initialInfo || DEFAULT_PROFILE.bio,
    links: user.links ?? [],
    offer: user.offer || DEFAULT_PROFILE.offer,
    portraitUrl: user.portraitUrl || DEFAULT_PROFILE.portraitUrl,
    chatAvatarUrl: user.chatAvatarUrl || user.avatarUrl || DEFAULT_PROFILE.chatAvatarUrl,
    tradeLogoUrl: user.tradeLogoUrl || user.avatarUrl || DEFAULT_PROFILE.tradeLogoUrl,
    agentBasePriceCents: user.agentBasePriceCents ?? DEFAULT_PROFILE.agentBasePriceCents
  };
}

function linkRowsToProfileLinks(value: string): ProfileLink[] {
  return value
    .split("\n")
    .map((url) => url.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((url) => ({ type: inferLinkType(url), url }));
}

function inferLinkType(url: string): ProfileLink["type"] {
  const normalized = url.toLowerCase();
  if (normalized.includes("linkedin.")) return "linkedin";
  if (normalized.includes("twitter.") || normalized.includes("x.com/")) return "twitter";
  if (normalized.includes("github.")) return "github";
  if (normalized.includes("linktr.ee") || normalized.includes("linktree.")) return "linktree";
  if (normalized.includes("substack.")) return "substack";
  if (normalized.includes("medium.")) return "medium";
  if (normalized.includes("youtube.") || normalized.includes("youtu.be")) return "youtube";
  if (normalized.includes("producthunt.")) return "product";
  return "website";
}

function linksToRows(links: ProfileLink[]): string {
  return links.map((link) => link.url).join("\n");
}

function expertiseToText(expertise: string[]): string {
  return expertise.join(", ");
}

function textToExpertise(value: string): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of value.split(/[,\n，]/)) {
    const label = item.trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    output.push(label);
    if (output.length === 5) break;
  }
  return output;
}

function normalizeTickerInput(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 12);
}

function centsToDollars(cents: number): string {
  return String(Math.max(0, Math.round(cents)) / 100);
}

function dollarsToCents(value: string): number {
  return Math.max(0, Math.round(Number(value || "0") * 100));
}

export function ProfileEditor() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<ProfilePayload>(DEFAULT_PROFILE);
  const [linkRows, setLinkRows] = useState("");
  const [expertiseText, setExpertiseText] = useState(expertiseToText(DEFAULT_PROFILE.expertise));
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "warning">("success");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [tickerLocked, setTickerLocked] = useState(false);
  const [cropRequest, setCropRequest] = useState<{ sourceUrl: string; mode: "profile" | "avatar" } | null>(null);

  useEffect(() => {
    let active = true;
    timexApi
      .profile()
      .then((payload) => {
        if (!active) return;
        if (!payload.profile) {
          setIsAuthenticated(false);
          setCanSave(false);
          setProfile(DEFAULT_PROFILE);
          setLinkRows("");
          setExpertiseText("");
          setTickerLocked(false);
          return;
        }
        const nextProfile = profileFromUser(payload.profile);
        setIsAuthenticated(true);
        setProfile(nextProfile);
        setLinkRows(linksToRows(nextProfile.links));
        setExpertiseText(expertiseToText(nextProfile.expertise));
        setTickerLocked(Boolean(payload.profile.tickerSymbol));
        setCanSave(true);
      })
      .catch(() => {
        if (!active) return;
        setIsAuthenticated(false);
        setCanSave(false);
        setMessage(t("editor.apiUnavailable"));
        setMessageTone("warning");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [t]);

  const normalizedProfile = useMemo(
    () => ({
      ...profile,
      tickerSymbol: normalizeTickerInput(profile.tickerSymbol),
      expertise: textToExpertise(expertiseText),
      links: linkRowsToProfileLinks(linkRows)
    }),
    [expertiseText, linkRows, profile]
  );

  function updateProfileField<Key extends keyof ProfilePayload>(key: Key, value: ProfilePayload[Key]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  const tickerReady = normalizedProfile.tickerSymbol.length >= 2;
  const marketReady = tickerReady && normalizedProfile.mbti.trim() !== "" && normalizedProfile.bio.trim() !== "";
  const portraitImageSrc = portraitSrc(normalizedProfile.portraitUrl);
  const avatarImageSrc = portraitSrc(normalizedProfile.avatarUrl || normalizedProfile.chatAvatarUrl || normalizedProfile.tradeLogoUrl);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      setMessage(t("editor.loginToSave"));
      setMessageTone("warning");
      return;
    }
    if (!tickerReady) {
      setMessage(t("editor.tickerRequired"));
      setMessageTone("warning");
      return;
    }
    const savePayload = {
      ...normalizedProfile,
      initialInfo: normalizedProfile.bio
    };
    setIsSaving(true);
    setMessage("");
    try {
      const payload = await timexApi.updateProfile(savePayload);
      const nextProfile = profileFromUser(payload.profile);
      setProfile(nextProfile);
      setLinkRows(linksToRows(nextProfile.links));
      setExpertiseText(expertiseToText(nextProfile.expertise));
      setTickerLocked(Boolean(payload.profile.tickerSymbol));
      setMessage(marketReady ? t("editor.saved") : t("editor.savedDraft"));
      setMessageTone(marketReady ? "success" : "warning");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setMessage(t("editor.tickerConflict"));
      } else if (error instanceof ApiError && error.status === 400) {
        setMessage(t("editor.tickerInvalid"));
      } else {
        setMessage(t("editor.saveFailed"));
      }
      setMessageTone("warning");
    } finally {
      setIsSaving(false);
    }
  }

  async function onImportLinks() {
    const links = linkRows
      .split("\n")
      .map((link) => link.trim())
      .filter(Boolean);
    if (!links.length) {
      setMessage(t("editor.addLink"));
      setMessageTone("warning");
      return;
    }
    if (!canSave) {
      setMessage(t("editor.loginToImport"));
      setMessageTone("warning");
      return;
    }
    setIsImporting(true);
    setMessage("");
    try {
      const payload = await timexApi.importProfileLinks(links);
      const suggestion = payload.suggestion;
      const nextProfile: ProfilePayload = {
        displayName: suggestion.display_name ?? normalizedProfile.displayName,
        tickerSymbol: normalizedProfile.tickerSymbol,
        avatarUrl: suggestion.avatar_url ?? normalizedProfile.avatarUrl,
        initialInfo: suggestion.bio ?? normalizedProfile.bio,
        headline: suggestion.headline ?? normalizedProfile.headline,
        organization: suggestion.organization ?? normalizedProfile.organization,
        mbti: normalizedProfile.mbti,
        expertise: suggestion.expertise?.length ? suggestion.expertise : normalizedProfile.expertise,
        bio: suggestion.bio ?? normalizedProfile.bio,
        links: suggestion.links?.length ? suggestion.links : normalizedProfile.links,
        offer: suggestion.offer ?? normalizedProfile.offer,
        portraitUrl: normalizedProfile.portraitUrl,
        chatAvatarUrl: normalizedProfile.chatAvatarUrl,
        tradeLogoUrl: normalizedProfile.tradeLogoUrl,
        agentBasePriceCents: normalizedProfile.agentBasePriceCents
      };
      setProfile(nextProfile);
      setLinkRows(linksToRows(nextProfile.links));
      setExpertiseText(expertiseToText(nextProfile.expertise));
      setMessage(t("editor.linksImported", { count: payload.imports.length }));
      setMessageTone("success");
    } catch {
      setMessage(t("editor.importFailed"));
      setMessageTone("warning");
    } finally {
      setIsImporting(false);
    }
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!canSave) {
      setMessage(t("editor.loginToUpload"));
      setMessageTone("warning");
      event.target.value = "";
      return;
    }
    setMessage("");
    const reader = new FileReader();
    reader.onload = () => setCropRequest({ sourceUrl: String(reader.result || ""), mode: "profile" });
    reader.onerror = () => {
      setMessage(t("editor.readImageFailed"));
      setMessageTone("warning");
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function onRecropAvatar() {
    if (!portraitImageSrc) {
      setMessage(t("editor.noPortraitToCrop"));
      setMessageTone("warning");
      return;
    }
    setCropRequest({ sourceUrl: portraitImageSrc, mode: "avatar" });
  }

  async function onCropComplete(files: { portrait?: File; avatar?: File; logo?: File }) {
    setIsUploading(true);
    setMessage("");
    try {
      const payload = await timexApi.uploadProfileImages(files);
      const nextProfile = profileFromUser(payload.profile);
      setProfile(nextProfile);
      window.dispatchEvent(new Event("timex-profile-images-changed"));
      window.dispatchEvent(new Event("timex-inventory-changed"));
      window.localStorage.setItem("timex-profile-images-version", String(Date.now()));
      setCropRequest(null);
      setMessage(files.portrait ? t("editor.imagesSaved") : t("editor.avatarSaved"));
      setMessageTone("success");
    } catch {
      setMessage(t("editor.imageFailed"));
      setMessageTone("warning");
    } finally {
      setIsUploading(false);
    }
  }

  if (isLoading) {
    return <StateBlock state="loading" title={t("profile.loading")} detail={t("editor.checkingSession")} />;
  }

  if (!isAuthenticated) {
    return (
      <div className="profileAuthRequired">
        <StateBlock state="disabled" title={t("auth.signInRequired")} detail={t("profile.signInDetail")} />
        <Link className="txButton txButton-primary txButton-md" href="/login?next=%2Fpersonal-center">
          {t("auth.signIn")}
        </Link>
        {message ? <InlineNotice tone={messageTone}>{message}</InlineNotice> : null}
      </div>
    );
  }

  return (
    <form className="profileEditor" onSubmit={onSubmit}>
      <div className="profilePreviewPanel">
        <div className="profilePortraitFrame">
          {portraitImageSrc ? <ChromaKeyPortrait src={portraitImageSrc} alt={`${normalizedProfile.displayName} portrait`} /> : null}
        </div>
        <div className="profileAvatarFrame">
          <span>{t("editor.avatar")}</span>
          {avatarImageSrc ? <ChromaKeyPortrait src={avatarImageSrc} alt={`${normalizedProfile.displayName} avatar`} /> : null}
        </div>
        <div className="profilePreviewCopy">
          <strong>{normalizedProfile.displayName}</strong>
          <span>{normalizedProfile.headline}</span>
          <p>{normalizedProfile.bio}</p>
        </div>
        <label className={isUploading ? "portraitInput isDisabled" : "portraitInput"}>
          <input accept="image/png,image/jpeg,image/webp,image/gif" type="file" onChange={onFileChange} />
          <span className="txButton txButton-secondary txButton-md" aria-disabled={isUploading}>
            <ImageUp size={15} />
            {isUploading ? t("editor.uploading") : t("editor.upload")}
          </span>
        </label>
        <button
          className="txButton txButton-secondary txButton-md"
          disabled={isUploading || !portraitImageSrc}
          type="button"
          onClick={onRecropAvatar}
        >
          {t("editor.recropAvatar")}
        </button>
      </div>

      <div className="profileFormGrid">
        <label>
          <span>{t("editor.displayName")}</span>
          <input value={profile.displayName} onChange={(event) => updateProfileField("displayName", event.target.value)} />
        </label>
        <label>
          <span>{tickerLocked ? t("editor.tickerLocked") : t("editor.ticker")}</span>
          <input
            disabled={tickerLocked}
            maxLength={12}
            placeholder="YOURTICKER"
            required
            value={profile.tickerSymbol}
            onChange={(event) => updateProfileField("tickerSymbol", normalizeTickerInput(event.target.value))}
          />
          <small>{tickerLocked ? t("editor.tickerLockedDetail") : t("editor.tickerHelp")}</small>
        </label>
        <label>
          <span>{t("editor.headline")}</span>
          <input value={profile.headline} onChange={(event) => updateProfileField("headline", event.target.value)} />
        </label>
        <label>
          <span>{t("editor.company")}</span>
          <input value={profile.organization} onChange={(event) => updateProfileField("organization", event.target.value)} />
        </label>
        <label>
          <span>{t("profile.expertise")}</span>
          <input value={expertiseText} onChange={(event) => setExpertiseText(event.target.value)} />
        </label>
        <label>
          <span>MBTI</span>
          <select required value={profile.mbti} onChange={(event) => updateProfileField("mbti", event.target.value)}>
            <option value="">{t("editor.mbtiUnset")}</option>
            {["INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP", "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP"].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("editor.agentBasePrice")}</span>
          <input
            min={0}
            step={1}
            type="number"
            value={centsToDollars(profile.agentBasePriceCents)}
            onChange={(event) => updateProfileField("agentBasePriceCents", dollarsToCents(event.target.value))}
          />
        </label>
        <label className="spanTwo">
          <span>{t("editor.personalIntro")}</span>
          <textarea required rows={4} value={profile.bio} onChange={(event) => updateProfileField("bio", event.target.value)} />
        </label>
        <label className="spanTwo">
          <span>{t("editor.bookableOffer")}</span>
          <input value={profile.offer} onChange={(event) => updateProfileField("offer", event.target.value)} />
        </label>
        <label className="spanTwo">
          <span>{t("editor.externalLinks")}</span>
          <textarea rows={4} value={linkRows} onChange={(event) => setLinkRows(event.target.value)} />
        </label>
        <div className="profileActionRow spanTwo">
          <span className={marketReady ? "profileMarketState isReady" : "profileMarketState"}>
            {marketReady ? t("editor.marketReady") : t("editor.marketNeeds")}
          </span>
          <button className="txButton txButton-secondary txButton-md" disabled={isImporting} type="button" onClick={onImportLinks}>
            <Sparkles size={15} />
            {isImporting ? t("editor.importing") : t("editor.importLinks")}
          </button>
          <button className="txButton txButton-primary txButton-md" disabled={isSaving} type="submit">
            <Save size={15} />
            {isSaving ? t("editor.saving") : t("editor.saveProfile")}
          </button>
        </div>
        {normalizedProfile.links.length ? (
          <div className="profileLinkPills spanTwo">
            {normalizedProfile.links.map((link) => (
              <span key={`${link.type}-${link.url}`}>
                <Link2 size={13} />
                {link.type}
              </span>
            ))}
          </div>
        ) : null}
        {message ? (
          <div className="spanTwo">
            <InlineNotice tone={messageTone}>{message}</InlineNotice>
          </div>
        ) : null}
      </div>
      {cropRequest ? (
        <ProfileImageCropper sourceUrl={cropRequest.sourceUrl} mode={cropRequest.mode} onCancel={() => setCropRequest(null)} onComplete={onCropComplete} />
      ) : null}
    </form>
  );
}
