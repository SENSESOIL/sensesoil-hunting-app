"use client";

import React, { useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { diffDays, toDay, WEEKDAYS } from "@/lib/project-ops";
import { ACCENT, STATUS, TRACK } from "./ui";

/* ══════════════════════════════════════════════════════════
   甘特圖
   - 左側名稱欄 sticky，時間軸橫向捲動（手機一次看不完幾個月是正常的）
   - 長條：淺色底＝排定區間；深色填色＝已完成的比例；紅色斜紋＝超過預定還沒做完的天數
           虛線框＝等待期（養護、待驗），不需要派工，所以不畫進度
   - 今天：一條品牌橘的細線，貫穿表頭與每一列
   - 桌機滑過長條有提示；手機點整列開啟細節
   - 列數多時改成框內上下捲動，表頭固定在上面（捲到後面還看得到日期）

   效能：背景格線（週末、週／月刻度、今天線）整張只畫一層，不是每一列各畫一份；
   滑鼠提示自己管位置，移動滑鼠不會讓整張圖重繪。
   ══════════════════════════════════════════════════════════ */

export interface GanttBar {
  start: string;
  end: string;
  progress?: number;
  fill: string;
  /** 已過預定結束日但未完成：從 end 隔天畫到 today */
  late?: boolean;
  tip?: React.ReactNode;
  /** 等待期（養護、待驗…）：透明長條＋同色虛線外框，不畫進度 */
  dashed?: boolean;
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
/** 時間軸右側留白，放列尾文字 */
const TAIL = 56;
/** 超過這麼多列就改成框內上下捲動、表頭固定 */
const SCROLL_ROWS = 10;

/* ── 滑鼠提示 ──────────────────────────────────────────────
   位置直接寫進 DOM（transform），不經過 React state：
   滑鼠每動一下都 setState 會讓整張甘特圖（上百個格線、長條）跟著重繪。
   只有換到另一條長條、內容真的變了，才重繪這個小元件自己。 */

type TipApi = {
  show: (x: number, y: number, node: React.ReactNode) => void;
  hide: () => void;
};

/** 靠近視窗右緣／下緣時翻到游標另一側，提示框不會被切掉 */
function placeTip(el: HTMLDivElement, x: number, y: number) {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const left = x + 14 + w > window.innerWidth - 8 ? Math.max(8, x - 14 - w) : x + 14;
  const top = y + 14 + h > window.innerHeight - 8 ? Math.max(8, y - 14 - h) : y + 14;
  el.style.transform = `translate3d(${left}px, ${top}px, 0)`;
}

function GanttTip({ api }: { api: React.Ref<TipApi> }) {
  const el = useRef<HTMLDivElement>(null);
  const cur = useRef<React.ReactNode>(null);
  const pos = useRef({ x: 0, y: 0 });
  const [node, setNode] = useState<React.ReactNode>(null);

  useImperativeHandle(
    api,
    () => ({
      show(x, y, n) {
        pos.current = { x, y };
        if (cur.current !== n) {
          cur.current = n;
          setNode(n);
        }
        if (el.current) placeTip(el.current, x, y);
      },
      hide() {
        if (cur.current === null) return;
        cur.current = null;
        setNode(null);
      },
    }),
    []
  );

  // 內容換了尺寸就變了，重新量一次再決定要不要翻邊
  useLayoutEffect(() => {
    if (node && el.current) placeTip(el.current, pos.current.x, pos.current.y);
  }, [node]);

  return (
    <div
      ref={el}
      hidden={!node}
      aria-hidden
      className="fixed left-0 top-0 z-[200] pointer-events-none bg-[#18181B] text-white text-[12px] leading-relaxed rounded-[12px] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.18)] max-w-[260px]"
    >
      {node}
    </div>
  );
}

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
  const tipApi = useRef<TipApi>(null);
  const [boxW, setBoxW] = useState(0);

  // 左右／上下還有內容時顯示邊緣陰影 —— 手機上看不出「可以往左捲」是最常見的困惑
  const [edges, setEdges] = useState({ left: false, right: false, top: false, bottom: false });
  const updateEdges = () => {
    const el = scroller.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setEdges((e) =>
      e.left === left && e.right === right && e.top === top && e.bottom === bottom ? e : { left, right, top, bottom }
    );
  };

  // 呼叫端每次重繪都傳新的 fit 物件，只看數值有沒有變，否則每次重繪都會重建 ResizeObserver
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      if (fit) setBoxW(el.clientWidth);
      updateEdges();
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit?.min, fit?.max]);
  if (fit && boxW) {
    dayWidth = Math.max(fit.min, Math.min(fit.max, (boxW - labelWidth - TAIL) / days));
  }
  const width = days * dayWidth;
  const x = (iso: string) => diffDays(from, iso) * dayWidth;
  const todayX = x(today) + dayWidth / 2;
  const showToday = today >= from && today <= to;

  const scrollY = rows.length > SCROLL_ROWS;
  const headH = dense ? 44 : 32;

  // 捲到「今天」落在可視區左側三分之一，前後都看得到。
  // 只在尺度或範圍改變時重新定位；使用者自己捲動不會被拉回來。
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, todayX - (el.clientWidth - labelWidth) * anchor);
    updateEdges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayWidth, from, to, labelWidth]);

  // 列數變了（篩選、展開）上下陰影要重算
  useLayoutEffect(() => {
    updateEdges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  /* ── 表頭：月份（專案層級）或日期（工項層級） ── */
  const header = useMemo(() => {
    const marks: { x: number; label: string; strong?: boolean }[] = [];
    const ticks: number[] = [];
    const weekends: number[] = [];
    // 每天的星期字只有夠寬才畫；窄的時候畫了也擠成一團，還白白多出幾百個節點
    const showDays = dense && dayWidth >= 18;
    const dayLabels: { x: number; label: string; weekend: boolean; isToday: boolean }[] = [];
    const todayIdx = diffDays(from, today);
    // 同一個 Date 逐日往後推，不必每天重新解析字串
    const d = toDay(from);
    for (let i = 0; i < days; i++, d.setDate(d.getDate() + 1)) {
      const px = i * dayWidth;
      const date = d.getDate();
      if (dense) {
        const dow = d.getDay();
        const weekend = dow === 0 || dow === 6;
        if (weekend) weekends.push(px);
        if (dow === 1) ticks.push(px);
        if (date === 1 || i === 0 || dow === 1) {
          marks.push({
            x: px,
            label: date === 1 || i === 0 ? `${d.getMonth() + 1}/${date}` : `${date}`,
            strong: date === 1 || i === 0,
          });
        }
        if (showDays) dayLabels.push({ x: px, label: WEEKDAYS[dow], weekend, isToday: i === todayIdx });
      } else if (date === 1 || i === 0) {
        const m = d.getMonth() + 1;
        marks.push({
          x: px,
          label: m === 1 || i === 0 ? `${d.getFullYear()} · ${m}月` : `${m}月`,
          strong: true,
        });
        if (i !== 0) ticks.push(px);
      }
    }
    // 月初（粗體）標記附近的週一日期會疊在一起，讓位給月初
    const strong = marks.filter((m) => m.strong).map((m) => m.x);
    const kept = marks.filter((m) => m.strong || strong.every((sx) => Math.abs(sx - m.x) >= 34));
    return { marks: kept, ticks, weekends, dayLabels };
  }, [from, today, days, dayWidth, dense]);

  // 背景格線：整張圖一層，墊在所有列底下（列的時間軸區是透明的）
  const background = useMemo(
    () => (
      <div
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{ left: labelWidth, width: width + TAIL }}
        aria-hidden
      >
        {header.weekends.map((wx) => (
          <div key={`w${wx}`} className="absolute top-0 bottom-0 bg-[#FAFAFA]" style={{ left: wx, width: dayWidth }} />
        ))}
        {header.ticks.map((tx) => (
          <div key={`t${tx}`} className="absolute top-0 bottom-0 w-px bg-[#F0F0F2]" style={{ left: tx }} />
        ))}
      </div>
    ),
    [header, dayWidth, labelWidth, width]
  );

  return (
    <div className="relative">
      <div
        ref={scroller}
        className={`${scrollY ? "overflow-auto" : "overflow-x-auto"} overscroll-x-contain scrollbar-hide`}
        style={
          scrollY
            ? {
                // 下限 240px：手機橫放時 100dvh 很矮，不設下限只剩一兩列
                maxHeight: "max(240px, calc(100dvh - 240px))",
                // 用鍵盤 Tab 到下一列時，不要停在固定表頭底下被蓋住
                scrollPaddingTop: headH,
              }
            : undefined
        }
        onScroll={() => {
          tipApi.current?.hide();
          updateEdges();
        }}
      >
        <div style={{ width: labelWidth + width + TAIL }}>
          {/* 表頭：框內上下捲動時固定在頂端 */}
          <div
            className={`flex sticky top-0 z-[5] bg-white border-b border-[#E4E4E7] transition-shadow ${
              edges.top ? "shadow-[0_6px_12px_-10px_rgba(0,0,0,0.35)]" : ""
            }`}
          >
            <div
              className="sticky left-0 top-0 z-[6] bg-white shrink-0 border-r border-[#F0F0F2]"
              style={{ width: labelWidth, height: headH }}
            />
            <div className="relative shrink-0" style={{ width: width + TAIL, height: headH }}>
              {header.marks.map((m) => (
                <span
                  key={`m${m.x}`}
                  className={`absolute top-2 text-[11px] whitespace-nowrap tabular-nums ${
                    m.strong ? "font-semibold text-[#52525B]" : "text-[#71717A]"
                  }`}
                  style={{ left: m.x + 4 }}
                >
                  {m.label}
                </span>
              ))}
              {header.dayLabels.map((dl) => (
                <span
                  key={`d${dl.x}`}
                  className={`absolute bottom-1.5 text-[10px] text-center ${
                    dl.isToday ? "font-bold text-[#18181B]" : dl.weekend ? "text-[#A1A1AA]" : "text-[#71717A]"
                  }`}
                  style={{ left: dl.x, width: dayWidth }}
                >
                  {dl.label}
                </span>
              ))}
              {showToday && (
                <span
                  className="absolute bottom-0 translate-y-1/2 -translate-x-1/2 z-[4] w-[7px] h-[7px] rounded-full ring-2 ring-white"
                  style={{ left: todayX, background: ACCENT }}
                />
              )}
            </div>
          </div>

          {/* 列 */}
          <div className="relative">
            {background}

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
                {/* 鍵盤焦點：globals.css 清掉了 outline，改用名稱欄變底色＋左側橘色細條 */}
                <div
                  className="sticky left-0 z-[4] bg-white shrink-0 border-r border-[#F0F0F2] border-b border-b-[#F4F4F5] flex flex-col justify-center px-3 group-hover:bg-[#FAFAFA] group-focus-visible:bg-[#F4F4F5] transition-colors before:absolute before:left-0 before:inset-y-0 before:w-[3px] before:content-[''] group-focus-visible:before:bg-[#F39C12]"
                  style={{ width: labelWidth }}
                >
                  <span className="text-[13px] font-semibold text-[#18181B] truncate leading-tight">{row.label}</span>
                  {row.sublabel && (
                    <span className="text-[11px] text-[#71717A] truncate leading-tight mt-0.5">{row.sublabel}</span>
                  )}
                </div>
                {/* 時間軸區保持透明，底下那層格線才看得到；滑過只疊一層極淡的墨色 */}
                <div
                  className="relative shrink-0 border-b border-[#F4F4F5] group-hover:bg-[#18181B]/[0.02]"
                  style={{ width: width + TAIL }}
                >
                  {row.bars.map((b, bi) => {
                    const bx = x(b.start);
                    const bw = Math.max(dayWidth, (diffDays(b.start, b.end) + 1) * dayWidth);
                    const isLate = !!b.late && b.end < today;
                    const lateFrom = isLate ? bx + bw : 0;
                    const lateW = isLate ? x(today) + dayWidth - lateFrom : 0;
                    const pct = Math.max(0, Math.min(100, b.progress ?? 0));
                    const tip = b.tip;
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
                          style={{
                            left: bx,
                            width: bw,
                            top: (ROW_H - BAR_H) / 2,
                            height: BAR_H,
                            ...(b.dashed
                              ? { background: "transparent", border: `1.5px dashed ${b.fill}` }
                              : { background: TRACK }),
                          }}
                          // 只給滑鼠：觸控的 pointermove 是手指拖曳，跳提示只會擋住畫面
                          onPointerMove={
                            tip
                              ? (e) => {
                                  if (e.pointerType === "mouse") tipApi.current?.show(e.clientX, e.clientY, tip);
                                }
                              : undefined
                          }
                          onPointerLeave={tip ? () => tipApi.current?.hide() : undefined}
                        >
                          {!b.dashed && (
                            <>
                              {/* 淺底上再疊一層極淡的同色，讓「排定但未做」與背景有區隔 */}
                              <div className="absolute inset-0" style={{ background: b.fill, opacity: 0.16 }} />
                              {pct > 0 && (
                                <div
                                  className="absolute left-0 top-0 bottom-0"
                                  style={{ width: `${pct}%`, background: b.fill }}
                                />
                              )}
                            </>
                          )}
                        </div>
                      </React.Fragment>
                    );
                  })}
                  {row.trailing && row.bars.length > 0 && (
                    <span
                      className="absolute text-[11px] text-[#71717A] tabular-nums whitespace-nowrap z-[2]"
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

            {/* 今天：一條線貫穿所有列，壓在長條上、名稱欄下 */}
            {showToday && (
              <div
                className="absolute top-0 bottom-0 w-[1.5px] z-[3] pointer-events-none"
                style={{ left: labelWidth + todayX, background: ACCENT }}
                aria-hidden
              />
            )}
          </div>
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
      {edges.bottom && (
        <div className="absolute left-0 right-0 bottom-0 h-5 pointer-events-none z-[7] bg-gradient-to-t from-black/[0.06] to-transparent" />
      )}
      <GanttTip api={tipApi} />
    </div>
  );
}
