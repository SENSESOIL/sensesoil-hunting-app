"use client";

import React, { useMemo } from "react";
import { addDays, toDay, WEEKDAYS } from "@/lib/project-ops";
import type { Task } from "@/lib/pm/model";
import { Icon } from "./ui";
import { Avatar, Group, GREEN, ORANGE, RED } from "./kit";
import { isLate, type Pm } from "./usePm";

/* ══════════════════════════════════════════════════════════
   工作量：每個人手上有多少、接下來兩週每天有幾件
   點一個人 → 看他的任務清單
   ══════════════════════════════════════════════════════════ */

const DAYS = 14;

interface Load {
  email?: string;
  name: string;
  open: Task[];
  late: number;
  unacked: number;
  dueWeek: number;
  doneWeek: number;
  daily: number[];
}

export function Workload({ pm, onPick }: { pm: Pm; onPick: (email: string | null) => void }) {
  const { today, tasks, people } = pm;
  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(today, i)), [today]);

  const loads = useMemo<Load[]>(() => {
    const weekAgo = addDays(today, -7);
    const weekAhead = addDays(today, 7);
    const make = (email: string | undefined, name: string): Load => {
      const mine = tasks.filter((t) => (email ? t.assigneeEmail === email : !t.assigneeEmail));
      const open = mine.filter((t) => t.status !== "done");
      const daily = days.map(
        (d) =>
          open.filter((t) => {
            if (t.kind === "等待") return false;
            const s = t.start ?? t.due;
            const e = t.due ?? t.start;
            if (!s || !e) return false;
            // 逾期的任務算在今天
            if (isLate(t, today)) return d === today;
            return s <= d && d <= e;
          }).length
      );
      return {
        email,
        name,
        open,
        late: open.filter((t) => isLate(t, today)).length,
        unacked: open.filter((t) => email && !t.ackAt && t.assignedBy && t.assignedBy !== email).length,
        dueWeek: open.filter((t) => t.due && t.due >= today && t.due <= weekAhead).length,
        doneWeek: mine.filter((t) => t.status === "done" && (t.doneAt ?? "") >= weekAgo).length,
        daily,
      };
    };
    const list = people.map((p) => make(p.email, p.email === pm.me?.email ? `${p.name}（我）` : p.name));
    const none = make(undefined, "未指派");
    return [...list.sort((a, b) => b.open.length - a.open.length || b.late - a.late), ...(none.open.length ? [none] : [])];
  }, [people, tasks, days, today, pm.me?.email]);

  const max = Math.max(3, ...loads.flatMap((l) => l.daily));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-[#8E8E93] px-1">未完成的任務；方格是接下來每天手上同時有幾件（不含等待期）。</p>
      <Group>
        {/* 日期表頭 */}
        <div className="flex items-end gap-3 pl-4 pr-3 pt-3 pb-1.5 border-b border-[#F2F2F4]">
          <span className="flex-1 min-w-0 text-[12px] text-[#A1A1AA]">人員</span>
          <DayStrip
            values={days.map((d) => {
              const dow = toDay(d).getDay();
              return { label: d === today ? "今" : WEEKDAYS[dow], weekend: dow === 0 || dow === 6 };
            })}
          />
        </div>
        {loads.map((l, i) => (
          <button
            key={l.email ?? "none"}
            type="button"
            onClick={() => onPick(l.email ?? null)}
            className={`w-full flex items-center gap-3 pl-4 pr-3 py-3 text-left active:bg-[#F7F7F8] ${i < loads.length - 1 ? "border-b border-[#F2F2F4]" : ""}`}
          >
            <span className="flex-1 min-w-0 flex items-center gap-2.5">
              {l.email ? <Avatar name={l.name} email={l.email} size={32} /> : (
                <span className="w-8 h-8 rounded-full border border-dashed border-[#D4D4D8] flex items-center justify-center shrink-0">
                  <Icon name="person_add" className="text-[16px] text-[#A1A1AA]" />
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-[#18181B] truncate">{l.name}</span>
                <span className="block text-[12.5px] text-[#8E8E93] truncate">
                  {l.open.length ? `${l.open.length} 件進行中` : "沒有待辦"}
                  {l.late > 0 && <span style={{ color: RED }}>　逾期 {l.late}</span>}
                  {l.unacked > 0 && <span style={{ color: ORANGE }}>　未確認 {l.unacked}</span>}
                  {l.doneWeek > 0 && <span style={{ color: GREEN }}>　本週完成 {l.doneWeek}</span>}
                </span>
              </span>
            </span>
            <HeatStrip values={l.daily} max={max} />
          </button>
        ))}
      </Group>
    </div>
  );
}

const CELL = "w-[16px] sm:w-[18px]";
/** 手機只顯示一週，平板以上兩週 */
const wide = (i: number) => (i >= 7 ? "hidden sm:flex" : "flex");

function DayStrip({ values }: { values: { label: string; weekend: boolean }[] }) {
  return (
    <span className="flex gap-[3px] shrink-0">
      {values.map((v, i) => (
        <span key={i} className={`${CELL} ${wide(i)} justify-center text-[10px] ${v.label === "今" ? "font-bold" : ""}`} style={{ color: v.label === "今" ? ORANGE : v.weekend ? "#C7C7CC" : "#A1A1AA" }}>
          {v.label}
        </span>
      ))}
    </span>
  );
}

function HeatStrip({ values, max }: { values: number[]; max: number }) {
  return (
    <span className="flex gap-[3px] shrink-0" aria-label={`接下來兩週每天 ${values.join("、")} 件`}>
      {values.map((v, i) => {
        const a = v === 0 ? 0 : 0.25 + 0.75 * Math.min(1, v / max);
        return (
          <span
            key={i}
            className={`${CELL} ${wide(i)} h-[22px] rounded-[4px] items-center justify-center text-[10px] font-semibold tabular-nums`}
            style={{
              background: v === 0 ? "#F2F2F4" : v >= 3 ? `rgba(229,72,77,${a})` : `rgba(243,156,18,${a})`,
              color: a > 0.6 ? "#fff" : "#8E8E93",
            }}
          >
            {v > 0 ? v : ""}
          </span>
        );
      })}
    </span>
  );
}
