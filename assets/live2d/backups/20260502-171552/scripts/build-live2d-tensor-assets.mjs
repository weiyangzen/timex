import fs from "node:fs/promises";
import path from "node:path";
import sharp from "../frontend/node_modules/sharp/lib/index.js";

const ROOT = path.resolve("assets/live2d/generated/see-through-nf4-r1024");
const PUBLIC_ROOT = path.resolve("frontend/public/live2d/generated/see-through-nf4-r1024");
const CHARACTERS = ["AYuan", "Weiyang"];
const TENSOR_SIZE = 256;
const ALPHA_THRESHOLD = 8;

const LAYER_ORDER = [
  "back hair",
  "tail",
  "wings",
  "objects",
  "footwear",
  "legwear",
  "bottomwear",
  "topwear",
  "neck",
  "neckwear",
  "handwear",
  "head",
  "face",
  "ears",
  "earwear",
  "nose",
  "eyewhite",
  "irides",
  "eyelash",
  "eyebrow",
  "mouth",
  "eyewear",
  "headwear",
  "front hair"
];

const MOTION_LIMITS = {
  hair: { maxOffsetNorm: 0.024, pinStrength: 0.22, seamBlend: 0.12 },
  head: { maxOffsetNorm: 0.018, pinStrength: 0.42, seamBlend: 0.22 },
  face: { maxOffsetNorm: 0.012, pinStrength: 0.62, seamBlend: 0.34 },
  facial: { maxOffsetNorm: 0.01, pinStrength: 0.7, seamBlend: 0.38 },
  neck: { maxOffsetNorm: 0.006, pinStrength: 0.92, seamBlend: 0.86 },
  torso: { maxOffsetNorm: 0.012, pinStrength: 0.76, seamBlend: 0.74 },
  hand: { maxOffsetNorm: 0.014, pinStrength: 0.62, seamBlend: 0.58 },
  hip: { maxOffsetNorm: 0.009, pinStrength: 0.88, seamBlend: 0.82 },
  leg: { maxOffsetNorm: 0.011, pinStrength: 0.84, seamBlend: 0.78 },
  foot: { maxOffsetNorm: 0.008, pinStrength: 0.9, seamBlend: 0.9 },
  prop: { maxOffsetNorm: 0.01, pinStrength: 0.82, seamBlend: 0.74 }
};

for (const character of CHARACTERS) {
  await buildCharacterTensor(character);
}

async function buildCharacterTensor(character) {
  const characterRoot = path.join(ROOT, character);
  const sourceDir = path.join(characterRoot, character);
  const publicCharacterRoot = path.join(PUBLIC_ROOT, character);
  const outputDir = path.join(characterRoot, `${character}_tensor`);
  const publicOutputDir = path.join(publicCharacterRoot, `${character}_tensor`);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(publicOutputDir, { recursive: true });

  const srcPath = path.join(sourceDir, "src_img.png");
  const srcMeta = await sharp(srcPath).metadata();
  const width = srcMeta.width ?? 1024;
  const height = srcMeta.height ?? 1024;
  const parts = await readParts(sourceDir);
  const layers = [];

  for (const part of parts) {
    const filePath = path.join(sourceDir, `${part}.png`);
    if (!(await exists(filePath))) continue;

    const alpha = await loadAlpha(filePath);
    const depthFilePath = path.join(sourceDir, `${part}_depth.png`);
    const depth = (await exists(depthFilePath)) ? await loadGray(depthFilePath) : null;
    const tensorAlpha = await loadAlpha(filePath, TENSOR_SIZE, TENSOR_SIZE);
    const tensorDepth = depth ? await loadGray(depthFilePath, TENSOR_SIZE, TENSOR_SIZE) : null;
    const bbox = alphaBounds(alpha.data, alpha.info.width, alpha.info.height);
    const tensorBbox = alphaBounds(tensorAlpha.data, tensorAlpha.info.width, tensorAlpha.info.height);
    const role = roleForLayer(part);
    const sideHint = sideForLayer(part, bbox, width);
    const layer = {
      id: part,
      role,
      sideHint,
      order: LAYER_ORDER.indexOf(part) >= 0 ? LAYER_ORDER.indexOf(part) : LAYER_ORDER.length,
      source: `${character}/${part}.png`,
      depthPath: depth ? `${character}/${part}_depth.png` : null,
      bbox,
      tensorBbox,
      center: centerForBbox(bbox, width, height),
      coverage: coverageForAlpha(alpha.data),
      meanDepth: depth ? meanDepthForMask(depth.data, alpha.data) : null,
      motion: MOTION_LIMITS[role] ?? MOTION_LIMITS.prop,
      alpha,
      depth,
      tensorAlpha,
      tensorDepth
    };
    layers.push(layer);
  }

  layers.sort((a, b) => a.order - b.order);

  const maps = buildMaps(layers);
  const skeleton = buildSkeleton(character, layers, width, height);
  const constraints = buildConstraints(layers, width, height);
  const splitManifest = await readJsonIfExists(path.join(characterRoot, `${character}_split_layers`, "manifest.json"));

  const manifest = {
    version: 1,
    character,
    sourceSize: { width, height },
    tensorSize: { width: TENSOR_SIZE, height: TENSOR_SIZE },
    source: path.relative(process.cwd(), sourceDir),
    output: path.relative(process.cwd(), outputDir),
    publicBaseUrl: `/live2d/generated/see-through-nf4-r1024/${character}/${character}_tensor`,
    maps: {
      control: `${character}_tensor/control_map.png`,
      alpha: `${character}_tensor/alpha_map.png`,
      depth: `${character}_tensor/depth_map.png`,
      pin: `${character}_tensor/pin_map.png`
    },
    drawOrder: layers.map((layer) => layer.id),
    layers: Object.fromEntries(
      layers.map((layer) => [
        layer.id,
        {
          role: layer.role,
          sideHint: layer.sideHint,
          source: layer.source,
          depth: layer.depthPath,
          bbox: layer.bbox,
          tensorBbox: layer.tensorBbox,
          center: layer.center,
          coverage: round(layer.coverage),
          meanDepth: layer.meanDepth == null ? null : round(layer.meanDepth),
          motion: layer.motion
        }
      ])
    ),
    skeleton,
    constraints,
    splitLayers: splitManifest
      ? {
          manifest: `${character}_split_layers/manifest.json`,
          layers: splitManifest.layers
        }
      : null,
    runtimePolicy: {
      note: "Use this as a deformation-control tensor, not as a replacement for a Cubism rig.",
      preventGhosting: true,
      singleRenderSource: true,
      maxGlobalOffsetNorm: 0.018,
      enforceContactPins: true,
      preferPinnedSeams: ["neck_topwear", "topwear_legwear", "legwear_footwear"]
    }
  };

  await writePngBoth(maps.control, "control_map.png", outputDir, publicOutputDir);
  await writePngBoth(maps.alpha, "alpha_map.png", outputDir, publicOutputDir);
  await writePngBoth(maps.depth, "depth_map.png", outputDir, publicOutputDir);
  await writePngBoth(maps.pin, "pin_map.png", outputDir, publicOutputDir);

  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  await fs.writeFile(path.join(outputDir, "tensor-manifest.json"), manifestText);
  await fs.writeFile(path.join(publicOutputDir, "tensor-manifest.json"), manifestText);

  console.log(`${character}: wrote ${path.relative(process.cwd(), outputDir)}/tensor-manifest.json`);
}

async function readParts(sourceDir) {
  const info = await readJsonIfExists(path.join(sourceDir, "info.json"));
  if (info?.parts && typeof info.parts === "object") return Object.keys(info.parts);

  const files = await fs.readdir(sourceDir);
  return files
    .filter((file) => file.endsWith(".png") && !file.endsWith("_depth.png") && !["src_img.png", "src_head.png", "reconstruction.png"].includes(file))
    .map((file) => file.replace(/\.png$/, ""));
}

async function loadAlpha(filePath, width, height) {
  let image = sharp(filePath).ensureAlpha();
  if (width && height) {
    image = image.resize(width, height, { fit: "fill", kernel: "lanczos3" });
  }
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const alpha = Buffer.alloc(info.width * info.height);
  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = data[index * info.channels + 3];
  }
  return { data: alpha, info: { width: info.width, height: info.height } };
}

async function loadGray(filePath, width, height) {
  let image = sharp(filePath).removeAlpha().greyscale();
  if (width && height) {
    image = image.resize(width, height, { fit: "fill", kernel: "lanczos3" });
  }
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  return { data, info: { width: info.width, height: info.height } };
}

function buildMaps(layers) {
  const pixelCount = TENSOR_SIZE * TENSOR_SIZE;
  const control = Buffer.alloc(pixelCount * 4);
  const alpha = Buffer.alloc(pixelCount * 4);
  const depth = Buffer.alloc(pixelCount * 4);
  const pin = Buffer.alloc(pixelCount * 4);

  const alphaAccum = new Float32Array(pixelCount);
  const depthAccum = new Float32Array(pixelCount);
  const depthWeight = new Float32Array(pixelCount);

  for (const layer of layers) {
    const role = layer.role;
    for (let index = 0; index < pixelCount; index += 1) {
      const a = layer.tensorAlpha.data[index] / 255;
      if (a <= 0.03) continue;

      alphaAccum[index] = Math.max(alphaAccum[index], a);

      if (layer.tensorDepth) {
        depthAccum[index] += layer.tensorDepth.data[index] * a;
        depthWeight[index] += a;
      }

      const offset = index * 4;
      const x = index % TENSOR_SIZE;
      const leftWeight = clamp((TENSOR_SIZE * 0.54 - x) / (TENSOR_SIZE * 0.16), 0, 1);
      const rightWeight = 1 - leftWeight;
      const anchorWeight = anchorWeightForRole(role);
      const limbWeight = limbWeightForRole(role);
      const pinWeight = pinWeightForRole(role);

      control[offset] = Math.max(control[offset], Math.round(255 * a * limbWeight * leftWeight));
      control[offset + 1] = Math.max(control[offset + 1], Math.round(255 * a * limbWeight * rightWeight));
      control[offset + 2] = Math.max(control[offset + 2], Math.round(255 * a * anchorWeight));
      control[offset + 3] = Math.max(control[offset + 3], Math.round(255 * a));

      pin[offset] = Math.max(pin[offset], Math.round(255 * a * pinWeight));
      pin[offset + 1] = Math.max(pin[offset + 1], Math.round(255 * a * (role === "neck" ? 1 : 0)));
      pin[offset + 2] = Math.max(pin[offset + 2], Math.round(255 * a * (role === "hip" || role === "leg" || role === "foot" ? 1 : 0)));
      pin[offset + 3] = Math.max(pin[offset + 3], Math.round(255 * a));
    }
  }

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const a = Math.round(alphaAccum[index] * 255);
    alpha[offset] = a;
    alpha[offset + 1] = a;
    alpha[offset + 2] = a;
    alpha[offset + 3] = a;

    const d = depthWeight[index] > 0 ? Math.round(depthAccum[index] / depthWeight[index]) : 0;
    depth[offset] = d;
    depth[offset + 1] = d;
    depth[offset + 2] = d;
    depth[offset + 3] = a;
  }

  return {
    control: imageBuffer(control),
    alpha: imageBuffer(alpha),
    depth: imageBuffer(depth),
    pin: imageBuffer(pin)
  };
}

function buildSkeleton(character, layers, width, height) {
  const leg = layerByRole(layers, "leg") ?? layerByRole(layers, "hip");
  const foot = layerByRole(layers, "foot");
  const torso = layerByRole(layers, "torso");
  const neck = layerByRole(layers, "neck");
  const head = layerByRole(layers, "head") ?? layerByRole(layers, "face");

  const bodyCenterX = torso?.center.xPx ?? leg?.center.xPx ?? width / 2;
  const legBox = leg?.bbox ?? [width * 0.38, height * 0.46, width * 0.6, height * 0.92];
  const footBox = foot?.bbox ?? [width * 0.34, height * 0.75, width * 0.62, height * 0.98];
  const splitX = bodyCenterX;

  const joints = {
    head: point(head?.center.xPx ?? bodyCenterX, head?.center.yPx ?? height * 0.24, width, height),
    neckTop: point(neck?.center.xPx ?? bodyCenterX, neck?.bbox?.[1] ?? height * 0.36, width, height),
    neckBase: point(neck?.center.xPx ?? bodyCenterX, neck?.bbox?.[3] ?? height * 0.45, width, height),
    chest: point(torso?.center.xPx ?? bodyCenterX, torso?.bbox?.[1] ? torso.bbox[1] + (torso.bbox[3] - torso.bbox[1]) * 0.28 : height * 0.52, width, height),
    hip: point(bodyCenterX, legBox[1] + (legBox[3] - legBox[1]) * 0.12, width, height),
    leftKnee: point((legBox[0] + splitX) * 0.5, legBox[1] + (legBox[3] - legBox[1]) * 0.56, width, height),
    rightKnee: point((splitX + legBox[2]) * 0.5, legBox[1] + (legBox[3] - legBox[1]) * 0.56, width, height),
    leftAnkle: point((legBox[0] + splitX) * 0.5, legBox[1] + (legBox[3] - legBox[1]) * 0.9, width, height),
    rightAnkle: point((splitX + legBox[2]) * 0.5, legBox[1] + (legBox[3] - legBox[1]) * 0.9, width, height),
    leftFoot: point((footBox[0] + splitX) * 0.5, footBox[1] + (footBox[3] - footBox[1]) * 0.68, width, height),
    rightFoot: point((splitX + footBox[2]) * 0.5, footBox[1] + (footBox[3] - footBox[1]) * 0.68, width, height)
  };

  return {
    character,
    coordinateSpace: "source-normalized",
    splitX: round(splitX / width),
    joints,
    chains: {
      spine: ["hip", "chest", "neckBase", "neckTop", "head"],
      leftLeg: ["hip", "leftKnee", "leftAnkle", "leftFoot"],
      rightLeg: ["hip", "rightKnee", "rightAnkle", "rightFoot"]
    }
  };
}

function buildConstraints(layers, width, height) {
  const contactPairs = [
    ["head", "neck", "head_neck"],
    ["neck", "topwear", "neck_topwear"],
    ["topwear", "bottomwear", "topwear_bottomwear"],
    ["topwear", "legwear", "topwear_legwear"],
    ["bottomwear", "legwear", "bottomwear_legwear"],
    ["legwear", "footwear", "legwear_footwear"],
    ["handwear", "topwear", "handwear_topwear"]
  ];

  const contacts = [];
  for (const [aName, bName, id] of contactPairs) {
    const a = layers.find((layer) => layer.id === aName);
    const b = layers.find((layer) => layer.id === bName);
    if (!a || !b) continue;
    const contact = contactForLayers(a, b, width, height);
    if (contact.pixelCount <= 0) continue;
    contacts.push({
      id,
      type: "contactPin",
      layers: [aName, bName],
      center: contact.center,
      bbox: contact.bbox,
      pixelCount: contact.pixelCount,
      maxSeparationNorm: contactMaxSeparation(id),
      strength: contactStrength(id)
    });
  }

  return {
    contacts,
    depthOrder: layers.map((layer) => ({ layer: layer.id, order: layer.order, meanDepth: layer.meanDepth })),
    noGhosting: {
      policy: "single-source deformation only; never blend duplicate leg/foot overlay layers at runtime",
      alphaThreshold: ALPHA_THRESHOLD
    },
    noTearing: {
      maxGlobalOffsetNorm: 0.018,
      lockedRoles: ["neck", "torso", "hip", "foot"],
      contactPinIds: contacts.map((contact) => contact.id)
    }
  };
}

function contactForLayers(a, b, width, height) {
  const dataA = a.alpha.data;
  const dataB = b.alpha.data;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let sumX = 0;
  let sumY = 0;
  let pixelCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (dataA[index] <= ALPHA_THRESHOLD || dataB[index] <= ALPHA_THRESHOLD) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
      sumX += x;
      sumY += y;
      pixelCount += 1;
    }
  }

  if (!pixelCount) {
    return {
      pixelCount: 0,
      bbox: [0, 0, 0, 0],
      center: point(0, 0, width, height)
    };
  }

  return {
    pixelCount,
    bbox: [round(minX / width), round(minY / height), round(maxX / width), round(maxY / height)],
    center: point(sumX / pixelCount, sumY / pixelCount, width, height)
  };
}

function roleForLayer(name) {
  const value = name.toLowerCase();
  if (/hair|tail/.test(value)) return "hair";
  if (/head/.test(value) && !/wear/.test(value)) return "head";
  if (/face|ear|nose|eyewear|mouth|eye|brow|irides|lash|white/.test(value)) return "facial";
  if (/neck/.test(value)) return "neck";
  if (/topwear|body|cloth/.test(value)) return "torso";
  if (/hand|arm/.test(value)) return "hand";
  if (/bottomwear/.test(value)) return "hip";
  if (/leg/.test(value)) return "leg";
  if (/foot|shoe/.test(value)) return "foot";
  return "prop";
}

function sideForLayer(name, bbox, width) {
  const value = name.toLowerCase();
  if (/left|_l| l$/.test(value)) return "left";
  if (/right|_r| r$/.test(value)) return "right";
  const centerX = (bbox[0] + bbox[2]) / 2;
  if (bbox[2] <= width * 0.49) return "left";
  if (bbox[0] >= width * 0.51) return "right";
  if (/leg|foot|hand/.test(value)) return centerX < width / 2 ? "left-biased" : "right-biased";
  return "center";
}

function alphaBounds(alpha, width, height) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] <= ALPHA_THRESHOLD) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
    }
  }
  if (!Number.isFinite(minX)) return [0, 0, 0, 0];
  return [minX, minY, maxX, maxY];
}

function centerForBbox(bbox, width, height) {
  return point((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2, width, height);
}

function point(xPx, yPx, width, height) {
  return {
    x: round(xPx / width),
    y: round(yPx / height),
    xPx: Math.round(xPx),
    yPx: Math.round(yPx)
  };
}

function coverageForAlpha(alpha) {
  let pixels = 0;
  for (const value of alpha) {
    if (value > ALPHA_THRESHOLD) pixels += 1;
  }
  return pixels / alpha.length;
}

function meanDepthForMask(depth, alpha) {
  let total = 0;
  let weight = 0;
  for (let index = 0; index < alpha.length; index += 1) {
    const a = alpha[index] / 255;
    if (a <= 0.03) continue;
    total += depth[index] * a;
    weight += a;
  }
  return weight > 0 ? total / weight / 255 : null;
}

function imageBuffer(buffer) {
  return sharp(buffer, {
    raw: {
      width: TENSOR_SIZE,
      height: TENSOR_SIZE,
      channels: 4
    }
  }).png().toBuffer();
}

async function writePngBoth(bufferPromise, fileName, outputDir, publicOutputDir) {
  const buffer = await bufferPromise;
  await fs.writeFile(path.join(outputDir, fileName), buffer);
  await fs.writeFile(path.join(publicOutputDir, fileName), buffer);
}

function layerByRole(layers, role) {
  return layers.find((layer) => layer.role === role);
}

function anchorWeightForRole(role) {
  if (role === "neck" || role === "torso" || role === "hip") return 1;
  if (role === "head" || role === "facial") return 0.72;
  if (role === "foot") return 0.42;
  if (role === "leg") return 0.38;
  return 0.18;
}

function limbWeightForRole(role) {
  if (role === "leg" || role === "foot" || role === "hand") return 1;
  if (role === "hip") return 0.45;
  return 0.08;
}

function pinWeightForRole(role) {
  return MOTION_LIMITS[role]?.pinStrength ?? 0.5;
}

function contactMaxSeparation(id) {
  if (id === "neck_topwear" || id === "head_neck") return 0.004;
  if (id === "legwear_footwear") return 0.006;
  if (id.includes("legwear") || id.includes("bottomwear")) return 0.008;
  return 0.01;
}

function contactStrength(id) {
  if (id === "neck_topwear" || id === "head_neck") return 0.94;
  if (id === "legwear_footwear") return 0.9;
  if (id.includes("legwear") || id.includes("bottomwear")) return 0.84;
  return 0.72;
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}
