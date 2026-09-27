"use client";

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { addDays, diffDays, toDay, WEEKDAYS } from "@/lib/project-ops";
import { ACCENT, STATUS, TRACK } from "./ui";

/* ══════════════════════════════════════════════════════════
   甘特圖
   - 左側名稱欄 sticky，時間軸橫向捲動（手機一次看不完幾個月是正常的）
   - 長條：淺色底＝排定區間；深色填色＝已完成的比例；紅色斜紋＝超過預定還沒做完的天數
   - 今天：一條品牌橘的細線，貫穿表頭與每一列
   - 桌機滑過長條有提示；手機點整列開啟細節
   ══════════════════════════════════════════════════════════ */

export interface GanttBar {
  start: string;
  end: string;
  progress?: number;
  fill: string;
  /** 已過預定結束日但未完成：從 end 隔天畫到 today */
  late?: boolean;
  tip?: React.ReactNode;
}

export interface GanttRow {
  id: string;
  label: string;
  sublabel?: string;
  bars: GanttBar[];
  onClick?: () => void;
  /** 列尾的小字（例如進度百分比） */
  trailing?: string;
}

const ROW_H = 44;
const BAR_H = 14;

export default function Gantt({
  rows,
  today,
  dayWidth,
  from,
  to,
  labelWidth = 150,
  dense = false,
  fit,
  anchor = 0.3,
}: {
  rows: GanttRow[];
  today: string;
  dayWidth: number;
  from: string;
  to: string;
  labelWidth?: number;
  /** 日刻度（工項層級）或月刻度（專案層級） */
  dense?: boolean;
  /** 依容器寬度縮放到整段放得下（每天寬度介於 min～max，放不下才捲動） */
  fit?: { min: number; max: number };
  /** 捲動時「今天」要落在可視區的哪個位置（0＝最左，1＝最右） */
  anchor?: number;
}) {
  const days = Math.max(1, diffDays(from, to) + 1);
  const scroller = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useLayoutEffect(() => {
    if (!fit) return;
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, [fit]);
  if (fit && boxW) {
    dayWidth = Math.max(fit.min, Math.min(fit.max, (boxW - labelWidth - 56) / days));
  }
  const width = days * dayWidth;
  const x = (iso: string) => diffDays(from, iso) * dayWidth;
  const todayX = x(today) + dayWidth / 2;
  const showToday = today >= from && today <= to;

  const [tip, setTip] = useState<{ x: number; y: number; node: React.ReactNode } | null>(null);
  // 左右還有內容時顯示邊緣陰影 —— 手機上看不出「可以往左捲」是最常見的困惑
  const [edges, setEdges] = useState({ left: false, right: false });
  const updateEdges = () => {
    const el = scroller.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  };

  // 捲到「今天」落在可視區左側三分之一，前後都看得到。
  // 只在尺度或範圍改變時重新定位；使用者自己捲動不會被拉回來。
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, todayX - (el.clientWidth - labelWidth) * anchor);
    updateEdges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayWidth, from, to, labelWidth]);

  /* ── 表頭：月份（專案層級）或日期（工項層級） ── */
  const header = useMemo(() => {
    const marks: { x: number; label: string; strong?: boolean }[] = [];
    const ticks: number[] = [];
    const weekends: number[] = [];
    for (let i = 0; i < days; i++) {
      const iso = addDays(from, i);
      const d = toDay(iso);
      if (dense) {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) weekends.push(i * dayWidth);
        if (dow === 1) ticks.push(i * dayWidth);
        if (d.getDate() === 1 || i === 0 || dow === 1) {
          marks.push({
            x: i * dayWidth,
            label: d.getDate() === 1 || i === 0 ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getDate()}`,
            strong: d.getDate() === 1 || i === 0,
          });
        }
      } else if (d.getDate() === 1 || i === 0) {
        const m = d.getMonth() + 1;
        marks.push({
          x: i * dayWidth,
          label: m === 1 || i === 0 ? `${d.getFullYear()} · ${m}月` : `${m}月`,
          strong: true,
        });
        if (i !== 0) ticks.push(i * dayWidth);
      }
    }
    // 月初（粗體）標記附近的週一日期會疊在一起，讓位給月初
    const strong = marks.filter((m) => m.strong).map((m) => m.x);
    const kept = marks.filter((m) => m.strong || strong.every((sx) => Math.abs(sx - m.x) >= 34));
    return { marks: kept, ticks, weekends };
  }, [from, days, dayWidth, dense]);

  // 格線是同一份元素，在每一列重複放；不要寫成內部元件，否則每次重繪都會整批卸載重建
  const grid = (
    <>
      {header.weekends.map((wx) => (
        <div key={`w${wx}`} className="absolute top-0 bottom-0 bg-[#FAFAFA]" style={{ left: wx, width: dayWidth }} />
      ))}
      {header.ticks.map((tx) => (
        <div key={`t${tx}`} className="absolute top-0 bottom-0 w-px bg-[#F0F0F2]" style={{ left: tx }} />
      ))}
      {showToday && (
        <div className="absolute top-0 bottom-0 w-[1.5px] z-[3]" style={{ left: todayX, background: ACCENT }} />
      )}
    </>
  );

  return (
    <div className="relative">
      <div
        ref={scroller}
        className="overflow-x-auto overscroll-x-contain scrollbar-hide"
        onScroll={() => {
          if (tip) setTip(null);
          updateEdges();
        }}
      >
        <div style={{ width: labelWidth + width + 56 }}>
          {/* 表頭 */}
          <div className="flex relative z-[5] bg-white border-b border-[#E4E4E7]">
            <div
              className="sticky left-0 z-[6] bg-white shrink-0 border-r border-[#F0F0F2]"
              style={{ width: labelWidth, height: dense ? 44 : 32 }}
            />
            <div className="relative shrink-0" style={{ width: width + 56, height: dense ? 44 : 32 }}>
              {header.marks.map((m) => (
                <span
                  key={`m${m.x}`}
                  className={`absolute top-2 text-[11px] whitespace-nowrap tabular-nums ${
                    m.strong ? "font-semibold text-[#52525B]" : "text-[#A1A1AA]"
                  }`}
                  style={{ left: m.x + 4 }}
                >
                  {m.label}
                </span>
              ))}
              {dense &&
                Array.from({ length: days }).map((_, i) => {
                  const d = toDay(addDays(from, i));
                  const isToday = addDays(from, i) === today;
                  return (
                    <span
                      key={`d${i}`}
                      className={`absolute bottom-1.5 text-[10px] text-center ${
                        isToday ? "font-bold text-[#18181B]" : "text-[#C4C4CC]"
                      }`}
                      style={{ left: i * dayWidth, width: dayWidth }}
                    >
                      {dayWidth >= 18 ? WEEKDAYS[d.getDay()] : ""}
                    </span>
                  );
                })}
              {showToday && (
                <span
                  className="absolute bottom-0 translate-y-1/2 -translate-x-1/2 z-[4] w-[7px] h-[7px] rounded-full ring-2 ring-white"
                  style={{ left: todayX, background: ACCENT }}
                />
              )}
            </div>
          </div>

          {/* 列 */}
          {rows.map((row) => (
            <div
              key={row.id}
              className={`flex group outline-none focus-visible:bg-[#FAFAFA] ${row.onClick ? "cursor-pointer" : ""}`}
              style={{ height: ROW_H }}
              onClick={row.onClick}
              role={row.onClick ? "button" : undefined}
              tabIndex={row.onClick ? 0 : undefined}
              aria-label={row.onClick ? `${row.label}${row.sublabel ? `，${row.sublabel}` : ""}${row.trailing ? `，${row.trailing}` : ""}` : undefined}
              onKeyDown={
                row.onClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        row.onClick!();
                      }
                    }
                  : undefined
              }
            >
              <div
                className="sticky left-0 z-[4] bg-white shrink-0 border-r border-[#F0F0F2] border-b border-b-[#F4F4F5] flex flex-col justify-center px-3 group-hover:bg-[#FAFAFA] transition-colors"
                style={{ width: labelWidth }}
              >
                <span className="text-[13px] font-semibold text-[#18181B] truncate leading-tight">{row.label}</span>
                {row.sublabel && (
                  <span className="text-[11px] text-[#A1A1AA] truncate leading-tight mt-0.5">{row.sublabel}</span>
                )}
              </div>
              <div
                className="relative shrink-0 border-b border-[#F4F4F5] group-hover:bg-[#FCFCFC]"
                style={{ width: width + 56 }}
              >
                {grid}
                {row.bars.map((b, bi) => {
                  const bx = x(b.start);
                  const bw = Math.max(dayWidth, (diffDays(b.start, b.end) + 1) * dayWidth);
                  const lateFrom = b.late && b.end < today ? x(addDays(b.end, 1)) : 0;
                  const lateW = b.late && b.end < today ? x(today) + dayWidth - lateFrom : 0;
                  const pct = Math.max(0, Math.min(100, b.progress ?? 0));
                  return (
                    <React.Fragment key={bi}>
                      {lateW > 0 && (
                        <div
                          className="absolute z-[2] rounded-r-[4px]"
                          style={{
                            left: lateFrom,
                            width: lateW,
                            top: (ROW_H - BAR_H) / 2,
                            height: BAR_H,
                            background: `repeating-linear-gradient(135deg, ${STATUS.critical}33 0 4px, ${STATUS.critical}14 4px 8px)`,
                          }}
                          title="超過預定完成日"
                        />
                      )}
                      <div
                        className="absolute z-[2] rounded-[4px] overflow-hidden"
                        style={{ left: bx, width: bw, top: (ROW_H - BAR_H) / 2, height: BAR_H, background: TRACK }}
                        onMouseMove={(e) => {
                          if (!b.tip || window.matchMedia("(hover: none)").matches) return;
                          setTip({ x: e.clientX, y: e.clientY, node: b.tip });
                        }}
                        onMouseLeave={() => setTip(null)}
                      >
                        {/* 淺底上再疊一層極淡的同色，讓「排定但未做」與背景有區隔 */}
                        <div className="absolute inset-0" style={{ background: b.fill, opacity: 0.16 }} />
                        {pct > 0 && (
                          <div className="absolute left-0 top-0 bottom-0" style={{ width: `${pct}%`, background: b.fill }} />
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
                {row.trailing && row.bars.length > 0 && (
                  <span
                    className="absolute text-[11px] text-[#A1A1AA] tabular-nums whitespace-nowrap z-[2]"
                    style={{
                      left:
                        Math.max(
                          ...row.bars.map((b) => {
                            const endX = x(b.end) + dayWidth;
                            return b.late && b.end < today ? Math.max(endX, x(today) + dayWidth) : endX;
                          })
                        ) + 6,
                      top: ROW_H / 2 - 8,
                    }}
                  >
                    {row.trailing}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {edges.left && (
        <div
          className="absolute top-0 bottom-0 w-5 pointer-events-none z-[7] bg-gradient-to-r from-black/[0.07] to-transparent"
          style={{ left: labelWidth }}
        />
      )}
      {edges.right && (
        <div className="absolute top-0 bottom-0 right-0 w-5 pointer-events-none z-[7] bg-gradient-to-l from-black/[0.07] to-transparent" />
      )}
      {tip && (
        <div
          className="fixed z-[200] pointer-events-none bg-[#18181B] text-white text-[12px] leading-relaxed rounded-xl px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.18)] max-w-[260px]"
          style={{ left: tip.x + 14, top: tip.y + 14 }}
        >
          {tip.node}
        </div>
      )}
    </div>
  );
}
