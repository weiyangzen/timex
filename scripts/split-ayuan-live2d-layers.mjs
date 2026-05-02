import fs from "node:fs/promises";
import path from "node:path";
import sharp from "../frontend/node_modules/sharp/lib/index.js";

const ROOT = path.resolve("assets/live2d/generated/see-through-nf4-r1024/AYuan");
const SOURCE_DIR = path.join(ROOT, "AYuan");
const OUTPUT_DIR = path.join(ROOT, "AYuan_split_layers");
const PUBLIC_OUTPUT_DIR = path.resolve("frontend/public/live2d/generated/see-through-nf4-r1024/AYuan/AYuan_split_layers");
const SPLIT_LAYERS = ["legwear", "footwear"];
const SPLIT_X = 500;
const FEATHER = 18;
const LEG_LOWER_FADE_START = 570;
const LEG_LOWER_FADE_END = 680;
const HIP_ANCHOR_FADE_START = 600;
const HIP_ANCHOR_FADE_END = 710;

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.mkdir(PUBLIC_OUTPUT_DIR, { recursive: true });

const manifest = {
  source: path.relative(process.cwd(), SOURCE_DIR),
  output: path.relative(process.cwd(), OUTPUT_DIR),
  note: "Non-destructive helper layers for Cubism reimport. Original PSD/MOC are not modified.",
  splitX: SPLIT_X,
  feather: FEATHER,
  layers: {}
};

for (const layer of SPLIT_LAYERS) {
  const sourcePath = path.join(SOURCE_DIR, `${layer}.png`);
  const image = sharp(sourcePath).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const left = Buffer.from(data);
  const right = Buffer.from(data);
  const leftLower = Buffer.from(data);
  const rightLower = Buffer.from(data);
  const hipAnchor = Buffer.from(data);
  const stats = {
    bbox: [Infinity, Infinity, -Infinity, -Infinity],
    leftPixels: 0,
    rightPixels: 0,
    leftLowerPixels: 0,
    rightLowerPixels: 0,
    hipAnchorPixels: 0
  };

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const alpha = data[offset + 3];
      if (alpha > 8) {
        stats.bbox[0] = Math.min(stats.bbox[0], x);
        stats.bbox[1] = Math.min(stats.bbox[1], y);
        stats.bbox[2] = Math.max(stats.bbox[2], x + 1);
        stats.bbox[3] = Math.max(stats.bbox[3], y + 1);
      }

      const leftWeight = clamp((SPLIT_X + FEATHER - x) / (FEATHER * 2), 0, 1);
      const rightWeight = 1 - leftWeight;
      const lowerWeight =
        layer === "legwear" ? smoothstep(LEG_LOWER_FADE_START, LEG_LOWER_FADE_END, y) : 1;
      const hipWeight =
        layer === "legwear" ? 1 - smoothstep(HIP_ANCHOR_FADE_START, HIP_ANCHOR_FADE_END, y) : 0;
      left[offset + 3] = Math.round(alpha * leftWeight);
      right[offset + 3] = Math.round(alpha * rightWeight);
      leftLower[offset + 3] = Math.round(alpha * leftWeight * lowerWeight);
      rightLower[offset + 3] = Math.round(alpha * rightWeight * lowerWeight);
      hipAnchor[offset + 3] = Math.round(alpha * hipWeight);

      if (left[offset + 3] > 8) stats.leftPixels += 1;
      if (right[offset + 3] > 8) stats.rightPixels += 1;
      if (leftLower[offset + 3] > 8) stats.leftLowerPixels += 1;
      if (rightLower[offset + 3] > 8) stats.rightLowerPixels += 1;
      if (hipAnchor[offset + 3] > 8) stats.hipAnchorPixels += 1;
    }
  }

  if (!Number.isFinite(stats.bbox[0])) {
    stats.bbox = [0, 0, 0, 0];
  }

  const outputs = [
    { side: "left", buffer: left },
    { side: "right", buffer: right }
  ];

  if (layer === "legwear") {
    outputs.push(
      { side: "left_lower", buffer: leftLower },
      { side: "right_lower", buffer: rightLower },
      { side: "hip_anchor", buffer: hipAnchor }
    );
  }

  for (const output of outputs) {
    const fileName = `${layer}_${output.side}.png`;
    const encoded = await sharp(output.buffer, {
      raw: {
        width: info.width,
        height: info.height,
        channels: info.channels
      }
    })
      .png()
      .toBuffer();
    await fs.writeFile(path.join(OUTPUT_DIR, fileName), encoded);
    await fs.writeFile(path.join(PUBLIC_OUTPUT_DIR, fileName), encoded);
  }

  manifest.layers[layer] = {
    source: `AYuan/${layer}.png`,
    left: `AYuan_split_layers/${layer}_left.png`,
    right: `AYuan_split_layers/${layer}_right.png`,
    leftLower: layer === "legwear" ? `AYuan_split_layers/${layer}_left_lower.png` : undefined,
    rightLower: layer === "legwear" ? `AYuan_split_layers/${layer}_right_lower.png` : undefined,
    hipAnchor: layer === "legwear" ? `AYuan_split_layers/${layer}_hip_anchor.png` : undefined,
    bbox: stats.bbox,
    leftPixels: stats.leftPixels,
    rightPixels: stats.rightPixels,
    leftLowerPixels: stats.leftLowerPixels,
    rightLowerPixels: stats.rightLowerPixels,
    hipAnchorPixels: stats.hipAnchorPixels
  };
}

const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
await fs.writeFile(path.join(OUTPUT_DIR, "manifest.json"), manifestText);
await fs.writeFile(path.join(PUBLIC_OUTPUT_DIR, "manifest.json"), manifestText);
console.log(JSON.stringify(manifest, null, 2));

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(start, end, value) {
  if (start === end) return value >= end ? 1 : 0;
  const t = clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
}
