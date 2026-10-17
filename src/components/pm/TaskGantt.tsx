"use client";

import React, { useMemo, useState } from "react";
import { addDays, fmtDate } from "@/lib/project-ops";
import { personColor, STATUS_LABEL, type Task } from "@/lib/pm/model";
import Gantt, { type GanttRow } from "./Gantt";
import { Empty, GREEN, ORANGE } from "./kit";
import { isLate, personMark, type Pm } from "./usePm";
import { taskAssignees } from "@/lib/pm/model";
import { ScheduleSheet } from "./ScheduleSheet";
import { treeOrder } from "./tree";

/* ══════════════════════════════════════════════════════════
   甘特圖（排程）：每個任務一條
   - 有開始日＋期限：畫區間；只有期限：畫那一天
   - 顏色：完成＝綠、進行中＝橘、待辦＝灰、等待期＝虛線；逾期會延伸紅色斜紋到今天
   - 跨專案時依專案分段（每段第一列顯示專案名稱）
   - 順序與清單相同：子任務接在上層底下、名稱縮排；上層沒排日期時，畫成涵蓋子任務的總橫條
   - 點名稱＝任務細節；點時間軸（長條或空白處）＝時間安排（只改日期）
   - 負責人用代表字（軍、恒…），名稱欄比較放得下
   - 沒有日期的任務也列出來（像清單一樣），點時間軸上的某一天就排進去；
     有日期的長條可以直接拖曳平移、拖兩端改開始／結束日 —— 在甘特圖上就能排程
   ══════════════════════════════════════════════════════════ */

// 每天至少 14px：可以直接點日期、拖長條排程，放不下就左右捲動
const FIT = { min: 14, max: 26 } as const;

export function TaskGantt({ pm, tasks, showProject, onOpen }: { pm: Pm; tasks: Task[]; showProject?: boolean; onOpen: (t: Task) => void }) {
  const { today } = pm;
  const [schedId, setSchedId] = useState<string | null>(null);
  // 依專案分組，組內依清單的層級順序；上層沒有日期時用子任務的期間
  const { rowsAll: dated, span, depthOf } = useMemo(() => {
    const byCode = new Map<string, Task[]>();
    for (const t of tasks) byCode.set(t.code, [...(byCode.get(t.code) ?? []), t]);
    const codes = [...byCode.keys()].sort((a, b) => a.localeCompare(b));
    const span = new Map<string, { start: string; end: string; progress: number }>();
    const depthOf = new Map<string, number>();
    const out: Task[] = [];
    for (const c of codes) {
      const rows = treeOrder(byCode.get(c)!);
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
    return { rowsAll: out, span, depthOf };
  }, [tasks]);
  const hasDate = (t: Task) => !!(t.start || t.due || span.has(t.id));
  const undated = dated.filter((t) => !hasDate(t)).length;

  const range = useMemo(() => {
    if (!dated.length) return null;
    let s = today;
    // 至少往後留三週，沒有日期的任務才有地方點
    let e = addDays(today, 21);
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
    return { from: addDays(s < floor ? floor : s, -2), to: addDays(e, 4) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dated, span, today]);

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
  const rows: GanttRow[] = dated.map((t) => {
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
        onPickDay: (day) => {
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
      onTimeline: sp ? undefined : () => setSchedId(t.id),
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
          onChange: sp ? undefined : (s, e) => pm.saveTask({ id: t.id, start: s, due: e }),
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
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="bg-white rounded-[14px] border border-[#EBEBED] overflow-hidden">
        <Gantt dense fit={FIT} anchor={0.3} today={today} from={range.from} to={range.to} dayWidth={16} labelWidth={132} rows={rows} />
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
        <span className="ml-auto">{undated > 0 ? `${undated} 件未排程，點日期排入` : "長按長條拖曳改日期，拖兩端改天數"}</span>
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
