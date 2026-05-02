"use client";

import { useEffect, useRef, useState } from "react";

const MIN_GREEN = 82;
const HARD_GREEN = 120;
const CROP_GREEN = 118;
const EDGE_FEATHER_PASSES = 4;

function clamp(value: number, min = 0, max = 255): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function pureGreen(red: number, green: number, blue: number): boolean {
  return green >= CROP_GREEN && green - red >= 54 && green - blue >= 44;
}

function keyedAlpha(red: number, green: number, blue: number): number {
  const greenDominance = green - Math.max(red, blue);
  const chroma = green - (red * 0.54 + blue * 0.46);
  if (green >= HARD_GREEN && greenDominance >= 86) return 0;
  if (green >= MIN_GREEN && chroma > 18 && greenDominance > 18) {
    const cut = smoothstep(16, 92, chroma) * smoothstep(14, 82, greenDominance) * smoothstep(64, 154, green);
    return clamp(Math.round(255 * (1 - cut)));
  }
  return 255;
}

function greenBorderCrop(pixels: Uint8ClampedArray, width: number, height: number) {
  const centerX0 = Math.floor(width * 0.1);
  const centerX1 = Math.ceil(width * 0.9);
  const centerY0 = Math.floor(height * 0.1);
  const centerY1 = Math.ceil(height * 0.9);

  const rowIsGreen = (y: number) => {
    for (let x = centerX0; x < centerX1; x += 1) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] > 10 && !pureGreen(pixels[i], pixels[i + 1], pixels[i + 2])) return false;
    }
    return true;
  };

  const colIsGreen = (x: number, top: number, bottom: number) => {
    const y0 = Math.max(top, centerY0);
    const y1 = Math.min(bottom, centerY1);
    for (let y = y0; y < y1; y += 1) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] > 10 && !pureGreen(pixels[i], pixels[i + 1], pixels[i + 2])) return false;
    }
    return true;
  };

  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;
  const maxCropY = Math.floor(height * 0.16);
  const maxCropX = Math.floor(width * 0.16);

  while (top < bottom && top < maxCropY && rowIsGreen(top)) top += 1;
  while (bottom > top && height - 1 - bottom < maxCropY && rowIsGreen(bottom)) bottom -= 1;
  while (left < right && left < maxCropX && colIsGreen(left, top, bottom + 1)) left += 1;
  while (right > left && width - 1 - right < maxCropX && colIsGreen(right, top, bottom + 1)) right -= 1;

  return {
    sx: left,
    sy: top,
    sw: Math.max(1, right - left + 1),
    sh: Math.max(1, bottom - top + 1)
  };
}

function featherAlpha(pixels: Uint8ClampedArray, width: number, height: number) {
  for (let pass = 0; pass < EDGE_FEATHER_PASSES; pass += 1) {
    const source = new Uint8ClampedArray(pixels);
    for (let y = 2; y < height - 2; y += 1) {
      for (let x = 2; x < width - 2; x += 1) {
        const i = (y * width + x) * 4;
        const alpha = source[i + 3];
        if (alpha === 0) continue;
        let minAlpha = 255;
        let maxAlpha = 0;
        let sum = alpha * 4;
        let count = 4;
        for (let oy = -2; oy <= 2; oy += 1) {
          for (let ox = -2; ox <= 2; ox += 1) {
            if (ox === 0 && oy === 0) continue;
            const ni = ((y + oy) * width + x + ox) * 4;
            const neighborAlpha = source[ni + 3];
            minAlpha = Math.min(minAlpha, neighborAlpha);
            maxAlpha = Math.max(maxAlpha, neighborAlpha);
            const weight = Math.abs(ox) + Math.abs(oy) <= 1 ? 2 : 1;
            sum += neighborAlpha * weight;
            count += weight;
          }
        }
        if (alpha < 252 || minAlpha < 170 || maxAlpha - minAlpha > 80) {
          const averaged = Math.round(sum / count);
          pixels[i + 3] = clamp(Math.round(alpha * 0.42 + averaged * 0.58));
        }
      }
    }
  }
}

function despillGreenEdges(pixels: Uint8ClampedArray) {
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha >= 252) continue;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const neutralGreen = Math.round(red * 0.54 + blue * 0.46);
    const edgeMix = 1 - alpha / 255;
    pixels[index + 1] = Math.round(green * (1 - edgeMix) + Math.min(green, neutralGreen + 8) * edgeMix);
  }
}

export function ChromaKeyPortrait({
  src,
  alt,
  className = ""
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !src) {
      setIsReady(false);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = sourceWidth;
      sourceCanvas.height = sourceHeight;
      const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
      if (!sourceContext) return;
      sourceContext.drawImage(image, 0, 0, sourceWidth, sourceHeight);
      const sourceData = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight);
      const crop = greenBorderCrop(sourceData.data, sourceWidth, sourceHeight);

      canvas.width = crop.sw;
      canvas.height = crop.sh;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.clearRect(0, 0, crop.sw, crop.sh);
      context.drawImage(sourceCanvas, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);
      const imageData = context.getImageData(0, 0, crop.sw, crop.sh);
      const pixels = imageData.data;

      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = keyedAlpha(pixels[index], pixels[index + 1], pixels[index + 2]);
        pixels[index + 3] = Math.min(pixels[index + 3], alpha);
        if (pixels[index + 3] < 252) {
          pixels[index + 1] = Math.min(pixels[index + 1], Math.round((pixels[index] + pixels[index + 2]) * 0.62));
        }
      }
      featherAlpha(pixels, crop.sw, crop.sh);
      despillGreenEdges(pixels);

      context.putImageData(imageData, 0, 0);
      setIsReady(true);
    };
    image.onerror = () => {
      if (!cancelled) setIsReady(false);
    };
    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!src) {
    return <div className={`${className} chromaPortrait isEmpty`} aria-label={`${alt} portrait not uploaded`} />;
  }

  return (
    <canvas
      ref={canvasRef}
      className={`${className} chromaPortrait${isReady ? " isReady" : ""}`}
      role="img"
      aria-label={alt}
    />
  );
}
