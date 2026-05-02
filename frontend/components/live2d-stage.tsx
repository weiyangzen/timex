"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { AvatarStage, type AvatarStageState } from "./avatar-stage";
import styles from "./live2d-stage.module.css";

export type Live2DStageState = "idle" | "blink" | "thinking" | "greeting";

type PixiModule = typeof import("pixi.js");
type Live2DModule = typeof import("pixi-live2d-display/cubism4");
type PixiApplication = InstanceType<PixiModule["Application"]>;
type Live2DModelInstance = Awaited<ReturnType<Live2DModule["Live2DModel"]["from"]>>;

type Core6DrawableState = {
  count?: number;
  drawOrders?: Int32Array | number[];
  renderOrders?: Int32Array | number[];
  opacities?: Float32Array;
};

type Core6NativeModel = {
  drawables?: Core6DrawableState;
  getRenderOrders?: () => Int32Array | number[] | undefined;
  renderOrders?: Int32Array | number[];
  drawOrders?: Int32Array | number[];
};

type CubismCoreModelBridge = {
  getModel?: () => Core6NativeModel | undefined;
  getDrawableRenderOrders?: () => Int32Array | number[] | undefined;
  getDrawableCount?: () => number;
  getDrawableId?: (drawableIndex: number) => string;
  getDrawableIds?: () => string[];
  getDrawableVertices?: (drawableIndex: number) => Float32Array | number[];
  addParameterValueById?: (parameterId: string, value: number, weight?: number) => void;
  setParameterValueById?: (parameterId: string, value: number, weight?: number) => void;
  update?: () => void;
  __timexRuntimeDeformInstalled?: boolean;
  __timexOriginalUpdate?: () => void;
  __timexBaseDrawableVertices?: Map<number, Float32Array>;
  _model?: Core6NativeModel;
};

type Live2DModelWithBridge = Live2DModelInstance & {
  __timexBaseTransform?: {
    x: number;
    y: number;
    scale: number;
  };
  internalModel?: {
    coreModel?: CubismCoreModelBridge;
    settings?: {
      url?: string;
    };
  };
};

type Live2DStageProps = {
  modelUrl?: string | null;
  modelUrls?: Array<string | null | undefined>;
  fallbackSrc?: string;
  alt: string;
  state?: Live2DStageState;
  motionKey?: number;
  size?: "compact" | "full";
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
};

const CUBISM_CORE_SCRIPT_ID = "timex-live2d-cubism-core";
const CUBISM_CORE_SRCS = [
  "/live2dcubismcore.min.js",
  "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js"
];

const AYUAN_WALK_PROFILE = {
  stride: 0.92,
  stepLift: 0.68,
  bodySway: 0.58,
  bodyBounce: 0.36,
  shoulderCounter: 0.7,
  footLead: 0.24
};

const GOOGLE_POSE_LANDMARK = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftFootIndex: 31,
  rightFootIndex: 32
} as const;

let cubismCorePromise: Promise<void> | null = null;

declare global {
  interface Window {
    Live2DCubismCore?: unknown;
    PIXI?: PixiModule;
  }
}

export function Live2DStage({
  modelUrl,
  modelUrls,
  fallbackSrc,
  alt,
  state = "idle",
  motionKey = 0,
  size = "full",
  interactive = false,
  onClick,
  className = ""
}: Live2DStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modelRef = useRef<Live2DModelInstance | null>(null);
  const motionPriorityRef = useRef<Live2DModule["MotionPriority"] | null>(null);
  const stateRef = useRef(state);
  const runtimePoseRef = useRef({ state, motionKey, startedAt: 0 });
  const [phase, setPhase] = useState<"fallback" | "loading" | "ready">("fallback");
  const modelUrlsKey = (modelUrls ?? []).filter(Boolean).join("\n");

  const resolvedModelUrls = useMemo(() => {
    const urls = [modelUrl, ...modelUrlsKey.split("\n")].filter((value): value is string => Boolean(value));
    return Array.from(new Set(urls));
  }, [modelUrl, modelUrlsKey]);

  const fallbackState: AvatarStageState = state === "greeting" ? "greeting" : state;
  const classNames = [
    styles.stage,
    phase === "ready" ? styles.ready : "",
    phase === "loading" ? styles.loading : "",
    interactive ? styles.interactive : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || resolvedModelUrls.length === 0) {
      setPhase("fallback");
      return;
    }
    const stageElement = container;
    const canvasElement = canvas;

    let cancelled = false;
    let app: PixiApplication | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let tickerCallback: ((deltaTime: number) => void) | null = null;

    async function mountLive2D() {
      setPhase("loading");

      try {
        await ensureCubismCore();
        if (cancelled) return;

        const [PIXI, live2d] = await Promise.all([
          import("pixi.js"),
          import("pixi-live2d-display/cubism4")
        ]);
        window.PIXI = PIXI;
        PIXI.settings.SPRITE_MAX_TEXTURES = Math.max(1, PIXI.settings.SPRITE_MAX_TEXTURES || 1);
        motionPriorityRef.current = live2d.MotionPriority;

        const bounds = stageElement.getBoundingClientRect();
        const webglContext = createPatchedWebGLContext(canvasElement);
        app = new PIXI.Application({
          view: canvasElement,
          context: webglContext as never,
          width: Math.max(1, Math.round(bounds.width)),
          height: Math.max(1, Math.round(bounds.height)),
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          preserveDrawingBuffer: true,
          resolution: Math.min(4, Math.max(window.devicePixelRatio || 1, 2.75))
        });

        const model = await loadFirstModel(live2d, resolvedModelUrls);
        if (cancelled) {
          model.destroy();
          return;
        }

        patchCubismCore6RenderOrders(model);
        installRuntimeDrawableDeformer(model, () => runtimePoseRef.current);
        modelRef.current = model;
        app.stage.addChild(model);
        fitModelToContainer(model, app, stageElement);
        runtimePoseRef.current = { state: stateRef.current, motionKey: 0, startedAt: performance.now() };

        tickerCallback = () => {
          applyRuntimePose(model, runtimePoseRef.current, performance.now());
        };
        app.ticker.add(tickerCallback);

        resizeObserver = new ResizeObserver(() => {
          if (!app || !modelRef.current) return;
          const nextBounds = stageElement.getBoundingClientRect();
          app.renderer.resize(Math.max(1, Math.round(nextBounds.width)), Math.max(1, Math.round(nextBounds.height)));
          fitModelToContainer(modelRef.current, app, stageElement);
        });
        resizeObserver.observe(stageElement);

        await playModelState(model, stateRef.current, motionPriorityRef.current);
        await waitForVisibleCanvasFrame(canvasElement, app);
        if (!cancelled) setPhase("ready");
      } catch (error) {
        console.warn("Live2DStage fallback", {
          urls: resolvedModelUrls,
          error,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        if (!cancelled) setPhase("fallback");
      }
    }

    void mountLive2D();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (app && tickerCallback) {
        app.ticker.remove(tickerCallback);
      }
      modelRef.current = null;
      motionPriorityRef.current = null;
      app?.destroy(true, { children: true, texture: true, baseTexture: true });
    };
  }, [resolvedModelUrls]);

  useEffect(() => {
    stateRef.current = state;
    runtimePoseRef.current = { state, motionKey, startedAt: performance.now() };
    const model = modelRef.current;
    if (!model || phase !== "ready") return;
    void playModelState(model, state, motionPriorityRef.current);
  }, [motionKey, phase, state]);

  function handleClick() {
    onClick?.();
    const model = modelRef.current;
    if (!model) return;
    void playModelState(model, "greeting", motionPriorityRef.current);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const model = modelRef.current;
    if (!model || !interactive) return;
    const rect = event.currentTarget.getBoundingClientRect();
    model.focus(event.clientX - rect.left, event.clientY - rect.top);
  }

  function handlePointerLeave() {
    const model = modelRef.current;
    if (!model) return;
    model.focus(0, 0, true);
  }

  return (
    <div
      ref={containerRef}
      className={classNames}
      role={interactive ? "button" : "img"}
      aria-label={alt}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? handleClick : undefined}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onKeyDown={(event) => {
        if (!interactive) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleClick();
        }
      }}
    >
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      <div className={styles.fallback}>
        <AvatarStage src={fallbackSrc} alt={alt} size={size} state={fallbackState} />
      </div>
    </div>
  );
}

async function ensureCubismCore(): Promise<void> {
  if (window.Live2DCubismCore) return;
  if (cubismCorePromise) return cubismCorePromise;

  cubismCorePromise = loadCubismCoreScript(0);

  return cubismCorePromise;
}

function loadCubismCoreScript(index: number): Promise<void> {
  const src = CUBISM_CORE_SRCS[index];
  if (!src) return Promise.reject(new Error("Cubism Core is unavailable."));

  return new Promise((resolve, reject) => {
    document.getElementById(CUBISM_CORE_SCRIPT_ID)?.remove();

    const script = document.createElement("script");
    script.id = CUBISM_CORE_SCRIPT_ID;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      loadCubismCoreScript(index + 1).then(resolve).catch(reject);
    };
    document.head.appendChild(script);
  });
}

async function loadFirstModel(live2d: Live2DModule, urls: string[]): Promise<Live2DModelInstance> {
  let lastError: unknown;

  for (const url of urls) {
    try {
      const model = (await live2d.Live2DModel.from(url, {
        motionPreload: live2d.MotionPreloadStrategy.NONE
      })) as Live2DModelWithBridge;
      return model;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("No Live2D model could be loaded.");
}

function createPatchedWebGLContext(canvas: HTMLCanvasElement): WebGLRenderingContext | WebGL2RenderingContext {
  const options: WebGLContextAttributes = {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
    stencil: true
  };
  const context =
    canvas.getContext("webgl2", options) ??
    canvas.getContext("webgl", options) ??
    canvas.getContext("experimental-webgl", options);

  if (!context) {
    throw new Error("Live2D canvas could not create a WebGL context.");
  }

  const gl = context as WebGLRenderingContext | WebGL2RenderingContext;
  const originalGetParameter = gl.getParameter.bind(gl);
  gl.getParameter = ((parameter: number) => {
    const value = originalGetParameter(parameter);
    if (parameter === gl.MAX_TEXTURE_IMAGE_UNITS && (!Number.isFinite(value) || value < 1)) {
      return 1;
    }
    return value;
  }) as WebGLRenderingContext["getParameter"];

  return gl;
}

function patchCubismCore6RenderOrders(model: Live2DModelInstance) {
  const bridgedModel = model as Live2DModelWithBridge;
  const coreModel = bridgedModel.internalModel?.coreModel;
  const nativeModel = coreModel?.getModel?.() ?? coreModel?._model;
  const drawables = nativeModel?.drawables;
  if (!coreModel || !nativeModel || !drawables) return;

  const renderOrders =
    drawables.renderOrders ??
    nativeModel.renderOrders ??
    nativeModel.getRenderOrders?.() ??
    drawables.drawOrders;

  if (!renderOrders) return;

  if (!drawables.renderOrders) {
    drawables.renderOrders = renderOrders;
  }

  coreModel.getDrawableRenderOrders = () => renderOrders;
  patchDrawableLayerOrder(coreModel, renderOrders, drawables.drawOrders);
}

function patchDrawableLayerOrder(
  coreModel: CubismCoreModelBridge,
  renderOrders: Int32Array | number[],
  drawOrders?: Int32Array | number[]
) {
  const drawableIds = coreModel.getDrawableIds?.() ?? [];
  if (!drawableIds.length) return;

  const orderByName: Array<[RegExp, number]> = [
    [/legwear|bottomwear/, 30],
    [/footwear|shoe|foot/, 42],
    [/handwear|hand|arm/, 52],
    [/neck/, 56],
    [/topwear|body|cloth|wear/, 60],
    [/face|head|ear/, 74],
    [/nose/, 78],
    [/eyewhite/, 82],
    [/irides|iris/, 86],
    [/eyelash/, 90],
    [/eyebrow|brow/, 92],
    [/mouth|lip/, 94],
    [/eyewear/, 96]
  ];

  drawableIds.forEach((id, index) => {
    const name = String(id).toLowerCase();
    const match = orderByName.find(([pattern]) => pattern.test(name));
    if (!match) return;
    renderOrders[index] = match[1];
    if (drawOrders) drawOrders[index] = match[1];
  });
}

function installRuntimeDrawableDeformer(
  model: Live2DModelInstance,
  getPose: () => { state: Live2DStageState; motionKey: number; startedAt: number }
) {
  const coreModel = (model as Live2DModelWithBridge).internalModel?.coreModel;
  if (!coreModel?.update || coreModel.__timexRuntimeDeformInstalled) return;

  const originalUpdate = coreModel.update.bind(coreModel);
  coreModel.__timexOriginalUpdate = originalUpdate;
  coreModel.__timexRuntimeDeformInstalled = true;
  coreModel.update = () => {
    originalUpdate();
    applyDrawableRuntimeDeform(coreModel, getPose(), performance.now());
  };
}

type RuntimeDeformSignals = {
  angleX: number;
  angleY: number;
  angleZ: number;
  bodyX: number;
  bodyY: number;
  bodyZ: number;
  blink: number;
  mouthOpen: number;
  mouthSmile: number;
  brow: number;
  eyeX: number;
  eyeY: number;
  hair: number;
  breath: number;
  bounce: number;
  cheek: number;
  stride: number;
  stepLift: number;
  hipSway: number;
  leftLeg: number;
  rightLeg: number;
  leftFootLift: number;
  rightFootLift: number;
  pocket: number;
  shoulder: number;
};

type DrawableBounds = {
  index: number;
  id: string;
  vertices: Float32Array | number[];
  baseVertices: Float32Array;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
};

function applyDrawableRuntimeDeform(
  coreModel: CubismCoreModelBridge,
  pose: { state: Live2DStageState; motionKey: number; startedAt: number },
  now: number
) {
  const drawableCount = coreModel.getDrawableCount?.() ?? 0;
  if (!drawableCount || !coreModel.getDrawableVertices) return;
  coreModel.__timexBaseDrawableVertices ??= new Map<number, Float32Array>();

  const elapsed = Math.max(0, (now - pose.startedAt) / 1000);
  const signals = runtimeDeformSignals(pose.state, elapsed);
  const drawables: DrawableBounds[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < drawableCount; index += 1) {
    const vertices = coreModel.getDrawableVertices(index);
    if (!vertices || vertices.length < 4) continue;
    let baseVertices = coreModel.__timexBaseDrawableVertices.get(index);
    if (!baseVertices || baseVertices.length !== vertices.length) {
      baseVertices = Float32Array.from(vertices);
      coreModel.__timexBaseDrawableVertices.set(index, baseVertices);
    }
    const id = String(coreModel.getDrawableId?.(index) ?? coreModel.getDrawableIds?.()[index] ?? "");
    const bounds = boundsForVertices(index, id, vertices, baseVertices);
    drawables.push(bounds);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  if (!drawables.length || !Number.isFinite(minX) || !Number.isFinite(minY)) return;

  const modelWidth = Math.max(0.001, maxX - minX);
  const modelHeight = Math.max(0.001, maxY - minY);
  const modelSize = Math.max(modelWidth, modelHeight);
  const modelCx = (minX + maxX) / 2;
  const headPivot = { x: modelCx, y: minY + modelHeight * 0.34 };
  const bodyPivot = { x: modelCx, y: minY + modelHeight * 0.68 };

  applyDrawableOpacityOverrides(coreModel, drawables);

  for (const drawable of drawables) {
    deformDrawable(drawable, {
      minY,
      modelHeight,
      modelSize,
      headPivot,
      bodyPivot,
      signals
    });
  }
}

function applyDrawableOpacityOverrides(coreModel: CubismCoreModelBridge, drawables: DrawableBounds[]) {
  const nativeModel = coreModel.getModel?.() ?? coreModel._model;
  const opacities = nativeModel?.drawables?.opacities;
  if (!opacities) return;

  for (const drawable of drawables) {
    const name = drawable.id.toLowerCase();
    if (/legwear|bottomwear/.test(name)) {
      opacities[drawable.index] = 1;
    } else if (/footwear|shoe|foot/.test(name)) {
      opacities[drawable.index] = 1;
    }
  }
}

function boundsForVertices(
  index: number,
  id: string,
  vertices: Float32Array | number[],
  baseVertices: Float32Array
): DrawableBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let offset = 0; offset < baseVertices.length - 1; offset += 2) {
    const x = baseVertices[offset];
    const y = baseVertices[offset + 1];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const width = Math.max(0.001, maxX - minX);
  const height = Math.max(0.001, maxY - minY);
  return {
    index,
    id,
    vertices,
    baseVertices,
    minX,
    maxX,
    minY,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    width,
    height
  };
}

function deformDrawable(
  drawable: DrawableBounds,
  context: {
    minY: number;
    modelHeight: number;
    modelSize: number;
    headPivot: { x: number; y: number };
    bodyPivot: { x: number; y: number };
    signals: RuntimeDeformSignals;
  }
) {
  const name = drawable.id.toLowerCase();
  const relativeY = (drawable.cy - context.minY) / context.modelHeight;
  const isNamedHair = /hair|tail/.test(name);
  const isHair = isNamedHair;
  const isEyewear = /eyewear/.test(name);
  const isEye = !isEyewear && /iris|irides|eyewhite|eyelash|(^|[^a-z])eye([^a-z]|$)/.test(name);
  const isMouth = /mouth|lip/.test(name);
  const isBrow = /brow|eyebrow/.test(name);
  const isFaceAttachment = /face|nose|ear|eyewear/.test(name);
  const isNamedHead = /head/.test(name) || isFaceAttachment;
  const isNeck = /neck/.test(name);
  const isHand = /hand|arm/.test(name);
  const isFoot = /foot|shoe/.test(name);
  const isLeg = /leg|bottomwear|foot|shoe/.test(name);
  const isTopwear = /topwear|body|cloth|wear/.test(name) && !isLeg && !isHand && !isHair && !isEyewear && !isNeck;
  const isNamedBody = isTopwear || isLeg || isHand || /wing|object/.test(name);
  const isFacialDetail = isFaceAttachment || isEye || isMouth || isBrow;
  const headWeight =
    isNeck || isNamedBody ? 0 : isNamedHead || isEye || isMouth || isBrow || isHair ? 1 : smoothRange(0.58, 0.1, relativeY);
  const bodyWeight = isNeck || isFacialDetail || isHair ? 0 : isNamedBody ? 1 : smoothRange(0.42, 0.92, relativeY);
  const softHeadWeight = Math.max(0, Math.min(1, headWeight));
  const softBodyWeight = Math.max(0, Math.min(1, bodyWeight));
  const unit = context.modelSize;
  const s = context.signals;

  const headRotation = degreesToRadians(s.angleZ * 0.34);
  const bodyRotation = degreesToRadians(s.bodyZ * 0.22);
  const headDx = (s.angleX / 30) * unit * 0.018;
  const headDy = (s.angleY / 30) * unit * 0.012;
  const bodyDx = (s.bodyX / 20) * unit * 0.012;
  const bodyDy = (s.bodyY / 18) * unit * 0.01 - s.breath * unit * 0.004;
  const maxOffset = unit * 0.026;
  const pocketTargetX = context.bodyPivot.x + unit * 0.055 * Math.sign(drawable.cx - context.bodyPivot.x || 1);
  const pocketTargetY = context.minY + context.modelHeight * 0.62;

  for (let offset = 0; offset < drawable.vertices.length - 1; offset += 2) {
    const originalX = drawable.baseVertices[offset];
    const originalY = drawable.baseVertices[offset + 1];
    const localX = (originalX - drawable.cx) / drawable.width;
    const localY = (originalY - drawable.cy) / drawable.height;
    let x = originalX;
    let y = originalY;

    if (isNeck) {
      const neckTopWeight = clamp((0.34 - localY) / 0.68, 0, 1);
      const neckHead = rotatePoint(originalX, originalY, context.headPivot.x, context.headPivot.y, headRotation * 0.5);
      const neckBody = rotatePoint(originalX, originalY, context.bodyPivot.x, context.bodyPivot.y, bodyRotation * 0.35);
      const topX = neckHead.x + headDx * 0.45;
      const topY = neckHead.y + headDy * 0.45 - unit * 0.003;
      const bottomX = neckBody.x + bodyDx * 0.55;
      const bottomY = neckBody.y + bodyDy * 0.55 + unit * 0.002;
      x = lerp(bottomX, topX, neckTopWeight);
      y = lerp(bottomY, topY, neckTopWeight);
    }

    if (softHeadWeight > 0) {
      const rotated = rotatePoint(x, y, context.headPivot.x, context.headPivot.y, headRotation);
      x += (rotated.x + headDx - x) * softHeadWeight;
      y += (rotated.y + headDy - y) * softHeadWeight;
      x += localY * unit * 0.006 * (s.angleX / 30) * softHeadWeight;
      y += localX * unit * 0.004 * (s.angleY / 30) * softHeadWeight;
    }

    if (softBodyWeight > 0) {
      const rotated = rotatePoint(x, y, context.bodyPivot.x, context.bodyPivot.y, bodyRotation);
      x += (rotated.x + bodyDx - x) * softBodyWeight;
      y += (rotated.y + bodyDy - y) * softBodyWeight;
      x += localY * unit * 0.004 * (s.bodyX / 20) * softBodyWeight;
      y += Math.abs(localX) * unit * 0.004 * s.breath * softBodyWeight;
    }

    if (isTopwear) {
      const upperBias = 1 - clamp((relativeY - 0.45) / 0.28, 0, 1);
      const lowerBias = 1 - upperBias;
      const side = Math.sign(originalX - context.bodyPivot.x || localX || 1);
      x += s.shoulder * unit * 0.012 * upperBias;
      x -= s.stride * side * unit * 0.004 * lowerBias;
      y += Math.abs(localX) * unit * 0.004 * s.breath;
      y -= s.bounce * unit * 0.002 * upperBias;
    }

    if (isHand) {
      const lock = 0.12 * s.pocket;
      x += (pocketTargetX - drawable.cx) * lock;
      y += (pocketTargetY - drawable.cy) * lock;
      x += s.stride * unit * 0.004;
      y += Math.abs(s.stride) * unit * 0.002;
    }

    if (isLeg) {
      const side = Math.sign(originalX - context.bodyPivot.x || localX || 1);
      const legSignal = side < 0 ? s.leftLeg : s.rightLeg;
      const footLift = side < 0 ? s.leftFootLift : s.rightFootLift;
      const lateralWeight = clamp(Math.abs(localX) * (isFoot ? 1.7 : 1.1), 0.16, 0.85);
      const lowerWeight = isFoot ? 1 : clamp((localY + 0.48) / 0.95, 0, 1);
      const upperAnchor = 1 - lowerWeight;
      const swing = clamp(legSignal, 0, 1);
      const plant = clamp(-legSignal, 0, 1);
      const kneeWeight = isFoot ? 0 : Math.max(0, 1 - Math.abs(localY - 0.02) * 3.2);
      const footScale = isFoot ? 0.72 : 0.42;
      x += s.hipSway * unit * 0.002 * upperAnchor;
      x += legSignal * side * unit * 0.0055 * lateralWeight * lowerWeight * footScale;
      x += legSignal * side * unit * 0.002 * kneeWeight;
      x += -legSignal * side * unit * 0.0015 * upperAnchor;
      y -= footLift * (0.25 + swing * 0.75) * unit * 0.0065 * lowerWeight * footScale;
      y += plant * unit * 0.0015 * lowerWeight;
      y += Math.abs(legSignal) * unit * 0.001 * upperAnchor;
    }

    if (isHair) {
      const looseness = 0.35 + Math.min(1.4, Math.abs(localY) + Math.abs(localX) * 0.55);
      x += s.hair * unit * 0.012 * looseness;
      y += Math.sin((localX + localY) * Math.PI) * s.hair * unit * 0.004;
    }

    if (isEye) {
      const compressed = 1 - Math.min(0.72, s.blink * 0.72);
      y = drawable.cy + (y - drawable.cy) * compressed;
      x += s.eyeX * unit * 0.008;
      y += s.eyeY * unit * 0.006;
    }

    if (isMouth) {
      const open = Math.max(0, s.mouthOpen);
      y = drawable.cy + (y - drawable.cy) * (1 + open * 0.28);
      x = drawable.cx + (x - drawable.cx) * (1 + s.mouthSmile * 0.05);
      y += open * unit * 0.004;
    }

    if (isBrow) {
      y -= s.brow * unit * 0.009;
      x += s.angleX * unit * 0.00015;
    }

    if (s.bounce) {
      y -= s.bounce * unit * 0.006 * (softHeadWeight > 0.5 ? 1.2 : 0.65);
    }

    drawable.vertices[offset] = clamp(x, originalX - maxOffset, originalX + maxOffset);
    drawable.vertices[offset + 1] = clamp(y, originalY - maxOffset, originalY + maxOffset);
  }
}

function runtimeDeformSignals(state: Live2DStageState, elapsed: number): RuntimeDeformSignals {
  if (state === "blink") {
    const progress = Math.min(1, elapsed / 0.82);
    const hit = Math.sin(progress * Math.PI);
    const snap = Math.sin(progress * Math.PI * 2);
    return {
      angleX: snap * 5,
      angleY: -14 * hit,
      angleZ: 9 * snap,
      bodyX: snap * 4,
      bodyY: -5 * hit,
      bodyZ: 7 * snap,
      blink: hit,
      mouthOpen: 0.2 * hit,
      mouthSmile: 0.1,
      brow: 0.25 * hit,
      eyeX: 0,
      eyeY: -0.3 * hit,
      hair: snap * 1.25,
      breath: 0.2,
      bounce: hit,
      cheek: 0,
      stride: snap * 0.25,
      stepLift: hit * 0.1,
      hipSway: snap * 0.08,
      leftLeg: snap * 0.12,
      rightLeg: -snap * 0.12,
      leftFootLift: hit * 0.04,
      rightFootLift: hit * 0.04,
      pocket: 1,
      shoulder: snap * 0.2
    };
  }

  if (state === "thinking") {
    const enter = Math.min(1, elapsed / 0.55);
    const hold = Math.sin(elapsed * Math.PI * 1.3);
    const slow = Math.sin(elapsed * Math.PI * 0.72);
    return {
      angleX: -28 * enter + hold * 5,
      angleY: -18 * enter + slow * 5,
      angleZ: -24 * enter + hold * 4,
      bodyX: -16 * enter + hold * 3,
      bodyY: -10 * enter + slow * 3,
      bodyZ: -16 * enter + hold * 4,
      blink: 0.25 * enter,
      mouthOpen: Math.max(0, hold) * 0.22,
      mouthSmile: -0.65 * enter,
      brow: -0.8 * enter,
      eyeX: -0.9 * enter + hold * 0.15,
      eyeY: -0.75 * enter + slow * 0.1,
      hair: -1.15 * enter + hold * 0.35,
      breath: 0.8 + slow * 0.3,
      bounce: 0,
      cheek: 0,
      stride: slow * 0.22,
      stepLift: Math.max(0, slow) * 0.12,
      hipSway: slow * 0.08,
      leftLeg: slow * 0.1,
      rightLeg: -slow * 0.1,
      leftFootLift: Math.max(0, slow) * 0.05,
      rightFootLift: Math.max(0, -slow) * 0.05,
      pocket: 1,
      shoulder: hold * 0.32
    };
  }

  if (state === "greeting") {
    const progress = Math.min(1, elapsed / 2.2);
    const wave = Math.sin(progress * Math.PI * 5);
    const bounce = Math.abs(Math.sin(progress * Math.PI * 3));
    const settle = 1 - progress * 0.3;
    return {
      angleX: wave * 30 * settle,
      angleY: 12 * bounce,
      angleZ: wave * 26 * settle,
      bodyX: wave * 20 * settle,
      bodyY: 10 * bounce,
      bodyZ: wave * 18 * settle,
      blink: Math.max(0, bounce - 0.45) * 0.65,
      mouthOpen: 0.25 + bounce * 0.8,
      mouthSmile: 0.85,
      brow: bounce * 0.75,
      eyeX: wave * 0.85,
      eyeY: bounce * 0.42,
      hair: wave * 1.55,
      breath: 0.9 + bounce * 0.35,
      bounce,
      cheek: bounce * 0.8,
      stride: wave * 0.34 * settle,
      stepLift: bounce * 0.12,
      hipSway: wave * 0.08 * settle,
      leftLeg: wave * 0.14 * settle,
      rightLeg: -wave * 0.14 * settle,
      leftFootLift: Math.max(0, wave) * 0.06 + bounce * 0.03,
      rightFootLift: Math.max(0, -wave) * 0.06 + bounce * 0.03,
      pocket: 0.72,
      shoulder: wave * 0.75 * settle
    };
  }

  const a = Math.sin((elapsed / 5.2) * Math.PI * 2);
  const b = Math.sin((elapsed / 2.6) * Math.PI * 2 + 0.8);
  const c = Math.sin((elapsed / 3.4) * Math.PI * 2 + 1.7);
  const poseWalk = googlePoseWalkSignals(elapsed);
  const walk = poseWalk.torsoSway;
  const step = poseWalk.stepCompression;
  return {
    angleX: a * 8 + walk * 6 * AYUAN_WALK_PROFILE.bodySway,
    angleY: b * 5 + step * 3 * AYUAN_WALK_PROFILE.bodyBounce,
    angleZ: a * 6 - walk * 5 * AYUAN_WALK_PROFILE.bodySway,
    bodyX: -walk * 8 * AYUAN_WALK_PROFILE.bodySway + a * 2,
    bodyY: b * 2 + step * 5 * AYUAN_WALK_PROFILE.bodyBounce,
    bodyZ: walk * 8 * AYUAN_WALK_PROFILE.bodySway + a * 1.5,
    blink: Math.max(0, c - 0.72) * 1.9,
    mouthOpen: 0.08 + Math.max(0, c) * 0.28,
    mouthSmile: 0.25 + Math.max(0, a) * 0.35,
    brow: Math.max(0, b) * 0.35,
    eyeX: a * 0.28 + walk * 0.18,
    eyeY: b * 0.38,
    hair: -walk * 0.7 + a * 0.3,
    breath: 0.55 + step * 0.45 + Math.max(0, b) * 0.25,
    bounce: step * 0.24 * AYUAN_WALK_PROFILE.bodyBounce,
    cheek: Math.max(0, c) * 0.18,
    stride: poseWalk.stride * AYUAN_WALK_PROFILE.stride,
    stepLift: poseWalk.stepLift * AYUAN_WALK_PROFILE.stepLift,
    hipSway: poseWalk.hipSway,
    leftLeg: poseWalk.leftLeg,
    rightLeg: poseWalk.rightLeg,
    leftFootLift: poseWalk.leftFootLift,
    rightFootLift: poseWalk.rightFootLift,
    pocket: 1,
    shoulder: -walk * AYUAN_WALK_PROFILE.shoulderCounter
  };
}

function googlePoseWalkSignals(elapsed: number) {
  void GOOGLE_POSE_LANDMARK;
  const phase = elapsed * Math.PI * 1.55 + AYUAN_WALK_PROFILE.footLead * Math.PI;
  const left = Math.sin(phase);
  const right = Math.sin(phase + Math.PI);
  const leftSwing = clamp(left, 0, 1);
  const rightSwing = clamp(right, 0, 1);
  const leftPlant = clamp(-left, 0, 1);
  const rightPlant = clamp(-right, 0, 1);
  const hipSway = (rightPlant - leftPlant) * 0.12;
  const torsoSway = -hipSway * 0.72;
  const stepCompression = Math.max(leftPlant, rightPlant) * 0.38 + Math.max(leftSwing, rightSwing) * 0.08;

  return {
    stride: left * 0.38,
    stepLift: Math.max(leftSwing, rightSwing) * 0.38,
    hipSway,
    torsoSway,
    stepCompression,
    leftLeg: left * 0.22,
    rightLeg: right * 0.22,
    leftFootLift: leftSwing * 0.18,
    rightFootLift: rightSwing * 0.18
  };
}

function rotatePoint(x: number, y: number, pivotX: number, pivotY: number, radians: number) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = x - pivotX;
  const dy = y - pivotY;
  return {
    x: pivotX + dx * cos - dy * sin,
    y: pivotY + dx * sin + dy * cos
  };
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, weight: number) {
  return start + (end - start) * weight;
}

function smoothRange(start: number, end: number, value: number) {
  if (start === end) return value >= end ? 1 : 0;
  const t = clamp((value - start) / (end - start), 0, 1);
  const eased = t * t * (3 - 2 * t);
  return start < end ? eased : 1 - eased;
}

async function playModelState(
  model: Live2DModelInstance,
  state: Live2DStageState,
  motionPriority: Live2DModule["MotionPriority"] | null
) {
  const priority = state === "idle" ? motionPriority?.IDLE : motionPriority?.FORCE;
  const groups = motionGroupsForState(state);

  for (const group of groups) {
    try {
      const started = await model.motion(group, 0, priority);
      if (started) return;
    } catch (error) {
      console.warn("Live2D motion failed", { state, group, error });
      // Keep trying the looser aliases below; exported rigs often name groups differently.
    }
  }

  focusModelForState(model, state);
}

function focusModelForState(model: Live2DModelInstance, state: Live2DStageState) {
  if (state === "thinking") {
    model.focus(-0.35, -0.12, true);
  } else if (state === "blink") {
    model.focus(0, -0.2, true);
  } else {
    model.focus(0, 0, true);
  }
}

function motionGroupsForState(state: Live2DStageState): string[] {
  switch (state) {
    case "blink":
      return ["blink", "Blink", "BLINK", "idle", "Idle"];
    case "thinking":
      return ["thinking", "Thinking", "think", "Think", "idle", "Idle"];
    case "greeting":
      return ["greeting", "Greeting", "tap_body", "TapBody", "Tap", "tap", "idle", "Idle"];
    case "idle":
    default:
      return ["idle", "Idle", "IDLE"];
  }
}

async function waitForVisibleCanvasFrame(canvas: HTMLCanvasElement, app: PixiApplication): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.renderer.render(app.stage);

  const rendererGl = (app.renderer as PixiApplication["renderer"] & { gl?: WebGLRenderingContext | WebGL2RenderingContext }).gl;
  const gl = rendererGl ?? (
    canvas.getContext("webgl2", { preserveDrawingBuffer: true }) ??
    canvas.getContext("webgl", { preserveDrawingBuffer: true }) ??
    canvas.getContext("experimental-webgl", { preserveDrawingBuffer: true })
  ) as WebGLRenderingContext | WebGL2RenderingContext | null;
  if (!gl) return;

  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  if (width <= 0 || height <= 0) return;

  const sampleWidth = Math.min(64, width);
  const sampleHeight = Math.min(64, height);
  const sampleX = Math.max(0, Math.floor((width - sampleWidth) / 2));
  const sampleY = Math.max(0, Math.floor((height - sampleHeight) / 2));
  const pixels = new Uint8Array(sampleWidth * sampleHeight * 4);
  gl.readPixels(sampleX, sampleY, sampleWidth, sampleHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > 8) return;
  }

  return;
}

function fitModelToContainer(model: Live2DModelInstance, app: PixiApplication, container: HTMLDivElement) {
  const bounds = model.getLocalBounds();
  const sourceWidth = Math.max(1, bounds.width || model.width || 1);
  const sourceHeight = Math.max(1, bounds.height || model.height || 1);
  const rect = container.getBoundingClientRect();
  const targetWidth = Math.max(1, rect.width);
  const targetHeight = Math.max(1, rect.height);
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight) * 1.24;

  model.scale.set(scale);
  model.x = app.screen.width / 2 - (bounds.x + sourceWidth / 2) * scale;
  model.y = app.screen.height / 2 - (bounds.y + sourceHeight / 2) * scale - targetHeight * 0.08;
  (model as Live2DModelWithBridge).__timexBaseTransform = {
    x: model.x,
    y: model.y,
    scale
  };
  model.rotation = 0;
}

function applyRuntimePose(
  model: Live2DModelInstance,
  pose: { state: Live2DStageState; motionKey: number; startedAt: number },
  now: number
) {
  const bridgedModel = model as Live2DModelWithBridge;
  const base = bridgedModel.__timexBaseTransform;
  if (!base) return;

  const elapsed = Math.max(0, (now - pose.startedAt) / 1000);
  let x = base.x;
  let y = base.y;
  let rotation = 0;
  let scaleX = base.scale;
  let scaleY = base.scale;

  const add = (parameterId: string, value: number, weight = 1) => addRuntimeParameter(model, parameterId, value, weight);

  if (pose.state === "blink") {
    const progress = Math.min(1, elapsed / 0.82);
    const hit = Math.sin(progress * Math.PI);
    const snap = Math.sin(progress * Math.PI * 2);
    y += hit * 8;
    rotation += snap * 0.045;
    scaleY *= 1 - hit * 0.065;
    add("ParamEyeLOpen", -1.2 * hit, 1);
    add("ParamEyeROpen", -1.2 * hit, 1);
    add("ParamAngleY", -14 * hit, 1);
    add("ParamAngleZ", 9 * snap, 1);
    add("ParamBodyAngleZ", 7 * snap, 1);
    add("ParamHairFront", 2.2 * snap, 1);
    add("ParamHairSide", -2 * snap, 1);
    add("ParamHairBack", 1.7 * snap, 1);
  } else if (pose.state === "thinking") {
    const enter = Math.min(1, elapsed / 0.55);
    const hold = Math.sin(elapsed * Math.PI * 1.3);
    const slow = Math.sin(elapsed * Math.PI * 0.72);
    x -= 14 * enter + hold * 3;
    y += 8 * enter + slow * 4;
    rotation -= 0.13 * enter + hold * 0.025;
    scaleX *= 1 - 0.025 * enter;
    scaleY *= 1 + 0.02 * enter;
    add("ParamAngleX", -28 * enter + hold * 5, 1);
    add("ParamAngleY", -18 * enter + slow * 5, 1);
    add("ParamAngleZ", -24 * enter + hold * 4, 1);
    add("ParamBodyAngleX", -16 * enter + hold * 3, 1);
    add("ParamBodyAngleY", -10 * enter + slow * 3, 1);
    add("ParamBodyAngleZ", -16 * enter + hold * 4, 1);
    add("ParamEyeBallX", -0.9 * enter + hold * 0.15, 1);
    add("ParamEyeBallY", -0.75 * enter + slow * 0.1, 1);
    add("ParamEyeLOpen", -0.35 * enter, 1);
    add("ParamEyeROpen", -0.35 * enter, 1);
    add("ParamBrowLY", -0.85 * enter, 1);
    add("ParamBrowRY", -0.65 * enter, 1);
    add("ParamMouthForm", -0.8 * enter, 1);
    add("ParamMouthOpenY", -0.18 * enter + Math.max(0, hold) * 0.18, 1);
    add("ParamHairFront", -2.6 * enter + hold * 0.7, 1);
    add("ParamHairSide", 2.4 * enter - hold * 0.6, 1);
    add("ParamHairBack", -2.1 * enter + hold * 0.5, 1);
    add("ParamBreath", 0.8 + slow * 0.3, 0.8);
  } else if (pose.state === "greeting") {
    const progress = Math.min(1, elapsed / 2.2);
    const wave = Math.sin(progress * Math.PI * 5);
    const bounce = Math.abs(Math.sin(progress * Math.PI * 3));
    const settle = 1 - progress * 0.3;
    x += wave * 16 * settle;
    y -= bounce * 11;
    rotation += wave * 0.16 * settle;
    scaleX *= 1 + bounce * 0.035;
    scaleY *= 1 - bounce * 0.02;
    add("ParamAngleX", wave * 30 * settle, 1);
    add("ParamAngleY", 12 * bounce, 1);
    add("ParamAngleZ", wave * 26 * settle, 1);
    add("ParamBodyAngleX", wave * 20 * settle, 1);
    add("ParamBodyAngleY", 10 * bounce, 1);
    add("ParamBodyAngleZ", wave * 18 * settle, 1);
    add("ParamEyeLOpen", bounce * 0.25, 1);
    add("ParamEyeROpen", bounce * 0.25, 1);
    add("ParamEyeLSmile", bounce, 1);
    add("ParamEyeRSmile", bounce, 1);
    add("ParamEyeBallX", wave * 0.85, 1);
    add("ParamEyeBallY", bounce * 0.42, 1);
    add("ParamMouthOpenY", 0.25 + bounce * 0.8, 1);
    add("ParamMouthForm", 0.85, 1);
    add("ParamCheek", bounce * 0.8, 1);
    add("ParamBrowLY", bounce * 0.75, 1);
    add("ParamBrowRY", bounce * 0.75, 1);
    add("ParamHairFront", wave * 3.0, 1);
    add("ParamHairSide", -wave * 2.8, 1);
    add("ParamHairBack", wave * 2.3, 1);
    add("ParamBreath", 0.9 + bounce * 0.35, 1);
  } else {
    const a = Math.sin((elapsed / 5.2) * Math.PI * 2);
    const b = Math.sin((elapsed / 2.6) * Math.PI * 2 + 0.8);
    const c = Math.sin((elapsed / 3.4) * Math.PI * 2 + 1.7);
    const walk = Math.sin(elapsed * Math.PI * 1.55);
    const step = Math.abs(walk);
    x += -walk * 3 + a * 1.5;
    y += step * 3 + b * 1.2;
    rotation += walk * 0.028 + a * 0.01;
    scaleX *= 1 + step * 0.006;
    scaleY *= 1 - step * 0.004;
    add("ParamAngleX", a * 10 + walk * 8, 0.8);
    add("ParamAngleY", b * 6 + step * 3, 0.8);
    add("ParamAngleZ", a * 7 - walk * 5, 0.8);
    add("ParamBodyAngleX", -walk * 8 + a * 3, 0.8);
    add("ParamBodyAngleY", b * 3 + step * 4, 0.8);
    add("ParamBodyAngleZ", walk * 8 + a * 2, 0.8);
    add("ParamBreath", 0.55 + step * 0.45 + Math.max(0, b) * 0.25, 0.75);
    add("ParamEyeBallX", a * 0.28 + walk * 0.18, 0.8);
    add("ParamEyeBallY", b * 0.38, 0.8);
    add("ParamMouthOpenY", 0.08 + Math.max(0, c) * 0.28, 0.8);
    add("ParamMouthForm", 0.25 + Math.max(0, a) * 0.35, 0.7);
    add("ParamHairFront", -walk * 0.85 + a * 0.35, 0.9);
    add("ParamHairSide", walk * 0.72 + c * 0.24, 0.9);
    add("ParamHairBack", -walk * 0.65 - b * 0.2, 0.9);
    add("ParamCheek", Math.max(0, c) * 0.18, 0.7);
  }

  model.x = x;
  model.y = y;
  model.rotation = rotation;
  model.scale.set(scaleX, scaleY);
}

function addRuntimeParameter(model: Live2DModelInstance, parameterId: string, value: number, weight = 1) {
  const coreModel = (model as Live2DModelWithBridge).internalModel?.coreModel;
  if (!coreModel) return;

  try {
    if (coreModel.addParameterValueById) {
      coreModel.addParameterValueById(parameterId, value, weight);
    } else {
      coreModel.setParameterValueById?.(parameterId, value, weight);
    }
  } catch {
    // The current moc may not expose every standard Cubism parameter.
  }
}
