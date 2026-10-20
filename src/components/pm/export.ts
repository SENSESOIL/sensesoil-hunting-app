/* ══════════════════════════════════════════════════════════
   匯出（專案頁的清單／看板／甘特圖，標題列搜尋左邊那顆）
   - 文字：貼到 LINE、Email 也看得懂（有編號、分組、縮排、日期、負責人）
   - 試算表 .csv：Excel、Google 試算表、Smartsheet、Asana 都能匯入（UTF-8 加 BOM，Excel 才不會亂碼）
   - Microsoft Project .xml（MSPDI）：MS Project、ProjectLibre、GanttProject、OmniPlan 都能開；
     有分組（摘要任務）、子任務、前置任務（完成→開始）、負責人（資源）、完成度
   - 行事曆 .ics：有日期的任務變成整天的行程，Google／Apple 行事曆都能加入
   - 圖片 .png：自己用 canvas 畫（甘特圖整段日期都畫出來，不受畫面捲動限制）
   全部在手機上產生，不經過伺服器
   ══════════════════════════════════════════════════════════ */

import { addDays, diffDays, toDay, WEEKDAYS } from "@/lib/project-ops";
import { STATUS_LABEL, taskAssignees, type Task } from "@/lib/pm/model";
import { metaChips } from "@/lib/pm/tags";
import { predecessorOf } from "@/lib/pm/deps";
import { realSections, splitBySection, treeOrder } from "./tree";
import type { Pm } from "./usePm";

export type ExportView = "list" | "board" | "gantt";

export interface OutRow {
  task: Task;
  depth: 0 | 1;
  /** 編號：1、1.2、1.2.1 */
  wbs: string;
  /** 分組名稱（沒分組＝空字串） */
  section: string;
  /** MS Project 用的流水號 */
  uid: number;
  /** 底下有子任務 */
  parent: boolean;
}
export interface OutGroup {
  name: string;
  wbs?: string;
  uid?: number;
  rows: OutRow[];
}
export interface Outline {
  code: string;
  name: string;
  start?: string;
  due?: string;
  today: string;
  groups: OutGroup[];
  rows: OutRow[];
  byId: Map<string, OutRow>;
  pm: Pm;
}

/* ── 共用：日期、人、標籤 ── */

export const md = (iso: string) => {
  const d = toDay(iso);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
};
const ymd = (iso: string) => iso.replace(/-/g, "/");
const daysOf = (t: Task) => (t.start && t.due ? diffDays(t.start, t.due) + 1 : t.start || t.due ? 1 : 0);

/** 日期：10/21（三）→ 10/23（五）・3 天；只有一天就一個日期 */
export function spanText(t: Task): string {
  if (t.start && t.due && t.start !== t.due) return `${md(t.start)} → ${md(t.due)}・${daysOf(t)} 天`;
  const d = t.due ?? t.start;
  return d ? md(d) : "未排程";
}

export function peopleOf(pm: Pm, t: Task): string[] {
  return taskAssignees(t).map((e) => pm.personBy.get(e)?.name ?? (e === t.assigneeEmail ? t.assigneeName : undefined) ?? e.split("@")[0]);
}

/** 清單上看得到的標籤（工種、工項、還沒處理的狀態、自訂），廠商另外列 */
function tagsOf(t: Task): string[] {
  return metaChips(t.meta)
    .map((c) => c.text)
    .filter((x) => x !== t.meta?.vendor);
}

/* ── 大綱：照清單的順序（分組 → 任務 → 子任務），每列有編號 ── */

export function buildOutline(pm: Pm, code: string, tasks: Task[]): Outline {
  const proj = pm.projectBy.get(code);
  const all = new Map(pm.tasks.map((t) => [t.id, t]));
  const secs = proj?.sections ?? [];
  const parts = realSections(secs).length
    ? splitBySection(tasks, secs, all).filter((g) => g.tasks.length)
    : [{ id: "", name: "", tasks }];
  let n = 0;
  let uid = 0;
  const groups: OutGroup[] = [];
  const rows: OutRow[] = [];
  for (const g of parts) {
    const named = !!g.name;
    const group: OutGroup = { name: g.name, rows: [] };
    if (named) {
      n++;
      group.wbs = String(n);
      group.uid = ++uid;
    }
    let k = 0;
    let parentW = "";
    let child = 0;
    for (const r of treeOrder(g.tasks)) {
      let w: string;
      if (r.depth === 0) {
        if (named) w = `${group.wbs}.${++k}`;
        else w = String(++n);
        parentW = w;
        child = 0;
      } else w = `${parentW}.${++child}`;
      const row: OutRow = { task: r.task, depth: r.depth, wbs: w, section: g.name, uid: ++uid, parent: r.childCount > 0 };
      group.rows.push(row);
      rows.push(row);
    }
    groups.push(group);
  }
  return {
    code,
    name: proj?.name ?? code,
    start: proj?.startAt,
    due: proj?.dueAt,
    today: pm.today,
    groups,
    rows,
    byId: new Map(rows.map((r) => [r.task.id, r])),
    pm,
  };
}

function header(o: Outline, kind: string): string[] {
  const done = o.rows.filter((r) => r.task.status === "done").length;
  const lines = [`${o.name}（${o.code}）${kind}`];
  if (o.start || o.due) lines.push(`預定工期 ${o.start ? md(o.start) : "—"} → ${o.due ? md(o.due) : "—"}`);
  lines.push(`${ymd(o.today)} 匯出・共 ${o.rows.length} 項，完成 ${done} 項`);
  return lines;
}

/* ── 文字 ── */

/**
 * 一個任務一段，每種資料自己一行（手機上看才不會擠成一長串）：
 *   ○ 任務名稱（完成＝●，兩個同一套字型裡的圓，一樣大）
 *     日期（進行中的完成度、逾期接在後面）
 *     負責人
 *     廠商
 *     標籤
 *     接在「前一個任務」之後
 *     備註
 */
function taskBlock(o: Outline, t: Task, pad = ""): string[] {
  const ind = `${pad}    `;
  const flags = `${t.meta?.urgent ? "‼" : ""}${t.flagged ? "⚑" : ""}`;
  const lines = [`${pad}${t.status === "done" ? "●" : "○"} ${flags}${t.title || "（未命名）"}`];
  const late = t.status !== "done" && !!t.due && t.due < o.today && t.kind !== "等待";
  lines.push(`${ind}${spanText(t)}${t.status === "doing" && t.progress > 0 ? `・${t.progress}%` : ""}${late ? "・逾期" : ""}`);
  const people = peopleOf(o.pm, t);
  if (people.length) lines.push(`${ind}${people.join("、")}`);
  if (t.meta?.vendor) lines.push(`${ind}廠商：${t.meta.vendor}`);
  const tags = tagsOf(t);
  if (tags.length) lines.push(`${ind}${tags.join("、")}`);
  const pred = predecessorOf(o.pm.tasks, t);
  if (pred) lines.push(`${ind}接在「${pred.title}」之後`);
  if (t.note?.trim()) lines.push(`${ind}備註：${t.note.trim().replace(/\s*\n\s*/g, " / ")}`);
  return lines;
}

/** 清單：分組標題【1 水電】，任務一段一段，子任務往內縮 */
export function listText(o: Outline): string {
  const out = header(o, "任務清單");
  for (const g of o.groups) {
    out.push("");
    if (g.name) out.push(`【${g.wbs} ${g.name}】`);
    g.rows.forEach((r, k) => {
      if (k > 0) out.push("");
      out.push(...taskBlock(o, r.task, r.depth ? "    " : ""));
    });
  }
  return out.join("\n");
}

/** 看板：依狀態分三段 */
export function boardText(o: Outline): string {
  const out = header(o, "看板");
  for (const s of ["todo", "doing", "done"] as const) {
    const rows = o.rows.filter((r) => r.task.status === s);
    out.push("", `【${STATUS_LABEL[s]}】`);
    if (!rows.length) out.push("（無）");
    rows.forEach((r, k) => {
      if (k > 0) out.push("");
      out.push(...taskBlock(o, r.task));
    });
  }
  return out.join("\n");
}

/** 甘特圖：照開始日排的工序表，最後列出還沒排日期的 */
export function scheduleText(o: Outline): string {
  const out = header(o, "排程表");
  const dated = o.rows.filter((r) => r.task.start || r.task.due);
  const sorted = [...dated].sort((a, b) => (a.task.start ?? a.task.due!).localeCompare(b.task.start ?? b.task.due!) || a.uid - b.uid);
  out.push("");
  for (const r of sorted) {
    const t = r.task;
    const people = peopleOf(o.pm, t);
    const done = t.status === "done" ? "（完成）" : t.status === "doing" && t.progress > 0 ? `（${t.progress}%）` : "";
    out.push(`${spanText(t)}`, `    ${r.wbs} ${t.title || "（未命名）"}${done}${people.length ? `｜${people.join("、")}` : ""}${r.section ? `｜${r.section}` : ""}`);
    const pred = predecessorOf(o.pm.tasks, t);
    if (pred) out.push(`    接在 ${o.byId.get(pred.id)?.wbs ?? ""}「${pred.title}」之後`);
  }
  const undated = o.rows.filter((r) => !(r.task.start || r.task.due));
  if (undated.length) {
    out.push("", `未排程 ${undated.length} 項`);
    for (const r of undated) out.push(`・${r.wbs} ${r.task.title || "（未命名）"}`);
  }
  return out.join("\n");
}

/* ── 試算表 ── */

export function toCsv(o: Outline): string {
  const cell = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["編號", "分組", "任務", "層級", "開始", "期限", "天數", "狀態", "完成度(%)", "負責人", "廠商", "前置任務", "緊急", "重要", "標籤", "備註"];
  const lines = [head.join(",")];
  for (const r of o.rows) {
    const t = r.task;
    const pred = predecessorOf(o.pm.tasks, t);
    lines.push(
      [
        r.wbs,
        r.section,
        t.title,
        r.depth ? "子任務" : "任務",
        t.start ?? t.due ?? "",
        t.due ?? t.start ?? "",
        daysOf(t) || "",
        STATUS_LABEL[t.status],
        t.status === "done" ? 100 : t.progress,
        peopleOf(o.pm, t).join("、"),
        t.meta?.vendor ?? "",
        pred ? o.byId.get(pred.id)?.wbs ?? pred.title : "",
        t.meta?.urgent ? "是" : "",
        t.flagged ? "是" : "",
        tagsOf(t).join("、"),
        t.note ?? "",
      ]
        .map(cell)
        .join(",")
    );
  }
  return "\uFEFF" + lines.join("\r\n");
}

/* ── Microsoft Project（MSPDI XML） ──
   工地一週七天都可能上工：行事曆設成每天都是工作日（8:00–17:00），天數＝日曆天，和 APP 一樣。
   任務用「手動排程」＋「不早於…開始」，打開時日期和 APP 一樣；有前置任務就加「完成→開始」的連結。 */

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function toMspXml(o: Outline): string {
  const startT = (d: string) => `${d}T08:00:00`;
  const finishT = (d: string) => `${d}T17:00:00`;
  const dur = (days: number) => `PT${days * 8}H0M0S`;
  const fallback = o.start ?? o.today;

  // 摘要任務（分組、有子任務的上層）的期間＝底下任務最早到最晚
  const rangeOf = (rows: OutRow[]) => {
    const s = rows.map((r) => r.task.start ?? r.task.due).filter(Boolean).sort() as string[];
    const e = rows.map((r) => r.task.due ?? r.task.start).filter(Boolean).sort() as string[];
    return s.length ? { s: s[0], e: e[e.length - 1] } : { s: fallback, e: fallback };
  };

  // 負責人＝資源
  const people = new Map<string, number>();
  for (const r of o.rows) for (const p of peopleOf(o.pm, r.task)) if (!people.has(p)) people.set(p, people.size + 1);

  let id = 0;
  const tasks: string[] = [];
  const assigns: string[] = [];
  const all = rangeOf(o.rows);
  const task = (f: {
    uid: number;
    name: string;
    wbs: string;
    level: number;
    s: string;
    e: string;
    summary: boolean;
    /** 手動排程：一般任務都是；上層任務自己有日期時也是（MS Project 會保留它自己的日期） */
    manual?: boolean;
    estimated?: boolean;
    pct: number;
    note?: string;
    pred?: number;
  }) => {
    const days = diffDays(f.s, f.e) + 1;
    const manual = f.manual ?? !f.summary;
    tasks.push(
      [
        "<Task>",
        `<UID>${f.uid}</UID>`,
        `<ID>${++id}</ID>`,
        `<Name>${xml(f.name)}</Name>`,
        `<Manual>${manual ? 1 : 0}</Manual>`,
        `<Type>1</Type>`,
        `<WBS>${f.wbs}</WBS>`,
        `<OutlineNumber>${f.wbs}</OutlineNumber>`,
        `<OutlineLevel>${f.level}</OutlineLevel>`,
        `<Start>${startT(f.s)}</Start>`,
        `<Finish>${finishT(f.e)}</Finish>`,
        `<Duration>${dur(days)}</Duration>`,
        ...(!manual ? [] : [`<ManualStart>${startT(f.s)}</ManualStart>`, `<ManualFinish>${finishT(f.e)}</ManualFinish>`, `<ManualDuration>${dur(days)}</ManualDuration>`]),
        `<DurationFormat>7</DurationFormat>`,
        `<Estimated>${f.estimated ? 1 : 0}</Estimated>`,
        `<Milestone>0</Milestone>`,
        `<Summary>${f.summary ? 1 : 0}</Summary>`,
        `<PercentComplete>${f.pct}</PercentComplete>`,
        ...(f.summary || f.estimated ? [] : [`<ConstraintType>4</ConstraintType>`, `<ConstraintDate>${startT(f.s)}</ConstraintDate>`]),
        ...(f.note ? [`<Notes>${xml(f.note)}</Notes>`] : []),
        ...(f.pred ? [`<PredecessorLink><PredecessorUID>${f.pred}</PredecessorUID><Type>1</Type></PredecessorLink>`] : []),
        "</Task>",
      ].join("")
    );
  };

  for (const g of o.groups) {
    const base = g.name ? 1 : 0;
    if (g.name) {
      const r = rangeOf(g.rows);
      const pct = g.rows.length ? Math.round(g.rows.reduce((n, x) => n + (x.task.status === "done" ? 100 : x.task.progress), 0) / g.rows.length) : 0;
      task({ uid: g.uid!, name: g.name, wbs: g.wbs!, level: 1, s: r.s, e: r.e, summary: true, pct });
    }
    for (const r of g.rows) {
      const t = r.task;
      const kids = r.parent ? g.rows.filter((x) => x.task.parentId === t.id) : [];
      const dated = !!(t.start || t.due);
      let s = t.start ?? t.due ?? fallback;
      let e = t.due ?? t.start ?? fallback;
      if (kids.length && !dated) ({ s, e } = rangeOf(kids));
      const pred = predecessorOf(o.pm.tasks, t);
      const info = [peopleOf(o.pm, t).length ? `負責：${peopleOf(o.pm, t).join("、")}` : "", t.meta?.vendor ? `廠商：${t.meta.vendor}` : "", tagsOf(t).join("、"), t.note ?? ""]
        .filter(Boolean)
        .join("\n");
      task({
        uid: r.uid,
        name: t.title || "（未命名）",
        wbs: r.wbs,
        level: base + 1 + r.depth,
        s,
        e: e < s ? s : e,
        summary: kids.length > 0,
        manual: dated || !kids.length,
        estimated: !dated && !kids.length,
        pct: t.status === "done" ? 100 : t.progress,
        note: info || undefined,
        pred: pred ? o.byId.get(pred.id)?.uid : undefined,
      });
      if (!kids.length) for (const p of peopleOf(o.pm, t)) assigns.push(`<Assignment><UID>${assigns.length + 1}</UID><TaskUID>${r.uid}</TaskUID><ResourceUID>${people.get(p)}</ResourceUID><Units>1</Units></Assignment>`);
    }
  }

  const week = [1, 2, 3, 4, 5, 6, 7]
    .map(
      (d) =>
        `<WeekDay><DayType>${d}</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>`
    )
    .join("");
  const res = [...people].map(([name, uid]) => `<Resource><UID>${uid}</UID><ID>${uid}</ID><Name>${xml(name)}</Name><Type>1</Type></Resource>`).join("");
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Project xmlns="http://schemas.microsoft.com/project">',
    "<SaveVersion>14</SaveVersion>",
    `<Name>${xml(o.code)}.xml</Name>`,
    `<Title>${xml(`${o.name}（${o.code}）`)}</Title>`,
    "<ScheduleFromStart>1</ScheduleFromStart>",
    `<StartDate>${startT(o.start && o.start < all.s ? o.start : all.s)}</StartDate>`,
    `<FinishDate>${finishT(o.due && o.due > all.e ? o.due : all.e)}</FinishDate>`,
    "<CalendarUID>1</CalendarUID>",
    "<DefaultStartTime>08:00:00</DefaultStartTime>",
    "<DefaultFinishTime>17:00:00</DefaultFinishTime>",
    "<MinutesPerDay>480</MinutesPerDay>",
    "<MinutesPerWeek>3360</MinutesPerWeek>",
    "<DaysPerMonth>30</DaysPerMonth>",
    `<Calendars><Calendar><UID>1</UID><Name>工地（每天）</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${week}</WeekDays></Calendar></Calendars>`,
    `<Tasks>${tasks.join("")}</Tasks>`,
    `<Resources>${res}</Resources>`,
    `<Assignments>${assigns.join("")}</Assignments>`,
    "</Project>",
  ].join("\n");
}

/* ── 行事曆（iCalendar） ── */

export function toIcs(o: Outline): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const enc = new TextEncoder();
  // 每行最多 75 個位元組（中文一個字 3 個位元組），超過就折行
  const fold = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let bytes = 0;
    for (const ch of line) {
      const b = enc.encode(ch).length;
      if (bytes + b > (out.length ? 74 : 75)) {
        out.push(cur);
        cur = "";
        bytes = 0;
      }
      cur += ch;
      bytes += b;
    }
    out.push(cur);
    return out.join("\r\n ");
  };
  const d8 = (iso: string) => iso.replace(/-/g, "");
  const stamp = `${d8(o.today)}T000000Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sensesoil//PM//ZH-TW", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(`${o.name} 排程`)}`];
  for (const r of o.rows) {
    const t = r.task;
    if (!(t.start || t.due)) continue;
    const s = t.start ?? t.due!;
    const e = t.due ?? t.start!;
    const desc = [`${o.name}（${o.code}）${r.section ? `・${r.section}` : ""}`, `狀態：${STATUS_LABEL[t.status]}${t.status === "doing" && t.progress ? ` ${t.progress}%` : ""}`];
    const people = peopleOf(o.pm, t);
    if (people.length) desc.push(`負責：${people.join("、")}`);
    if (t.meta?.vendor) desc.push(`廠商：${t.meta.vendor}`);
    if (t.note?.trim()) desc.push(`備註：${t.note.trim()}`);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${t.id}@sensesoil`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d8(s)}`,
      `DTEND;VALUE=DATE:${d8(addDays(e < s ? s : e, 1))}`,
      `SUMMARY:${esc(`${t.status === "done" ? "✓ " : ""}${t.title || "（未命名）"}`)}`,
      `DESCRIPTION:${esc(desc.join("\n"))}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/* ── 存檔：手機跳出分享（可以存到照片、檔案、傳 LINE），電腦直接下載 ── */

export async function deliver(blob: Blob, name: string): Promise<"shared" | "downloaded" | "cancel"> {
  const file = new File([blob], name, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch && nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancel";
      // 其他錯誤（例如這種檔案不能分享）：改成下載
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}

/** 檔名：B20 老佛爺泥牆 甘特圖 20261020.png（拿掉檔名不能用的字） */
export function fileName(o: Outline, kind: string, ext: string): string {
  return `${o.code} ${o.name} ${kind} ${o.today.replace(/-/g, "")}.${ext}`.replace(/[\\/:*?"<>|]/g, "");
}
