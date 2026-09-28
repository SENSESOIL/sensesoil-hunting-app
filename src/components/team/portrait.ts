"use client";

/* ══════════════════════════════════════════════════════════
   員工卡牌人像：上傳一張大頭照 →
     1. 找臉（MediaPipe Face Landmarker）：對齊、轉正、統一大小與位置
     2. 去背（MediaPipe Selfie Segmenter）
     3. 穿上公司制服（uniform.ts）
   全部在手機／瀏覽器裡算，照片不會送到第三方。
   模型第一次使用時從 Google 下載（約 15MB），之後瀏覽器會快取。

   卡牌座標固定：臉寬＝卡寬 30%、臉中心在 (50%, 34.5%)。
   所以大頭照（圓形頭像）可以直接從卡牌裁出來，換背景色時不必重新辨識。
   ══════════════════════════════════════════════════════════ */

import type { FaceLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";
import { drawBody, drawHood, personClipY, type UniformGeo } from "./uniform";

const MP_VERSION = "1.0.1";
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const SEG_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

/** 卡牌尺寸（3:4）與臉的固定位置 */
export const CARD_W = 480;
export const CARD_H = 640;
export const FACE_W = CARD_W * 0.3;
export const FACE_CX = CARD_W / 2;
export const FACE_CY = CARD_H * 0.345;
const MAX_INPUT = 1280;

let vision: Promise<{ face: FaceLandmarker; seg: ImageSegmenter }> | null = null;

/** 先在背景載入模型（打開上傳畫面時就呼叫，選好照片時通常已經好了） */
export function preloadVision() {
  if (!vision) {
    vision = (async () => {
      const mp = await import("@mediapipe/tasks-vision");
      const files = await mp.FilesetResolver.forVisionTasks(WASM);
      const [face, seg] = await Promise.all([
        mp.FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: FACE_MODEL, delegate: "CPU" },
          runningMode: "IMAGE",
          numFaces: 1,
        }),
        mp.ImageSegmenter.createFromOptions(files, {
          baseOptions: { modelAssetPath: SEG_MODEL, delegate: "CPU" },
          runningMode: "IMAGE",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        }),
      ]);
      return { face, seg };
    })();
    vision.catch(() => {
      vision = null; // 下次再試
    });
  }
  return vision;
}

export class PortraitError extends Error {}

async function toCanvas(file: Blob): Promise<HTMLCanvasElement> {
  let src: ImageBitmap | HTMLImageElement;
  try {
    src = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      src = img;
    } catch {
      throw new PortraitError("讀不到這張照片（格式不支援？）");
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  }
  const w = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h = "naturalHeight" in src ? src.naturalHeight : src.height;
  const k = Math.min(1, MAX_INPUT / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  if ("close" in src) src.close();
  return c;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface PortraitResult {
  /** 卡牌人像：透明底 webp／png（data URL） */
  card: string;
  /** 圓形頭像用的方形 jpeg（已含背景色） */
  avatar: string;
}

/**
 * 大頭照 → 卡牌人像＋頭像。
 * bg：卡牌背景的兩個顏色（頭像要用；卡牌本身是透明底，背景由畫面決定）
 */
export async function makePortrait(file: Blob, bg: [string, string], onStage?: (s: string) => void): Promise<PortraitResult> {
  onStage?.("讀取照片…");
  const src = await toCanvas(file);
  onStage?.("載入人像模型…（第一次約需 10–30 秒）");
  const { face, seg } = await preloadVision();

  onStage?.("找臉、對齊…");
  const lm = face.detect(src).faceLandmarks?.[0];
  if (!lm) throw new PortraitError("照片裡找不到臉，請換一張正面、清楚、臉不要太小的照片");
  const W = src.width;
  const H = src.height;
  const P = (i: number) => ({ x: lm[i].x * W, y: lm[i].y * H });
  const left = P(234), right = P(454), top = P(10), chin = P(152), eyeR = P(33), eyeL = P(263);
  const faceW = Math.hypot(right.x - left.x, right.y - left.y);
  if (faceW < 40) throw new PortraitError("臉太小了，請裁切或換一張近一點的大頭照");
  const center = { x: (left.x + right.x) / 2, y: (top.y + chin.y) / 2 };
  const angle = Math.atan2(eyeL.y - eyeR.y, eyeL.x - eyeR.x);

  onStage?.("去背…");
  const res = seg.segment(src);
  const masks = res.confidenceMasks ?? [];
  if (!masks.length) throw new PortraitError("去背失敗，請換一張照片");
  // 有的模型版本輸出「背景＋人」兩張，取臉中心機率高的那張
  const pick = (m: (typeof masks)[number]) => {
    const a = m.getAsFloat32Array();
    return { a, v: a[Math.round(center.y) * W + Math.round(center.x)] ?? 0 };
  };
  let best = pick(masks[0]);
  for (const m of masks.slice(1)) {
    const c = pick(m);
    if (c.v > best.v) best = c;
  }
  const person = document.createElement("canvas");
  person.width = W;
  person.height = H;
  const pctx = person.getContext("2d")!;
  pctx.drawImage(src, 0, 0);
  const img = pctx.getImageData(0, 0, W, H);
  for (let i = 0; i < best.a.length; i++) img.data[i * 4 + 3] = Math.round(255 * smooth(0.25, 0.75, best.a[i]));
  pctx.putImageData(img, 0, 0);
  masks.forEach((m) => m.close());
  res.close?.();

  onStage?.("穿上制服…");
  const s = FACE_W / faceW;
  const out = document.createElement("canvas");
  out.width = CARD_W;
  out.height = CARD_H;
  const ctx = out.getContext("2d")!;
  // 下巴在卡牌上的位置（轉正後）
  const dx = chin.x - center.x, dy = chin.y - center.y;
  const chinY = FACE_CY + s * (dx * Math.sin(-angle) + dy * Math.cos(-angle));
  const geo: UniformGeo = { cx: FACE_CX, collarY: chinY + 0.17 * FACE_W, fw: FACE_W, H: CARD_H };

  drawHood(ctx, geo);
  ctx.save();
  // 領口以下的原本衣服裁掉（避免從制服邊緣露出來）
  ctx.beginPath();
  ctx.rect(0, 0, CARD_W, personClipY(geo));
  ctx.clip();
  ctx.translate(FACE_CX, FACE_CY);
  ctx.rotate(-angle);
  ctx.scale(s, s);
  ctx.translate(-center.x, -center.y);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(person, 0, 0);
  ctx.restore();
  await drawBody(ctx, geo);

  onStage?.("完成");
  return { card: encodeCard(out), avatar: avatarFrom(out, out.width, bg) };
}

/** 透明底的卡牌：優先 webp（小）；瀏覽器不支援 webp 編碼時改 png，太大就縮小 */
function encodeCard(c: HTMLCanvasElement): string {
  let url = c.toDataURL("image/webp", 0.88);
  if (!url.startsWith("data:image/webp")) url = c.toDataURL("image/png");
  if (url.length > 650_000) {
    const k = document.createElement("canvas");
    k.width = Math.round(c.width * 0.75);
    k.height = Math.round(c.height * 0.75);
    k.getContext("2d")!.drawImage(c, 0, 0, k.width, k.height);
    url = k.toDataURL("image/webp", 0.8);
    if (!url.startsWith("data:image/webp")) url = k.toDataURL("image/png");
  }
  return url;
}

/** 從卡牌裁出頭像（臉＋一點領口），墊上背景色 */
export function avatarFrom(card: CanvasImageSource, cardWidth: number, bg: [string, string], size = 128): string {
  const k = cardWidth / CARD_W;
  const box = FACE_W * 1.85 * k;
  const cx = FACE_CX * k;
  const cy = (FACE_CY + FACE_W * 0.16) * k;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, bg[0]);
  g.addColorStop(1, bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(card, cx - box / 2, cy - box / 2, box, box, 0, 0, size, size);
  return c.toDataURL("image/jpeg", 0.88);
}

/** 換背景色：用已經存好的卡牌重新做頭像 */
export async function avatarFromUrl(cardUrl: string, bg: [string, string]): Promise<string> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = cardUrl;
  await img.decode();
  return avatarFrom(img, img.naturalWidth, bg);
}
