"use client";

import React, { useEffect, useId, useState } from "react";
import { fmtMoney, parseMoney, toDay, WEEKDAYS, type Issue } from "@/lib/project-ops";
import { Icon, STATUS } from "./ui";

/* ══════════════════════════════════════════════════════════
   表單欄位。iPhone 為主：
   - 字級 16px 以上，iOS 才不會在點進輸入框時自動放大整頁
   - 觸控目標至少 44px
   - 金額用文字框 + inputmode=decimal，接受「185萬」「1,850,000」，下方即時顯示解讀結果
   ══════════════════════════════════════════════════════════ */

export function FieldGroup({ title, children, hint }: { title?: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="px-4 pt-4">
      {title && <h3 className="text-[12.5px] font-bold text-[#71717A] tracking-wide px-1 mb-2">{title}</h3>}
      <div className="bg-white rounded-[16px] border border-[#E4E4E7]/70 divide-y divide-[#F4F4F5]">{children}</div>
      {hint && <p className="text-[11.5px] text-[#A1A1AA] px-1 mt-1.5 leading-relaxed">{hint}</p>}
    </section>
  );
}

function IssueLine({ issues }: { issues?: Issue[] }) {
  if (!issues?.length) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-0.5">
      {issues.map((i) => (
        <p key={i.message} className="text-[12px] leading-snug flex items-center gap-1 text-[#52525B]">
          <Icon
            name={i.level === "error" ? "error" : "warning"}
            weight={400}
            fill={1}
            className="text-[14px]"
            style={{ color: i.level === "error" ? STATUS.critical : STATUS.warning }}
          />
          {i.message}
        </p>
      ))}
    </div>
  );
}

export function Row({
  label,
  htmlFor,
  children,
  issues,
  aside,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  issues?: Issue[];
  aside?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-[#3F3F46]">
          {label}
        </label>
        {aside}
      </div>
      {children}
      <IssueLine issues={issues} />
    </div>
  );
}

const inputCls =
  "w-full h-11 rounded-[12px] border border-[#E4E4E7] bg-[#FCFCFC] px-3 text-[16px] text-[#18181B] outline-none focus:border-[#F39C12] focus:ring-1 focus:ring-[#F39C12] placeholder:text-[#C4C4CC]";

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  issues,
  list,
  multiline,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  issues?: Issue[];
  /** 建議選項（datalist） */
  list?: string[];
  multiline?: boolean;
}) {
  const id = useId();
  return (
    <Row label={label} htmlFor={id} issues={issues}>
      {multiline ? (
        <textarea
          id={id}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`${inputCls} h-auto py-2.5 leading-relaxed resize-none`}
        />
      ) : (
        <>
          <input
            id={id}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            list={list?.length ? `${id}-list` : undefined}
            className={inputCls}
            autoComplete="off"
          />
          {list && list.length > 0 && (
            <datalist id={`${id}-list`}>
              {list.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          )}
        </>
      )}
    </Row>
  );
}

/** 金額：顯示原本輸入的文字，失焦時才正規化；下方顯示解讀出的數字 */
export function MoneyField({
  label,
  value,
  onChange,
  issues,
  signed,
  hint,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  issues?: Issue[];
  /** 可正可負（追加減）：用「追加／追減」切換，因為 iOS 數字鍵盤沒有負號 */
  signed?: boolean;
  hint?: string;
}) {
  const id = useId();
  const [neg, setNeg] = useState((value ?? 0) < 0);
  const [text, setText] = useState(value === undefined ? "" : String(Math.abs(value)));
  // 外部值改變（例如復原）時同步顯示
  useEffect(() => {
    const p = parseMoney(text);
    const cur = p === undefined ? undefined : neg ? -p : p;
    if (cur !== value) {
      setText(value === undefined ? "" : String(Math.abs(value)));
      setNeg((value ?? 0) < 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const parsed = parseMoney(text);
  const bad = text.trim() !== "" && (parsed === undefined || parsed < 0);
  const emit = (t: string, n: boolean) => {
    const v = parseMoney(t);
    if (t.trim() === "") onChange(undefined);
    else if (v !== undefined && v >= 0) onChange(n ? -v : v);
  };
  return (
    <Row
      label={label}
      htmlFor={id}
      issues={bad ? [{ field: "", level: "error", message: "看不懂這個金額，例：185萬 或 1850000" }, ...(issues || [])] : issues}
      aside={
        parsed !== undefined && parsed >= 0 ? (
          <span className="text-[12px] text-[#71717A] tabular-nums">＝ {fmtMoney(neg ? -parsed : parsed)}</span>
        ) : undefined
      }
    >
      <div className="flex gap-2">
        {signed && (
          <div className="flex shrink-0 rounded-[12px] bg-[#F4F4F5] p-[3px]" role="radiogroup" aria-label="追加或追減">
            {[false, true].map((n) => (
              <button
                key={String(n)}
                type="button"
                role="radio"
                aria-checked={neg === n}
                onClick={() => {
                  setNeg(n);
                  emit(text, n);
                }}
                className={`h-[38px] px-3 rounded-[9px] text-[14px] font-semibold ${
                  neg === n ? "bg-white text-[#18181B] shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-[#71717A]"
                }`}
              >
                {n ? "追減" : "追加"}
              </button>
            ))}
          </div>
        )}
        <input
          id={id}
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            emit(e.target.value, neg);
          }}
          placeholder="例：185萬"
          className={`${inputCls} tabular-nums`}
          autoComplete="off"
        />
      </div>
      {hint && <p className="text-[11.5px] text-[#A1A1AA] mt-1">{hint}</p>}
    </Row>
  );
}

/** 10/3（六）；不同年份時加上年份 */
export function fmtDateLong(iso: string, today: string): string {
  const d = toDay(iso);
  const md = `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
  return iso.slice(0, 4) === today.slice(0, 4) ? md : `${d.getFullYear()}/${md}`;
}

/**
 * 日期：iOS 空的 <input type=date> 沒有提示字、會塌掉又置中，
 * 所以畫一列自己的顯示（10/3（六）或「未設定」），真正的原生選擇器透明地疊在上面。
 */
export function DateField({
  label,
  value,
  onChange,
  issues,
  today,
  min,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  issues?: Issue[];
  today: string;
  min?: string;
}) {
  const id = useId();
  return (
    <Row
      label={label}
      htmlFor={id}
      issues={issues}
      aside={
        <div className="flex items-center gap-1">
          {value !== today && (
            <button
              type="button"
              onClick={() => onChange(today)}
              className="h-8 px-3 rounded-full text-[12.5px] font-semibold text-[#52525B] bg-[#F4F4F5] active:bg-[#E4E4E7]"
            >
              今天
            </button>
          )}
          {value && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="h-8 w-8 rounded-full flex items-center justify-center text-[#71717A] active:bg-[#F4F4F5]"
              aria-label={`清除${label}`}
            >
              <Icon name="close" className="text-[17px]" />
            </button>
          )}
        </div>
      }
    >
      <div className="relative">
        <div className={`${inputCls} flex items-center justify-between pointer-events-none`} aria-hidden>
          <span className={`tabular-nums ${value ? "text-[#18181B]" : "text-[#A1A1AA]"}`}>
            {value ? fmtDateLong(value, today) : "未設定"}
          </span>
          <Icon name="calendar_today" className="text-[18px] text-[#A1A1AA]" />
        </div>
        <input
          id={id}
          type="date"
          value={value ?? ""}
          min={min}
          onChange={(e) => onChange(e.target.value || undefined)}
          onClick={(e) => {
            // 桌機 Chrome 點文字區不會開日曆，主動叫出來
            try {
              (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
            } catch {
              /* 某些瀏覽器不允許，忽略 */
            }
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ colorScheme: "light" }}
        />
      </div>
    </Row>
  );
}

/** 單選膠囊：少量選項（階段、風險、類別） */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  issues,
  columns = 4,
  render,
  allowEmpty,
}: {
  label: string;
  options: readonly T[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
  issues?: Issue[];
  columns?: number;
  render?: (o: T) => React.ReactNode;
  allowEmpty?: boolean;
}) {
  return (
    <Row label={label} issues={issues}>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = value === o;
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(on && allowEmpty ? undefined : o)}
              className={`min-h-[44px] px-1.5 rounded-[12px] text-[14px] font-semibold transition-colors inline-flex items-center justify-center gap-1 ${
                on ? "bg-[#18181B] text-white" : "bg-[#F4F4F5] text-[#3F3F46] active:bg-[#E4E4E7]"
              }`}
            >
              {render ? render(o) : o}
            </button>
          );
        })}
      </div>
    </Row>
  );
}

/** 進度：大數字＋滑桿＋加減鍵（手套、手濕也按得到） */
export function ProgressControl({
  value,
  onChange,
  suggestion,
  label = "實際進度",
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  /** 例如「依工項推算 62%」 */
  suggestion?: { label: string; value: number };
  label?: string;
}) {
  const v = value ?? 0;
  const set = (n: number) => onChange(Math.max(0, Math.min(100, Math.round(n))));
  return (
    <Row label={label}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => set(v - 5)}
          className="w-12 h-12 rounded-[14px] bg-[#F4F4F5] text-[#18181B] active:bg-[#E4E4E7] flex items-center justify-center shrink-0"
          aria-label="減少 5%"
        >
          <Icon name="remove" weight={400} className="text-[22px]" />
        </button>
        <div className="flex-1 text-center">
          <span className="text-[40px] font-semibold text-[#18181B] leading-none tabular-nums">{v}</span>
          <span className="text-[18px] font-medium text-[#A1A1AA] ml-0.5">%</span>
        </div>
        <button
          type="button"
          onClick={() => set(v + 5)}
          className="w-12 h-12 rounded-[14px] bg-[#F4F4F5] text-[#18181B] active:bg-[#E4E4E7] flex items-center justify-center shrink-0"
          aria-label="增加 5%"
        >
          <Icon name="add" weight={400} className="text-[22px]" />
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={v}
        onChange={(e) => set(+e.target.value)}
        className="w-full mt-3 accent-[#18181B] h-6"
        aria-label={label}
      />
      <div className="flex justify-between text-[11px] text-[#A1A1AA] tabular-nums -mt-0.5">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
      {suggestion && suggestion.value !== v && (
        <button
          type="button"
          onClick={() => set(suggestion.value)}
          className="mt-2.5 w-full h-10 rounded-[12px] border border-dashed border-[#D4D4D8] text-[13px] text-[#52525B] active:bg-[#F4F4F5] inline-flex items-center justify-center gap-1.5"
        >
          <Icon name="auto_awesome" className="text-[16px] text-[#A1A1AA]" />
          {suggestion.label} {suggestion.value}%
        </button>
      )}
    </Row>
  );
}

/** 片語快選：近況常用句，點了附加到文字框 */
export function PhraseChips({ phrases, onPick }: { phrases: string[]; onPick: (p: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {phrases.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPick(p)}
          className="h-10 px-3.5 rounded-full bg-[#F4F4F5] text-[13px] text-[#3F3F46] active:bg-[#E4E4E7]"
        >
          {p}
        </button>
      ))}
    </div>
  );
}
