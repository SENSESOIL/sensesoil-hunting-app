"use client";

import React, { useMemo, useState } from "react";
import { addDays, fmtDate } from "@/lib/project-ops";
import { personColor, STATUS_LABEL, type Task } from "@/lib/pm/model";
import Gantt, { type GanttRow } from "./Gantt";
import { Empty, GREEN, ORANGE } from "./kit";
import { isLate, personMark, type Pm } from "./usePm";
import { taskAssignees } from "@/lib/pm/model";
import { ScheduleSheet } from "./ScheduleSheet";
import { realSections, splitBySection, treeOrder } from "./tree";

/* ══════════════════════════════════════════════════════════
   甘特圖（排程）：每個任務一條
   - 有開始日＋期限：畫區間；只有期限：畫那一天
   - 顏色：完成＝綠、進行中＝橘、待辦＝灰、等待期＝虛線；逾期會延伸紅色斜紋到今天
   - 跨專案時依專案分段（每段第一列顯示專案名稱）
   - 順序與清單相同：子任務接在上層底下、名稱縮排；上層沒排日期時，畫成涵蓋子任務的總橫條
   - 點名稱＝任務細節；點時間軸（長條或空白處）＝時間安排（只改日期）
   - 專案有分組（Section）時：先分組、再任務；分組標題列畫一條涵蓋組內任務的總橫條
   - 負責人用代表字（軍、恒…），名稱欄比較放得下
   - 沒有日期的任務也列出來（像清單一樣），點時間軸上的某一天就排進去；
     有日期的長條可以直接拖曳平移、拖兩端改開始／結束日 —— 在甘特圖上就能排程
   ══════════════════════════════════════════════════════════ */

/* 日／週／月：每天的寬度不同（放不下就左右捲動）
   日＝看得到每天的星期；週＝每週一一個刻度（預設）；月＝一次看好幾個月 */
type Zoom = "day" | "week" | "month";
const ZOOMS: { value: Zoom; label: string; icon: string; fit: { min: number; max: number }; dense: boolean; ahead: number }[] = [
  { value: "day", label: "日", icon: "D", fit: { min: 30, max: 44 }, dense: true, ahead: 14 },
  { value: "week", label: "週", icon: "W", fit: { min: 14, max: 26 }, dense: true, ahead: 21 },
  { value: "month", label: "月", icon: "M", fit: { min: 3, max: 8 }, dense: false, ahead: 90 },
];
const ZOOM_KEY = "pm:gantt:zoom";

export function TaskGantt({
  pm,
  tasks,
  showProject,
  onOpen,
  editable = false,
  project: projectCode,
}: {
  pm: Pm;
  tasks: Task[];
  showProject?: boolean;
  onOpen: (t: Task) => void;
  /** 編輯模式：拖曳長條、拖兩端、點日期排入、點時間軸開「時間安排」。閱讀模式只能看、點了開細節（避免手滑） */
  editable?: boolean;
  /** 單一專案的甘特圖：最上面加一列「專案工期」（開工日 → 預計完工），並畫出預計／實際完工線 */
  project?: string;
}) {
  const { today } = pm;
  const [schedId, setSchedId] = useState<string | null>(null);
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
      if (g.id !== null && rows.length) headBefore.set(rows[0].task.id, { key: `${c}:${g.id}`, name: g.name, tasks: g.tasks });
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
      sublabel: `${h.tasks.length} 項`,
      heading: true,
      bars: ranges.length
        ? [{ start: ranges.map((r) => r[0]).sort()[0], end: ranges.map((r) => r[1]).sort().pop()!, progress: done, fill: "#3F3F46" }]
        : [],
    };
  };
  const md = (d?: string) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "—");
  const projRow: GanttRow[] =
    proj && (pStart || pDue)
      ? [
          {
            id: "project-span",
            label: "專案工期",
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
                    <b>專案工期</b>
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
  const markers = [
    ...(pDue ? [{ date: pDue, color: ORANGE, dashed: true, label: `預計完工 ${md(pDue)}` }] : []),
    ...(pDone ? [{ date: pDone, color: GREEN, label: `實際完工 ${md(pDone)}` }] : []),
  ];
  const rows: GanttRow[] = [
    ...projRow,
    ...dated.flatMap((t) => {
      const head = headBefore.get(t.id);
      return head ? [headRow(head), taskRow(t)] : [taskRow(t)];
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
        label: child ? `　${t.title}` : t.title,
        sublabel: firstOfProject ? `● ${project?.name ?? t.code}` : "未排程",
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
      label: child ? `　${t.title}` : t.title,
      sublabel: firstOfProject ? `● ${project?.name ?? t.code}` : t.kind === "等待" ? "等待期" : who,
      onClick: () => onOpen(t),
      onTimeline: sp || !editable ? undefined : () => setSchedId(t.id),
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
          corner={
            // 同一個位置一顆按鈕：點一下換下一個刻度（日 → 週 → 月 → 日）
            <button
              type="button"
              onClick={() => setZoom(ZOOMS[(ZOOMS.indexOf(Z) + 1) % ZOOMS.length].value)}
              aria-label={`時間刻度：${Z.label}，點一下換成${ZOOMS[(ZOOMS.indexOf(Z) + 1) % ZOOMS.length].label}`}
              title={`${Z.label}（點一下換成${ZOOMS[(ZOOMS.indexOf(Z) + 1) % ZOOMS.length].label}）`}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#52525B] hover:bg-[#F4F4F5] active:bg-[#F4F4F5] transition-colors"
            >
              {/* D／W／M 當圖示：細框小方塊裡一個字母 */}
              <span className="w-[22px] h-[22px] rounded-[6px] border-[1.25px] border-current flex items-center justify-center text-[11.5px] font-semibold leading-none tracking-tight">
                {Z.icon}
              </span>
            </button>
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
    </div>
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
