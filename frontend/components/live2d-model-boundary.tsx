"use client";

import { Pointer } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { Live2DGeneratedAssetReport } from "../lib/live2d-assets";
import { Live2DStage } from "./live2d-stage";
import { Badge } from "./ui";

type BoundaryBadge = {
  label: string;
  tone: "neutral" | "accent" | "success" | "warning" | "danger" | "mock";
  icon?: ReactNode;
};

type Live2DModelBoundaryProps = {
  assetReport: Live2DGeneratedAssetReport;
};

// AIRI's web path loads an existing model3/moc3 package with Pixi and then drives
// focus, blink, motion, and expression state. It does not generate moc3 from PNGs.
export function Live2DModelBoundary({ assetReport }: Live2DModelBoundaryProps) {
  const [tapReaction, setTapReaction] = useState(false);

  const status = getBoundaryStatus(assetReport);
  const className = [
    "avatarFallback",
    tapReaction ? "isReacting" : "",
    assetReport.status === "detected" ? "isLive2dDetected" : "",
    assetReport.status === "invalid" ? "isLive2dInvalid" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <Live2DStage
        modelUrl={assetReport.status === "detected" ? assetReport.publicModelUrl : null}
        fallbackSrc="/avatar/Weiyang.png"
        alt="Avatar tap reaction"
        size="compact"
        state={tapReaction ? "greeting" : "idle"}
        interactive
        onClick={() => {
          setTapReaction(true);
          window.setTimeout(() => setTapReaction(false), 900);
        }}
      />
      <div>
        <strong>{tapReaction ? "Agent state: focus" : status.title}</strong>
        <span>{status.detail}</span>
        <div className="avatarControls" aria-label="Avatar boundary signals">
          {status.badges.map((badge) => (
            <Badge key={badge.label} tone={badge.tone}>
              {badge.icon}
              {badge.label}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

function getBoundaryStatus(assetReport: Live2DGeneratedAssetReport): {
  title: string;
  detail: string;
  badges: BoundaryBadge[];
} {
  if (assetReport.status === "detected") {
    return {
      title: "Agent state: Live2D package detected",
      detail: `${assetReport.entrypoint} references ${assetReport.moc}. Stage0 keeps the cutout fallback until a Pixi loader is wired and render-verified.`,
      badges: [
        { label: "model3+moc3 detected", tone: "success" as const },
        { label: assetReport.browserVisible ? "browser-visible assets" : "not browser-visible", tone: assetReport.browserVisible ? ("success" as const) : ("warning" as const) },
        { label: "Live2D inactive", tone: "neutral" as const }
      ]
    };
  }

  if (assetReport.status === "invalid") {
    return {
      title: "Agent state: fallback",
      detail: `${assetReport.root} is present but not loadable: ${assetReport.issues[0] ?? "invalid Live2D package"}.`,
      badges: [
        { label: "package invalid", tone: "warning" as const },
        { label: "Live2D inactive", tone: "neutral" as const },
        { label: "tap reaction", tone: "neutral" as const }
      ]
    };
  }

  return {
    title: "Agent state: idle",
    detail: "Browser-contained cutout fallback with blink, gaze, and tap reaction. Live2D is not claimed active.",
    badges: [
      { label: "auto blink", tone: "success" as const },
      {
        label: "in-page gaze",
        tone: "accent" as const,
        icon: <Pointer size={12} />
      },
      { label: "tap reaction", tone: "neutral" as const }
    ]
  };
}
