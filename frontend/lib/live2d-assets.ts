import { promises as fs } from "fs";
import path from "path";

type Live2DModelSettings = {
  FileReferences?: {
    Moc?: string;
    Textures?: string[];
    Physics?: string;
    Pose?: string;
    Expressions?: Array<string | { Name?: string; File?: string }>;
    Motions?: Record<string, Array<{ File?: string }>>;
  };
};

export type Live2DGeneratedAssetReport =
  | {
      status: "missing";
      root: "assets/live2d/generated";
      reason: string;
    }
  | {
      status: "invalid";
      root: "assets/live2d/generated";
      entrypoint?: string;
      issues: string[];
      warnings: string[];
    }
  | {
      status: "detected";
      root: "assets/live2d/generated";
      entrypoint: string;
      moc: string;
      publicModelUrl: string | null;
      browserVisible: boolean;
      counts: {
        textures: number;
        expressions: number;
        motions: number;
      };
      warnings: string[];
    };

const GENERATED_ROOT_LABEL = "assets/live2d/generated" as const;

export async function getGeneratedLive2DPackage(): Promise<Live2DGeneratedAssetReport> {
  const generatedRoot = await findGeneratedRoot();

  if (!generatedRoot) {
    return {
      status: "missing",
      root: GENERATED_ROOT_LABEL,
      reason: "No generated Live2D asset directory was found."
    };
  }

  const files = await listFiles(generatedRoot);
  const modelFiles = files
    .filter((file) => {
      const normalized = file.replaceAll(path.sep, "/").toLowerCase();
      return normalized.endsWith(".model3.json") || normalized.endsWith("/model3.json") || normalized === "model3.json";
    })
    .sort();

  if (modelFiles.length === 0) {
    return {
      status: "invalid",
      root: GENERATED_ROOT_LABEL,
      issues: ["No .model3.json entrypoint was found under assets/live2d/generated."],
      warnings: []
    };
  }

  const warnings = modelFiles.length > 1 ? [`Multiple model3 entrypoints found; using ${toPosix(modelFiles[0])}.`] : [];
  const entrypoint = modelFiles[0];
  const entrypointPath = path.join(generatedRoot, entrypoint);
  const issues: string[] = [];
  let settings: Live2DModelSettings;

  try {
    settings = JSON.parse(await fs.readFile(entrypointPath, "utf8")) as Live2DModelSettings;
  } catch (error) {
    return {
      status: "invalid",
      root: GENERATED_ROOT_LABEL,
      entrypoint: toPosix(entrypoint),
      issues: [`Failed to parse model3 JSON: ${error instanceof Error ? error.message : "unknown error"}.`],
      warnings
    };
  }

  const refs = settings.FileReferences;
  if (!refs) {
    issues.push("model3 JSON does not contain FileReferences.");
  }

  const moc = refs?.Moc;
  if (!moc) {
    issues.push("model3 JSON does not reference a .moc3 file.");
  }

  const resolvedMoc = moc ? resolveModelReference(generatedRoot, entrypoint, moc) : null;
  if (resolvedMoc) {
    const mocExists = await fileExists(resolvedMoc.absolutePath);
    if (!mocExists) {
      issues.push(`Referenced MOC file is missing: ${resolvedMoc.relativePath}.`);
    } else {
      const header = await readMocHeader(resolvedMoc.absolutePath);
      if (header !== "MOC3") {
        issues.push(`Referenced MOC file has invalid header "${header}".`);
      }
    }
  }

  const textures = Array.isArray(refs?.Textures) ? refs.Textures : [];
  const texturePaths: string[] = [];
  if (textures.length === 0) {
    warnings.push("model3 JSON does not list textures; browser rendering is unlikely to succeed.");
  }

  for (const texture of textures) {
    const resolvedTexture = resolveModelReference(generatedRoot, entrypoint, texture);
    texturePaths.push(resolvedTexture.relativePath);
    if (!(await fileExists(resolvedTexture.absolutePath))) {
      issues.push(`Referenced texture is missing: ${resolvedTexture.relativePath}.`);
    }
  }

  if (refs?.Physics) {
    const resolvedPhysics = resolveModelReference(generatedRoot, entrypoint, refs.Physics);
    if (!(await fileExists(resolvedPhysics.absolutePath))) {
      warnings.push(`Referenced physics file is missing: ${resolvedPhysics.relativePath}.`);
    }
  }

  if (refs?.Pose) {
    const resolvedPose = resolveModelReference(generatedRoot, entrypoint, refs.Pose);
    if (!(await fileExists(resolvedPose.absolutePath))) {
      warnings.push(`Referenced pose file is missing: ${resolvedPose.relativePath}.`);
    }
  }

  const expressions = Array.isArray(refs?.Expressions) ? refs.Expressions : [];
  for (const expression of expressions) {
    const expressionFile = typeof expression === "string" ? expression : expression.File;
    if (!expressionFile) continue;
    const resolvedExpression = resolveModelReference(generatedRoot, entrypoint, expressionFile);
    if (!(await fileExists(resolvedExpression.absolutePath))) {
      warnings.push(`Referenced expression file is missing: ${resolvedExpression.relativePath}.`);
    }
  }

  const motions = Object.values(refs?.Motions ?? {}).flat();
  for (const motion of motions) {
    if (!motion.File) continue;
    const resolvedMotion = resolveModelReference(generatedRoot, entrypoint, motion.File);
    if (!(await fileExists(resolvedMotion.absolutePath))) {
      warnings.push(`Referenced motion file is missing: ${resolvedMotion.relativePath}.`);
    }
  }

  if (issues.length > 0 || !resolvedMoc) {
    return {
      status: "invalid",
      root: GENERATED_ROOT_LABEL,
      entrypoint: toPosix(entrypoint),
      issues,
      warnings
    };
  }

  const publicModelUrl = `/live2d/generated/${toPosix(entrypoint)}`;
  const browserVisible = await isPublicMirrorComplete(entrypoint, resolvedMoc.relativePath, texturePaths);

  return {
    status: "detected",
    root: GENERATED_ROOT_LABEL,
    entrypoint: toPosix(entrypoint),
    moc: resolvedMoc.relativePath,
    publicModelUrl: browserVisible ? publicModelUrl : null,
    browserVisible,
    counts: {
      textures: textures.length,
      expressions: expressions.length,
      motions: motions.length
    },
    warnings
  };
}

async function findGeneratedRoot(): Promise<string | null> {
  const candidates = [
    path.join(/*turbopackIgnore: true*/ process.cwd(), "..", "assets", "live2d", "generated"),
    path.join(/*turbopackIgnore: true*/ process.cwd(), "assets", "live2d", "generated")
  ];

  for (const candidate of candidates) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isDirectory()) return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

async function listFiles(root: string, dir = ""): Promise<string[]> {
  const absoluteDir = path.join(root, dir);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listFiles(root, relativePath);
      if (entry.isFile()) return [relativePath];
      return [];
    })
  );

  return files.flat();
}

function resolveModelReference(root: string, modelFile: string, reference: string) {
  const modelDir = path.dirname(modelFile);
  const relativePath = path.normalize(path.join(modelDir, reference));

  return {
    absolutePath: path.join(root, relativePath),
    relativePath: toPosix(relativePath)
  };
}

async function readMocHeader(filePath: string): Promise<string> {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(4);
    await handle.read(buffer, 0, 4, 0);
    return buffer.toString("ascii");
  } finally {
    await handle.close();
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function isPublicMirrorComplete(modelFile: string, mocFile: string, textures: string[]): Promise<boolean> {
  const publicRoot = path.resolve(process.cwd(), "public", "live2d", "generated");
  const requiredFiles = [modelFile, mocFile, ...textures];
  const checks = await Promise.all(requiredFiles.map((file) => fileExists(path.join(publicRoot, file))));

  return checks.every(Boolean);
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}
