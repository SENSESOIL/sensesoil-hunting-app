"use client";

import React from "react";
import type { Health, Stage, WorkStatus } from "@/lib/project-ops";

/* ══════════════════════════════════════════════════════════
   專案情報／工進排程共用的小元件。
   視覺語彙沿用指揮中心：白卡、#E4E4E7 細框、Material Symbols 細線圖示。

   顏色分工（刻意的）：
     品牌橘 #F39C12  → 只用在互動（選取、按鈕）與甘特圖的「今天」基準線
     狀態色          → 只用在健康度，永遠搭配圖示＋文字，不單靠顏色
     進度條          → 墨色；落後／逾期才換成狀態色
   品牌橘跟「注意／落後」色相太近，進度條若也用橘色會讓人分不清是進度還是警告。
   ══════════════════════════════════════════════════════════ */

export const INK = "#18181B";
export const INK_2 = "#3F3F46";
export const MUTED = "#A1A1AA";
/** 帶資訊的次要文字（白底 4.8:1）。#A1A1AA 只給圖示、placeholder、停用狀態 */
export const TEXT_3 = "#71717A";
export const LINE = "#E4E4E7";
export const TRACK = "#F0F0F2";
export const ACCENT = "#F39C12";

/** 狀態色：取自經過色覺辨識驗證的狀態色票（good / warning / serious / critical） */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

export const HEALTH_META: Record<Health, { color: string; icon: string; fill: string }> = {
  逾期: { color: STATUS.critical, icon: "error", fill: STATUS.critical },
  落後: { color: STATUS.serious, icon: "trending_down", fill: STATUS.serious },
  注意: { color: STATUS.warning, icon: "warning", fill: INK_2 },
  暫停: { color: "#71717A", icon: "pause_circle", fill: "#A1A1AA" },
  正常: { color: STATUS.good, icon: "check_circle", fill: INK_2 },
  未開工: { color: MUTED, icon: "schedule", fill: INK_2 },
  完工: { color: "#71717A", icon: "task_alt", fill: "#71717A" },
  未建檔: { color: "#D4D4D8", icon: "radio_button_unchecked", fill: INK_2 },
};

export const WORK_META: Record<WorkStatus, { fill: string; label: string }> = {
  完成: { fill: "#A1A1AA", label: "完成" },
  進行中: { fill: INK_2, label: "進行中" },
  延遲: { fill: STATUS.critical, label: "延遲" },
  未開始: { fill: "#D4D4D8", label: "未開始" },
  未排定: { fill: "#E4E4E7", label: "未排定" },
};

export function Icon({
  name,
  className = "",
  weight = 200,
  fill = 0,
  style,
}: {
  name: string;
  className?: string;
  weight?: number;
  fill?: 0 | 1;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{ fontVariationSettings: `'wght' ${weight}, 'FILL' ${fill}`, ...style }}
      aria-hidden
    >
      {name}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-[#FFFFFF] rounded-[18px] shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 px-1 mb-2.5">
      <div className="flex items-baseline gap-2 min-w-0">
        <h3 className="text-[15px] font-bold text-[#18181B] whitespace-nowrap">{title}</h3>
        {meta && <span className="text-[12px] text-[#71717A] truncate">{meta}</span>}
      </div>
      {action}
    </div>
  );
}

/** 健康度標籤：圖示帶顏色，文字維持墨色 —— 顏色不單獨承載意義 */
export function HealthBadge({ health, compact }: { health: Health; compact?: boolean }) {
  const m = HEALTH_META[health];
  return (
    <span
      className={`inline-flex items-center gap-1 shrink-0 rounded-full border border-[#E4E4E7] bg-white ${
        compact ? "h-[22px] pl-1 pr-2 text-[11px]" : "h-[26px] pl-1.5 pr-2.5 text-[12px]"
      } font-semibold text-[#3F3F46] whitespace-nowrap`}
    >
      <Icon name={m.icon} weight={400} fill={health === "未建檔" ? 0 : 1} className={compact ? "text-[14px]" : "text-[16px]"} style={{ color: m.color }} />
      {health}
    </span>
  );
}

export function StagePill({ stage }: { stage?: Stage }) {
  if (!stage) return null;
  return (
    <span className="inline-flex items-center h-[22px] px-2 rounded-[6px] bg-[#F4F4F5] text-[11px] font-semibold text-[#52525B] whitespace-nowrap">
      {stage}
    </span>
  );
}

/** 類別標籤：試算表有填是實線，依名稱推測的是虛線 */
export function CategoryTag({ category, inferred }: { category: string; inferred: boolean }) {
  return (
    <span
      title={inferred ? "依專案名稱推測，可在試算表「工程類別」欄覆寫" : undefined}
      className={`inline-flex items-center h-[22px] px-2 rounded-[6px] text-[11px] font-medium whitespace-nowrap ${
        inferred ? "border border-dashed border-[#D4D4D8] text-[#71717A]" : "border border-[#E4E4E7] text-[#52525B]"
      }`}
    >
      {category}
    </span>
  );
}

/**
 * 進度條：實際進度是填色，計畫進度是一條細刻度。
 * 讀法：填色沒跨過刻度 → 落後。
 */
export function ProgressBar({
  actual,
  planned,
  health,
  height = 6,
}: {
  actual?: number;
  planned?: number;
  health?: Health;
  height?: number;
}) {
  const fill = health ? HEALTH_META[health].fill : INK_2;
  return (
    <div className="relative w-full rounded-full" style={{ height, background: TRACK }}>
      {actual !== undefined && actual > 0 && (
        <div
          className="absolute left-0 top-0 bottom-0 rounded-full"
          style={{ width: `${Math.min(100, actual)}%`, background: fill }}
        />
      )}
      {planned !== undefined && planned > 0 && planned < 100 && (
        <div
          className="absolute -top-[3px] -bottom-[3px] w-[2px] rounded-full bg-[#18181B]"
          style={{ left: `calc(${planned}% - 1px)`, boxShadow: "0 0 0 2px #fff" }}
          title={`計畫進度 ${planned}%`}
        />
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: string;
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-8 text-center">
      <Icon name={icon} className="text-[44px] text-[#D4D4D8] mb-3" />
      <p className="text-[14px] font-medium text-[#71717A]">{title}</p>
      {hint && <div className="text-[12px] text-[#71717A] mt-1.5 leading-relaxed max-w-[340px]">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  // 焦點框：globals.css 把 :focus-visible 的 outline／box-shadow 全部清掉，ring-* 看不到，
  // 所以改成「邊框變橘＋內側再疊一圈 ::after 邊框」＝ 2px 橘框。
  // 畫在內側而不是外擴：Chip 都放在橫向捲動列裡，外擴的框會被裁掉。
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`relative h-10 px-3.5 rounded-full border text-[13px] font-semibold whitespace-nowrap transition-colors after:absolute after:inset-0 after:rounded-full after:border after:border-transparent after:pointer-events-none focus-visible:border-[#F39C12] focus-visible:after:border-[#F39C12] ${
        active
          ? "bg-[#18181B] border-[#18181B] text-white"
          : "bg-white text-[#52525B] border-[#E4E4E7] active:bg-[#F4F4F5] [@media(hover:hover)]:hover:bg-[#FAFAFA]"
      }`}
    >
      {children}
      {count !== undefined && (
        <span className={`ml-1.5 tabular-nums ${active ? "text-white/60" : "text-[#71717A]"}`}>{count}</span>
      )}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════
   子頁殼層：與指揮中心相同的右側滑入
   - 開啟時焦點移到「返回」，關閉時還給原本觸發的元素（鍵盤／報讀器不會迷路）
   - Esc 關閉：只有最上層的子頁會回應，且編輯抽屜開著時交給抽屜處理
   - 關閉時 inert：滑出畫面的子頁不能被 Tab 到，也不會被報讀器讀到
   ══════════════════════════════════════════════════════════ */

/** 目前開著的子頁（依開啟順序）。子頁可以疊在另一個子頁上，Esc 只該關最上面那一層 */
const openSubScreens: object[] = [];

export function SubScreen({
  open,
  title,
  subtitle,
  onClose,
  children,
  headerAction,
  bottomBar,
  scrollKey,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** 標題列右側（例如「編輯」） */
  headerAction?: React.ReactNode;
  /** 固定在底部的操作列（會自動加上安全區域） */
  bottomBar?: React.ReactNode;
  /** 內容換了（例如換一筆專案）時改變這個值，捲動位置會回到最上面 */
  scrollKey?: string;
}) {
  const root = React.useRef<HTMLDivElement>(null);
  const back = React.useRef<HTMLButtonElement>(null);
  const scroller = React.useRef<HTMLDivElement>(null);
  // onClose 常是每次重繪都新建的箭頭函式；用 effect event 取最新的一份，鍵盤監聽就不必跟著重綁
  const close = React.useEffectEvent(() => onClose());

  React.useEffect(() => {
    if (!open) return;
    const token = {};
    openSubScreens.push(token);
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    back.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
      if (openSubScreens[openSubScreens.length - 1] !== token) return;
      // 編輯抽屜畫在子頁外面、自己處理 Esc（有未存修改時要先確認），這裡不能搶著把整頁關掉
      if (document.querySelector("[data-pm-sheet]")) return;
      close();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      const i = openSubScreens.indexOf(token);
      if (i >= 0) openSubScreens.splice(i, 1);
      // 焦點還在子頁裡（或因為 inert 掉回 body）才還回去；使用者已經點到別處就不要搶
      const active = document.activeElement;
      const lost = !active || active === document.body || !!root.current?.contains(active);
      if (lost && returnTo?.isConnected && !returnTo.closest("[inert]")) {
        returnTo.focus({ preventScroll: true });
      }
    };
  }, [open]);

  React.useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [scrollKey]);

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      inert={!open}
      className={`fixed inset-0 z-[120] bg-[#FFFFFF] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        open ? "translate-x-0" : "translate-x-full pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      <header className="fixed top-0 left-0 right-0 h-[60px] bg-[#FFFFFF] z-[130] border-b border-[#E4E4E7]/60 flex items-center justify-between px-2">
        <button
          ref={back}
          type="button"
          onClick={onClose}
          className="w-11 h-11 flex items-center justify-center rounded-full text-[#18181B] active:bg-[#F4F4F5] focus-visible:bg-[#F4F4F5] transition-colors"
          aria-label="返回"
        >
          <Icon name="arrow_back_ios_new" weight={300} className="text-[14px]" />
        </button>
        <div className="absolute left-1/2 -translate-x-1/2 text-center max-w-[70%]">
          <h2 className="text-[17px] font-bold text-[#18181B] truncate leading-tight">{title}</h2>
          {subtitle && <p className="text-[11px] text-[#71717A] truncate leading-tight mt-0.5">{subtitle}</p>}
        </div>
        {headerAction ?? <div className="w-11 h-11" />}
      </header>
      <div ref={scroller} className="pt-[60px] h-full overflow-y-auto overscroll-contain scrollbar-hide bg-[#FAFAFA]">
        {children}
        {/* 底部操作列的高度，避免最後的內容被蓋住 */}
        {bottomBar && <div className="h-[92px]" aria-hidden />}
      </div>
      {bottomBar && (
        <div
          className="fixed left-0 right-0 bottom-0 z-[131] bg-white/95 backdrop-blur-xl border-t border-[#E4E4E7]/70 px-4 pt-2.5"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 10px)" }}
        >
          <div className="max-w-3xl mx-auto">{bottomBar}</div>
        </div>
      )}
    </div>
  );
}

/**
 * 子頁開著時把狀態列變白（與指揮中心相同寫法：單一 effect、單一布林值）。
 * 同一時間只有一個頁面掛載，所以不會有多份 effect 搶同一個 meta。
 */
export function useWhiteStatusBar(open: boolean) {
  React.useEffect(() => {
    if (!open) return;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const original = meta.getAttribute("content");
    meta.setAttribute("content", "#FFFFFF");
    const r1 = requestAnimationFrame(() => {
      meta.setAttribute("content", "#ffffff");
      requestAnimationFrame(() => meta.setAttribute("content", "#FFFFFF"));
    });
    return () => {
      cancelAnimationFrame(r1);
      if (original) meta.setAttribute("content", original);
    };
  }, [open]);
}
