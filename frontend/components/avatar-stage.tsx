"use client";

import { useMemo, useState } from "react";
import { ChromaKeyPortrait } from "./chroma-key-portrait";
import styles from "./avatar-stage.module.css";

export type AvatarStageState = "idle" | "blink" | "thinking" | "greeting" | "speaking" | "focus";

type AvatarStageProps = {
  src?: string;
  alt: string;
  state?: AvatarStageState;
  size?: "compact" | "full";
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
};

export function AvatarStage({
  src,
  alt,
  state = "idle",
  size = "full",
  interactive = false,
  onClick,
  className = ""
}: AvatarStageProps) {
  const [tapFocus, setTapFocus] = useState(false);
  const stageState = tapFocus ? "greeting" : state;
  const classNames = useMemo(
    () =>
      [
        styles.stage,
        styles[size],
        styles[stageState],
        interactive ? styles.interactive : "",
        className
      ]
        .filter(Boolean)
        .join(" "),
    [className, interactive, size, stageState]
  );

  return (
    <button
      className={classNames}
      type="button"
      aria-label={alt}
      disabled={!interactive}
      onClick={() => {
        if (!interactive) return;
        setTapFocus(true);
        onClick?.();
        window.setTimeout(() => setTapFocus(false), 900);
      }}
      onPointerLeave={(event) => {
        event.currentTarget.style.setProperty("--avatar-look-x", "0");
        event.currentTarget.style.setProperty("--avatar-look-y", "0");
      }}
      onPointerMove={(event) => {
        if (!interactive) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
        event.currentTarget.style.setProperty("--avatar-look-x", x.toFixed(2));
        event.currentTarget.style.setProperty("--avatar-look-y", y.toFixed(2));
      }}
    >
      <span className={styles.pulse} aria-hidden="true" />
      <span key={src ?? "empty"} className={styles.figure}>
        <ChromaKeyPortrait src={src} alt={alt} className={styles.portrait} />
      </span>
      <span className={styles.eyes} aria-hidden="true">
        <i />
        <i />
      </span>
      <span className={styles.statusDot} aria-hidden="true" />
    </button>
  );
}
