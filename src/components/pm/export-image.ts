/* ══════════════════════════════════════════════════════════
   匯出圖片：清單、看板、甘特圖各畫一張（canvas）
   - 不是截圖：甘特圖整段日期、清單整份都畫進去，不受畫面大小、捲動限制
   - 字和顏色跟 APP 一樣；2 倍解析度（太大張會自動降一點，iPhone 的 canvas 有面積上限）
   ══════════════════════════════════════════════════════════ */

import { addDays, diffDays, toDay, WEEKDAYS } from "@/lib/project-ops";
import { STATUS_LABEL, type Task } from "@/lib/pm/model";
import { predecessorOf } from "@/lib/pm/deps";
import { md, peopleOf, spanText, type Outline, type OutRow } from "./export";

const FONT = '-apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Helvetica Neue", sans-serif';
const INK = "#18181B";
const INK2 = "#3F3F46";
const MUTED = "#71717A";
const FAINT = "#A1A1AA";
const LINE = "#ECECEE";
const BG = "#F7F7F8";
const GREEN = "#30A46C";
const RED = "#E5484D";
const TODO = "#71717A";

/** CSS 顏色（含 var(--accent)）轉成 canvas 看得懂的 rgb */
export function resolveColor(c: string | undefined, fallback = "#F39C12"): string {
  if (!c) return fallback;
  if (!c.includes("var(")) return c;
  const el = document.createElement("span");
  el.style.color = c;
  document.body.appendChild(el);
  const v = getComputedStyle(el).color;
  el.remove();
  return v || fallback;
}

type Ctx = CanvasRenderingContext2D;

const font = (size: number, weight = 400) => `${weight} ${size}px ${FONT}`;

function canvas(w: number, h: number): { c: HTMLCanvasElement; ctx: Ctx } {
  const s = Math.max(1, Math.min(2, Math.sqrt(15_000_000 / (w * h))));
  const c = document.createElement("canvas");
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  const ctx = c.getContext("2d")!;
  ctx.scale(s, s);
  ctx.textBaseline = "alphabetic";
  return { c, ctx };
}

const measurer = () => document.createElement("canvas").getContext("2d")!;

/** 依寬度斷行（中文一個字一個字算，英文單字盡量不拆） */
function wrap(ctx: Ctx, text: string, width: number, max = 4): string[] {
  const tokens = text.match(/[A-Za-z0-9@._%\-/]+|\s+|./gu) ?? [];
  const lines: string[] = [];
  let cur = "";
  for (const tk of tokens) {
    const next = cur + tk;
    if (ctx.measureText(next).width <= width || !cur) {
      cur = next;
      continue;
    }
    lines.push(cur.trimEnd());
    cur = tk.trimStart();
    if (lines.length === max) break;
  }
  if (lines.length < max && cur) lines.push(cur);
  if (lines.length === max && tokens.join("") !== lines.join("")) {
    let last = lines[max - 1];
    while (last && ctx.measureText(last + "…").width > width) last = last.slice(0, -1);
    lines[max - 1] = last + "…";
  }
  return lines.length ? lines : [""];
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function statusColor(t: Task, accent: string) {
  return t.status === "done" ? GREEN : t.status === "doing" ? accent : TODO;
}

/** 狀態圓圈：待辦＝空心、進行中＝扇形、完成＝綠底打勾 */
function statusDot(ctx: Ctx, cx: number, cy: number, r: number, t: Task, accent: string) {
  ctx.lineWidth = 1.6;
  if (t.status === "done") {
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.45, cy + r * 0.02);
    ctx.lineTo(cx - r * 0.1, cy + r * 0.38);
    ctx.lineTo(cx + r * 0.48, cy - r * 0.32);
    ctx.stroke();
    return;
  }
  ctx.strokeStyle = t.status === "doing" ? accent : "#C7C7CC";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  if (t.status === "doing") {
    const p = Math.max(0.12, Math.min(1, (t.progress || 0) / 100));
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    ctx.closePath();
    ctx.fill();
  }
}

/* ── 外框：和畫面上的甘特圖匯出同一套 ──
   淺灰底；左上專案名稱（專案色、粗體），右上拾壤 logo；內容；右下「匯出日期」 */

const PAD = 32;
const TITLE_H = 64;

/** 拾壤 logo（右上角）：畫之前先載好 */
export function loadLogo(src: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

function frameTop(ctx: Ctx, o: Outline, color: string, W: number, logo: HTMLImageElement | null) {
  ctx.fillStyle = "#FAFAFA";
  ctx.fillRect(0, 0, W, ctx.canvas.height);
  const m = measurer();
  m.font = font(28, 700);
  ctx.font = font(28, 700);
  ctx.fillStyle = color;
  ctx.fillText(wrap(m, o.name, W - PAD * 2 - 80, 1)[0], PAD + 4, PAD + 30);
  if (logo) {
    const h = 40;
    const w = (logo.naturalWidth / logo.naturalHeight || 64 / 58) * h;
    ctx.drawImage(logo, W - PAD - 4 - w, PAD, w, h);
  }
}

function frameDate(ctx: Ctx, o: Outline, W: number, y: number) {
  ctx.font = font(12);
  ctx.fillStyle = "#8E8E93";
  ctx.textAlign = "right";
  ctx.fillText(`${o.today.replace(/-/g, "/")} 匯出`, W - PAD - 4, y);
  ctx.textAlign = "left";
}

/* ── 清單：一張白色圓角卡（和甘特圖的表格同樣的外框），分組是灰底標題列 ── */

export function drawList(o: Outline, color: string, logo: HTMLImageElement | null): HTMLCanvasElement {
  const accent = resolveColor("var(--accent)");
  const W = 720;
  const CW = W - PAD * 2;
  const m = measurer();
  type Item = { h: number; draw: (ctx: Ctx, x: number, y: number) => void };
  const items: Item[] = [];
  for (const g of o.groups) {
    if (g.name) {
      const n = g.rows.length;
      items.push({
        h: 44,
        draw: (ctx, x, y) => {
          ctx.fillStyle = "#F7F7F8";
          ctx.fillRect(x, y, CW, 44);
          ctx.font = font(15, 700);
          ctx.fillStyle = INK;
          ctx.fillText(g.name, x + 16, y + 28);
          ctx.font = font(13);
          ctx.fillStyle = FAINT;
          ctx.textAlign = "right";
          ctx.fillText(`${n} 項`, x + CW - 16, y + 28);
          ctx.textAlign = "left";
        },
      });
    }
    for (const r of g.rows) {
      const t = r.task;
      const indent = r.depth ? 30 : 0;
      const tw = CW - 16 - indent - 34 - 16;
      m.font = font(16, 500);
      const title = wrap(m, `${t.meta?.urgent ? "‼ " : ""}${t.title || "（未命名）"}`, tw, 2);
      const people = peopleOf(o.pm, t);
      const info = [spanText(t), ...(people.length ? [people.join("、")] : []), ...(t.meta?.vendor ? [t.meta.vendor] : []), ...(t.status === "doing" && t.progress ? [`${t.progress}%`] : [])].join("・");
      m.font = font(13);
      const infoLine = wrap(m, info, tw, 1)[0];
      const h = 14 + title.length * 22 + 20 + 12;
      items.push({
        h,
        draw: (ctx, x, y) => {
          const cx = x + 16 + indent + 11;
          statusDot(ctx, cx, y + 14 + 11, 10, t, accent);
          const tx = x + 16 + indent + 34;
          ctx.font = font(16, 500);
          ctx.fillStyle = t.status === "done" ? FAINT : INK;
          title.forEach((l, k) => ctx.fillText(l, tx, y + 14 + 16 + k * 22));
          ctx.font = font(13);
          const late = t.status !== "done" && !!t.due && t.due < o.today && t.kind !== "等待";
          ctx.fillStyle = late ? RED : MUTED;
          ctx.fillText(infoLine, tx, y + 14 + title.length * 22 + 14);
          if (t.flagged) {
            ctx.font = font(15, 700);
            ctx.fillStyle = accent;
            ctx.textAlign = "right";
            ctx.fillText("⚑", x + CW - 16, y + 14 + 16);
            ctx.textAlign = "left";
          }
        },
      });
    }
  }
  const body = items.reduce((n, it) => n + it.h, 0) || 80;
  const top = PAD + TITLE_H;
  const H = top + body + 2 + 40 + PAD - 8;
  const { c, ctx } = canvas(W, H);
  frameTop(ctx, o, color, W, logo);
  // 卡片：白底、圓角、細外框，裡面每列之間一條分隔線
  ctx.save();
  rr(ctx, PAD, top, CW, body + 2, 14);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.clip();
  let y = top + 1;
  if (!items.length) {
    ctx.font = font(14);
    ctx.fillStyle = FAINT;
    ctx.fillText("沒有任務", PAD + 16, y + 46);
  }
  items.forEach((it, k) => {
    it.draw(ctx, PAD, y);
    y += it.h;
    if (k < items.length - 1) {
      ctx.fillStyle = "#F0F0F2";
      ctx.fillRect(PAD, y - 0.5, CW, 1);
    }
  });
  ctx.restore();
  ctx.strokeStyle = "#EBEBED";
  ctx.lineWidth = 1;
  rr(ctx, PAD + 0.5, top + 0.5, CW - 1, body + 1, 14);
  ctx.stroke();
  frameDate(ctx, o, W, top + body + 2 + 24);
  return c;
}

/* ── 看板：三欄（和畫面上一樣的灰色欄、白色卡片） ── */

export function drawBoard(o: Outline, color: string, logo: HTMLImageElement | null): HTMLCanvasElement {
  const accent = resolveColor("var(--accent)");
  const COL = 300;
  const GAP = 14;
  const W = PAD * 2 + COL * 3 + GAP * 2;
  const m = measurer();
  const top = PAD + TITLE_H;
  const cols = (["todo", "doing", "done"] as const).map((s) => {
    const cards = o.rows
      .filter((r) => r.task.status === s)
      .map((r) => {
        const t = r.task;
        m.font = font(16, 500);
        const title = wrap(m, t.title || "（未命名）", COL - 24 - 28, 3);
        const people = peopleOf(o.pm, t);
        m.font = font(13);
        const ppl = people.length ? wrap(m, people.join("、"), COL - 24 - 28, 1) : [];
        const h = 14 + title.length * 22 + (t.status === "doing" ? 14 : 0) + 24 + ppl.length * 19 + 12;
        return { t, title, ppl, h };
      });
    const h = 56 + cards.reduce((n, c) => n + c.h + 10, 0) + (cards.length ? 4 : 44);
    return { s, cards, h };
  });
  const bodyH = Math.max(...cols.map((c) => c.h));
  const H = top + bodyH + 40 + PAD - 8;
  const { c, ctx } = canvas(W, H);
  frameTop(ctx, o, color, W, logo);
  cols.forEach((col, i) => {
    const x = PAD + i * (COL + GAP);
    ctx.fillStyle = "#F0F0F2";
    rr(ctx, x, top, COL, bodyH, 18);
    ctx.fill();
    statusDot(ctx, x + 26, top + 28, 10, { status: col.s, progress: 50 } as Task, accent);
    ctx.font = font(17, 700);
    ctx.fillStyle = INK;
    ctx.fillText(STATUS_LABEL[col.s], x + 46, top + 34);
    const lw = ctx.measureText(STATUS_LABEL[col.s]).width;
    ctx.font = font(15);
    ctx.fillStyle = FAINT;
    ctx.fillText(String(col.cards.length), x + 46 + lw + 8, top + 34);
    let y = top + 56;
    if (!col.cards.length) {
      ctx.font = font(14);
      ctx.fillStyle = FAINT;
      ctx.textAlign = "center";
      ctx.fillText("（無）", x + COL / 2, y + 22);
      ctx.textAlign = "left";
    }
    for (const card of col.cards) {
      const t = card.t;
      const cx = x + 12;
      const cw = COL - 24;
      ctx.fillStyle = "#FFFFFF";
      rr(ctx, cx, y, cw, card.h, 14);
      ctx.fill();
      ctx.strokeStyle = "#E8E8EB";
      ctx.lineWidth = 1;
      rr(ctx, cx + 0.5, y + 0.5, cw - 1, card.h - 1, 14);
      ctx.stroke();
      let yy = y + 14;
      ctx.font = font(16, 500);
      ctx.fillStyle = t.status === "done" ? FAINT : INK;
      card.title.forEach((l) => {
        yy += 22;
        ctx.fillText(l, cx + 14, yy - 6);
      });
      if (t.status === "doing") {
        yy += 4;
        ctx.fillStyle = "#EEEEF0";
        rr(ctx, cx + 14, yy, cw - 28, 5, 3);
        ctx.fill();
        ctx.fillStyle = accent;
        rr(ctx, cx + 14, yy, Math.max(5, ((cw - 28) * (t.progress || 0)) / 100), 5, 3);
        ctx.fill();
        yy += 10;
      }
      ctx.font = font(13);
      const late = t.status !== "done" && !!t.due && t.due < o.today;
      ctx.fillStyle = late ? RED : MUTED;
      ctx.fillText(spanText(t), cx + 14, yy + 18);
      yy += 24;
      ctx.fillStyle = MUTED;
      card.ppl.forEach((l) => {
        yy += 19;
        ctx.fillText(l, cx + 14, yy - 4);
      });
      y += card.h + 10;
    }
  });
  frameDate(ctx, o, W, top + bodyH + 24);
  return c;
}

export function toPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error("圖片產生失敗"))), "image/png"));
}
