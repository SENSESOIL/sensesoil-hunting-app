"use client";

import React, { useMemo, useState } from "react";
import { tourEmit, tourState } from "./tour/bus";
import { addDays, diffDays, fmtDate } from "@/lib/project-ops";
import { personColor, STATUS_LABEL, type Task } from "@/lib/pm/model";
import Gantt, { type GanttRow } from "./Gantt";
import { Empty, GREEN, ORANGE, T } from "./kit";
import { isLate, personMark, type Pm } from "./usePm";
import { taskAssignees } from "@/lib/pm/model";
import { ScheduleSheet } from "./ScheduleSheet";
import { ProjectScreen } from "./ProjectScreen";
import { realSections, splitBySection, treeOrder } from "./tree";
import { predecessorOf } from "@/lib/pm/deps";

/* ══════════════════════════════════════════════════════════
   甘特圖（排程）：每個任務一條
   - 有開始日＋期限：畫區間；只有期限：畫那一天
   - 顏色：完成＝綠、進行中＝橘、待辦＝灰、等待期＝虛線；逾期會延伸紅色斜紋到今天
   - 跨專案時依專案分段（每段第一列顯示專案名稱）
   - 順序與清單相同：子任務接在上層底下、名稱縮排；上層沒排日期時，畫成涵蓋子任務的總橫條
   - 點名稱＝任務細節；點時間軸（長條或空白處）＝時間安排（只改日期）
   - 專案有分組（Section）時：先分組、再任務；分組標題列畫一條涵蓋組內任務的總橫條
   - 負責人用代表字（軍、恒…），名稱欄比較放得下
   - 前置任務（時間安排裡的「接在哪個任務之後開始」）：兩條長條之間畫折線箭頭
   - 沒有日期的任務也列出來（像清單一樣），點時間軸上的某一天就排進去；
     有日期的長條可以直接拖曳平移、拖兩端改開始／結束日 —— 在甘特圖上就能排程
   ══════════════════════════════════════════════════════════ */

/* 日／週／月：每天的寬度不同（放不下就左右捲動）
   日＝看得到每天的星期；週＝每週一一個刻度（預設）；月＝一次看好幾個月 */
type Zoom = "day" | "week" | "month";
const ZOOMS: { value: Zoom; label: string; hint: string; icon: string; fit: { min: number; max: number }; dense: boolean; ahead: number }[] = [
  { value: "day", label: "日", hint: "看得到每一天", icon: "D", fit: { min: 30, max: 44 }, dense: true, ahead: 14 },
  { value: "week", label: "週", hint: "以週排程（預設）", icon: "W", fit: { min: 14, max: 26 }, dense: true, ahead: 21 },
  { value: "month", label: "月", hint: "一次看好幾個月", icon: "M", fit: { min: 3, max: 8 }, dense: false, ahead: 90 },
];
const ZOOM_KEY = "pm:gantt:zoom";
/* 顯示到哪一層：只看分組／分組＋主任務（子任務收起來）／全部 */
type Level = "section" | "task" | "all";
const LEVEL_KEY = "pm:gantt:level";
const LEVELS: { value: Level; label: string }[] = [
  { value: "section", label: "只看分組" },
  { value: "task", label: "分組和主任務" },
  { value: "all", label: "全部（含子任務）" },
];
/** 拾壤 logo（匯出圖片右上角） */
export const LOGO = encodeURI("/Logo｜Orange.svg");

export function TaskGantt({
  pm,
  tasks,
  showProject,
  onOpen,
  editable = false,
  project: projectCode,
  exportFrame,
}: {
  pm: Pm;
  tasks: Task[];
  showProject?: boolean;
  onOpen: (t: Task) => void;
  /** 編輯模式：拖曳長條、拖兩端、點日期排入、點時間軸開「時間安排」。閱讀模式只能看、點了開細節（避免手滑） */
  editable?: boolean;
  /** 單一專案的甘特圖：最上面加一列「專案工期」（開工日 → 預計完工），並畫出預計／實際完工線 */
  project?: string;
  /** 匯出圖片：整張攤開（不捲動），上面專案名稱＋拾壤 logo，下面圖例＋匯出日期 */
  exportFrame?: { title: string; color: string; includeProject: boolean };
}) {
  const { today } = pm;
  const [schedId, setSchedId] = useState<string | null>(null);
  // 點「預定工期」列：直接打開專案資料改日期（管理者）
  const [infoOpen, setInfoOpen] = useState(false);
  const [zoom, setZoomState] = useState<Zoom>(() => {
    try {
      const v = localStorage.getItem(ZOOM_KEY);
      return v === "day" || v === "month" ? v : "week";
    } catch {
      return "week";
    }
  });
  const setZoom = (z: Zoom) => {
    setZoomState(z);
    try {
      localStorage.setItem(ZOOM_KEY, z);
    } catch {
      /* 無痕模式 */
    }
  };
  const Z = ZOOMS.find((z) => z.value === zoom)!;
  const [level, setLevelState] = useState<Level>(() => {
    try {
      const v = localStorage.getItem(LEVEL_KEY);
      return v === "section" || v === "task" ? v : "all";
    } catch {
      return "all";
    }
  });
  const setLevel = (l: Level) => {
    setLevelState(l);
    try {
      localStorage.setItem(LEVEL_KEY, l);
    } catch {
      /* 無痕模式 */
    }
  };
  // 依專案分組，組內依清單的層級順序；上層沒有日期時用子任務的期間
  const { rowsAll: dated, span, depthOf, headBefore } = useMemo(() => {
    const byCode = new Map<string, Task[]>();
    for (const t of tasks) byCode.set(t.code, [...(byCode.get(t.code) ?? []), t]);
    const codes = [...byCode.keys()].sort((a, b) => a.localeCompare(b));
    const span = new Map<string, { start: string; end: string; progress: number }>();
    const depthOf = new Map<string, number>();
    const out: Task[] = [];
    // 分組標題：插在該組第一個任務前面
    const headBefore = new Map<string, { key: string; name: string; tasks: Task[] }>();
    const taskById = new Map(pm.tasks.map((t) => [t.id, t]));
    for (const c of codes) {
      const secs = pm.projectBy.get(c)?.sections ?? [];
      const groups = realSections(secs).length
        ? splitBySection(byCode.get(c)!, secs, taskById).filter((g) => g.tasks.length)
        : [{ id: null as string | null, name: "", tasks: byCode.get(c)! }];
      for (const g of groups) {
      const rows = treeOrder(g.tasks);
      // 沒分組的任務（放最上面）沒有標題列
      if (g.id !== null && g.name && rows.length) headBefore.set(rows[0].task.id, { key: `${c}:${g.id}`, name: g.name, tasks: g.tasks });
      for (const r of rows) {
        depthOf.set(r.task.id, r.depth);
        if (r.childCount > 0 && !(r.task.start || r.task.due)) {
          const kids = rows.filter((x) => x.task.parentId === r.task.id && (x.task.start || x.task.due)).map((x) => x.task);
          if (kids.length) {
            const starts = kids.map((k) => k.start ?? k.due!);
            const ends = kids.map((k) => k.due ?? k.start!);
            span.set(r.task.id, {
              start: starts.sort()[0],
              end: ends.sort()[ends.length - 1],
              progress: Math.round(kids.reduce((n, k) => n + (k.status === "done" ? 100 : k.progress), 0) / kids.length),
            });
          }
        }
        out.push(r.task);
      }
      }
    }
    return { rowsAll: out, span, depthOf, headBefore };
  }, [tasks, pm.tasks, pm.projectBy]);
  const hasDate = (t: Task) => !!(t.start || t.due || span.has(t.id));
  const undated = dated.filter((t) => !hasDate(t)).length;

  // 專案資料裡的開工日、預計完工、實際完工
  const proj = projectCode ? pm.projectBy.get(projectCode) : undefined;
  const pStart = proj?.startAt;
  const pDue = proj?.dueAt;
  const pDone = proj?.doneAt;
  const range = useMemo(() => {
    if (!dated.length && !pStart && !pDue) return null;
    let s = today;
    // 往後至少留一段（日：兩週、週：三週、月：三個月），沒有日期的任務才有地方點
    let e = addDays(today, Z.ahead);
    for (const d of [pStart, pDue, pDone]) {
      if (!d) continue;
      if (d < s) s = d;
      if (d > e) e = d;
    }
    for (const t of dated) {
      if (!hasDate(t)) continue;
      const sp = span.get(t.id);
      const a = sp?.start ?? t.start ?? t.due!;
      const b = sp?.end ?? t.due ?? t.start!;
      if (a < s) s = a;
      if (b > e) e = b;
    }
    // 太久以前的完成任務不要把圖拉得很長：最多往前看 60 天
    const floor = addDays(today, -60);
    const from = addDays(s < floor ? floor : s, -2);
    // 月刻度：從那個月 1 號開始畫，月份標籤才會對齊、不會擠在一起
    return { from: zoom === "month" ? `${from.slice(0, 8)}01` : from, to: addDays(e, 4) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dated, span, today, Z.ahead, zoom, pStart, pDue, pDone]);

  if (!range) {
    return (
      <Empty
        icon="view_timeline"
        title="還沒有任務"
        hint="按右下角的＋新增任務，再到這裡點日期排程。"
      />
    );
  }

  let lastCode = "";
  /** 分組標題列：總橫條＝組內有日期的任務（含上層的子任務期間）從最早到最晚 */
  const headRow = (h: { key: string; name: string; tasks: Task[] }): GanttRow => {
    const ranges = h.tasks
      .map((t) => {
        const sp = span.get(t.id);
        const a = sp?.start ?? t.start ?? t.due;
        const b = sp?.end ?? t.due ?? t.start;
        return a && b ? [a, b] : null;
      })
      .filter((x): x is string[] => !!x);
    const done = h.tasks.length ? Math.round(h.tasks.reduce((n, t) => n + (t.status === "done" ? 100 : t.progress), 0) / h.tasks.length) : 0;
    return {
      id: `h:${h.key}`,
      label: h.name,
      heading: true,
      bars: ranges.length
        ? [{ start: ranges.map((r) => r[0]).sort()[0], end: ranges.map((r) => r[1]).sort().pop()!, progress: done, fill: "#3F3F46" }]
        : [],
    };
  };
  const md = (d?: string) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "—");
  const projRow: GanttRow[] =
    proj && (pStart || pDue) && (!exportFrame || exportFrame.includeProject)
      ? [
          {
            id: "project-span",
            label: "預定工期",
            accent: true,
            onClick: pm.isManager ? () => setInfoOpen(true) : undefined,
            sublabel: `${md(pStart)} → ${md(pDue)}${pDone ? `・完工 ${md(pDone)}` : ""}`,
            heading: true,
            bars: [
              {
                start: pStart ?? pDue!,
                end: pDue ?? pStart!,
                progress: pDone ? 100 : proj.view.ops?.progress ?? proj.progress ?? 0,
                fill: pDone ? GREEN : ORANGE,
                late: !pDone && !!pDue && pDue < today,
                tip: (
                  <>
                    <b>預定工期</b>
                    <br />
                    開工 {md(pStart)}　預計完工 {md(pDue)}
                    <br />
                    {pDone ? `實際完工 ${md(pDone)}` : `進度 ${proj.view.ops?.progress ?? proj.progress ?? 0}%`}
                  </>
                ),
              },
            ],
          },
        ]
      : [];
  const markers = exportFrame && !exportFrame.includeProject ? [] : [
    ...(pDue ? [{ date: pDue, color: ORANGE, dashed: true, label: `預計完工 ${md(pDue)}` }] : []),
    ...(pDone ? [{ date: pDone, color: GREEN, label: `實際完工 ${md(pDone)}` }] : []),
  ];
  // 沒有分組的專案：「只看分組」沒東西可看，當成「分組和主任務」
  const hasSections = headBefore.size > 0;
  const shown: Level = level === "section" && !hasSections ? "task" : level;
  const rows: GanttRow[] = [
    ...projRow,
    ...dated.flatMap((t) => {
      const head = headBefore.get(t.id);
      const out = head ? [headRow(head)] : [];
      if (shown === "all" || (shown === "task" && depthOf.get(t.id) !== 1)) out.push(taskRow(t));
      return out;
    }),
  ];
  function taskRow(t: Task): GanttRow {
    const sp = span.get(t.id);
    const child = depthOf.get(t.id) === 1;
    const project = pm.projectBy.get(t.code);
    const firstOfProject = showProject && t.code !== lastCode;
    lastCode = t.code;
    const list = taskAssignees(t);
    const who = list.length
      ? list
          .slice(0, 4)
          .map((e) => personMark(pm, e, e === t.assigneeEmail ? t.assigneeName : undefined))
          .join("、") + (list.length > 4 ? ` +${list.length - 4}` : "")
      : "未指派";
    if (!hasDate(t)) {
      return {
        id: t.id,
        label: t.title,
        sub: child,
        // 名稱底下不放小字（負責人、未排程…），清爽；跨專案時每段第一列標專案名稱
        sublabel: firstOfProject ? `${project?.name ?? t.code}` : undefined,
        onClick: () => onOpen(t),
        bars: [],
        // 點哪天就從哪天開始；有填工期天數就一起算出期限
        onPickDay: !editable ? undefined : (day) => {
          const n = t.meta?.days;
          pm.saveTask({ id: t.id, start: day, due: n && n > 1 ? addDays(day, n - 1) : day });
        },
      };
    }
    const start = sp?.start ?? t.start ?? t.due!;
    const end = sp?.end ?? t.due ?? t.start!;
    const late = isLate(t, today);
    const done = t.status === "done";
    return {
      id: t.id,
      label: t.title,
      sub: child,
      sublabel: firstOfProject ? `${project?.name ?? t.code}` : undefined,
      onClick: () => onOpen(t),
      onTimeline: sp || !editable ? undefined : () => {
        if (tourState.lockSchedule) return;
        setSchedId(t.id);
        tourEmit("schedule-open", t.id);
      },
      trailing: done ? undefined : t.progress > 0 ? `${t.progress}%` : late ? "逾期" : undefined,
      bars: [
        {
          start,
          end: end < start ? start : end,
          progress: t.kind === "等待" ? undefined : done ? 100 : sp ? sp.progress : t.progress,
          fill: sp ? "#3F3F46" : t.kind === "等待" ? "#A1A1AA" : done ? GREEN : t.status === "doing" ? ORANGE : showProject ? personColor(t.code) : "#71717A",
          dashed: t.kind === "等待",
          late,
          // 上層的總橫條是子任務算出來的，不能拖
          onChange: sp || !editable ? undefined : (s, e) => pm.saveTask({ id: t.id, start: s, due: e }),
          tip: (
            <>
              <b>{t.title}</b>
              <br />
              {project?.name ?? t.code}
              <br />
              {fmtDate(start, today)}
              {end !== start ? ` – ${fmtDate(end, today)}` : ""}　·　{STATUS_LABEL[t.status]}
              {t.progress > 0 && !done ? `　${t.progress}%` : ""}
              <br />
              {who}
            </>
          ),
        },
      ],
    };
  }

  // 前置任務的連線：兩邊都有畫長條才連
  const links = dated
    .filter((t) => t.meta?.after && hasDate(t))
    .map((t) => ({ t, p: predecessorOf(pm.tasks, t) }))
    .filter((v) => v.p && dated.some((d) => d.id === v.p!.id) && hasDate(v.p))
    .map((v) => ({ from: v.p!.id, to: v.t.id }));

  if (exportFrame) {
    // 整段放得下（每天至少是這個刻度的最窄寬度），最少 1100 寬
    const days = diffDays(range.from, range.to) + 1;
    const W = Math.max(1100, Math.ceil(132 + days * Z.fit.min + 56) + 2);
    return (
      <div className="bg-[#FAFAFA] p-8 font-sans" style={{ width: W + 64 }}>
        <div className="flex items-center justify-between gap-6 pb-5 px-1">
          <h1 className={T.largeTitle} style={{ color: exportFrame.color }}>
            {exportFrame.title}
          </h1>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="拾壤" className="h-10 w-auto shrink-0" />
        </div>
        <div className="bg-white rounded-[14px] border border-[#EBEBED] overflow-hidden" style={{ width: W }}>
          <Gantt still dense={Z.dense} fit={Z.fit} anchor={0} today={today} from={range.from} to={range.to} dayWidth={16} labelWidth={132} rows={rows} markers={markers} links={links} />
        </div>
        <div className="mt-2.5 flex items-center gap-x-4 px-1 text-[12px] text-[#8E8E93]">
          <Legend color="#71717A">待辦</Legend>
          <Legend color={ORANGE}>進行中</Legend>
          <Legend color={GREEN}>完成</Legend>
          <Legend dashed>等待期</Legend>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[3px]" style={{ background: "repeating-linear-gradient(135deg,#E5484D 0 2px,#fde2e2 2px 4px)" }} />
            逾期
          </span>
          <span className="ml-auto tabular-nums">{today.replace(/-/g, "/")} 匯出</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="bg-white rounded-[14px] border border-[#EBEBED] overflow-hidden">
        <Gantt
          dense={Z.dense}
          fit={Z.fit}
          anchor={0.3}
          today={today}
          from={range.from}
          to={range.to}
          dayWidth={16}
          labelWidth={132}
          rows={rows}
          markers={markers}
          links={links}
          corner={
            <div className="flex items-center gap-1.5">
              <ZoomPicker value={zoom} onChange={setZoom} />
              <LevelPicker value={shown} onChange={setLevel} skipSection={!hasSections} />
            </div>
          }
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12px] text-[#8E8E93]">
        <Legend color="#71717A">待辦</Legend>
        <Legend color={ORANGE}>進行中</Legend>
        <Legend color={GREEN}>完成</Legend>
        <Legend dashed>等待期</Legend>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[3px]" style={{ background: "repeating-linear-gradient(135deg,#E5484D 0 2px,#fde2e2 2px 4px)" }} />
          逾期
        </span>
        <span className="ml-auto">
          {!editable ? (undated > 0 ? `${undated} 件未排程` : "") : undated > 0 ? `${undated} 件未排程，點日期排入` : "長按長條拖曳改日期，拖兩端改天數"}
        </span>
      </div>
      <ScheduleSheet pm={pm} taskId={schedId} open={!!schedId} onClose={() => setSchedId(null)} />
      {pm.isManager && projectCode && <ProjectScreen pm={pm} code={infoOpen ? projectCode : null} onClose={() => setInfoOpen(false)} />}
    </div>
  );
}

/**
 * 顯示層級：和日／週／月同一種淺灰膠囊，點一下換下一個（只看分組 → 分組和主任務 → 全部）。
 * 圖示是一疊橫線：越往內縮的線越多，代表看得越細
 */
function LevelPicker({ value, onChange, skipSection }: { value: Level; onChange: (l: Level) => void; skipSection: boolean }) {
  const list = skipSection ? LEVELS.filter((l) => l.value !== "section") : LEVELS;
  const i = Math.max(0, list.findIndex((l) => l.value === value));
  const cur = list[i];
  const next = list[(i + 1) % list.length];
  // 每條線：[起點 x, y]；終點都是 20
  const lines: Record<Level, [number, number][]> = {
    section: [
      [4, 8],
      [4, 16],
    ],
    task: [
      [4, 6],
      [9, 12],
      [9, 18],
    ],
    all: [
      [4, 5],
      [9, 10],
      [14, 15],
      [9, 20],
    ],
  };
  return (
    <button
      type="button"
      onClick={() => {
        tourEmit("gantt-level", next.value);
        onChange(next.value);
      }}
      data-tour="gantt-level"
      aria-label={`顯示：${cur.label}，點一下換成${next.label}`}
      title={`換成${next.label}`}
      className="h-8 min-w-[40px] px-2.5 rounded-full flex items-center justify-center text-[#18181B] bg-[#F2F2F4] active:bg-[#E4E4E7] transition-colors select-none"
    >
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden>
        {lines[cur.value].map(([x, y]) => (
          <path key={`${x}-${y}`} d={`M${x} ${y}H20`} />
        ))}
      </svg>
    </button>
  );
}

function Legend({ color, dashed, children }: { color?: string; dashed?: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="w-3 h-3 rounded-[3px]"
        style={dashed ? { border: "1.5px dashed #A1A1AA" } : { background: color }}
      />
      {children}
    </span>
  );
}

/**
 * 時間刻度：一顆淺灰膠囊寫著目前的刻度（日／週／月），點一下換下一個（日 → 週 → 月 → 日），不跳選單。
 */
function ZoomPicker({ value, onChange }: { value: Zoom; onChange: (z: Zoom) => void }) {
  const i = Math.max(0, ZOOMS.findIndex((z) => z.value === value));
  const cur = ZOOMS[i];
  const next = ZOOMS[(i + 1) % ZOOMS.length];
  return (
    <button
      type="button"
      onClick={() => {
        onChange(next.value);
        tourEmit("gantt-zoom", next.value);
      }}
      data-tour="gantt-zoom"
      aria-label={`時間刻度：${cur.label}，點一下換成${next.label}`}
      title={`換成${next.label}（${next.hint}）`}
      className="h-8 min-w-[40px] px-3 rounded-full flex items-center justify-center text-[14px] font-semibold text-[#18181B] bg-[#F2F2F4] active:bg-[#E4E4E7] transition-colors select-none"
    >
      {cur.label}
    </button>
  );
}
