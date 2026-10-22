"use client";

import { useEffect, useRef, useState } from "react";

/* ══════════════════════════════════════════════════════════
   下拉更新（和長流 App 一樣）：iOS 原生的「菊花」指示
   - 8 根灰色放射短線，往下拉時一根一根長出來；放開後一格一格跳著轉，更新完收回去
   - 從凍結的標題列下緣（top）冒出來：指示在標題列底下（z 比標題列低），拉開時才露出來
   - 拉的時候內容由 iOS 原生的回彈往下移；放開後用 hold 讓內容停在下面（留位置給轉圈），更新完再收回
     （不用 transform 推內容：內容裡有 fixed 的按鈕，祖先加 transform 會讓它們跑位）
   - 抽屜、選單、教學打開時不觸發；在裡面捲動的區塊（已經往下捲了）也不觸發
   ══════════════════════════════════════════════════════════ */

const PULL = 0.6; // 手指移動 → 指示移動
const GO = 72; // 拉超過這麼多放開就更新
const HOLD = 60; // 更新中內容往下留的空間

/** 從手指按的地方往上找：有任何一層已經捲下去了，就是在捲內容，不是下拉更新 */
function scrolledInside(el: EventTarget | null) {
  for (let n = el instanceof Element ? el : null; n; n = n.parentElement) {
    if (n.scrollTop > 0) return true;
  }
  return false;
}

export function PullRefresh({
  onRefresh,
  top = 0,
  hold,
  enabled = true,
}: {
  onRefresh: () => Promise<unknown> | unknown;
  /** 凍結的標題列下緣（px）：指示從這條線底下冒出來 */
  top?: number;
  /** 更新中把內容往下推多少（0＝收回）；不傳就不推 */
  hold?: (px: number) => void;
  enabled?: boolean;
}) {
  const [h, setH] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const y0 = useRef<number | null>(null);
  const dy = useRef(0);
  const busyRef = useRef(false);
  const run = useRef(onRefresh);
  run.current = onRefresh;
  const holdRef = useRef(hold);
  holdRef.current = hold;

  useEffect(() => {
    if (!enabled) return;
    const blocked = () => !!document.querySelector('[data-pm-sheet], [role="dialog"], [data-tour-card]');
    const start = (e: TouchEvent) => {
      y0.current = !busyRef.current && window.scrollY <= 0 && e.touches.length === 1 && !blocked() && !scrolledInside(e.target) ? e.touches[0].clientY : null;
      dy.current = 0;
    };
    const move = (e: TouchEvent) => {
      if (y0.current == null) return;
      dy.current = e.touches[0].clientY - y0.current;
      setDragging(true);
      setH(dy.current <= 0 || window.scrollY > 0 ? 0 : dy.current * PULL);
    };
    const end = async () => {
      if (y0.current == null) return;
      const go = dy.current * PULL > GO;
      y0.current = null;
      setDragging(false);
      if (!go) {
        setH(0);
        return;
      }
      busyRef.current = true;
      setBusy(true);
      setH(GO);
      holdRef.current?.(HOLD);
      try {
        await run.current();
      } finally {
        busyRef.current = false;
        setBusy(false);
        setH(0);
        holdRef.current?.(0);
      }
    };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
    };
  }, [enabled]);

  // 拉越多，長出越多根；更新中 8 根全亮
  const n = busy ? 8 : Math.min(8, Math.floor(h / 9));
  // 靜止時藏在標題列底下（往上 46）；拉的時候跟著往下；更新中停在留出來的空間正中間
  const y = busy ? (HOLD - 28) / 2 : Math.min(h, 80) - 46;
  return (
    <div
      aria-hidden={!busy}
      role="status"
      aria-label={busy ? "更新中" : undefined}
      className="fixed left-1/2 z-[30] w-7 h-7 pointer-events-none md:hidden"
      style={{
        top: top + 8,
        transform: `translate(-50%, ${y}px)`,
        opacity: h > 4 || busy ? 1 : 0,
        transition: dragging ? "opacity .12s" : "transform .3s cubic-bezier(.2,.9,.25,1), opacity .25s",
      }}
    >
      <svg viewBox="0 0 28 28" width={28} height={28} className={busy ? "ptr-spin" : undefined}>
        {Array.from({ length: 8 }, (_, i) => (
          <line
            key={i}
            x1="14"
            y1="3.5"
            x2="14"
            y2="8.5"
            transform={`rotate(${i * 45} 14 14)`}
            stroke="#8E8E93"
            strokeWidth={2.6}
            strokeLinecap="round"
            style={{ opacity: i < n ? 1 - ((8 - i) % 8) * 0.1 : 0, transition: "opacity .12s" }}
          />
        ))}
      </svg>
      <style>{`
        .ptr-spin { animation: ptr-step .8s steps(8) infinite; }
        @keyframes ptr-step { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .ptr-spin { animation-duration: 2.4s; } }
      `}</style>
    </div>
  );
}
