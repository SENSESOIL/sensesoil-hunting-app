"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { addDays, diffDays, todayISO, toDay, WEEKDAYS } from "@/lib/project-ops";
import { personColor, type Task } from "@/lib/pm/model";
import { Icon } from "./ui";
import { Avatar, Empty, Group, ORANGE, RED, SegmentedIcons, Spinner } from "./kit";
import { TaskList } from "./TaskList";
import { TaskBoard } from "./TaskBoard";
import { TaskGantt } from "./TaskGantt";
import { Workload } from "./Workload";
import { TaskSheet } from "./TaskSheet";
import { SetupNotice } from "./SetupNotice";
import { isLate, usePm, type Pm } from "./usePm";

/* ══════════════════════════════════════════════════════════
   任務追蹤（參考時間管理 App：先看「今天」，再往前後翻日子）
   我的    —— 每個人都有：問候＋今日進度、本週日期列、當日／已排程／全部／已完成
   全部    —— 管理者：所有人的任務；上方是團隊頭像列（各自手上幾件），點人篩選
   工作量  —— 管理者：每個人手上有多少、接下來每天幾件
   三種檢視：清單、看板、甘特圖（功能與資料都和原本相同，只換呈現）
   ══════════════════════════════════════════════════════════ */

export const TASK_TABS_MANAGER = ["我的", "全部", "工作量"];
export const TASK_TABS_MEMBER = ["我的"];

type View = "list" | "board" | "gantt";
type Smart = "day" | "scheduled" | "all" | "done";

const VIEWS: { value: View; icon: string; label: string }[] = [
  { value: "list", icon: "checklist", label: "清單" },
  { value: "board", icon: "view_kanban", label: "看板" },
  { value: "gantt", icon: "view_timeline", label: "甘特" },
];

function useStored<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const s = localStorage.getItem(key);
      if (s) setV(s as T);
    } catch {
      /* 私密瀏覽等情況讀不到就用預設 */
    }
  }, [key]);
  return [
    v,
    (n: T) => {
      setV(n);
      try {
        localStorage.setItem(key, n);
      } catch {
        /* 忽略 */
      }
    },
  ];
}

export default function TasksPage({
  activeTab,
  onTabChange,
  openTaskId,
  onOpenedTask,
}: {
  activeTab: string;
  onTabChange: (t: string) => void;
  /** 從通知點進來要打開的任務 */
  openTaskId?: string | null;
  onOpenedTask?: () => void;
}) {
  const pm = usePm();
  const [sheet, setSheet] = useState<{ id: string | null; preset?: Partial<Task> } | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (openTaskId && pm.data) {
      setSheet({ id: openTaskId });
      onOpenedTask?.();
    }
  }, [openTaskId, pm.data, onOpenedTask]);

  if (!pm.data) {
    return (
      <div className="flex justify-center py-20">
        {pm.error ? <p className="text-[14px] text-[#71717A]">{pm.error.message}</p> : <Spinner size={22} />}
      </div>
    );
  }

  const open = (t: Task) => setSheet({ id: t.id });
  const add = (preset?: Partial<Task>) => setSheet({ id: null, preset });

  const tab = pm.isManager ? activeTab : "我的";

  return (
    <div className="px-5 lg:px-10 pb-28 w-full max-w-5xl mx-auto flex flex-col gap-5">
      <SetupNotice pm={pm} />
      {tab === "工作量" ? (
        <Workload
          pm={pm}
          onPick={(email) => {
            setPersonFilter(email);
            onTabChange("全部");
          }}
        />
      ) : tab === "全部" ? (
        <AllTasks pm={pm} onOpen={open} onAdd={add} person={personFilter} setPerson={setPersonFilter} />
      ) : (
        <MyTasks pm={pm} onOpen={open} onAdd={add} />
      )}
      <TaskSheet pm={pm} open={!!sheet} taskId={sheet?.id ?? null} preset={sheet?.preset} onClose={() => setSheet(null)} />
    </div>
  );
}

/* ── 共用 ─────────────────────────────────────────────── */

const MONTH_DAY = (iso: string) => {
  const d = toDay(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};
const WEEKDAY = (iso: string) => `星期${WEEKDAYS[toDay(iso).getDay()]}`;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "夜深了";
  if (h < 11) return "早安";
  if (h < 14) return "午安";
  if (h < 18) return "午後好";
  return "晚安";
}

/** 某一天要做的（未完成）任務。今天另外含逾期的 */
function tasksOn(list: Task[], day: string, today: string): Task[] {
  return list.filter((t) => {
    if (t.status === "done") return false;
    if (day === today && isLate(t, today)) return true;
    if (t.due === day) return true;
    return !!t.start && t.start <= day && !!t.due && t.due >= day && t.kind !== "等待";
  });
}

/** 一個日期所在那週的週一 */
function mondayOf(iso: string): string {
  const dow = (toDay(iso).getDay() + 6) % 7;
  return addDays(iso, -dow);
}

/** 「今天」「明天」，其他日子是「10月14日　週二」 */
function dayLabel(day: string, today: string): string {
  const d = diffDays(today, day);
  if (d === 0) return "今天";
  if (d === 1) return "明天";
  if (d === -1) return "昨天";
  return `${MONTH_DAY(day)}　${WEEKDAY(day).replace("星期", "週")}`;
}

/** 圓環進度（今日進度、團隊每個人手上的件數） */
function Ring({
  value,
  size = 76,
  stroke = 8,
  color = "var(--accent)",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: "var(--track, #F0F0F2)" }} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          // 顏色用 style 給：SVG 屬性不吃 CSS 變數（iOS Safari），主題色要走 style
          style={{ stroke: color, transition: "stroke-dashoffset 600ms cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 ${label ? "px-4" : "w-11"} rounded-full text-white flex items-center justify-center gap-1 shrink-0 active:scale-95 transition-transform text-[15px] font-semibold shadow-[0_6px_16px_-6px_var(--accent)]`}
      style={{ background: ORANGE }}
      aria-label="新增任務"
    >
      <Icon name="add" weight={500} className="text-[22px]" />
      {label && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}

/** 篩選膠囊（附數字） */
function Chip({ on, onClick, children, count, tone }: { on: boolean; onClick: () => void; children: React.ReactNode; count?: number; tone?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-9 px-3.5 rounded-full text-[14px] whitespace-nowrap inline-flex items-center gap-1.5 shrink-0 transition-colors ${
        on ? "bg-[#18181B] text-white" : "bg-white shadow-card text-[#3F3F46] active:bg-[#F4F4F5]"
      }`}
    >
      {children}
      {count !== undefined && (
        <span className={`text-[12px] tabular-nums ${on ? "text-white/70" : "text-[#A1A1AA]"}`} style={!on && tone ? { color: tone } : undefined}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ── 我的 ─────────────────────────────────────────────── */

function MyTasks({ pm, onOpen, onAdd }: { pm: Pm; onOpen: (t: Task) => void; onAdd: (p?: Partial<Task>) => void }) {
  const [smart, setSmart] = useStored<Smart>("pm:my:smart2", "day");
  const [view, setView] = useStored<View>("pm:my:view", "list");
  const { today } = pm;
  const [day, setDay] = useState(today);
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const mine = useMemo(() => pm.tasks.filter((t) => t.assigneeEmail === pm.me?.email), [pm.tasks, pm.me?.email]);

  const sets = useMemo(() => {
    const open = mine.filter((t) => t.status !== "done");
    const onDay = tasksOn(mine, day, today);
    const scheduled = open.filter((t) => t.due && t.due > today);
    const done = mine.filter((t) => t.status === "done" && (t.doneAt ?? "") >= addDays(today, -30));
    return { day: onDay, scheduled, all: open, done };
  }, [mine, day, today]);

  // 今日進度：今天要做的＋今天完成的
  const todayOpen = useMemo(() => tasksOn(mine, today, today), [mine, today]);
  const doneToday = mine.filter((t) => t.status === "done" && t.doneAt && todayISO(new Date(t.doneAt)) === today).length;
  const lateCount = todayOpen.filter((t) => isLate(t, today)).length;
  const totalToday = todayOpen.length + doneToday;
  const next = [...todayOpen].sort(
    (a, b) =>
      Number(isLate(b, today)) - Number(isLate(a, today)) ||
      Number(b.flagged) - Number(a.flagged) ||
      (a.due ?? "9999").localeCompare(b.due ?? "9999")
  )[0];

  const newCount = mine.filter((t) => !t.ackAt && t.status !== "done" && t.assignedBy && t.assignedBy !== pm.me?.email).length;
  // 中文姓名只叫名字（陳政剛 → 政剛）
  const name = pm.me?.name ?? "";
  const callName = /^[一-鿿]{3}$/.test(name) ? name.slice(1) : name;

  const pick = (d: string) => {
    setDay(d);
    setSmart("day");
    if (view !== "list") setView("list");
  };

  const list = view === "list" ? sets[smart] : view === "board" ? [...sets.all, ...sets.done] : smart === "done" ? sets.done : sets.all;
  const title =
    view === "board"
      ? "我的看板"
      : view === "gantt"
        ? "我的排程"
        : smart === "day"
          ? dayLabel(day, today)
          : smart === "scheduled"
            ? "已排程"
            : smart === "all"
              ? "全部任務"
              : "已完成";
  const shortDay = dayLabel(day, today).split("　")[0];

  return (
    <>
      {/* 問候 */}
      <header className="pt-1">
        <p className="text-[13px] font-medium tracking-wide" style={{ color: ORANGE }}>
          {MONTH_DAY(today)}　{WEEKDAY(today)}
        </p>
        <h1 className="mt-1 text-[28px] leading-[34px] font-bold tracking-tight text-[#18181B]">
          {greeting()}
          {callName ? `，${callName}` : ""}
        </h1>
        <p className="mt-1 text-[14px] leading-[20px] text-[#71717A]">
          {todayOpen.length === 0 ? (doneToday ? `今天的事都完成了，共 ${doneToday} 件` : "今天沒有排定的任務") : `今天還有 ${todayOpen.length} 件`}
          {lateCount > 0 && <span style={{ color: RED }}>，其中 {lateCount} 件已逾期</span>}
        </p>
      </header>

      {/* 今日進度 */}
      <button
        type="button"
        onClick={() => {
          setWeekStart(mondayOf(today));
          pick(today);
        }}
        className="w-full bg-white rounded-[22px] shadow-card p-4 pr-5 flex items-center gap-4 text-left active:scale-[0.99] transition-transform"
      >
        <Ring value={totalToday ? doneToday / totalToday : 0}>
          <span className="text-[17px] font-bold tabular-nums text-[#18181B]">{totalToday ? Math.round((doneToday / totalToday) * 100) : 0}%</span>
        </Ring>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] text-[#A1A1AA]">今日進度</span>
          <span className="block text-[20px] font-bold tabular-nums text-[#18181B] leading-tight mt-0.5">
            {doneToday}
            <span className="text-[14px] font-normal text-[#A1A1AA]"> / {totalToday} 完成</span>
          </span>
          {next ? (
            <span className="mt-1.5 flex items-center gap-1.5 min-w-0 text-[13px] text-[#52525B]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: personColor(next.code) }} aria-hidden />
              <span className="shrink-0 text-[#A1A1AA]">下一件</span>
              <span className="truncate">{next.title}</span>
            </span>
          ) : (
            <span className="mt-1.5 block text-[13px] text-[#A1A1AA]">{pm.isManager ? "按「＋」安排工作，指派給同事" : "有新任務會通知你"}</span>
          )}
        </span>
      </button>

      {newCount > 0 && (
        <button
          type="button"
          onClick={() => {
            setSmart("all");
            setView("list");
          }}
          className="w-full rounded-[18px] px-4 py-3 flex items-center gap-3 text-left bg-[var(--accent-soft)] active:opacity-80"
        >
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white" style={{ background: ORANGE }}>
            <Icon name="notifications_active" weight={500} className="text-[19px]" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-[var(--accent-ink)]">{newCount} 件新指派</span>
            <span className="block text-[13px] text-[var(--accent-ink)] opacity-80">打開任務按「收到」，讓對方知道</span>
          </span>
          <Icon name="chevron_right" className="text-[20px] text-[var(--accent-ink)] opacity-60" />
        </button>
      )}

      {/* 本週日期列 */}
      <WeekStrip mine={mine} today={today} day={smart === "day" && view === "list" ? day : null} weekStart={weekStart} setWeekStart={setWeekStart} onPick={pick} />

      {/* 篩選 */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5 py-1 lg:mx-0 lg:px-0">
        <Chip on={smart === "day" && view === "list"} onClick={() => pick(day)} count={sets.day.length} tone={lateCount && day === today ? RED : undefined}>
          {shortDay}
        </Chip>
        <Chip
          on={smart === "scheduled" && view === "list"}
          onClick={() => {
            setSmart("scheduled");
            setView("list");
          }}
          count={sets.scheduled.length}
        >
          已排程
        </Chip>
        <Chip
          on={smart === "all" && view === "list"}
          onClick={() => {
            setSmart("all");
            setView("list");
          }}
          count={sets.all.length}
        >
          全部
        </Chip>
        <Chip
          on={smart === "done" && view === "list"}
          onClick={() => {
            setSmart("done");
            setView("list");
          }}
          count={sets.done.length}
        >
          已完成
        </Chip>
      </div>

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[22px] font-bold tracking-tight text-[#18181B] truncate">{title}</h2>
        <div className="flex items-center gap-2 shrink-0">
          <SegmentedIcons label="檢視方式" value={view} options={VIEWS} onChange={setView} />
          <AddButton onClick={() => onAdd(smart === "day" ? { due: day } : undefined)} />
        </div>
      </div>

      {view === "list" &&
        (list.length ? (
          <TaskList
            pm={pm}
            tasks={list}
            groupBy={smart === "done" ? "project" : "date"}
            showProject
            showDone={smart === "done"}
            hideSingleHeader={smart !== "done"}
            onOpen={onOpen}
            onAdd={() => onAdd(smart === "day" ? { due: day } : undefined)}
          />
        ) : (
          <Group>
            <Empty
              icon={smart === "done" ? "task_alt" : "celebration"}
              title={smart === "day" ? `${shortDay}沒有要做的任務` : smart === "done" ? "最近 30 天還沒有完成的任務" : "沒有任務"}
              hint={pm.isManager ? "按「＋」建立任務，指派給同事，對方的 APP 會收到通知。" : "主管指派任務給你時，會出現在這裡，也會收到通知。"}
            />
          </Group>
        ))}
      {view === "board" && <TaskBoard pm={pm} tasks={list} showProject onOpen={onOpen} onAdd={() => onAdd()} />}
      {view === "gantt" && <TaskGantt pm={pm} tasks={list} showProject onOpen={onOpen} />}
    </>
  );
}

/** 一週七天：點日期看那天的任務；有任務的日子下方有點（今天有逾期是紅點）。左右滑換週 */
function WeekStrip({
  mine,
  today,
  day,
  weekStart,
  setWeekStart,
  onPick,
}: {
  mine: Task[];
  today: string;
  /** 目前選的日子（不在「當日」模式時是 null） */
  day: string | null;
  weekStart: string;
  setWeekStart: (d: string) => void;
  onPick: (d: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const thisWeek = weekStart === mondayOf(today);
  const touch = useRef<number | null>(null);
  const first = toDay(days[0]);
  const last = toDay(days[6]);
  const range =
    first.getMonth() === last.getMonth()
      ? `${first.getMonth() + 1}月 ${first.getDate()}–${last.getDate()}日`
      : `${first.getMonth() + 1}/${first.getDate()} – ${last.getMonth() + 1}/${last.getDate()}`;
  return (
    <section className="bg-white rounded-[22px] shadow-card px-2 pt-3 pb-2.5">
      <div className="flex items-center justify-between pl-3 pr-1 pb-2">
        <span className="text-[15px] font-semibold text-[#18181B] tabular-nums">{range}</span>
        <span className="flex items-center gap-1">
          {!thisWeek && (
            <button
              type="button"
              onClick={() => {
                setWeekStart(mondayOf(today));
                onPick(today);
              }}
              className="h-8 px-3 rounded-full text-[13px] font-medium bg-[var(--accent-soft)] text-[var(--accent-ink)]"
            >
              回到今天
            </button>
          )}
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="上一週" className="w-9 h-9 rounded-full flex items-center justify-center text-[#71717A] active:bg-[#F4F4F5]">
            <Icon name="chevron_left" className="text-[20px]" />
          </button>
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="下一週" className="w-9 h-9 rounded-full flex items-center justify-center text-[#71717A] active:bg-[#F4F4F5]">
            <Icon name="chevron_right" className="text-[20px]" />
          </button>
        </span>
      </div>
      <div
        className="grid grid-cols-7 gap-1"
        onTouchStart={(e) => {
          e.stopPropagation();
          touch.current = e.touches[0].clientX;
        }}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => {
          e.stopPropagation();
          const start = touch.current;
          touch.current = null;
          if (start === null) return;
          const dx = e.changedTouches[0].clientX - start;
          if (Math.abs(dx) > 50) setWeekStart(addDays(weekStart, dx < 0 ? 7 : -7));
        }}
      >
        {days.map((d) => {
          const on = d === day;
          const isToday = d === today;
          const list = tasksOn(mine, d, today);
          const late = isToday && list.some((t) => isLate(t, today));
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-pressed={on}
              aria-label={`${MONTH_DAY(d)}，${list.length} 件`}
              className={`h-[68px] rounded-[16px] flex flex-col items-center justify-center gap-0.5 transition-colors ${on ? "text-white" : "active:bg-[#F4F4F5]"}`}
              style={on ? { background: "var(--accent)" } : undefined}
            >
              <span className={`text-[12px] ${on ? "text-white/80" : "text-[#A1A1AA]"}`}>{WEEKDAYS[toDay(d).getDay()]}</span>
              <span className={`text-[18px] font-semibold tabular-nums ${on ? "text-white" : isToday ? "text-[var(--accent)]" : "text-[#18181B]"}`}>{toDay(d).getDate()}</span>
              <span className="h-1.5 flex items-center gap-0.5" aria-hidden>
                {list.length > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? "#fff" : late ? RED : "var(--accent)" }} />}
                {list.length > 2 && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? "rgba(255,255,255,0.6)" : "color-mix(in srgb, var(--accent) 45%, transparent)" }} />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ── 全部（管理者） ───────────────────────────────────── */

function AllTasks({
  pm,
  onOpen,
  onAdd,
  person,
  setPerson,
}: {
  pm: Pm;
  onOpen: (t: Task) => void;
  onAdd: (p?: Partial<Task>) => void;
  /** undefined＝全部人；null＝未指派 */
  person: string | null | undefined;
  setPerson: (v: string | null | undefined) => void;
}) {
  const [view, setView] = useStored<View>("pm:all:view", "list");
  const [group, setGroup] = useStored<"project" | "date">("pm:all:group", "project");
  const [showDone, setShowDone] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    return pm.tasks.filter((t) => {
      if (person === null && t.assigneeEmail) return false;
      if (person && t.assigneeEmail !== person) return false;
      if (k) {
        const p = pm.projectBy.get(t.code);
        const hay = `${t.title} ${t.note ?? ""} ${t.code} ${p?.name ?? ""} ${t.assigneeName ?? ""}`.toLowerCase();
        if (!hay.includes(k)) return false;
      }
      return true;
    });
  }, [pm.tasks, pm.projectBy, person, q]);

  const openCount = filtered.filter((t) => t.status !== "done").length;
  const lateCount = filtered.filter((t) => isLate(t, pm.today)).length;
  const unacked = filtered.filter((t) => t.status !== "done" && t.assigneeEmail && t.assigneeEmail !== pm.me?.email && !t.ackAt).length;

  // 團隊頭像列：手上件數多的在前
  const counts = new Map<string, number>();
  const lates = new Map<string, number>();
  pm.tasks.forEach((t) => {
    if (t.status === "done" || !t.assigneeEmail) return;
    counts.set(t.assigneeEmail, (counts.get(t.assigneeEmail) ?? 0) + 1);
    if (isLate(t, pm.today)) lates.set(t.assigneeEmail, (lates.get(t.assigneeEmail) ?? 0) + 1);
  });
  const people = [...pm.people].sort((a, b) => (counts.get(b.email) ?? 0) - (counts.get(a.email) ?? 0));
  const unassigned = pm.tasks.filter((t) => !t.assigneeEmail && t.status !== "done").length;
  const maxLoad = Math.max(5, ...counts.values());
  const who = person === undefined ? "全部人" : person === null ? "未指派" : person === pm.me?.email ? "我" : pm.people.find((p) => p.email === person)?.name ?? "";
  const stop = {
    onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
    onTouchMove: (e: React.TouchEvent) => e.stopPropagation(),
    onTouchEnd: (e: React.TouchEvent) => e.stopPropagation(),
  };

  return (
    <>
      {/* 團隊 */}
      <section className="bg-white rounded-[22px] shadow-card pt-4 pb-3">
        <div className="flex items-baseline justify-between px-4 pb-2">
          <h2 className="text-[17px] font-bold text-[#18181B]">團隊手上</h2>
          <span className="text-[13px] text-[#A1A1AA]">點頭像只看那個人</span>
        </div>
        <div className="flex gap-1 overflow-x-auto scrollbar-hide px-2" {...stop}>
          <PersonBubble on={person === undefined} label="全部" sub={`${pm.tasks.filter((t) => t.status !== "done").length} 件`} onClick={() => setPerson(undefined)}>
            <span className="w-full h-full rounded-full bg-[#F4F4F5] flex items-center justify-center">
              <Icon name="groups" weight={400} className="text-[24px] text-[#71717A]" />
            </span>
          </PersonBubble>
          {people.map((p) => {
            const n = counts.get(p.email) ?? 0;
            return (
              <PersonBubble
                key={p.email}
                on={person === p.email}
                label={p.email === pm.me?.email ? "我" : p.name}
                sub={n ? `${n} 件` : "空閒"}
                late={lates.get(p.email) ?? 0}
                load={n / maxLoad}
                onClick={() => setPerson(person === p.email ? undefined : p.email)}
              >
                <Avatar name={p.name} email={p.email} size={44} />
              </PersonBubble>
            );
          })}
          {unassigned > 0 && (
            <PersonBubble on={person === null} label="未指派" sub={`${unassigned} 件`} onClick={() => setPerson(person === null ? undefined : null)}>
              <span className="w-full h-full rounded-full border-[1.5px] border-dashed border-[#D4D4D8] flex items-center justify-center">
                <Icon name="person_add" className="text-[20px] text-[#A1A1AA]" />
              </span>
            </PersonBubble>
          )}
        </div>
      </section>

      {/* 數字 */}
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="未完成" value={openCount} />
        <Stat label="逾期" value={lateCount} color={lateCount ? RED : undefined} />
        <Stat label="未確認" value={unacked} color={unacked ? "var(--accent-strong)" : undefined} />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[19px] text-[#A1A1AA]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋任務、專案、人"
            className="w-full h-11 rounded-full bg-white shadow-card pl-10 pr-4 text-[16px] text-[#18181B] outline-none focus:ring-2 focus:ring-[var(--accent)]/35 placeholder:text-[#A1A1AA]"
          />
        </div>
        <AddButton onClick={() => onAdd(person ? { assigneeEmail: person } : undefined)} label="新增任務" />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-[22px] font-bold tracking-tight text-[#18181B]">{who}</h2>
        <div className="flex items-center gap-2">
          {view === "list" && (
            <Chip on={false} onClick={() => setGroup(group === "project" ? "date" : "project")}>
              <Icon name="swap_vert" className="text-[16px]" />
              {group === "project" ? "依專案" : "依日期"}
            </Chip>
          )}
          {view !== "board" && (
            <Chip on={showDone} onClick={() => setShowDone(!showDone)}>
              <Icon name="check" className="text-[16px]" />
              已完成
            </Chip>
          )}
          <SegmentedIcons label="檢視方式" value={view} options={VIEWS} onChange={setView} />
        </div>
      </div>

      {view === "list" &&
        (filtered.some((t) => showDone || t.status !== "done") ? (
          <TaskList pm={pm} tasks={filtered} groupBy={group} showProject={group === "date"} showAssignee={!person} showDone={showDone} onOpen={onOpen} />
        ) : (
          <Group>
            <Empty icon="checklist" title="沒有符合的任務" hint="換個人或關鍵字，或按「新增任務」。" />
          </Group>
        ))}
      {view === "board" && <TaskBoard pm={pm} tasks={filtered} showProject onOpen={onOpen} onAdd={() => onAdd()} />}
      {view === "gantt" && <TaskGantt pm={pm} tasks={filtered.filter((t) => showDone || t.status !== "done")} showProject onOpen={onOpen} />}
    </>
  );
}

/** 團隊頭像：外圈是手上件數（越多越滿），逾期有紅色數字 */
function PersonBubble({
  on,
  label,
  sub,
  late = 0,
  load,
  onClick,
  children,
}: {
  on: boolean;
  label: string;
  sub: string;
  late?: number;
  load?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`w-[70px] shrink-0 flex flex-col items-center gap-1 py-1.5 rounded-[16px] transition-colors ${on ? "bg-[var(--accent-soft)]" : "active:bg-[#F4F4F5]"}`}>
      <span className="relative">
        {load !== undefined ? (
          <Ring value={load} size={54} stroke={3} color={on ? "var(--accent)" : "color-mix(in srgb, var(--accent) 50%, #D4D4D8)"}>
            <span className="w-11 h-11 block">{children}</span>
          </Ring>
        ) : (
          <span className="w-[54px] h-[54px] p-[5px] flex">{children}</span>
        )}
        {late > 0 && (
          <span
            className="absolute -top-0.5 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold text-white flex items-center justify-center tabular-nums ring-2 ring-white"
            style={{ background: RED }}
          >
            {late}
          </span>
        )}
      </span>
      <span className={`text-[13px] leading-[16px] max-w-full truncate ${on ? "font-semibold text-[#18181B]" : "text-[#3F3F46]"}`}>{label}</span>
      <span className="text-[11px] leading-[14px] text-[#A1A1AA] tabular-nums">{sub}</span>
    </button>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white rounded-[18px] shadow-card px-3.5 py-3">
      <p className="text-[12px] text-[#A1A1AA]">{label}</p>
      <p className="mt-0.5 text-[24px] font-bold tabular-nums leading-tight" style={{ color: color ?? "#18181B" }}>
        {value}
      </p>
    </div>
  );
}
