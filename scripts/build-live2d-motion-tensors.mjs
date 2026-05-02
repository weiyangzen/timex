import fs from "node:fs/promises";
import path from "node:path";
import sharp from "../frontend/node_modules/sharp/lib/index.js";

const ROOT = path.resolve("assets/live2d/generated/see-through-nf4-r1024");
const PUBLIC_ROOT = path.resolve("frontend/public/live2d/generated/see-through-nf4-r1024");
const CHARACTERS = (process.env.LIVE2D_CHARACTERS ?? "AYuan")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const MOTIONS = ["blink", "thinking", "greeting"];
const SOURCE_SIZE = 1024;
const TENSOR_CELL_SIZE = 256;
const PREVIEW_CELL_SIZE = 512;
const FRAME_COUNT = 16;
const MAX_TENSOR_OFFSET = 96;
const ALPHA_THRESHOLD = 8;

for (const character of CHARACTERS) {
  await buildCharacterMotions(character);
}

async function buildCharacterMotions(character) {
  const characterRoot = path.join(ROOT, character);
  const sourceDir = path.join(characterRoot, character);
  const tensorDir = path.join(characterRoot, `${character}_tensor`);
  const publicTensorDir = path.join(PUBLIC_ROOT, character, `${character}_tensor`);
  const manifest = JSON.parse(await fs.readFile(path.join(tensorDir, "tensor-manifest.json"), "utf8"));
  const layers = await loadLayers(sourceDir, manifest);
  const outputRoot = path.join(characterRoot, `${character}_motion_tensors`);
  const publicOutputRoot = path.join(PUBLIC_ROOT, character, `${character}_motion_tensors`);

  await fs.mkdir(outputRoot, { recursive: true });
  await fs.mkdir(publicOutputRoot, { recursive: true });

  const index = {
    version: 1,
    character,
    sourceTensor: `${character}_tensor/tensor-manifest.json`,
    frameCount: FRAME_COUNT,
    grid: { columns: 4, rows: 4 },
    tensorCellSize: TENSOR_CELL_SIZE,
    previewCellSize: PREVIEW_CELL_SIZE,
    coordinateSpace: "source-pixels",
    encoding: {
      motionTensorPng: {
        red: `dx encoded as 128 + dx / ${MAX_TENSOR_OFFSET} * 127`,
        green: `dy encoded as 128 + dy / ${MAX_TENSOR_OFFSET} * 127`,
        blue: "role pin strength / seam lock, 0-255",
        alpha: "source part alpha mask"
      }
    },
    motions: {}
  };

  for (const motion of MOTIONS) {
    const motionFrames = buildMotionFrames(motion, manifest);
    const tensorSheet = await buildMotionTensorSheet(layers, motionFrames);
    const pinSheet = await buildMotionPinSheet(layers, motionFrames);
    const previewSheet = await buildPreviewSheet(layers, motionFrames);
    const motionManifest = {
      version: 1,
      character,
      motion,
      frameCount: FRAME_COUNT,
      loop: motion === "blink" ? false : true,
      tensor: `${motion}.motion-tensor.png`,
      pin: `${motion}.pin-tensor.png`,
      preview: `${motion}.preview-16grid.png`,
      policy: policyForMotion(motion),
      frames: motionFrames.map((frame) => ({
        index: frame.index,
        t: round(frame.t),
        phase: round(frame.phase),
        root: frame.root,
        groups: frame.groups
      }))
    };

    await writeBoth(tensorSheet, path.join(outputRoot, `${motion}.motion-tensor.png`), path.join(publicOutputRoot, `${motion}.motion-tensor.png`));
    await writeBoth(pinSheet, path.join(outputRoot, `${motion}.pin-tensor.png`), path.join(publicOutputRoot, `${motion}.pin-tensor.png`));
    await writeBoth(previewSheet, path.join(outputRoot, `${motion}.preview-16grid.png`), path.join(publicOutputRoot, `${motion}.preview-16grid.png`));

    const text = `${JSON.stringify(motionManifest, null, 2)}\n`;
    await fs.writeFile(path.join(outputRoot, `${motion}.motion-tensor.json`), text);
    await fs.writeFile(path.join(publicOutputRoot, `${motion}.motion-tensor.json`), text);

    index.motions[motion] = {
      manifest: `${character}_motion_tensors/${motion}.motion-tensor.json`,
      tensor: `${character}_motion_tensors/${motion}.motion-tensor.png`,
      pin: `${character}_motion_tensors/${motion}.pin-tensor.png`,
      preview: `${character}_motion_tensors/${motion}.preview-16grid.png`
    };
  }

  const indexText = `${JSON.stringify(index, null, 2)}\n`;
  await fs.writeFile(path.join(outputRoot, "motion-tensors.json"), indexText);
  await fs.writeFile(path.join(publicOutputRoot, "motion-tensors.json"), indexText);

  await fs.cp(outputRoot, publicOutputRoot, { recursive: true });
  console.log(`${character}: wrote ${path.relative(process.cwd(), outputRoot)}`);
  await fs.mkdir(publicTensorDir, { recursive: true });
}

async function loadLayers(sourceDir, manifest) {
  const layers = [];
  for (const layerId of manifest.drawOrder) {
    const info = manifest.layers[layerId];
    if (!info) continue;
    const sourcePath = path.join(sourceDir, `${layerId}.png`);
    if (!(await exists(sourcePath))) continue;
    const image = sharp(sourcePath).ensureAlpha();
    const { data, info: meta } = await image.raw().toBuffer({ resolveWithObject: true });
    const bbox = info.bbox ?? alphaBounds(data, meta.width, meta.height, meta.channels);
    const tensorAlpha = await loadTensorAlpha(sourcePath);
    layers.push({
      id: layerId,
      role: info.role,
      sideHint: info.sideHint,
      bbox,
      center: {
        x: (bbox[0] + bbox[2]) / 2,
        y: (bbox[1] + bbox[3]) / 2
      },
      motion: info.motion,
      buffer: await image.png().toBuffer(),
      tensorAlpha
    });
  }
  return layers;
}

async function loadTensorAlpha(sourcePath) {
  const image = sharp(sourcePath)
    .ensureAlpha()
    .resize(TENSOR_CELL_SIZE, TENSOR_CELL_SIZE, { fit: "fill", kernel: "lanczos3" });
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const alpha = Buffer.alloc(info.width * info.height);
  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = data[index * info.channels + 3];
  }
  return alpha;
}

function buildMotionFrames(motion, manifest) {
  return Array.from({ length: FRAME_COUNT }, (_, index) => {
    const t = index / FRAME_COUNT;
    const phase = t * Math.PI * 2;
    const root = rootTransformForMotion(motion, phase, index);
    const groups = groupTransformsForMotion(motion, phase, index, manifest);
    return { index, t, phase, root, groups };
  });
}

function rootTransformForMotion(motion, phase, index) {
  if (motion === "blink") {
    const hit = blinkHit(index);
    return {
      tx: round(Math.sin(phase) * 1.2),
      ty: round(hit * 2),
      rotate: round(Math.sin(phase) * 0.2),
      sx: 1,
      sy: round(1 - hit * 0.006)
    };
  }

  if (motion === "thinking") {
    const enter = easeInOutSine(Math.min(1, index / 5));
    const hold = Math.sin(phase * 0.7);
    return {
      tx: round(-10 * enter + hold * 1.6),
      ty: round(5 * enter + Math.sin(phase) * 1.1),
      rotate: round(-2.8 * enter + hold * 0.45),
      sx: round(1 - 0.006 * enter),
      sy: round(1 + 0.004 * enter)
    };
  }

  const wave = Math.sin(phase);
  const bounce = Math.abs(Math.sin(phase));
  return {
    tx: round(wave * 5.5),
    ty: round(-bounce * 5.5),
    rotate: round(wave * 1.6),
    sx: round(1 + bounce * 0.006),
    sy: round(1 - bounce * 0.004)
  };
}

function groupTransformsForMotion(motion, phase, index) {
  const hit = blinkHit(index);
  const wave = Math.sin(phase);
  const counter = Math.sin(phase + Math.PI);
  const bounce = Math.abs(Math.sin(phase));
  const enter = easeInOutSine(Math.min(1, index / 5));
  const settle = motion === "greeting" ? 0.7 + 0.3 * Math.cos(phase * 0.5) : 1;

  const groups = {
    hair: { tx: wave * 5, ty: -bounce * 1.2, rotate: wave * 1.7, sx: 1, sy: 1, pin: 0.22 },
    head: { tx: 0, ty: 0, rotate: 0, sx: 1, sy: 1, pin: 0.42 },
    facial: { tx: 0, ty: 0, rotate: 0, sx: 1, sy: 1, pin: 0.72 },
    neck: { tx: 0, ty: 0, rotate: 0, sx: 1, sy: 1, pin: 0.96 },
    torso: { tx: 0, ty: 0, rotate: 0, sx: 1, sy: 1, pin: 0.82 },
    hand: { tx: 0, ty: 0, rotate: 0, sx: 1, sy: 1, pin: 0.72 },
    hip: { tx: 0, ty: 0, rotate: 0, sx: 1, sy: 1, pin: 0.9 },
    leg: { tx: 0, ty: 0, rotate: 0, sx: 1, sy: 1, pin: 0.86 },
    foot: { tx: 0, ty: 0, rotate: 0, sx: 1, sy: 1, pin: 0.94 },
    prop: { tx: 0, ty: 0, rotate: 0, sx: 1, sy: 1, pin: 0.82 }
  };

  if (motion === "blink") {
    groups.head = { tx: 0, ty: hit * 1.8, rotate: Math.sin(phase) * 0.8, sx: 1, sy: 1 - hit * 0.01, pin: 0.45 };
    groups.facial = { tx: 0, ty: hit * 0.8, rotate: 0, sx: 1, sy: 1 - hit * 0.12, pin: 0.74 };
    groups.hair = { tx: Math.sin(phase) * 2.4, ty: hit * 1.2, rotate: Math.sin(phase) * 0.9, sx: 1, sy: 1, pin: 0.28 };
    return normalizeGroups(groups);
  }

  if (motion === "thinking") {
    groups.hair = { tx: -7 * enter + wave * 1.4, ty: 2 * enter, rotate: -2.4 * enter + wave * 0.5, sx: 1, sy: 1, pin: 0.3 };
    groups.head = { tx: -7 * enter + wave * 1.2, ty: 4.5 * enter, rotate: -5.5 * enter + wave * 0.6, sx: 1, sy: 1, pin: 0.52 };
    groups.facial = { tx: -7 * enter + wave * 1.1, ty: 4.5 * enter, rotate: -5.3 * enter + wave * 0.4, sx: 1, sy: 1, pin: 0.78 };
    groups.neck = { tx: -3 * enter, ty: 2.2 * enter, rotate: -1.4 * enter, sx: 1, sy: 1, pin: 0.98 };
    groups.torso = { tx: -4.5 * enter + wave * 0.8, ty: 2.2 * enter, rotate: -2.3 * enter + wave * 0.3, sx: 1, sy: 1, pin: 0.86 };
    groups.hand = { tx: -4.3 * enter, ty: 2.2 * enter, rotate: -1.7 * enter, sx: 1, sy: 1, pin: 0.8 };
    groups.hip = { tx: -2.5 * enter, ty: 1.2 * enter, rotate: -0.9 * enter, sx: 1, sy: 1, pin: 0.92 };
    groups.leg = { tx: -1.5 * enter + wave * 0.6, ty: 0.6 * enter, rotate: -0.4 * enter, sx: 1, sy: 1, pin: 0.9 };
    groups.foot = { tx: -1.2 * enter, ty: 0.2 * enter, rotate: -0.2 * enter, sx: 1, sy: 1, pin: 0.96 };
    return normalizeGroups(groups);
  }

  groups.hair = { tx: wave * 8.5 * settle, ty: -bounce * 1.2, rotate: wave * 3.6 * settle, sx: 1, sy: 1, pin: 0.28 };
  groups.head = { tx: wave * 4.8 * settle, ty: -bounce * 3.2, rotate: wave * 3.2 * settle, sx: 1, sy: 1, pin: 0.48 };
  groups.facial = { tx: wave * 4.8 * settle, ty: -bounce * 3.2, rotate: wave * 3.2 * settle, sx: 1, sy: 1, pin: 0.76 };
  groups.neck = { tx: wave * 1.8, ty: -bounce * 1.4, rotate: wave * 0.7, sx: 1, sy: 1, pin: 0.98 };
  groups.torso = { tx: wave * 3.6, ty: -bounce * 3.6, rotate: wave * 1.8, sx: 1 + bounce * 0.004, sy: 1 - bounce * 0.003, pin: 0.86 };
  groups.hand = { tx: wave * 3.2, ty: -bounce * 3.2, rotate: wave * 1.4, sx: 1, sy: 1, pin: 0.8 };
  groups.hip = { tx: counter * 2.2, ty: -bounce * 1.5, rotate: counter * 0.7, sx: 1, sy: 1, pin: 0.93 };
  groups.leg = { tx: counter * 1.8, ty: -bounce * 0.7, rotate: counter * 0.5, sx: 1, sy: 1, pin: 0.91 };
  groups.foot = { tx: counter * 1.4, ty: 0, rotate: counter * 0.25, sx: 1, sy: 1, pin: 0.97 };
  return normalizeGroups(groups);
}

function normalizeGroups(groups) {
  return Object.fromEntries(
    Object.entries(groups).map(([key, value]) => [
      key,
      {
        tx: round(value.tx),
        ty: round(value.ty),
        rotate: round(value.rotate),
        sx: round(value.sx),
        sy: round(value.sy),
        pin: round(value.pin)
      }
    ])
  );
}

async function buildMotionTensorSheet(layers, frames) {
  const gridSize = TENSOR_CELL_SIZE * 4;
  const sheet = Buffer.alloc(gridSize * gridSize * 4);

  for (const frame of frames) {
    const cellX = (frame.index % 4) * TENSOR_CELL_SIZE;
    const cellY = Math.floor(frame.index / 4) * TENSOR_CELL_SIZE;
    for (const layer of layers) {
      const transform = transformForLayer(layer, frame);
      const center = tensorCenter(layer);
      for (let y = 0; y < TENSOR_CELL_SIZE; y += 1) {
        for (let x = 0; x < TENSOR_CELL_SIZE; x += 1) {
          const alpha = layer.tensorAlpha[y * TENSOR_CELL_SIZE + x];
          if (alpha <= ALPHA_THRESHOLD) continue;
          const displacement = displacementAt(transform, x, y, center.x, center.y, 0.25);
          const outX = cellX + x;
          const outY = cellY + y;
          const offset = (outY * gridSize + outX) * 4;
          const existingAlpha = sheet[offset + 3];
          if (alpha < existingAlpha) continue;
          sheet[offset] = encodeOffset(displacement.dx);
          sheet[offset + 1] = encodeOffset(displacement.dy);
          sheet[offset + 2] = Math.round((transform.pin ?? layer.motion?.pinStrength ?? 0.5) * 255);
          sheet[offset + 3] = alpha;
        }
      }
    }
  }

  return sharp(sheet, { raw: { width: gridSize, height: gridSize, channels: 4 } }).png().toBuffer();
}

async function buildMotionPinSheet(layers, frames) {
  const gridSize = TENSOR_CELL_SIZE * 4;
  const sheet = Buffer.alloc(gridSize * gridSize * 4);

  for (const frame of frames) {
    const cellX = (frame.index % 4) * TENSOR_CELL_SIZE;
    const cellY = Math.floor(frame.index / 4) * TENSOR_CELL_SIZE;
    for (const layer of layers) {
      const transform = transformForLayer(layer, frame);
      const pin = Math.round((transform.pin ?? layer.motion?.pinStrength ?? 0.5) * 255);
      const seam = seamLockForRole(layer.role);
      for (let y = 0; y < TENSOR_CELL_SIZE; y += 1) {
        for (let x = 0; x < TENSOR_CELL_SIZE; x += 1) {
          const alpha = layer.tensorAlpha[y * TENSOR_CELL_SIZE + x];
          if (alpha <= ALPHA_THRESHOLD) continue;
          const outX = cellX + x;
          const outY = cellY + y;
          const offset = (outY * gridSize + outX) * 4;
          if (alpha < sheet[offset + 3]) continue;
          sheet[offset] = pin;
          sheet[offset + 1] = seam;
          sheet[offset + 2] = roleColor(layer.role);
          sheet[offset + 3] = alpha;
        }
      }
    }
  }

  return sharp(sheet, { raw: { width: gridSize, height: gridSize, channels: 4 } }).png().toBuffer();
}

async function buildPreviewSheet(layers, frames) {
  const cellPromises = frames.map((frame) => renderPreviewFrame(layers, frame));
  const cells = await Promise.all(cellPromises);
  const sheet = sharp({
    create: {
      width: PREVIEW_CELL_SIZE * 4,
      height: PREVIEW_CELL_SIZE * 4,
      channels: 4,
      background: { r: 0, g: 255, b: 0, alpha: 1 }
    }
  });
  return sheet
    .composite(
      cells.map((input, index) => ({
        input,
        left: (index % 4) * PREVIEW_CELL_SIZE,
        top: Math.floor(index / 4) * PREVIEW_CELL_SIZE
      }))
    )
    .png()
    .toBuffer();
}

async function renderPreviewFrame(layers, frame) {
  const composites = [];
  for (const layer of layers) {
    const transform = transformForLayer(layer, frame);
    const transformed = await transformLayerComposite(layer, transform);
    if (transformed) composites.push(await fitCompositeToSource(transformed));
  }
  await assertCompositesFit(composites, `frame ${frame.index}`);
  return sharp({
    create: {
      width: SOURCE_SIZE,
      height: SOURCE_SIZE,
      channels: 4,
      background: { r: 0, g: 255, b: 0, alpha: 1 }
    }
  })
    .composite(composites)
    .resize(PREVIEW_CELL_SIZE, PREVIEW_CELL_SIZE, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();
}

async function assertCompositesFit(composites, label) {
  for (const composite of composites) {
    const meta = await sharp(composite.input).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (
      !Number.isFinite(composite.left) ||
      !Number.isFinite(composite.top) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width > SOURCE_SIZE ||
      height > SOURCE_SIZE ||
      composite.left < 0 ||
      composite.top < 0 ||
      composite.left + width > SOURCE_SIZE ||
      composite.top + height > SOURCE_SIZE
    ) {
      console.warn("Invalid preview composite", { label, left: composite.left, top: composite.top, width, height });
    }
  }
}

async function fitCompositeToSource(composite) {
  const meta = await sharp(composite.input).metadata();
  const width = meta.width ?? SOURCE_SIZE;
  const height = meta.height ?? SOURCE_SIZE;
  const left = Math.max(0, Math.min(SOURCE_SIZE - 1, composite.left));
  const top = Math.max(0, Math.min(SOURCE_SIZE - 1, composite.top));
  const maxWidth = Math.max(1, SOURCE_SIZE - left);
  const maxHeight = Math.max(1, SOURCE_SIZE - top);
  if (width <= maxWidth && height <= maxHeight) {
    return { input: composite.input, left, top };
  }
  const cropped = await sharp(composite.input)
    .extract({
      left: 0,
      top: 0,
      width: Math.min(width, maxWidth),
      height: Math.min(height, maxHeight)
    })
    .png()
    .toBuffer();
  return { input: cropped, left, top };
}

async function transformLayerComposite(layer, transform) {
  const [minX, minY, maxX, maxY] = layer.bbox;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  if (width <= 1 || height <= 1) return null;

  const scaledWidth = Math.max(1, Math.round(width * transform.sx));
  const scaledHeight = Math.max(1, Math.round(height * transform.sy));
  let input = await sharp(layer.buffer)
    .extract({ left: minX, top: minY, width, height })
    .resize(scaledWidth, scaledHeight, { fit: "fill", kernel: "lanczos3" })
    .rotate(transform.rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  let meta = await sharp(input).metadata();
  if ((meta.width ?? 0) > SOURCE_SIZE || (meta.height ?? 0) > SOURCE_SIZE) {
    input = await sharp(input)
      .resize({
        width: SOURCE_SIZE,
        height: SOURCE_SIZE,
        fit: "inside",
        withoutEnlargement: true,
        kernel: "lanczos3"
      })
      .png()
      .toBuffer();
    meta = await sharp(input).metadata();
  }
  if ((meta.width ?? 0) > SOURCE_SIZE || (meta.height ?? 0) > SOURCE_SIZE) {
    const cropWidth = Math.min(SOURCE_SIZE, meta.width ?? SOURCE_SIZE);
    const cropHeight = Math.min(SOURCE_SIZE, meta.height ?? SOURCE_SIZE);
    input = await sharp(input)
      .extract({
        left: Math.max(0, Math.floor(((meta.width ?? cropWidth) - cropWidth) / 2)),
        top: Math.max(0, Math.floor(((meta.height ?? cropHeight) - cropHeight) / 2)),
        width: cropWidth,
        height: cropHeight
      })
      .png()
      .toBuffer();
    meta = await sharp(input).metadata();
  }
  const outputWidth = meta.width ?? scaledWidth;
  const outputHeight = meta.height ?? scaledHeight;
  const targetCenterX = layer.center.x + transform.tx;
  const targetCenterY = layer.center.y + transform.ty;
  const left = Math.round(clamp(targetCenterX - outputWidth / 2, 0, Math.max(0, SOURCE_SIZE - outputWidth)));
  const top = Math.round(clamp(targetCenterY - outputHeight / 2, 0, Math.max(0, SOURCE_SIZE - outputHeight)));

  return { input, left, top };
}

function transformForLayer(layer, frame) {
  const group = frame.groups[layer.role] ?? frame.groups.prop;
  const root = frame.root;
  const maxOffsetNorm = layer.motion?.maxOffsetNorm ?? 0.012;
  const maxPx = Math.min(MAX_TENSOR_OFFSET * 0.72, maxOffsetNorm * SOURCE_SIZE * 1.65);
  return {
    tx: clamp(root.tx + group.tx, -maxPx, maxPx),
    ty: clamp(root.ty + group.ty, -maxPx, maxPx),
    rotate: clamp(root.rotate + group.rotate, -6, 6),
    sx: clamp(root.sx * group.sx, 0.94, 1.06),
    sy: clamp(root.sy * group.sy, 0.88, 1.08),
    pin: Math.max(group.pin ?? 0.5, layer.motion?.pinStrength ?? 0.5)
  };
}

function displacementAt(transform, x, y, cx, cy, tensorToSourceScale) {
  const sourceX = x / tensorToSourceScale;
  const sourceY = y / tensorToSourceScale;
  const sourceCx = cx / tensorToSourceScale;
  const sourceCy = cy / tensorToSourceScale;
  const angle = degreesToRadians(transform.rotate);
  const dx = sourceX - sourceCx;
  const dy = sourceY - sourceCy;
  const nextX = sourceCx + (dx * Math.cos(angle) - dy * Math.sin(angle)) * transform.sx + transform.tx;
  const nextY = sourceCy + (dx * Math.sin(angle) + dy * Math.cos(angle)) * transform.sy + transform.ty;
  return {
    dx: nextX - sourceX,
    dy: nextY - sourceY
  };
}

function tensorCenter(layer) {
  return {
    x: (layer.center.x / SOURCE_SIZE) * TENSOR_CELL_SIZE,
    y: (layer.center.y / SOURCE_SIZE) * TENSOR_CELL_SIZE
  };
}

function policyForMotion(motion) {
  const shared = {
    noDuplicateOverlay: true,
    noGhosting: true,
    keepFeetAttached: true,
    keepNeckAttached: true,
    singleSourcePartsOnly: true
  };
  if (motion === "blink") {
    return {
      ...shared,
      primaryRoles: ["facial", "head", "hair"],
      lockedRoles: ["neck", "torso", "hip", "leg", "foot"],
      maxFrameOffsetPx: 14
    };
  }
  if (motion === "thinking") {
    return {
      ...shared,
      primaryRoles: ["head", "facial", "neck", "torso"],
      lockedRoles: ["hip", "leg", "foot"],
      maxFrameOffsetPx: 18
    };
  }
  return {
    ...shared,
    primaryRoles: ["head", "facial", "hair", "torso", "hip"],
    lockedRoles: ["neck", "foot"],
    maxFrameOffsetPx: 20
  };
}

function blinkHit(index) {
  const centers = [5, 6];
  const distance = Math.min(...centers.map((center) => Math.abs(index - center)));
  return clamp(1 - distance / 3, 0, 1) ** 1.6;
}

function alphaBounds(data, width, height, channels) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * channels + 3];
      if (alpha <= ALPHA_THRESHOLD) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
    }
  }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : [0, 0, 0, 0];
}

function encodeOffset(value) {
  return Math.round(clamp(128 + (value / MAX_TENSOR_OFFSET) * 127, 0, 255));
}

function seamLockForRole(role) {
  if (role === "neck") return 255;
  if (role === "torso" || role === "hip" || role === "foot") return 226;
  if (role === "leg") return 210;
  if (role === "hand") return 180;
  if (role === "facial") return 170;
  return 130;
}

function roleColor(role) {
  const values = {
    hair: 30,
    head: 58,
    facial: 84,
    neck: 112,
    torso: 140,
    hand: 168,
    hip: 190,
    leg: 214,
    foot: 238,
    prop: 255
  };
  return values[role] ?? values.prop;
}

async function writeBoth(buffer, filePath, publicFilePath) {
  await fs.writeFile(filePath, buffer);
  await fs.writeFile(publicFilePath, buffer);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function easeInOutSine(value) {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}
