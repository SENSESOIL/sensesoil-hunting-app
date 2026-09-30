/**
 * 員工卡牌人像：AI 重新生成（伺服器端）
 *
 * 上傳一張生活照／大頭照 → 影像模型生成「同一個人、穿公司制服、攝影棚正面半身照」→
 * 前端再對齊、去背，放到卡牌的漸層背景上（src/components/team/portrait.ts）。
 *
 * 擇一設定（Vercel 環境變數）：
 *   GEMINI_API_KEY   Google AI Studio 的金鑰（最簡單；aistudio.google.com → Get API key）
 *   AVATAR_AI=vertex 用 APP 既有的 Google 服務帳號走 Vertex AI（要先在 GCP 開啟 Vertex AI API 與帳單）
 *   OPENAI_API_KEY   OpenAI（gpt-image）
 * 選用：AVATAR_MODEL 指定模型（預設 Gemini 用 gemini-3.1-flash-image，找不到時自動退回 gemini-2.5-flash-image）
 *
 * 照片只在生成當下傳給上述服務，APP 不保存原始照片。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export type AvatarProvider = "gemini" | "vertex" | "openai" | "mock";

export function avatarProvider(): AvatarProvider | null {
  const forced = process.env.AVATAR_AI?.toLowerCase();
  if (forced === "mock" && process.env.NODE_ENV === "development") return "mock";
  if (forced === "vertex") return "vertex";
  if (forced === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

/** 給模型的指示：重點是「還是同一個人」＋「制服像真的穿在身上」＋乾淨的背景（方便去背） */
export const AVATAR_PROMPT = [
  "Create a new photorealistic studio portrait of the SAME person shown in the first reference photo.",
  "Identity is the top priority: keep their face shape, eyes, nose, mouth, eyebrows, skin tone, hairstyle, hair colour, facial hair, glasses (if any) and apparent age exactly, so colleagues instantly recognise them. Do not beautify, slim, or change ethnicity or gender.",
  "Framing: head-and-shoulders to mid-chest, front-facing, centred, looking straight into the camera, relaxed neutral expression with a slight natural smile, shoulders square to the camera. Top of the head at about 10% from the top of the frame; the chest fills the lower third.",
  "Clothing: they wear the company uniform, a plain black heavyweight cotton pullover hoodie, hood down and resting around the back of the neck, two light grey drawstrings hanging in front. It must look genuinely worn: correct fit on their body, natural fabric folds and shadows, consistent lighting. No other garments or accessories visible except glasses.",
  "If a second image (a small orange logo) is provided, embroider it small (about 8% of the frame width) on the wearer's left chest of the hoodie.",
  "Background: plain seamless light-grey studio backdrop, evenly lit, no gradient, no objects, no text, no watermark.",
  "Lighting: soft large key light from the front-left, gentle fill, subtle rim light; sharp focus on the eyes; high detail skin texture; 85mm portrait lens look.",
  "Output a single image in 3:4 portrait orientation.",
].join("\n");

export interface GenResult {
  mime: string;
  data: string;
  provider: AvatarProvider;
  model: string;
}

async function logoPng(): Promise<string | null> {
  try {
    // logo 是 SVG；模型要點陣圖。public 裡的 APP 圖示就是橘色 logo
    const buf = await readFile(path.join(process.cwd(), "public", "icon-192x192.png"));
    return buf.toString("base64");
  } catch {
    return null;
  }
}

export function pickImage(json: unknown): { mime: string; data: string } | null {
  const cands = (json as { candidates?: { content?: { parts?: Record<string, unknown>[] } }[] })?.candidates ?? [];
  for (const c of cands) {
    for (const p of c.content?.parts ?? []) {
      const d = (p.inlineData ?? p.inline_data) as { mimeType?: string; mime_type?: string; data?: string } | undefined;
      if (d?.data) return { mime: d.mimeType ?? d.mime_type ?? "image/png", data: d.data };
    }
  }
  return null;
}

function geminiBody(photo: string, logo: string | null) {
  const parts: Record<string, unknown>[] = [
    { text: AVATAR_PROMPT },
    { inlineData: { mimeType: "image/jpeg", data: photo } },
  ];
  if (logo) parts.push({ inlineData: { mimeType: "image/png", data: logo } });
  return {
    contents: [{ role: "user", parts }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4" } },
  };
}

async function callGemini(model: string, photo: string, logo: string | null): Promise<Response> {
  const base = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com";
  return fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify(geminiBody(photo, logo)),
    signal: AbortSignal.timeout(55_000),
  });
}

async function callVertex(model: string, photo: string, logo: string | null): Promise<Response> {
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const token = (await (await auth.getClient()).getAccessToken()).token;
  const project =
    process.env.GOOGLE_CLOUD_PROJECT || (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "").split("@")[1]?.split(".")[0];
  return fetch(
    `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(geminiBody(photo, logo)),
      signal: AbortSignal.timeout(55_000),
    }
  );
}

async function callOpenAI(model: string, photo: string, logo: string | null): Promise<GenResult> {
  const fd = new FormData();
  fd.append("model", model);
  fd.append("prompt", AVATAR_PROMPT);
  fd.append("size", "1024x1536");
  fd.append("quality", "high");
  fd.append("image[]", new Blob([Buffer.from(photo, "base64")], { type: "image/jpeg" }), "photo.jpg");
  if (logo) fd.append("image[]", new Blob([Buffer.from(logo, "base64")], { type: "image/png" }), "logo.png");
  const r = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: fd,
    signal: AbortSignal.timeout(58_000),
  });
  const j = (await r.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; error?: { message?: string } };
  if (!r.ok || !j.data?.[0]?.b64_json) throw new Error(j.error?.message || `OpenAI HTTP ${r.status}`);
  return { mime: "image/png", data: j.data[0].b64_json, provider: "openai", model };
}

/** 生成一張卡牌人像（原圖大小，還沒去背） */
export async function generateAvatar(photo: string): Promise<GenResult> {
  const provider = avatarProvider();
  if (!provider) throw new Error("AI 生成尚未設定（GEMINI_API_KEY）");
  const logo = await logoPng();

  if (provider === "mock") {
    // 開發用：不呼叫外部服務，回傳 AVATAR_MOCK_FILE 指定的測試圖，用來測整條流程
    const file = process.env.AVATAR_MOCK_FILE;
    const buf = file ? await readFile(file) : Buffer.from(photo, "base64");
    await new Promise((r) => setTimeout(r, 800));
    return { mime: "image/jpeg", data: buf.toString("base64"), provider, model: "mock" };
  }

  if (provider === "openai") return callOpenAI(process.env.AVATAR_MODEL || "gpt-image-1", photo, logo);

  const models = process.env.AVATAR_MODEL
    ? [process.env.AVATAR_MODEL]
    : ["gemini-3.1-flash-image", "gemini-2.5-flash-image"];
  let lastErr = "";
  for (const model of models) {
    const r = provider === "vertex" ? await callVertex(model, photo, logo) : await callGemini(model, photo, logo);
    const text = await r.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* 非 JSON */
    }
    if (r.ok) {
      const img = pickImage(json);
      if (img) return { ...img, provider, model };
      // 模型拒絕（安全過濾）或只回了文字
      const j = json as { candidates?: { finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
      const reason = j?.promptFeedback?.blockReason ?? j?.candidates?.[0]?.finishReason;
      throw new Error(reason ? `模型沒有產生圖片（${reason}），請換一張照片` : "模型沒有產生圖片，請換一張照片再試");
    }
    const msg = (json as { error?: { message?: string } })?.error?.message ?? text.slice(0, 200);
    lastErr = `${r.status} ${msg}`;
    // 模型名稱不存在 → 換下一個；其他錯誤直接回報
    if (r.status !== 404 && !/not found|is not supported|unknown model/i.test(msg)) break;
  }
  if (/API key not valid|API_KEY_INVALID/i.test(lastErr)) throw new Error("GEMINI_API_KEY 無效，請重新複製");
  if (/SERVICE_DISABLED|has not been used|is disabled/i.test(lastErr))
    throw new Error("Google Cloud 還沒開啟 Vertex AI API（或帳單），請看設定說明");
  if (/quota|RESOURCE_EXHAUSTED|429/i.test(lastErr)) throw new Error("AI 生成的額度用完了，請稍後再試");
  throw new Error(`AI 生成失敗：${lastErr.slice(0, 160)}`);
}
