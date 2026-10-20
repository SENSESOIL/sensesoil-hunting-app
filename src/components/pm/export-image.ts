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

function headerBlock(ctx: Ctx | null, o: Outline, x: number, y: number, width: number, color: string, kind: string): number {
  const m = ctx ?? measurer();
  const done = o.rows.filter((r) => r.task.status === "done").length;
  const sub = [
    o.start || o.due ? `預定工期 ${o.start ? md(o.start) : "—"} → ${o.due ? md(o.due) : "—"}` : "",
    `共 ${o.rows.length} 項・完成 ${done} 項`,
  ]
    .filter(Boolean)
    .join("　");
  m.font = font(30, 700);
  const titleLines = wrap(m, o.name, width - 120, 2);
  if (ctx) {
    ctx.font = font(13, 600);
    ctx.fillStyle = FAINT;
    ctx.fillText(`${o.code}・${kind}`, x, y + 16);
    ctx.font = font(30, 700);
    ctx.fillStyle = color;
    titleLines.forEach((l, i) => ctx.fillText(l, x, y + 54 + i * 38));
    ctx.font = font(14);
    ctx.fillStyle = MUTED;
    ctx.fillText(sub, x, y + 54 + (titleLines.length - 1) * 38 + 30);
    ctx.textAlign = "right";
    ctx.font = font(12);
    ctx.fillStyle = FAINT;
    ctx.fillText(`${o.today.replace(/-/g, "/")} 匯出`, x + width, y + 16);
    ctx.textAlign = "left";
  }
  return y + 54 + (titleLines.length - 1) * 38 + 52;
}

function footer(ctx: Ctx, x: number, y: number) {
  ctx.font = font(12);
  ctx.fillStyle = FAINT;
  ctx.fillText("拾壤・任務追蹤", x, y);
}

/* ── 清單 ── */

export function drawList(o: Outline, color: string): HTMLCanvasElement {
  const accent = resolveColor("var(--accent)");
  const W = 640;
  const PAD = 36;
  const inner = W - PAD * 2;
  type Op = (ctx: Ctx, y: number) => void;
  const ops: { y: number; h: number; draw: Op }[] = [];
  const m = measurer();
  let y = headerBlock(null, o, PAD, PAD, inner, color, "任務清單");

  for (const g of o.groups) {
    if (g.name) {
      y += 14;
      const gy = y;
      const n = g.rows.length;
      ops.push({
        y: gy,
        h: 40,
        draw: (ctx) => {
          ctx.font = font(21, 700);
          ctx.fillStyle = INK;
          ctx.fillText(g.name, PAD, gy + 26);
          const w = ctx.measureText(g.name).width;
          ctx.font = font(14);
          ctx.fillStyle = FAINT;
          ctx.fillText(`${n} 項`, PAD + w + 10, gy + 26);
        },
      });
      y += 40;
    }
    g.rows.forEach((r, i) => {
      const t = r.task;
      const indent = r.depth ? 30 : 0;
      const tx = PAD + indent + 34;
      const tw = W - PAD - tx;
      m.font = font(17, 500);
      const title = wrap(m, `${t.meta?.urgent ? "‼ " : ""}${t.title || "（未命名）"}`, tw, 3);
      const info = [spanText(t), ...(peopleOf(o.pm, t).length ? [peopleOf(o.pm, t).join("、")] : []), ...(t.meta?.vendor ? [`廠商 ${t.meta.vendor}`] : []), ...(t.status === "doing" && t.progress ? [`${t.progress}%`] : [])].join("・");
      m.font = font(14);
      const infoLines = wrap(m, info, tw, 2);
      const pred = predecessorOf(o.pm.tasks, t);
      const extra = [
        ...(pred ? [`接在「${pred.title}」之後`] : []),
        ...(t.note?.trim() ? [`備註：${t.note.trim().replace(/\s*\n\s*/g, " / ")}`] : []),
      ];
      const extraLines = extra.flatMap((e) => wrap(m, e, tw, 2));
      const h = 14 + title.length * 24 + infoLines.length * 20 + extraLines.length * 20 + 12;
      const ry = y;
      const last = i === g.rows.length - 1;
      ops.push({
        y: ry,
        h,
        draw: (ctx) => {
          statusDot(ctx, PAD + indent + 11, ry + 14 + 13, 10, t, accent);
          ctx.font = font(17, 500);
          ctx.fillStyle = t.status === "done" ? FAINT : INK;
          title.forEach((l, k) => ctx.fillText(l, tx, ry + 14 + 18 + k * 24));
          if (t.flagged) {
            ctx.fillStyle = accent;
            ctx.font = font(15, 700);
            ctx.textAlign = "right";
            ctx.fillText("⚑", W - PAD, ry + 14 + 18);
            ctx.textAlign = "left";
          }
          let yy = ry + 14 + title.length * 24;
          ctx.font = font(14);
          const late = t.status !== "done" && !!t.due && t.due < o.today && t.kind !== "等待";
          ctx.fillStyle = late ? RED : MUTED;
          infoLines.forEach((l) => {
            yy += 20;
            ctx.fillText(l, tx, yy - 4);
          });
          ctx.fillStyle = FAINT;
          extraLines.forEach((l) => {
            yy += 20;
            ctx.fillText(l, tx, yy - 4);
          });
          if (!last) {
            ctx.fillStyle = LINE;
            ctx.fillRect(tx, ry + h - 0.5, W - PAD - tx, 1);
          }
        },
      });
      y += h;
    });
  }
  y += 28;
  const H = y + 24;
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  headerBlock(ctx, o, PAD, PAD, inner, color, "任務清單");
  for (const op of ops) op.draw(ctx, op.y);
  footer(ctx, PAD, H - 20);
  return c;
}

/* ── 看板 ── */

export function drawBoard(o: Outline, color: string): HTMLCanvasElement {
  const accent = resolveColor("var(--accent)");
  const PAD = 32;
  const COL = 300;
  const GAP = 16;
  const W = PAD * 2 + COL * 3 + GAP * 2;
  const m = measurer();
  const top = headerBlock(null, o, PAD, PAD, W - PAD * 2, color, "看板");
  const cols = (["todo", "doing", "done"] as const).map((s) => {
    const rows = o.rows.filter((r) => r.task.status === s);
    const cards = rows.map((r) => {
      const t = r.task;
      m.font = font(16, 500);
      const title = wrap(m, t.title || "（未命名）", COL - 24 - 28, 3);
      const people = peopleOf(o.pm, t);
      m.font = font(13);
      const ppl = people.length ? wrap(m, people.join("、"), COL - 24 - 28, 1) : [];
      const h = 16 + title.length * 22 + 8 + (t.status === "doing" ? 14 : 0) + 20 + ppl.length * 19 + 14;
      return { r, title, ppl, h };
    });
    const h = 56 + cards.reduce((n, c) => n + c.h + 10, 0) + (cards.length ? 6 : 44);
    return { s, cards, h };
  });
  const H = top + 8 + Math.max(...cols.map((c) => c.h)) + 56;
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  headerBlock(ctx, o, PAD, PAD, W - PAD * 2, color, "看板");
  cols.forEach((col, i) => {
    const x = PAD + i * (COL + GAP);
    const y0 = top + 8;
    ctx.fillStyle = "#F2F2F4";
    rr(ctx, x, y0, COL, col.h, 18);
    ctx.fill();
    const dotColor = col.s === "done" ? GREEN : col.s === "doing" ? accent : TODO;
    statusDot(ctx, x + 26, y0 + 28, 10, { status: col.s, progress: 50 } as Task, accent);
    ctx.font = font(17, 700);
    ctx.fillStyle = INK;
    ctx.fillText(STATUS_LABEL[col.s], x + 46, y0 + 34);
    const lw = ctx.measureText(STATUS_LABEL[col.s]).width;
    ctx.font = font(15);
    ctx.fillStyle = FAINT;
    ctx.fillText(String(col.cards.length), x + 46 + lw + 8, y0 + 34);
    let y = y0 + 56;
    if (!col.cards.length) {
      ctx.font = font(14);
      ctx.fillStyle = FAINT;
      ctx.textAlign = "center";
      ctx.fillText("（無）", x + COL / 2, y + 22);
      ctx.textAlign = "left";
    }
    for (const card of col.cards) {
      const t = card.r.task;
      const cx = x + 12;
      const cw = COL - 24;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.06)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = "#FFFFFF";
      rr(ctx, cx, y, cw, card.h, 14);
      ctx.fill();
      ctx.restore();
      let yy = y + 16;
      ctx.font = font(16, 500);
      ctx.fillStyle = INK;
      card.title.forEach((l) => {
        yy += 22;
        ctx.fillText(l, cx + 14, yy - 5);
      });
      if (t.status === "doing") {
        yy += 6;
        ctx.fillStyle = "#EEEEF0";
        rr(ctx, cx + 14, yy, cw - 28, 5, 3);
        ctx.fill();
        ctx.fillStyle = dotColor;
        rr(ctx, cx + 14, yy, Math.max(5, ((cw - 28) * (t.progress || 0)) / 100), 5, 3);
        ctx.fill();
        yy += 8;
      }
      yy += 8;
      ctx.font = font(13);
      const late = t.status !== "done" && !!t.due && t.due < o.today;
      ctx.fillStyle = late ? RED : MUTED;
      ctx.fillText(spanText(t), cx + 14, yy + 12);
      yy += 20;
      ctx.fillStyle = MUTED;
      card.ppl.forEach((l) => {
        yy += 19;
        ctx.fillText(l, cx + 14, yy - 6);
      });
      y += card.h + 10;
    }
  });
  footer(ctx, PAD, H - 20);
  return c;
}

/* ── 甘特圖 ── */

export function drawGantt(o: Outline, color: string): HTMLCanvasElement {
  const accent = resolveColor("var(--accent)");
  const PAD = 28;
  const LABEL = 230;
  const ROW = 40;
  const BAR = 14;
  const HEAD = 46;
  const m = measurer();

  // 列：分組標題＋任務（和畫面上的甘特圖同一個順序）
  type GRow = { kind: "group"; name: string; rows: OutRow[] } | { kind: "task"; r: OutRow };
  const rows: GRow[] = [];
  for (const g of o.groups) {
    if (g.name) rows.push({ kind: "group", name: g.name, rows: g.rows });
    for (const r of g.rows) rows.push({ kind: "task", r });
  }
  const span = (rs: OutRow[]) => {
    const s = rs.map((r) => r.task.start ?? r.task.due).filter(Boolean).sort() as string[];
    const e = rs.map((r) => r.task.due ?? r.task.start).filter(Boolean).sort() as string[];
    return s.length ? { s: s[0], e: e[e.length - 1] } : null;
  };
  const all = span(o.rows);
  let from = all?.s ?? o.today;
  let to = all?.e ?? addDays(o.today, 14);
  for (const d of [o.start, o.due]) {
    if (!d) continue;
    if (d < from) from = d;
    if (d > to) to = d;
  }
  if (o.today >= addDays(from, -7) && o.today < from) from = o.today;
  if (o.today <= addDays(to, 7) && o.today > to) to = o.today;
  from = addDays(from, -1);
  to = addDays(to, 2);
  const days = diffDays(from, to) + 1;
  const DW = days <= 31 ? 30 : days <= 62 ? 20 : days <= 120 ? 12 : days <= 240 ? 7 : 4;
  const W = PAD * 2 + LABEL + days * DW;
  const top = headerBlock(null, o, PAD, PAD, Math.max(420, W - PAD * 2), color, "甘特圖");
  const gy = top + 6;
  const bodyY = gy + HEAD;
  const H = bodyY + rows.length * ROW + 64;
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  headerBlock(ctx, o, PAD, PAD, Math.max(420, W - PAD * 2), color, "甘特圖");

  const X0 = PAD + LABEL;
  const x = (iso: string) => X0 + diffDays(from, iso) * DW;

  // 底：週末、月份／週刻度、日期
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    const wd = toDay(d).getDay();
    if (wd === 0 || wd === 6) {
      ctx.fillStyle = "#FAFAFB";
      ctx.fillRect(X0 + i * DW, gy, DW, HEAD + rows.length * ROW);
    }
  }
  ctx.font = font(12, 600);
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    const day = toDay(d);
    const xx = X0 + i * DW;
    const newMonth = day.getDate() === 1 || i === 0;
    const monday = day.getDay() === 1;
    if (newMonth) {
      ctx.fillStyle = INK2;
      ctx.font = font(12, 700);
      ctx.fillText(`${day.getMonth() + 1}月`, xx + 3, gy + 16);
    }
    if (DW >= 20) {
      ctx.font = font(11, d === o.today ? 700 : 400);
      ctx.fillStyle = d === o.today ? INK : MUTED;
      ctx.textAlign = "center";
      ctx.fillText(String(day.getDate()), xx + DW / 2, gy + 32);
      ctx.fillStyle = FAINT;
      ctx.font = font(10);
      ctx.fillText(WEEKDAYS[day.getDay()], xx + DW / 2, gy + 43);
      ctx.textAlign = "left";
    } else if (monday && DW >= 7) {
      ctx.font = font(11);
      ctx.fillStyle = MUTED;
      ctx.fillText(String(day.getDate()), xx + 2, gy + 36);
    }
    if (monday || newMonth) {
      ctx.fillStyle = newMonth ? "#E4E4E7" : "#F0F0F2";
      ctx.fillRect(xx, gy + (newMonth ? 0 : 22), 1, HEAD - (newMonth ? 0 : 22) + rows.length * ROW);
    }
  }
  ctx.fillStyle = LINE;
  ctx.fillRect(PAD, bodyY - 1, W - PAD * 2, 1);

  // 列
  const rowIndex = new Map<string, number>();
  rows.forEach((row, i) => {
    const y = bodyY + i * ROW;
    if (row.kind === "group") {
      ctx.fillStyle = BG;
      ctx.fillRect(PAD, y, LABEL, ROW);
      ctx.font = font(14, 700);
      ctx.fillStyle = INK;
      m.font = font(14, 700);
      ctx.fillText(wrap(m, row.name, LABEL - 70, 1)[0], PAD + 10, y + 25);
      ctx.font = font(12);
      ctx.fillStyle = FAINT;
      ctx.textAlign = "right";
      ctx.fillText(`${row.rows.length} 項`, PAD + LABEL - 10, y + 25);
      ctx.textAlign = "left";
      const sp = span(row.rows);
      if (sp) {
        const done = Math.round(row.rows.reduce((n, r) => n + (r.task.status === "done" ? 100 : r.task.progress), 0) / row.rows.length);
        const bx = x(sp.s);
        const bw = (diffDays(sp.s, sp.e) + 1) * DW;
        ctx.fillStyle = "#E4E4E7";
        rr(ctx, bx, y + (ROW - 10) / 2, bw, 10, 3);
        ctx.fill();
        if (done > 0) {
          ctx.fillStyle = "#3F3F46";
          rr(ctx, bx, y + (ROW - 10) / 2, Math.max(4, (bw * done) / 100), 10, 3);
          ctx.fill();
        }
      }
    } else {
      const t = row.r.task;
      rowIndex.set(t.id, i);
      const lx = PAD + 10 + (row.r.depth ? 14 : 0);
      m.font = font(13, 600);
      ctx.font = font(13, 600);
      ctx.fillStyle = t.status === "done" ? FAINT : INK;
      ctx.fillText(wrap(m, `${row.r.wbs}  ${t.title || "（未命名）"}`, LABEL - 20 - (row.r.depth ? 14 : 0), 1)[0], lx, y + 18);
      const people = peopleOf(o.pm, t);
      ctx.font = font(11);
      ctx.fillStyle = MUTED;
      m.font = font(11);
      ctx.fillText(wrap(m, people.length ? people.join("、") : "未指派", LABEL - 20, 1)[0], lx, y + 33);
      const s = t.start ?? t.due;
      const e = t.due ?? t.start;
      if (s && e) {
        const bx = x(s);
        const bw = Math.max(DW, (diffDays(s, e < s ? s : e) + 1) * DW);
        const by = y + (ROW - BAR) / 2;
        const fill = statusColor(t, accent);
        if (t.kind === "等待") {
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = FAINT;
          ctx.lineWidth = 1.5;
          rr(ctx, bx + 0.75, by + 0.75, bw - 1.5, BAR - 1.5, 4);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.fillStyle = "#F0F0F2";
          rr(ctx, bx, by, bw, BAR, 4);
          ctx.fill();
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = fill;
          rr(ctx, bx, by, bw, BAR, 4);
          ctx.fill();
          ctx.globalAlpha = 1;
          const pct = t.status === "done" ? 100 : t.progress;
          if (pct > 0) {
            ctx.save();
            rr(ctx, bx, by, bw, BAR, 4);
            ctx.clip();
            ctx.fillStyle = fill;
            ctx.fillRect(bx, by, (bw * pct) / 100, BAR);
            ctx.restore();
          }
        }
        // 逾期：紅色細框＋延伸到今天
        const late = t.status !== "done" && e < o.today && t.kind !== "等待";
        if (late) {
          ctx.fillStyle = "rgba(229,72,77,0.16)";
          ctx.fillRect(bx + bw, by, x(o.today) + DW - (bx + bw), BAR);
        }
        ctx.font = font(11);
        ctx.fillStyle = late ? RED : MUTED;
        const tail = t.status === "done" ? "" : late ? "逾期" : t.progress > 0 ? `${t.progress}%` : "";
        if (tail) ctx.fillText(tail, Math.max(bx + bw, late ? x(o.today) + DW : 0) + 6, by + 11);
      } else {
        ctx.font = font(11);
        ctx.fillStyle = FAINT;
        ctx.fillText("未排程", X0 + 6, y + 25);
      }
    }
    ctx.fillStyle = "#F4F4F5";
    ctx.fillRect(PAD, y + ROW - 1, W - PAD * 2, 1);
  });
  ctx.fillStyle = LINE;
  ctx.fillRect(X0 - 1, gy, 1, HEAD + rows.length * ROW);

  // 前置任務：折線箭頭
  ctx.strokeStyle = FAINT;
  ctx.fillStyle = FAINT;
  ctx.lineWidth = 1.2;
  for (const row of rows) {
    if (row.kind !== "task") continue;
    const t = row.r.task;
    const p = predecessorOf(o.pm.tasks, t);
    if (!p || !rowIndex.has(p.id)) continue;
    const ps = p.start ?? p.due;
    const pe = p.due ?? p.start;
    const s = t.start ?? t.due;
    if (!ps || !pe || !s) continue;
    const i = rowIndex.get(p.id)!;
    const j = rowIndex.get(t.id)!;
    const x1 = x(pe) + DW;
    const y1 = bodyY + i * ROW + ROW / 2;
    const x2 = x(s);
    const y2 = bodyY + j * ROW + ROW / 2;
    const down = j > i ? 1 : -1;
    ctx.beginPath();
    if (x1 + 6 <= x2 - 6) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 + 6, y1);
      ctx.lineTo(x1 + 6, y2);
      ctx.lineTo(x2 - 1, y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2 - 5, y2 - 3.5);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2 - 5, y2 + 3.5);
      ctx.fill();
    } else {
      const vx = Math.max(x(ps) + 2, Math.min(x1, x2 + 3));
      const tip = y2 - (down * BAR) / 2 - down;
      ctx.moveTo(vx, y1 + (down * BAR) / 2);
      ctx.lineTo(vx, tip - down * 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(vx - 3.5, tip - down * 5);
      ctx.lineTo(vx, tip);
      ctx.lineTo(vx + 3.5, tip - down * 5);
      ctx.fill();
    }
  }

  // 今天、預計完工
  const vline = (d: string, c: string, dashed: boolean, end: boolean) => {
    if (d < from || d > to) return;
    const xx = x(d) + (end ? DW : DW / 2);
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dashed ? [5, 4] : []);
    ctx.beginPath();
    ctx.moveTo(xx, gy + HEAD - 4);
    ctx.lineTo(xx, bodyY + rows.length * ROW);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  if (o.due) vline(o.due, accent, true, true);
  vline(o.today, accent, false, false);
  if (o.today >= from && o.today <= to) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x(o.today) + DW / 2, gy + HEAD - 4, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 圖例
  const ly = bodyY + rows.length * ROW + 30;
  let lx = PAD;
  ctx.font = font(12);
  for (const [label, c2] of [
    ["待辦", TODO],
    ["進行中", accent],
    ["完成", GREEN],
  ] as [string, string][]) {
    ctx.fillStyle = c2;
    rr(ctx, lx, ly - 10, 12, 12, 3);
    ctx.fill();
    ctx.fillStyle = MUTED;
    ctx.fillText(label, lx + 18, ly);
    lx += 18 + ctx.measureText(label).width + 18;
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(lx + 6, ly - 12);
  ctx.lineTo(lx + 6, ly + 2);
  ctx.stroke();
  ctx.fillStyle = MUTED;
  ctx.fillText("今天", lx + 14, ly);
  lx += 14 + ctx.measureText("今天").width + 18;
  if (o.due) {
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(lx + 6, ly - 12);
    ctx.lineTo(lx + 6, ly + 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(`預計完工 ${md(o.due)}`, lx + 14, ly);
  }
  footer(ctx, PAD, H - 12);
  return c;
}

export function toPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error("圖片產生失敗"))), "image/png"));
}
