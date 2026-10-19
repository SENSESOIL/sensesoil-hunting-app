/* ══════════════════════════════════════════════════════════
   提醒事項截圖辨識（全部在瀏覽器裡做，免費、截圖不會上傳）
   做法參考「細水長流」的截圖匯入（Budget_APP/index.html：ocrImage、prepImage、cropForOcr）：
   1. 文字：Tesseract.js（繁中＋英數）。整張先讀一次拿到每一行的位置，
      再把每一行（從圓圈右邊開始）裁下來、字高調到 40px、用「單行」模式讀第二次，以第二次為準。
      實測：iPhone 截圖本身解析度就夠，整張放大反而讀錯更多；逐行讀能避開圓圈（常被讀成 @、O）。
   2. 結構不靠文字，靠位置與像素：
      - 圓圈：在左側找「環狀」的色塊（沿圓周取樣大多是有顏色的），有圓圈的那一列才是任務
      - 已完成：圓圈中間是實心（有顏色）
      - 子任務：圓圈比同一張最左邊的圓圈明顯靠右
      - 分組標題：左邊沒有圓圈、文字跟圓圈一樣靠左
      - 備註／日期：在任務正下方、跟任務名稱同一欄的灰字
      - 旗標：任務那一列最右邊有橘色色塊
      - 清單名稱：第一個任務上方、字最大的那一行
   ══════════════════════════════════════════════════════════ */

import type { Shot, ShotItem } from "./reminder-import";

/* ── Tesseract（CDN 載入，同一次匯入共用一個 worker，閒置 60 秒自動關掉） ── */

interface TBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface TWord {
  text: string;
  bbox: TBox;
}
interface TLine {
  text: string;
  bbox: TBox;
  words: TWord[];
}
interface TData {
  blocks?: { paragraphs: { lines: TLine[] }[] }[];
}
interface TWorker {
  recognize(img: Blob | HTMLCanvasElement, opts?: unknown, output?: unknown): Promise<{ data: TData & { text: string } }>;
  setParameters(p: Record<string, string>): Promise<unknown>;
  terminate(): Promise<unknown>;
}
declare global {
  interface Window {
    Tesseract?: { createWorker(langs: string[], oem?: number, opts?: unknown): Promise<TWorker> };
  }
}

const CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
let scriptP: Promise<void> | null = null;
let workerP: Promise<TWorker> | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;
let progressCb: ((p: number) => void) | null = null;
/** worker 目前的版面模式：3＝整頁、7＝單行 */
let psmNow = "3";

function loadScript(): Promise<void> {
  if (window.Tesseract) return Promise.resolve();
  return (scriptP ??= new Promise<void>((ok, bad) => {
    const s = document.createElement("script");
    s.src = CDN;
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => {
      scriptP = null;
      bad(new Error("辨識程式下載失敗，請確認網路"));
    };
    document.head.appendChild(s);
  }));
}

async function withWorker<T>(psm: string, job: (w: TWorker) => Promise<T>): Promise<T> {
  await loadScript();
  if (!workerP) {
    psmNow = "3";
    workerP = window.Tesseract!.createWorker(["chi_tra", "eng"], 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") progressCb?.(m.progress);
      },
    });
  }
  clearTimeout(idle);
  try {
    const w = await workerP;
    if (psm !== psmNow) {
      await w.setParameters({ tessedit_pageseg_mode: psm });
      psmNow = psm;
    }
    return await job(w);
  } catch (e) {
    const w = workerP;
    workerP = null;
    w?.then((x) => x.terminate()).catch(() => {});
    throw e;
  } finally {
    idle = setTimeout(() => {
      const w = workerP;
      workerP = null;
      w?.then((x) => x.terminate()).catch(() => {});
    }, 60_000);
  }
}

/** 整頁：每一行的字與位置 */
function ocrLines(img: Blob | HTMLCanvasElement): Promise<TLine[]> {
  return withWorker("3", async (w) => {
    const r = await w.recognize(img, {}, { blocks: true, text: true });
    return (r.data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines)).filter((l) => l.text.trim());
  });
}

/** 單行：只要文字 */
function ocrOneLine(img: HTMLCanvasElement): Promise<string> {
  return withWorker("7", async (w) => (await w.recognize(img)).data.text);
}

/* ── 影像工具 ── */

interface Px {
  W: number;
  H: number;
  d: Uint8ClampedArray;
  bg: [number, number, number];
}

async function readPixels(file: Blob): Promise<{ px: Px; bmp: ImageBitmap }> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  // 背景色 = 抽樣後最常出現的顏色（淺色、深色模式都適用）
  const freq = new Map<number, number>();
  let bg: [number, number, number] = [255, 255, 255];
  let best = 0;
  for (let y = 0; y < c.height; y += 9)
    for (let x = 0; x < c.width; x += 9) {
      const k = (y * c.width + x) * 4;
      const key = ((d[k] >> 4) << 8) | ((d[k + 1] >> 4) << 4) | (d[k + 2] >> 4);
      const n = (freq.get(key) ?? 0) + 1;
      freq.set(key, n);
      if (n > best) {
        best = n;
        bg = [d[k], d[k + 1], d[k + 2]];
      }
    }
  return { px: { W: c.width, H: c.height, d, bg }, bmp };
}

/** 這個像素和背景差多少（0–255） */
function diff(p: Px, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= p.W || y >= p.H) return 0;
  const k = (Math.round(y) * p.W + Math.round(x)) * 4;
  return Math.max(Math.abs(p.d[k] - p.bg[0]), Math.abs(p.d[k + 1] - p.bg[1]), Math.abs(p.d[k + 2] - p.bg[2]));
}

/** 放大、用「和背景的色差」轉成白底黑字（深色模式、彩色字都讀得到） */
/** 縮放、用「和背景的色差」轉成白底黑字（深色模式、彩色字都讀得到） */
function prep(bmp: ImageBitmap, bg: [number, number, number], sx: number, sy: number, sw: number, sh: number, scale: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * scale));
  c.height = Math.max(1, Math.round(sh * scale));
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const im = g.getImageData(0, 0, c.width, c.height);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2]));
    const o = 255 - Math.min(255, v * 1.3);
    d[i] = d[i + 1] = d[i + 2] = o;
  }
  g.putImageData(im, 0, 0);
  return c;
}

/* ── 找圓圈 ── */

interface Circle {
  cx: number;
  cy: number;
  r: number;
  done: boolean;
  /** 被上下緣切到 */
  cut: boolean;
}

function findCircles(p: Px): Circle[] {
  const { W, H } = p;
  // 只看左側 35%；縮小到 1/2 做連通區塊，比較快
  const step = W > 900 ? 2 : 1;
  const xs = Math.floor((W * 0.35) / step);
  const ys = Math.floor(H / step);
  const mask = new Uint8Array(xs * ys);
  for (let y = 0; y < ys; y++) for (let x = 0; x < xs; x++) if (diff(p, x * step, y * step) > 45) mask[y * xs + x] = 1;
  const seen = new Uint8Array(xs * ys);
  const out: Circle[] = [];
  const minD = (W * 0.03) / step;
  const maxD = (W * 0.09) / step;
  const stack: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, n = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % xs;
      const y = (j / xs) | 0;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (n > 40000) break;
      for (const k of [j - 1, j + 1, j - xs, j + xs]) {
        if (k < 0 || k >= mask.length || seen[k] || !mask[k]) continue;
        if ((k === j - 1 && x === 0) || (k === j + 1 && x === xs - 1)) continue;
        seen[k] = 1;
        stack.push(k);
      }
    }
    stack.length = 0;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const touchesEdge = y0 <= 1 || y1 >= ys - 2;
    if (w < minD || w > maxD) continue;
    if (!touchesEdge && (h < w * 0.8 || h > w * 1.25)) continue;
    if (touchesEdge && h > w * 1.25) continue;
    // 沿圓周取樣：大多數點要落在有顏色的地方（文字不會這樣）
    const r = (w / 2) * step;
    const cx = (x0 + w / 2) * step;
    const cy = touchesEdge ? (y0 <= 1 ? (y1 + 1) * step - r : y0 * step + r) : (y0 + h / 2) * step;
    let hit = 0, tot = 0;
    for (let a = 0; a < 32; a++) {
      const t = (a / 32) * Math.PI * 2;
      const sy = cy + Math.sin(t) * r * 0.88;
      if (sy < 0 || sy >= H) continue;
      tot++;
      if ([0.78, 0.88, 0.96].some((k) => diff(p, cx + Math.cos(t) * r * k, cy + Math.sin(t) * r * k) > 45)) hit++;
    }
    if (tot < 12 || hit / tot < 0.85) continue;
    // 方框的字（面、回、國…）沿圓周取樣也會過：圓圈外接正方形的四個角是空的，方框字的角是滿的
    const corner = [[-1, -1], [1, -1], [-1, 1], [1, 1]].filter(([dx, dy]) => cy + dy * r * 0.92 >= 0 && cy + dy * r * 0.92 < H);
    if (corner.some(([dx, dy]) => diff(p, cx + dx * r * 0.92, cy + dy * r * 0.92) > 45)) continue;
    // 中間：空心＝還沒做；實心（或中間有點）＝已完成
    let inner = 0, innerTot = 0;
    for (let dy = -0.45; dy <= 0.45; dy += 0.15)
      for (let dx = -0.45; dx <= 0.45; dx += 0.15) {
        if (dx * dx + dy * dy > 0.2) continue;
        innerTot++;
        if (diff(p, cx + dx * r, cy + dy * r) > 45) inner++;
      }
    out.push({ cx, cy, r, done: inner / innerTot > 0.3, cut: touchesEdge });
  }
  // 提醒事項的圓圈大小都一樣：和中位數差太多的（例如方框字「面」）不算
  const med = out.map((c) => c.r).sort((a, b) => a - b)[out.length >> 1] ?? 0;
  return out.filter((c) => Math.abs(c.r - med) <= med * 0.2).sort((a, b) => a.cy - b.cy);
}

/** 這一列最右邊有沒有橘色旗子 */
function hasFlag(p: Px, y0: number, y1: number): boolean {
  let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(p.H, y1); y += 2)
    for (let x = Math.round(p.W * 0.84); x < p.W - 2; x += 2) {
      const k = (y * p.W + x) * 4;
      const r = p.d[k] / 255, g = p.d[k + 1] / 255, b = p.d[k + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx < 0.7 || mx - mn < 0.55 * mx) continue;
      let h = 0;
      if (mx === r) h = (60 * ((g - b) / (mx - mn)) + 360) % 360;
      else if (mx === g) h = 60 * ((b - r) / (mx - mn)) + 120;
      else h = 60 * ((r - g) / (mx - mn)) + 240;
      if (h >= 22 && h <= 42) n++;
    }
  return n >= 6;
}

/** 這一行字的「墨色」：文字像素和背景的平均差（灰字比較小） */
function inkOf(p: Px, b: TBox): number {
  const vals: number[] = [];
  for (let y = b.y0; y < b.y1; y += 2) for (let x = b.x0; x < b.x1; x += 2) vals.push(diff(p, x, y));
  vals.sort((a, c) => c - a);
  const top = vals.slice(0, Math.max(3, Math.round(vals.length * 0.08)));
  return top.reduce((s, v) => s + v, 0) / top.length;
}

/* ── 文字整理 ── */

const CJK = "\\u3000-\\u303f\\u3400-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef";
/** Tesseract 會在中文字中間插空白：中文字之間的空白拿掉，英文單字之間保留 */
function tidy(s: string): string {
  return s
    .replace(new RegExp(`([${CJK}])\\s+(?=[${CJK}])`, "g"), "$1")
    .replace(new RegExp(`([${CJK}])\\s+(?=[A-Za-z0-9])`, "g"), "$1")
    .replace(new RegExp(`([A-Za-z0-9])\\s+(?=[${CJK}])`, "g"), "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
    // 圓圈殘影（@、O、括號…）黏在中文前面
    .replace(new RegExp(`^[@©®OoQ0()（）〇○◯_|\\\\/\\-—~·•。,，:;'"“”]+\\s*(?=[${CJK}])`), "");
}

const UI_TEXT = /^(新增提醒事項|新提醒事項|提醒事項|列表|完成|編輯|搜尋|顯示|隱藏|清除|已完成|\d+\s*項已完成.*|.*已完成.*清除.*|[<＜‹]\s*\S*)$/;

const WEEK = "日一二三四五六";
/** 日期文字 → YYYY-MM-DD（今天、明天、10/18、2026/10/18、10月18日、週五…） */
export function parseDate(s: string, today: string): string | undefined {
  // OCR 常把「天」讀成「大／夭」
  const t = s.replace(/\s/g, "").replace(/([今明後昨])[大夭]/g, "$1天");
  const [Y, M, D] = today.split("-").map(Number);
  const base = new Date(Y, M - 1, D);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const add = (n: number) => iso(new Date(Y, M - 1, D + n));
  if (/今天/.test(t)) return add(0);
  if (/明天/.test(t)) return add(1);
  if (/後天/.test(t)) return add(2);
  if (/昨天/.test(t)) return add(-1);
  let m = t.match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
  if (m) return iso(new Date(+m[1], +m[2] - 1, +m[3]));
  m = t.match(/(?<!\d)(\d{1,2})[\/月](\d{1,2})(?!\d)/);
  if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) {
    // 沒寫年份：取離今天最近的那一年
    const cands = [Y - 1, Y, Y + 1].map((y) => new Date(y, +m![1] - 1, +m![2]));
    cands.sort((a, b) => Math.abs(+a - +base) - Math.abs(+b - +base));
    return iso(cands[0]);
  }
  m = t.match(/(?:週|星期|禮拜)([日一二三四五六天])/);
  if (m) {
    const w = m[1] === "天" ? 0 : WEEK.indexOf(m[1]);
    const n = (w - base.getDay() + 7) % 7;
    return add(n);
  }
  return undefined;
}
const DATE_RE = /[今明後昨][天大夭]|\d{1,4}[\/\-.年]\d{1,2}([\/\-.月]\d{1,2})?|(週|星期|禮拜)[日一二三四五六天]|(上午|下午)\s*\d{1,2}[:：]\d{2}|\d{1,2}[:：]\d{2}/;

/* ── 主程式：一張截圖 → 由上到下的列 ── */

export async function readReminderShot(file: Blob, today: string, onProgress?: (p: number) => void): Promise<Shot> {
  const { px, bmp } = await readPixels(file);
  const { W, H } = px;
  progressCb = onProgress ? (v) => onProgress(v * 0.3) : null;

  // 1) 整張讀一次：拿每一行的位置（寬度不到 1000 的截圖才放大到約 1200）
  const s1 = W < 1000 ? Math.min(2, 1200 / W) : 1;
  const k1 = 1 / s1;
  const lines1 = (await ocrLines(prep(bmp, px.bg, 0, 0, W, H, s1))).map((l) => ({
    text: l.text,
    bbox: { x0: l.bbox.x0 * k1, y0: l.bbox.y0 * k1, x1: l.bbox.x1 * k1, y1: l.bbox.y1 * k1 },
    words: l.words.map((w) => ({ text: w.text, bbox: { x0: w.bbox.x0 * k1, y0: w.bbox.y0 * k1, x1: w.bbox.x1 * k1, y1: w.bbox.y1 * k1 } })),
  }));

  // 2) 圓圈
  const circles = findCircles(px);
  const minCx = circles.length ? Math.min(...circles.map((c) => c.cx)) : W * 0.08;
  const r0 = circles.length ? circles.map((c) => c.r).sort((a, b) => a - b)[circles.length >> 1] : W * 0.028;

  // 3) 每一行：去掉壓在圓圈上的字（Tesseract 常把圓圈讀成 @、O），配對圓圈
  type L = { text: string; box: TBox; circle?: Circle; ink: number };
  const rows: L[] = [];
  for (const l of lines1) {
    const yc = (l.bbox.y0 + l.bbox.y1) / 2;
    const h = l.bbox.y1 - l.bbox.y0;
    const c = circles.find((c) => Math.abs(c.cy - yc) < Math.max(r0, h * 0.6) && c.cx + c.r < l.bbox.x1);
    // 最右邊 10% 是旗子、ⓘ 圖示，不是字
    const words = l.words.filter((w) => w.bbox.x0 < W * 0.9 && !circles.some((c) => Math.abs(c.cy - (w.bbox.y0 + w.bbox.y1) / 2) < c.r * 1.2 && w.bbox.x1 <= c.cx + c.r * 1.3));
    const text = tidy(words.map((w) => w.text).join(" "));
    if (!text) continue;
    const box = words.length ? { x0: Math.min(...words.map((w) => w.bbox.x0)), y0: l.bbox.y0, x1: Math.max(...words.map((w) => w.bbox.x1)), y1: l.bbox.y1 } : l.bbox;
    rows.push({ text, box, circle: c, ink: inkOf(px, box) });
  }
  rows.sort((a, b) => a.box.y0 - b.box.y0);

  // 任務名稱那一欄的左緣、標題的墨色（用來分辨灰色的備註）
  const taskRows = rows.filter((r) => r.circle);
  const textX0 = taskRows.length ? taskRows.map((r) => r.box.x0).sort((a, b) => a - b)[0] : minCx + r0 * 2.2;
  const titleInk = taskRows.length ? taskRows.map((r) => r.ink).sort((a, b) => a - b)[taskRows.length >> 1] : 200;
  const titleH = taskRows.length ? taskRows.map((r) => r.box.y1 - r.box.y0).sort((a, b) => a - b)[taskRows.length >> 1] : W * 0.04;
  const headerMaxX = (minCx - r0 + textX0) / 2 + r0 * 0.3;

  // 4) 逐行再讀一次（單行模式、字高 40px、從圓圈右邊開始裁），讀得到就以這次為準
  progressCb = null;
  const todo = rows.filter((r) => (r.box.y0 + r.box.y1) / 2 >= H * 0.06);
  for (let i = 0; i < todo.length; i++) {
    const r = todo[i];
    onProgress?.(0.3 + (0.68 * i) / todo.length);
    try {
      const h = Math.max(4, r.box.y1 - r.box.y0);
      const pad = Math.round(h * 0.35);
      const left = r.circle ? r.circle.cx + r.circle.r * 1.25 : r.box.x0 - pad;
      const sx = Math.max(0, Math.round(Math.max(left, r.box.x0 - pad)));
      const sy = Math.max(0, Math.round(r.box.y0 - pad));
      const sw = Math.min(Math.round(W * 0.9), Math.round(r.box.x1 + pad)) - sx;
      const sh = Math.min(H, Math.round(r.box.y1 + pad)) - sy;
      if (sw < 4 || sh < 4) continue;
      const t = tidy(await ocrOneLine(prep(bmp, px.bg, sx, sy, sw, sh, 40 / h)));
      if (t) r.text = t;
    } catch (e) {
      console.warn("逐行辨識失敗，用第一次的結果", e);
      break;
    }
  }
  onProgress?.(1);

  // 5) 由上到下組成清單
  let listTitle: string | undefined;
  const items: ShotItem[] = [];
  let cur: { it: ShotItem; box: TBox; lineBottom: number; textX: number; noteLines: number } | null = null;
  const firstTaskY = taskRows[0]?.box.y0 ?? H;
  const flush = () => {
    if (!cur) return;
    const { it, box, lineBottom } = cur;
    it.flagged = hasFlag(px, Math.round(box.y0 - titleH * 0.3), Math.round(box.y1 + titleH * 0.3));
    if (lineBottom >= H - 3) it.cut = true;
    items.push(it);
    cur = null;
  };

  for (const r of rows) {
    const yc = (r.box.y0 + r.box.y1) / 2;
    const h = r.box.y1 - r.box.y0;
    if (yc < H * 0.06) continue; // 狀態列（時間、電池）
    if (UI_TEXT.test(r.text)) continue;

    if (r.circle) {
      flush();
      const c = r.circle;
      cur = {
        it: { kind: "task", text: r.text, indent: c.cx - minCx > r0 * 1.2 ? 1 : 0, done: c.done, cut: c.cut || r.box.y0 <= 2 },
        box: { ...r.box },
        lineBottom: r.box.y1,
        textX: r.box.x0,
        noteLines: 0,
      };
      continue;
    }

    // 接在任務下面、同一欄：標題換行、或灰色的備註／日期
    if (cur && r.box.x0 >= cur.textX - W * 0.02 && r.box.y0 - cur.lineBottom < h * 1.3) {
      const isDate = DATE_RE.test(r.text) && r.text.length <= 24;
      if (isDate && !cur.it.dateText) {
        cur.it.dateText = r.text;
        cur.it.dateISO = parseDate(r.text, today);
      } else if (!cur.noteLines && !isDate && r.ink >= titleInk * 0.78 && !r.text.startsWith("#")) {
        cur.it.text = tidy(`${cur.it.text} ${r.text}`);
        cur.box.y1 = r.box.y1;
      } else {
        cur.it.note = cur.it.note ? `${cur.it.note}\n${r.text}` : r.text;
        cur.noteLines++;
      }
      cur.lineBottom = r.box.y1;
      continue;
    }

    // 沒有圓圈、靠左：第一個任務上面最大的字＝清單名稱，其他＝分組標題
    if (r.box.x0 <= headerMaxX) {
      flush();
      if (r.box.y1 <= firstTaskY && h >= titleH * 1.45 && !listTitle && !items.length) {
        listTitle = r.text;
        continue;
      }
      if (r.box.y0 <= 2 || r.box.y1 >= H - 3) continue;
      items.push({ kind: "section", text: r.text, indent: 0 });
      continue;
    }
    // 其他（截圖最上面接著上一張的備註、按鈕文字…）不要
  }
  flush();
  bmp.close();
  return { listTitle, items };
}
