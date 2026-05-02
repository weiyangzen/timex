import fs from "node:fs/promises";
import path from "node:path";
import sharp from "../frontend/node_modules/sharp/lib/index.js";

const CHARACTER = "AYuan";
const SOURCE = path.resolve("assets/live2d/source/AYuan.png");
const OUTPUT_DIR = path.resolve("assets/live2d/generated/see-through-nf4-r1024/AYuan/AYuan_static_action_grids");
const PUBLIC_OUTPUT_DIR = path.resolve("frontend/public/live2d/generated/see-through-nf4-r1024/AYuan/AYuan_static_action_grids");
const CELL = 512;
const GRID = 4;
const FRAME_COUNT = 16;
const GREEN = { r: 0, g: 255, b: 0, alpha: 1 };

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.mkdir(PUBLIC_OUTPUT_DIR, { recursive: true });

const source = await loadSourceCutout(SOURCE);
const motions = {
  blink: blinkFrames(),
  thinking: thinkingFrames(),
  greeting: greetingFrames()
};

const manifest = {
  version: 1,
  character: CHARACTER,
  source: path.relative(process.cwd(), SOURCE),
  output: path.relative(process.cwd(), OUTPUT_DIR),
  publicBaseUrl: `/live2d/generated/see-through-nf4-r1024/AYuan/AYuan_static_action_grids`,
  note: "Full static-source 16-grid action sheets. These are visual action references, not tensor debug previews.",
  grid: { columns: GRID, rows: GRID, cellSize: CELL },
  frames: FRAME_COUNT,
  motions: {}
};

for (const [motion, frames] of Object.entries(motions)) {
  const sheet = await buildSheet(source, frames, motion);
  const fileName = `${motion}.static-full-16grid.png`;
  await fs.writeFile(path.join(OUTPUT_DIR, fileName), sheet);
  await fs.writeFile(path.join(PUBLIC_OUTPUT_DIR, fileName), sheet);

  const frameData = frames.map((frame, index) => ({ index, ...frame }));
  const motionManifest = {
    version: 1,
    character: CHARACTER,
    motion,
    source: "assets/live2d/source/AYuan.png",
    sheet: fileName,
    grid: { columns: GRID, rows: GRID, cellSize: CELL },
    frames: frameData,
    constraints: {
      fullBodyVisible: true,
      sourceIsStaticFullImage: true,
      noPartDuplication: true,
      noLayerSplitPreview: true,
      greenBackground: "#00ff00"
    }
  };
  const motionManifestName = `${motion}.static-full-16grid.json`;
  const text = `${JSON.stringify(motionManifest, null, 2)}\n`;
  await fs.writeFile(path.join(OUTPUT_DIR, motionManifestName), text);
  await fs.writeFile(path.join(PUBLIC_OUTPUT_DIR, motionManifestName), text);

  manifest.motions[motion] = {
    sheet: `AYuan_static_action_grids/${fileName}`,
    manifest: `AYuan_static_action_grids/${motionManifestName}`
  };
}

const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
await fs.writeFile(path.join(OUTPUT_DIR, "static-action-grids.json"), manifestText);
await fs.writeFile(path.join(PUBLIC_OUTPUT_DIR, "static-action-grids.json"), manifestText);

console.log(`wrote ${path.relative(process.cwd(), OUTPUT_DIR)}`);

async function loadSourceCutout(filePath) {
  const image = sharp(filePath).rotate().ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const bbox = findForegroundBbox(data, info.width, info.height, info.channels);
  const padded = {
    left: Math.max(0, bbox.left - 22),
    top: Math.max(0, bbox.top - 18),
    width: Math.min(info.width - Math.max(0, bbox.left - 22), bbox.width + 44),
    height: Math.min(info.height - Math.max(0, bbox.top - 18), bbox.height + 36)
  };
  const crop = await sharp(filePath)
    .rotate()
    .ensureAlpha()
    .extract(padded)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = Buffer.from(crop.data);

  for (let y = 0; y < crop.info.height; y += 1) {
    for (let x = 0; x < crop.info.width; x += 1) {
      const offset = (y * crop.info.width + x) * crop.info.channels;
      const r = rgba[offset];
      const g = rgba[offset + 1];
      const b = rgba[offset + 2];
      const greenWeight = greenKeyWeight(r, g, b);
      const alpha = rgba[offset + 3] ?? 255;
      rgba[offset + 3] = Math.round(alpha * (1 - greenWeight));
      if (greenWeight > 0.2) {
        rgba[offset] = Math.round(r * (1 - greenWeight) + 255 * greenWeight);
        rgba[offset + 1] = Math.round(g * (1 - greenWeight) + 255 * greenWeight);
        rgba[offset + 2] = Math.round(b * (1 - greenWeight) + 255 * greenWeight);
      }
    }
  }

  const cutout = await sharp(rgba, {
    raw: {
      width: crop.info.width,
      height: crop.info.height,
      channels: crop.info.channels
    }
  })
    .png()
    .toBuffer();

  return {
    cutout,
    width: crop.info.width,
    height: crop.info.height,
    sourceSize: { width: info.width, height: info.height },
    bbox: padded
  };
}

async function buildSheet(source, frames, motion) {
  const cells = await Promise.all(frames.map((frame) => buildCell(source, frame, motion)));
  return sharp({
    create: {
      width: CELL * GRID,
      height: CELL * GRID,
      channels: 4,
      background: GREEN
    }
  })
    .composite(
      cells.map((input, index) => ({
        input,
        left: (index % GRID) * CELL,
        top: Math.floor(index / GRID) * CELL
      }))
    )
    .png()
    .toBuffer();
}

async function buildCell(source, frame, motion) {
  const baseHeight = 472;
  const fittedHeight = Math.round(baseHeight * frame.scale);
  const fittedWidth = Math.round((source.width / source.height) * fittedHeight);
  const rotated = await sharp(source.cutout)
    .resize(fittedWidth, fittedHeight, { fit: "fill", kernel: "lanczos3" })
    .rotate(frame.rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const meta = await sharp(rotated).metadata();
  const width = meta.width ?? fittedWidth;
  const height = meta.height ?? fittedHeight;
  const left = Math.round(CELL / 2 - width / 2 + frame.tx);
  const top = Math.round(CELL / 2 - height / 2 + frame.ty);
  const overlays = overlayForMotion(motion, frame, { left, top, width, height });

  return sharp({
    create: {
      width: CELL,
      height: CELL,
      channels: 4,
      background: GREEN
    }
  })
    .composite([{ input: rotated, left, top }, ...overlays])
    .png()
    .toBuffer();
}

function blinkFrames() {
  return Array.from({ length: FRAME_COUNT }, (_, index) => {
    const phase = (index / FRAME_COUNT) * Math.PI * 2;
    const hit = blinkHit(index);
    return {
      tx: round(Math.sin(phase) * 1.6),
      ty: round(hit * 3.2 + Math.sin(phase * 0.5) * 0.8),
      rotate: round(Math.sin(phase) * 0.35),
      scale: round(1 - hit * 0.008),
      blink: round(hit)
    };
  });
}

function thinkingFrames() {
  return Array.from({ length: FRAME_COUNT }, (_, index) => {
    const t = index / (FRAME_COUNT - 1);
    const enter = easeInOutSine(Math.min(1, index / 5));
    const breathe = Math.sin(t * Math.PI * 2);
    return {
      tx: round(-8 * enter + breathe * 1.8),
      ty: round(5 * enter + Math.sin(t * Math.PI * 3) * 1.2),
      rotate: round(-3.6 * enter + breathe * 0.45),
      scale: round(1 - enter * 0.004),
      blink: round(0.22 * enter)
    };
  });
}

function greetingFrames() {
  return Array.from({ length: FRAME_COUNT }, (_, index) => {
    const phase = (index / FRAME_COUNT) * Math.PI * 2;
    const wave = Math.sin(phase);
    const bounce = Math.abs(Math.sin(phase));
    return {
      tx: round(wave * 8),
      ty: round(-bounce * 7),
      rotate: round(wave * 2.8),
      scale: round(1 + bounce * 0.008),
      blink: round(Math.max(0, bounce - 0.65) * 0.7)
    };
  });
}

function overlayForMotion(motion, frame, rect) {
  const overlays = [];
  if (motion !== "blink" && frame.blink <= 0.08) return overlays;

  const faceX = rect.left + rect.width * 0.54;
  const faceY = rect.top + rect.height * 0.125;
  const blink = frame.blink;
  if (blink <= 0.08) return overlays;

  const svg = `
    <svg width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}" xmlns="http://www.w3.org/2000/svg">
      <g opacity="${Math.min(0.9, 0.35 + blink * 0.65)}" fill="none" stroke="#1538ff" stroke-width="${Math.max(2, 3.6 * blink)}" stroke-linecap="round">
        <path d="M ${faceX - rect.width * 0.045} ${faceY} Q ${faceX - rect.width * 0.012} ${faceY + 4 * blink} ${faceX + rect.width * 0.025} ${faceY}" />
        <path d="M ${faceX + rect.width * 0.05} ${faceY - 1} Q ${faceX + rect.width * 0.083} ${faceY + 3 * blink} ${faceX + rect.width * 0.118} ${faceY - 1}" />
      </g>
    </svg>
  `;
  overlays.push({ input: Buffer.from(svg), left: 0, top: 0 });
  return overlays;
}

function findForegroundBbox(data, width, height, channels) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      if (greenKeyWeight(r, g, b) > 0.72) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
    }
  }
  if (!Number.isFinite(minX)) {
    return { left: 0, top: 0, width, height };
  }
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

function greenKeyWeight(r, g, b) {
  const dominance = g - Math.max(r, b);
  if (g < 110 || dominance < 26) return 0;
  return clamp((dominance - 26) / 80, 0, 1);
}

function blinkHit(index) {
  const distance = Math.min(Math.abs(index - 5), Math.abs(index - 6), Math.abs(index - 12));
  return clamp(1 - distance / 2.4, 0, 1) ** 1.3;
}

function easeInOutSine(value) {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}
