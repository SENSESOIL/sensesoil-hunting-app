"use client";

import React from "react";
import { initials, personColor } from "@/lib/pm/model";
import { fmtDate, WEEKDAYS, addDays, diffDays, toDay } from "@/lib/project-ops";
import { Icon } from "./ui";

/* ══════════════════════════════════════════════════════════
   專案／任務的小元件（參考 Apple 提醒事項：白底分組、圓圈勾選、一行重點）
   ══════════════════════════════════════════════════════════ */

export const RED = "#E5484D";
export const ORANGE = "#F39C12";
export const BLUE = "#2F7FD8";
export const GREEN = "#30A46C";
export const INK = "#18181B";
export const GRAY = "#8E8E93";

/* ── 大頭照目錄：團隊頁上傳的照片，全 APP 的頭像共用 ───────── */

const avatarStore = { map: new Map<string, string>(), v: 0, subs: new Set<() => void>() };

/** usePm／團隊頁拿到新資料時呼叫；內容沒變就不會觸發重繪 */
export function setAvatarDirectory(list: { email: string; avatar?: string }[]) {
  let changed = false;
  for (const p of list) {
    if (!p.email) continue;
    if ((avatarStore.map.get(p.email) ?? "") !== (p.avatar ?? "")) {
      if (p.avatar) avatarStore.map.set(p.email, p.avatar);
      else avatarStore.map.delete(p.email);
      changed = true;
    }
  }
  if (changed) {
    avatarStore.v++;
    avatarStore.subs.forEach((f) => f());
  }
}

function useAvatarSrc(email?: string): string | undefined {
  React.useSyncExternalStore(
    (cb) => {
      avatarStore.subs.add(cb);
      return () => avatarStore.subs.delete(cb);
    },
    () => avatarStore.v,
    () => 0
  );
  return email ? avatarStore.map.get(email) : undefined;
}

/** 圓形頭像：有上傳大頭照就用照片，沒有就是姓名縮寫 */
export function Avatar({
  name,
  email,
  size = 24,
  ring,
  src,
  color,
}: {
  name?: string;
  email?: string;
  size?: number;
  ring?: boolean;
  src?: string;
  /** 指定底色（例如協力廠商依工項上色）；不給就依姓名／信箱固定一色 */
  color?: string;
}) {
  const photo = useAvatarSrc(email);
  const img = src ?? photo;
  const label = initials(name);
  const style: React.CSSProperties = { width: size, height: size };
  if (img) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={img}
        alt=""
        aria-hidden
        draggable={false}
        className={`rounded-full object-cover shrink-0 select-none bg-[#E4E4E7] ${ring ? "ring-2 ring-white" : ""}`}
        style={style}
      />
    );
  }
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-white font-semibold shrink-0 select-none ${ring ? "ring-2 ring-white" : ""}`}
      style={{
        ...style,
        background: color ?? (email || name ? personColor(email || name) : "#D4D4D8"),
        fontSize: Math.max(9, Math.round(size * (label.length > 1 ? 0.36 : 0.46))),
        letterSpacing: label.length > 1 ? "-0.02em" : undefined,
      }}
      aria-hidden
    >
      {email || name ? label : <Icon name="person" className="text-[14px]" />}
    </span>
  );
}

/** 疊在一起的小頭像（參與者）：最多顯示 max 個，其餘顯示 +N */
export function AvatarStack({
  people,
  max = 4,
  size = 26,
  onClick,
  label,
}: {
  people: { email?: string; name?: string }[];
  max?: number;
  size?: number;
  onClick?: () => void;
  /** 報讀用說明，例如「5 位參與者」 */
  label?: string;
}) {
  if (!people.length) return null;
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  const inner = (
    <span className="flex items-center" style={{ paddingLeft: size * 0.3 }}>
      {shown.map((p, i) => (
        <span key={p.email ?? p.name ?? i} style={{ marginLeft: -size * 0.3, zIndex: shown.length - i }} className="relative rounded-full ring-2 ring-white">
          <Avatar name={p.name} email={p.email} size={size} />
        </span>
      ))}
      {more > 0 && (
        <span
          className="relative rounded-full ring-2 ring-white bg-[#F2F2F4] text-[#52525B] font-semibold flex items-center justify-center tabular-nums"
          style={{ width: size, height: size, marginLeft: -size * 0.3, fontSize: Math.max(10, size * 0.38) }}
        >
          +{more}
        </span>
      )}
    </span>
  );
  const title = label ?? people.map((p) => p.name).filter(Boolean).join("、");
  return onClick ? (
    <button type="button" onClick={onClick} aria-label={title} title={title} className="shrink-0 rounded-full active:opacity-70">
      {inner}
    </button>
  ) : (
    <span aria-label={title} title={title} className="shrink-0">
      {inner}
    </span>
  );
}

/** 提醒事項的圓圈：點一下完成 */
export function CheckCircle({
  checked,
  onToggle,
  color = ORANGE,
  size = 24,
  disabled,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  color?: string;
  size?: number;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="shrink-0 w-11 h-11 -m-[10px] flex items-center justify-center disabled:opacity-40 active:scale-90 transition-transform"
    >
      <span
        className="rounded-full flex items-center justify-center transition-all duration-200"
        style={{
          width: size,
          height: size,
          border: `1.75px solid ${checked ? color : "#C7C7CC"}`,
          background: checked ? color : "transparent",
        }}
      >
        {checked && <Icon name="check" weight={700} className="text-white" style={{ fontSize: size * 0.62 }} />}
      </span>
    </button>
  );
}

/** 白底圓角分組（清單、表單都用） */
export function Group({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-[14px] border border-[#EBEBED] overflow-hidden ${className}`}>{children}</div>;
}

export function GroupTitle({ children, right, color }: { children: React.ReactNode; right?: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-end justify-between px-1 pb-2 pt-1">
      <h3 className="text-[20px] font-bold tracking-tight" style={{ color: color ?? INK }}>
        {children}
      </h3>
      {right}
    </div>
  );
}

/** 分段切換（清單／看板／甘特） */
export function SegmentedIcons<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; icon: string; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-[3px] rounded-[10px] bg-[#EEEEF0]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`h-9 px-3 rounded-[8px] flex items-center gap-1.5 text-[13px] font-semibold transition-all ${
              on ? "bg-white text-[#18181B] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[#71717A]"
            }`}
          >
            <Icon name={o.icon} weight={on ? 500 : 300} className="text-[18px]" />
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 期限的文字與顏色：逾期紅、今天橘、其他灰 */
export function dueLabel(due: string | undefined, today: string, done = false): { text: string; color: string } | null {
  if (!due) return null;
  const d = diffDays(today, due);
  const wd = WEEKDAYS[toDay(due).getDay()];
  if (done) return { text: fmtDate(due, today), color: GRAY };
  if (d < 0) return { text: d === -1 ? "昨天" : `${fmtDate(due, today)}（逾期 ${-d} 天）`, color: RED };
  if (d === 0) return { text: "今天", color: ORANGE };
  if (d === 1) return { text: "明天", color: INK };
  if (d < 7) return { text: `週${wd}`, color: INK };
  return { text: `${fmtDate(due, today)}（${wd}）`, color: GRAY };
}

/** 常用的日期捷徑 */
export function dateShortcuts(today: string): { label: string; value: string }[] {
  const dow = toDay(today).getDay(); // 0 = 週日
  const friday = addDays(today, (5 - dow + 7) % 7 || 7);
  const nextMon = addDays(today, ((1 - dow + 7) % 7) || 7);
  return [
    { label: "今天", value: today },
    { label: "明天", value: addDays(today, 1) },
    { label: dow === 5 ? "下週五" : "週五", value: dow === 5 ? addDays(today, 7) : friday },
    { label: "下週一", value: nextMon },
  ];
}

/** 空狀態 */
export function Empty({ icon, title, hint, action }: { icon: string; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-14">
      <div className="w-14 h-14 rounded-full bg-[#F2F2F4] flex items-center justify-center mb-3">
        <Icon name={icon} weight={300} className="text-[28px] text-[#A1A1AA]" />
      </div>
      <p className="text-[15px] font-semibold text-[#3F3F46]">{title}</p>
      {hint && <p className="text-[13px] text-[#8E8E93] mt-1 max-w-[300px] leading-relaxed">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** 小膠囊（篩選用） */
export function Pill({
  on,
  onClick,
  children,
  color,
}: {
  on?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-9 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap inline-flex items-center gap-1.5 transition-colors shrink-0 ${
        on ? "text-white" : "bg-white border border-[#E4E4E7] text-[#3F3F46] active:bg-[#F4F4F5]"
      }`}
      style={on ? { background: color ?? INK } : undefined}
    >
      {children}
    </button>
  );
}

/** 旋轉中的小圈 */
export function Spinner({ size = 16, color = "#A1A1AA" }: { size?: number; color?: string }) {
  return (
    <span
      className="inline-block rounded-full animate-spin"
      style={{ width: size, height: size, border: `2px solid ${color}33`, borderTopColor: color }}
      aria-hidden
    />
  );
}
