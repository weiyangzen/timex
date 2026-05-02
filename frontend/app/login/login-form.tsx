"use client";

import { Triangle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, timexApi } from "../../lib/api";
import { Button } from "../../components/ui";
import { useI18n } from "../../components/i18n-provider";
import { withLang } from "../../lib/i18n";

function internalNext(value: string | null, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang, t } = useI18n();
  const next = useMemo(() => internalNext(searchParams.get("next"), withLang(lang, "/discover")), [lang, searchParams]);
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    timexApi.me().then((state) => {
      if (active && state.authenticated) router.replace(next);
    });
    return () => {
      active = false;
    };
  }, [next, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = loginName.trim();
    if (!name || !password) {
      setMessage(t("login.required"));
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const result = await timexApi.registerOrLogin(name, password);
      window.dispatchEvent(new Event("timex-auth-changed"));
      setMessage(result.created ? t("login.registered") : t("login.signedIn"));
      router.replace(next);
    } catch (error) {
      const text =
        error instanceof ApiError && error.status === 401
          ? t("login.badPassword")
          : t("login.failed");
      setMessage(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="loginPage">
      <section className="loginPanel" aria-label={t("login.panel")}>
        <div className="loginMark">
          <Triangle size={22} />
        </div>
        <header>
          <h1>TimeX</h1>
        </header>
        <form className="authPanel loginForm" onSubmit={submit}>
          <label>
            <span>{t("login.name")}</span>
            <input
              autoComplete="username"
              maxLength={40}
              value={loginName}
              onChange={(event) => setLoginName(event.target.value)}
              placeholder={t("login.namePlaceholder")}
            />
          </label>
          <label>
            <span>{t("login.password")}</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("login.passwordPlaceholder")}
            />
          </label>
          <Button variant="primary" disabled={busy} type="submit">
            {busy ? t("auth.checking") : t("login.continue")}
          </Button>
        </form>
        {message ? <p className="loginMessage">{message}</p> : null}
      </section>
    </div>
  );
}
