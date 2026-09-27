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
      className={`bg-[#FFFFFF] rounded-[18px] border border-[#E4E4E7]/60 shadow-[0_2px_10px_rgba(0,0,0,0.03)] ${className}`}
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
        {meta && <span className="text-[12px] text-[#A1A1AA] truncate">{meta}</span>}
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
    <span className="inline-flex items-center h-[22px] px-2 rounded-md bg-[#F4F4F5] text-[11px] font-semibold text-[#52525B] whitespace-nowrap">
      {stage}
    </span>
  );
}

/** 類別標籤：試算表有填是實線，依名稱推測的是虛線 */
export function CategoryTag({ category, inferred }: { category: string; inferred: boolean }) {
  return (
    <span
      title={inferred ? "依專案名稱推測，可在試算表「工程類別」欄覆寫" : undefined}
      className={`inline-flex items-center h-[22px] px-2 rounded-md text-[11px] font-medium whitespace-nowrap ${
        inferred ? "border border-dashed border-[#D4D4D8] text-[#A1A1AA]" : "border border-[#E4E4E7] text-[#52525B]"
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
      {hint && <div className="text-[12px] text-[#A1A1AA] mt-1.5 leading-relaxed max-w-[340px]">{hint}</div>}
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
  return (
    <button
      onClick={onClick}
      className={`h-8 px-3 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#F39C12]/50 ${
        active
          ? "bg-[#18181B] text-white"
          : "bg-white text-[#52525B] border border-[#E4E4E7] active:bg-[#F4F4F5]"
      }`}
    >
      {children}
      {count !== undefined && (
        <span className={`ml-1.5 tabular-nums ${active ? "text-white/60" : "text-[#A1A1AA]"}`}>{count}</span>
      )}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════
   子頁殼層：與指揮中心相同的右側滑入
   ══════════════════════════════════════════════════════════ */

export function SubScreen({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`fixed inset-0 z-[120] bg-[#FFFFFF] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        open ? "translate-x-0" : "translate-x-full pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      <header className="fixed top-0 left-0 right-0 h-[60px] bg-[#FFFFFF] z-[130] border-b border-[#E4E4E7]/60 flex items-center justify-between px-2">
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full text-[#18181B] active:bg-[#F4F4F5] transition-colors"
          aria-label="返回"
        >
          <Icon name="arrow_back_ios_new" weight={300} className="text-[14px]" />
        </button>
        <div className="absolute left-1/2 -translate-x-1/2 text-center max-w-[70%]">
          <h2 className="text-[17px] font-bold text-[#18181B] truncate leading-tight">{title}</h2>
          {subtitle && <p className="text-[11px] text-[#A1A1AA] truncate leading-tight mt-0.5">{subtitle}</p>}
        </div>
        <div className="w-10 h-10" />
      </header>
      <div className="pt-[60px] h-full overflow-y-auto overscroll-contain scrollbar-hide bg-[#FAFAFA]">
        {children}
      </div>
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
