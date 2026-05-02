"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { useI18n } from "../../components/i18n-provider";

type CropStage = "portrait" | "avatar";

type CropState = {
  x: number;
  y: number;
  zoom: number;
};

type CropResult = {
  portrait: File;
  avatar: File;
  logo: File;
};

type LoadedImage = {
  element: HTMLImageElement;
  width: number;
  height: number;
};

const PORTRAIT_SIZE = { width: 1000, height: 1600 };
const AVATAR_SIZE = { width: 512, height: 512 };
const LOGO_SIZE = { width: 256, height: 256 };

export function ProfileImageCropper({
  sourceUrl,
  mode = "profile",
  onCancel,
  onComplete
}: {
  sourceUrl: string;
  mode?: "profile" | "avatar";
  onCancel: () => void;
  onComplete: (result: Partial<CropResult> & { avatar: File; logo: File }) => void;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [stage, setStage] = useState<CropStage>(mode === "avatar" ? "avatar" : "portrait");
  const [portraitCrop, setPortraitCrop] = useState<CropState>({ x: 50, y: 50, zoom: 1 });
  const [avatarCrop, setAvatarCrop] = useState<CropState>({ x: 50, y: 28, zoom: 1.6 });
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const activeCrop = stage === "portrait" ? portraitCrop : avatarCrop;
  const setActiveCrop = stage === "portrait" ? setPortraitCrop : setAvatarCrop;
  const outputSize = stage === "portrait" ? PORTRAIT_SIZE : AVATAR_SIZE;
  const previewSize = stage === "portrait" ? { width: 250, height: 400 } : { width: 280, height: 280 };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStage(mode === "avatar" ? "avatar" : "portrait");
      setPortraitFile(null);
    }, 0);
    const nextImage = new Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => {
      setImage({ element: nextImage, width: nextImage.naturalWidth, height: nextImage.naturalHeight });
    };
    nextImage.src = sourceUrl;
    return () => window.clearTimeout(timer);
  }, [mode, sourceUrl]);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    drawCrop(canvasRef.current, image, activeCrop, previewSize.width, previewSize.height);
  }, [activeCrop, image, previewSize.height, previewSize.width, stage]);

  function updateCrop(patch: Partial<CropState>) {
    setActiveCrop((current) => ({ ...current, ...patch }));
  }

  function moveCrop(deltaX: number, deltaY: number) {
    setActiveCrop((current) => ({
      ...current,
      x: clamp(current.x - (deltaX / previewSize.width) * 100, 0, 100),
      y: clamp(current.y - (deltaY / previewSize.height) * 100, 0, 100)
    }));
  }

  function zoomCrop(delta: number) {
    setActiveCrop((current) => ({
      ...current,
      zoom: clamp(current.zoom + delta, 1, 3)
    }));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!image || isWorking) return;
    event.preventDefault();
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
    moveCrop(deltaX, deltaY);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    if (!image || isWorking) return;
    event.preventDefault();
    zoomCrop(event.deltaY > 0 ? -0.08 : 0.08);
  }

  async function confirmCrop() {
    if (!image || isWorking) return;
    setIsWorking(true);
    try {
      if (stage === "portrait") {
        const croppedPortrait = await cropToFile(image, portraitCrop, PORTRAIT_SIZE.width, PORTRAIT_SIZE.height, "portrait.png");
        setPortraitFile(croppedPortrait);
        setStage("avatar");
        return;
      }
      const avatar = await cropToFile(image, avatarCrop, AVATAR_SIZE.width, AVATAR_SIZE.height, "chat-avatar.png");
      const logo = await cropToFile(image, avatarCrop, LOGO_SIZE.width, LOGO_SIZE.height, "trade-logo.png");
      onComplete(
        mode === "avatar"
          ? { avatar, logo }
          : { portrait: portraitFile ?? (await cropToFile(image, portraitCrop, PORTRAIT_SIZE.width, PORTRAIT_SIZE.height, "portrait.png")), avatar, logo }
      );
    } finally {
      setIsWorking(false);
    }
  }

  function resetCrop() {
    setActiveCrop(stage === "portrait" ? { x: 50, y: 50, zoom: 1 } : { x: 50, y: 28, zoom: 1.6 });
  }

  return (
    <div className="cropModalOverlay" role="dialog" aria-modal="true">
      <div className="cropModal">
        <header className="cropModalHeader">
          <div>
            <strong>{stage === "portrait" ? t("crop.portraitTitle") : t("crop.avatarTitle")}</strong>
            <span>{stage === "portrait" ? t("crop.portraitDetail") : t("crop.avatarDetail")}</span>
          </div>
          <button className="cropIconButton" type="button" onClick={onCancel} aria-label={t("crop.close")}>
            <X size={18} />
          </button>
        </header>

        <div className="cropModalBody">
          <div
            className={stage === "portrait" ? "cropPreview cropPreviewPortrait" : "cropPreview cropPreviewSquare"}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            <canvas ref={canvasRef} width={previewSize.width} height={previewSize.height} />
          </div>

          <div className="cropControls">
            <label>
              <span>{t("crop.horizontal")}</span>
              <input type="range" min={0} max={100} value={activeCrop.x} onChange={(event) => updateCrop({ x: Number(event.target.value) })} />
            </label>
            <label>
              <span>{t("crop.vertical")}</span>
              <input type="range" min={0} max={100} value={activeCrop.y} onChange={(event) => updateCrop({ y: Number(event.target.value) })} />
            </label>
            <label>
              <span>{t("crop.zoom")}</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={activeCrop.zoom}
                onChange={(event) => updateCrop({ zoom: Number(event.target.value) })}
              />
            </label>
            <div className="cropFacts">
              <span>{stage === "portrait" ? t("crop.portraitOutput") : t("crop.avatarOutput")}</span>
              <span>{activeCrop.zoom.toFixed(2)}x</span>
            </div>
          </div>
        </div>

        <footer className="cropModalFooter">
          <button className="txButton txButton-secondary txButton-md" type="button" onClick={resetCrop}>
            <RotateCcw size={15} />
            {t("crop.reset")}
          </button>
          {stage === "avatar" && mode !== "avatar" ? (
            <button className="txButton txButton-secondary txButton-md" type="button" onClick={() => setStage("portrait")}>
              {t("crop.back")}
            </button>
          ) : null}
          <button className="txButton txButton-primary txButton-md" disabled={!image || isWorking} type="button" onClick={confirmCrop}>
            <Check size={15} />
            {isWorking ? t("crop.cropping") : stage === "portrait" ? t("crop.next") : t("crop.useImages")}
          </button>
        </footer>
      </div>
    </div>
  );
}

function drawCrop(canvas: HTMLCanvasElement, image: LoadedImage, crop: CropState, targetWidth: number, targetHeight: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const source = sourceRect(image, crop, targetWidth / targetHeight);
  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(image.element, source.x, source.y, source.width, source.height, 0, 0, targetWidth, targetHeight);
  removeGreenScreen(ctx, targetWidth, targetHeight);
}

function cropToFile(image: LoadedImage, crop: CropState, width: number, height: number, filename: string): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  drawCrop(canvas, image, crop, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not crop image"));
          return;
        }
        resolve(new File([blob], filename, { type: "image/png" }));
      },
      "image/png",
      0.92
    );
  });
}

function sourceRect(image: LoadedImage, crop: CropState, targetAspect: number) {
  const imageAspect = image.width / image.height;
  let width = image.width;
  let height = image.height;
  if (imageAspect > targetAspect) {
    height = image.height;
    width = height * targetAspect;
  } else {
    width = image.width;
    height = width / targetAspect;
  }

  width = Math.min(image.width, width / crop.zoom);
  height = Math.min(image.height, height / crop.zoom);

  const minX = width / 2;
  const maxX = image.width - width / 2;
  const minY = height / 2;
  const maxY = image.height - height / 2;
  const centerX = minX + ((maxX - minX) * crop.x) / 100;
  const centerY = minY + ((maxY - minY) * crop.y) / 100;

  return {
    x: clamp(centerX - width / 2, 0, image.width - width),
    y: clamp(centerY - height / 2, 0, image.height - height),
    width,
    height
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function removeGreenScreen(ctx: CanvasRenderingContext2D, width: number, height: number) {
  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch {
    return;
  }
  const { data } = imageData;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const greenDominance = green - Math.max(red, blue);
    if (green > 74 && greenDominance > 24 && green > red * 1.16 && green > blue * 1.16) {
      const edgeAlpha = clamp((greenDominance - 24) / 58, 0, 1);
      data[index + 3] = Math.round(data[index + 3] * (1 - edgeAlpha));
    }
  }
  ctx.putImageData(imageData, 0, 0);
}
