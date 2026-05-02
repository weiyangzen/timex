"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ComponentProps } from "react";
import { timexApi } from "../lib/api";
import { withLang } from "../lib/i18n";
import { useI18n } from "./i18n-provider";
import { Button } from "./ui";

type ProtectedActionButtonProps = ComponentProps<typeof Button> & {
  action?: string;
  loginLabel?: string;
  nextPath?: string;
  onAuthenticated?: () => void | Promise<void>;
};

export function ProtectedActionButton({
  action = "protected-action",
  loginLabel,
  nextPath,
  onAuthenticated,
  disabled,
  children,
  ...buttonProps
}: ProtectedActionButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { lang, t } = useI18n();
  const [checking, setChecking] = useState(false);
  const [authState, setAuthState] = useState<"unknown" | "authenticated" | "anonymous">("unknown");

  useEffect(() => {
    let active = true;
    function loadAuthState() {
      timexApi
        .me()
        .then((state) => {
          if (active) setAuthState(state.authenticated ? "authenticated" : "anonymous");
        })
        .catch(() => {
          if (active) setAuthState("anonymous");
        });
    }
    loadAuthState();
    window.addEventListener("timex-auth-changed", loadAuthState);
    return () => {
      active = false;
      window.removeEventListener("timex-auth-changed", loadAuthState);
    };
  }, []);

  async function handleClick() {
    if (disabled || checking) return;
    setChecking(true);
    try {
      const state = await timexApi.me();
      if (state.authenticated) {
        await onAuthenticated?.();
        return;
      }
      const target = nextPath ?? `${pathname || withLang(lang, "/discover")}${window.location.search}`;
      router.push(withLang(lang, `/login?next=${encodeURIComponent(target)}&action=${encodeURIComponent(action)}`));
    } finally {
      setChecking(false);
    }
  }

  return (
    <Button {...buttonProps} disabled={disabled || checking} onClick={handleClick}>
      {checking ? t("auth.checking") : authState === "anonymous" && loginLabel ? loginLabel : children}
    </Button>
  );
}
