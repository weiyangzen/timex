"use client";

import { ImageUp } from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import { API_BASE, timexApi } from "../../lib/api";
import type { TimeXUser } from "../../lib/types";
import { useI18n } from "../../components/i18n-provider";
import { InlineNotice, StateBlock } from "../../components/ui";

type RawUser = Partial<TimeXUser> & {
  display_name?: string;
  avatar_url?: string;
  balance_cents?: number;
  created_at?: string;
};

function normalizeUser(value: RawUser | null | undefined): TimeXUser | null {
  if (!value?.id || !value.email) return null;
  return {
    id: value.id,
    loginName: value.loginName ?? value.displayName ?? value.display_name ?? value.email.split("@")[0],
    email: value.email,
    displayName: value.displayName ?? value.display_name ?? value.email.split("@")[0],
    avatarUrl: value.avatarUrl ?? value.avatar_url,
    balanceCents: value.balanceCents ?? value.balance_cents ?? 0,
    createdAt: value.createdAt ?? value.created_at ?? new Date().toISOString()
  };
}

function portraitSrc(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/avatar/")) return value;
  if (value.startsWith("/")) return `${API_BASE}${value}`;
  return value;
}

export function PortraitUploader() {
  const { t } = useI18n();
  const [user, setUser] = useState<TimeXUser | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    let active = true;
    timexApi
      .me()
      .then((payload) => {
        if (!active) return;
        setUser(normalizeUser(payload.user as RawUser | null | undefined));
      })
      .catch(() => {
        if (active) setMessage(t("editor.apiUnavailable"));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [t]);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setMessage("");

    try {
      const payload = await timexApi.uploadPortrait(file);
      setUser(normalizeUser(payload.profile as RawUser));
      setMessage(t("editor.imagesSaved"));
    } catch {
      setMessage(t("editor.loginToUpload"));
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  if (isLoading) {
    return <StateBlock state="loading" title={t("profile.loading")} detail={t("editor.checkingSession")} />;
  }

  if (!user) {
    return (
      <div className="portraitUploader">
        <StateBlock state="disabled" title={t("inventory.signInRequired")} detail={t("editor.loginToUpload")} />
        {message ? <InlineNotice tone="warning">{message}</InlineNotice> : null}
      </div>
    );
  }

  return (
    <div className="portraitUploader">
      <div className="portraitPreview">
        {portraitSrc(user.avatarUrl) ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- Uploaded portraits are local backend files, not static Next assets. */}
            <img src={portraitSrc(user.avatarUrl)} alt={`${user.displayName} portrait`} />
          </>
        ) : (
          <span className="portraitEmpty" aria-label={`${user.displayName} portrait not uploaded`} />
        )}
        <div>
          <strong>{user.displayName}</strong>
          <span>{user.loginName}</span>
        </div>
      </div>
      <label className={isUploading ? "portraitInput isDisabled" : "portraitInput"}>
        <input accept="image/png,image/jpeg,image/webp,image/gif" type="file" onChange={onFileChange} />
        <span className="txButton txButton-secondary txButton-md" aria-disabled={isUploading}>
          <ImageUp size={15} />
          {isUploading ? t("editor.uploading") : t("editor.upload")}
        </span>
      </label>
      {message ? <InlineNotice tone="success">{message}</InlineNotice> : null}
    </div>
  );
}
