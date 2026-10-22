"use client";

import { useEffect, useRef, useState } from "react";

/* ══════════════════════════════════════════════════════════
   下拉更新（和長流 App 一樣）
   - 在最上面往下拉：畫面頂端滑出一顆白色膠囊「↻ 下拉更新」，拉夠了變「放開更新」
   - 放開：膠囊停著轉圈「更新中…」，更新完收回去
   - 抽屜、選單、教學打開時不觸發；在裡面捲動的區塊（已經往下捲了）也不觸發
   ══════════════════════════════════════════════════════════ */

const PULL = 0.6; // 手指移動 → 膠囊移動
const GO = 70; // 拉超過這麼多（膠囊位移）放開就更新

/** 從手指按的地方往上找：有任何一層已經捲下去了，就是在捲內容，不是下拉更新 */
function scrolledInside(el: EventTarget | null) {
  for (let n = el instanceof Element ? el : null; n; n = n.parentElement) {
    if (n.scrollTop > 0) return true;
  }
  return false;
}

export function PullRefresh({ onRefresh, enabled = true }: { onRefresh: () => Promise<unknown> | unknown; enabled?: boolean }) {
  const [h, setH] = useState(0);
  const [state, setState] = useState<"idle" | "pull" | "ready" | "busy">("idle");
  const y0 = useRef<number | null>(null);
  const dy = useRef(0);
  const busy = useRef(false);
  const run = useRef(onRefresh);
  run.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;
    const blocked = () => !!document.querySelector('[data-pm-sheet], [role="dialog"], [data-tour-card]');
    const start = (e: TouchEvent) => {
      y0.current = !busy.current && window.scrollY <= 0 && e.touches.length === 1 && !blocked() && !scrolledInside(e.target) ? e.touches[0].clientY : null;
      dy.current = 0;
    };
    const move = (e: TouchEvent) => {
      if (y0.current == null) return;
      dy.current = e.touches[0].clientY - y0.current;
      if (dy.current <= 0 || window.scrollY > 0) {
        setH(0);
        setState("idle");
        return;
      }
      const v = dy.current * PULL;
      setH(v);
      setState(v > GO ? "ready" : "pull");
    };
    const end = async () => {
      if (y0.current == null) return;
      const go = dy.current * PULL > GO;
      y0.current = null;
      if (!go) {
        setH(0);
        setState("idle");
        return;
      }
      busy.current = true;
      setH(80);
      setState("busy");
      try {
        await run.current();
      } finally {
        busy.current = false;
        setH(0);
        setState("idle");
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

  const dragging = state === "pull" || state === "ready";
  return (
    <div
      aria-hidden={state === "idle"}
      role="status"
      className="fixed left-1/2 z-[70] flex items-center gap-1.5 px-3.5 py-[7px] rounded-full bg-white border border-[#E4E4E7] shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)] text-[13px] text-[#52525B] pointer-events-none"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 6px)",
        transform: `translate(-50%, ${Math.min(h, 90) - 60}px)`,
        opacity: Math.min(1, h / 70),
        // 拉的時候跟著手指；放開才用動畫回去
        transition: dragging ? "none" : "transform .25s, opacity .25s",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={16}
        height={16}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={state === "busy" ? "animate-spin motion-reduce:animate-none" : ""}
      >
        <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
      </svg>
      <span>{state === "busy" ? "更新中…" : state === "ready" ? "放開更新" : "下拉更新"}</span>
    </div>
  );
}
