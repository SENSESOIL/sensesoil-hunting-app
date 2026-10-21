"use client";

import React, { useEffect, useState } from "react";
import { addDays, toDay, WEEKDAYS } from "@/lib/project-ops";
import { Icon } from "./ui";

/* ══════════════════════════════════════════════════════════
   選日期區間：同一個月曆點兩下
   - 第一下＝開始日，第二下＝結束日；中間畫一條色帶
   - 只做一天：同一天點兩下
   - 第二下點在開始日之前：那天變成開始日、原本的開始日變成結束日
   - 選好兩端才呼叫 onChange（只點了一下還不算）
   ══════════════════════════════════════════════════════════ */

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function RangeCalendar({
  start,
  end,
  today,
  onChange,
}: {
  start?: string;
  end?: string;
  today: string;
  onChange: (start: string, end: string) => void;
}) {
  // 只點了第一下（等第二下）
  const [first, setFirst] = useState<string | null>(null);
  const anchor = first ?? start ?? end ?? today;
  const [month, setMonth] = useState(() => anchor.slice(0, 7));
  useEffect(() => {
    setFirst(null);
    setMonth((start ?? end ?? today).slice(0, 7));
    // 換了任務、外面改了日期：重新對到那個月
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  const [y, m] = month.split("-").map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const lead = firstDay.getDay();
  const daysIn = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => iso(new Date(y, m - 1, i + 1)))];
  while (cells.length % 7) cells.push(null);

  // 畫出來的區間：只點了一下＝那一天；不然＝目前的開始到結束
  const a = first ?? start ?? end;
  const b = first ? first : end ?? start;
  const lo = a && b ? (a < b ? a : b) : undefined;
  const hi = a && b ? (a < b ? b : a) : undefined;

  const tap = (d: string) => {
    if (!first) {
      setFirst(d);
      return;
    }
    setFirst(null);
    onChange(d < first ? d : first, d < first ? first : d);
  };
  const shift = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(iso(d).slice(0, 7));
  };

  return (
    <div className="select-none">
      <div className="flex items-center justify-between px-1 pb-2">
        <button type="button" onClick={() => shift(-1)} aria-label="上個月" className="w-9 h-9 rounded-full flex items-center justify-center text-[#52525B] active:bg-[#F2F2F4]">
          <Icon name="chevron_left" className="text-[22px]" />
        </button>
        <span className="text-[16px] font-semibold text-[#18181B] tabular-nums">
          {y} 年 {m} 月
        </span>
        <button type="button" onClick={() => shift(1)} aria-label="下個月" className="w-9 h-9 rounded-full flex items-center justify-center text-[#52525B] active:bg-[#F2F2F4]">
          <Icon name="chevron_right" className="text-[22px]" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[13px] text-[#A1A1AA] pb-1">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) return <span key={`x${i}`} className="h-11" />;
          const col = i % 7;
          const inRange = !!(lo && hi && d >= lo && d <= hi);
          const isEnd = d === lo || d === hi;
          const single = lo === hi;
          // 色帶：區間內每格都鋪，左右端（或換週）圓角
          const roundL = d === lo || col === 0 || d.endsWith("-01");
          const roundR = d === hi || col === 6 || addDays(d, 1).endsWith("-01");
          return (
            <button key={d} type="button" onClick={() => tap(d)} aria-label={d} aria-pressed={isEnd} className="relative h-11 flex items-center justify-center">
              {inRange && !single && (
                <span
                  className={`absolute inset-y-[4px] bg-[var(--accent-soft)] ${roundL ? "left-[3px] rounded-l-full" : "left-0"} ${roundR ? "right-[3px] rounded-r-full" : "right-0"}`}
                />
              )}
              <span
                className={`relative w-[38px] h-[38px] rounded-full flex items-center justify-center text-[16px] tabular-nums ${
                  isEnd ? "bg-[var(--accent)] text-white font-semibold" : d === today ? "text-[var(--accent)] font-semibold" : "text-[#18181B]"
                }`}
              >
                {Number(d.slice(8, 10))}
              </span>
            </button>
          );
        })}
      </div>
      <p className="px-1 pt-2 text-[12.5px] text-[#8E8E93]">{first ? "再點結束日（只做一天就再點同一天）" : "點開始日，再點結束日"}</p>
    </div>
  );
}

/** 「10/21 → 10/24・4 天」 */
export function rangeLabel(start?: string, end?: string) {
  if (!start && !end) return "";
  const md = (s: string) => {
    const d = toDay(s);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const a = start ?? end!;
  const b = end ?? start!;
  if (a === b) return md(a);
  const n = Math.round((toDay(b).getTime() - toDay(a).getTime()) / 86400000) + 1;
  return `${md(a)} → ${md(b)}・${n} 天`;
}
