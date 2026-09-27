"use client";

import React, { useMemo } from "react";
import { addDays, fmtDate } from "@/lib/project-ops";
import { personColor, STATUS_LABEL, type Task } from "@/lib/pm/model";
import Gantt, { type GanttRow } from "./Gantt";
import { Empty, GREEN, ORANGE } from "./kit";
import { isLate, personLabel, type Pm } from "./usePm";

/* ══════════════════════════════════════════════════════════
   甘特圖（排程）：每個任務一條
   - 有開始日＋期限：畫區間；只有期限：畫那一天
   - 顏色：完成＝綠、進行中＝橘、待辦＝灰、等待期＝虛線；逾期會延伸紅色斜紋到今天
   - 跨專案時依專案分段（每段第一列顯示專案名稱）
   ══════════════════════════════════════════════════════════ */

const FIT = { min: 5, max: 26 } as const;

export function TaskGantt({ pm, tasks, showProject, onOpen }: { pm: Pm; tasks: Task[]; showProject?: boolean; onOpen: (t: Task) => void }) {
  const { today } = pm;
  const dated = useMemo(
    () =>
      tasks
        .filter((t) => t.start || t.due)
        .sort(
          (a, b) =>
            (showProject ? a.code.localeCompare(b.code) : 0) ||
            a.seq - b.seq ||
            (a.start ?? a.due ?? "").localeCompare(b.start ?? b.due ?? "")
        ),
    [tasks, showProject]
  );
  const undated = tasks.length - dated.length;

  const range = useMemo(() => {
    if (!dated.length) return null;
    let s = today;
    let e = today;
    for (const t of dated) {
      const a = t.start ?? t.due!;
      const b = t.due ?? t.start!;
      if (a < s) s = a;
      if (b > e) e = b;
    }
    // 太久以前的完成任務不要把圖拉得很長：最多往前看 60 天
    const floor = addDays(today, -60);
    return { from: addDays(s < floor ? floor : s, -2), to: addDays(e, 4) };
  }, [dated, today]);

  if (!range) {
    return (
      <Empty
        icon="view_timeline"
        title="還沒有排日期的任務"
        hint="在任務裡設定「開始」與「期限」，就會出現在甘特圖上。"
      />
    );
  }

  let lastCode = "";
  const rows: GanttRow[] = dated.map((t) => {
    const start = t.start ?? t.due!;
    const end = t.due ?? t.start!;
    const late = isLate(t, today);
    const done = t.status === "done";
    const project = pm.projectBy.get(t.code);
    const firstOfProject = showProject && t.code !== lastCode;
    lastCode = t.code;
    const who = t.assigneeEmail ? personLabel(pm, t.assigneeEmail, t.assigneeName) : "未指派";
    return {
      id: t.id,
      label: t.title,
      sublabel: firstOfProject ? `● ${project?.name ?? t.code}` : t.kind === "等待" ? "等待期" : who,
      onClick: () => onOpen(t),
      trailing: done ? undefined : t.progress > 0 ? `${t.progress}%` : late ? "逾期" : undefined,
      bars: [
        {
          start,
          end: end < start ? start : end,
          progress: t.kind === "等待" ? undefined : done ? 100 : t.progress,
          fill: t.kind === "等待" ? "#A1A1AA" : done ? GREEN : t.status === "doing" ? ORANGE : showProject ? personColor(t.code) : "#71717A",
          dashed: t.kind === "等待",
          late,
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
        {undated > 0 && <span className="ml-auto">另有 {undated} 件沒有日期</span>}
      </div>
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
