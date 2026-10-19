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
import { isAssignee, taskAssignees } from "@/lib/pm/model";
import { isLate, usePm, type GoalItem, type Pm } from "./usePm";
import { GoalSheet } from "./Goals";
import { ReminderPage, RemindersHome, SMART, smartTasks, TaskSearchResults, type ListRoute } from "./Reminders";
import { SearchOverlay } from "@/components/team/TeamPage";
import { tagKeys } from "@/lib/pm/tags";

/* ══════════════════════════════════════════════════════════
   任務追蹤（Apple 提醒事項風格）
   清單    —— 首頁：智慧清單、專案、標籤；點進專案直接打字新增任務（見 Reminders.tsx）
              「行事曆」是原本的我的任務（週／月、公司目標）；「團隊」是原本的全部任務
   我的    —— 每個人都有：問候＋今日進度、日期（週／月切換，月曆上有公司目標橫條）、當日／已排程／全部／已完成
   目標    —— 每個人都看得到公司目標與排程；管理者可新增、修改（任務以「所屬目標」連結）
   全部    —— 管理者：所有人的任務；上方是團隊頭像列（各自手上幾件），點人篩選
   工作量  —— 管理者：每個人手上有多少、接下來每天幾件
   三種檢視：清單、看板、甘特圖（功能與資料都和原本相同，只換呈現）
   ══════════════════════════════════════════════════════════ */

// 「目標」（公司目標）移到專案情報的分頁
export const TASK_TABS_MANAGER = ["行事曆", "任務", "團隊", "工作量"];
export const TASK_TABS_MEMBER = ["行事曆", "任務"];

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
  onSubPage,
  searchQuery = "",
  onSearchQuery,
  searchOpen = false,
  onSearchClose,
}: {
  activeTab: string;
  onTabChange: (t: string) => void;
  /** 進入清單頁（專案、智慧清單、標籤）時通知外層收起底部導覽列 */
  onSubPage?: (on: boolean) => void;
  /** 標題列的搜尋（分享鍵左邊的放大鏡），只在「清單」分頁 */
  searchQuery?: string;
  onSearchQuery?: (q: string) => void;
  searchOpen?: boolean;
  onSearchClose?: () => void;
  /** 從通知點進來要打開的任務 */
  openTaskId?: string | null;
  onOpenedTask?: () => void;
}) {
  const pm = usePm();
  const [sheet, setSheet] = useState<{ id: string | null; preset?: Partial<Task> } | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null | undefined>(undefined);
  const [route, setRoute] = useState<ListRoute>({ kind: "home" });
  // 換頁時回到頁首
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route]);
  const listPage = activeTab === "任務" && (route.kind === "project" || route.kind === "smart" || route.kind === "tag");
  useEffect(() => {
    onSubPage?.(listPage);
  }, [listPage, onSubPage]);
  useEffect(() => () => onSubPage?.(false), [onSubPage]);

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

  const tab =
    activeTab === "行事曆"
      ? activeTab
      : pm.isManager && (activeTab === "工作量" || activeTab === "團隊")
        ? activeTab
        : "任務";
  const home = () => setRoute({ kind: "home" });

  const listView = () => {
    switch (route.kind) {
      case "project": {
        const p = pm.projectBy.get(route.code);
        return (
          <ReminderPage
            pm={pm}
            title={p?.name ?? route.code}
            color={personColor(route.code)}
            tasks={pm.tasks.filter((t) => t.code === route.code)}
            code={route.code}
            onBack={home}
            onOpen={open}
          />
        );
      }
      case "smart": {
        const sm = SMART[route.id];
        const id = route.id;
        return (
          <ReminderPage
            pm={pm}
            title={sm.label}
            color={sm.color}
            tasks={smartTasks(pm, id)}
            grouped
            showDoneDefault={id === "done"}
            onBack={home}
            onOpen={open}
            onAddFull={id === "done" ? undefined : () => add(id === "today" ? { due: pm.today } : id === "flagged" ? { flagged: true } : undefined)}
          />
        );
      }
      case "tag":
        return (
          <ReminderPage
            pm={pm}
            title={route.tag.startsWith("#") ? route.tag : `#${route.tag}`}
            color="#2F7FD8"
            tasks={pm.tasks.filter((t) => t.status !== "done" && tagKeys(t.meta).includes(route.tag))}
            grouped
            onBack={home}
            onOpen={open}
          />
        );
      case "calendar":
        return (
          <SubPage title="行事曆" onBack={home}>
            <MyTasks pm={pm} onOpen={open} onAdd={add} />
          </SubPage>
        );
      case "team":
        return (
          <SubPage title="團隊" onBack={home}>
            <AllTasks pm={pm} onOpen={open} onAdd={add} person={personFilter} setPerson={setPersonFilter} />
          </SubPage>
        );
      default:
        return <RemindersHome pm={pm} go={setRoute} />;
    }
  };

  return (
    <div className="px-5 lg:px-10 pb-28 w-full flex flex-col gap-5">
      <SetupNotice pm={pm} />
      {tab === "工作量" ? (
        <Workload
          pm={pm}
          onPick={(email) => {
            setPersonFilter(email);
            onTabChange("團隊");
          }}
        />
      ) : tab === "行事曆" ? (
        <MyTasks pm={pm} onOpen={open} onAdd={add} />
      ) : tab === "團隊" ? (
        <>
          {/* 手機：標題列放大鏡 → 跳出搜尋欄，結果列在下方；電腦：左側欄的搜尋框，直接篩選下面的清單 */}
          <SearchOverlay open={searchOpen} query={searchQuery} onQuery={(v) => onSearchQuery?.(v)} onClose={() => onSearchClose?.()} placeholder="搜尋任務、專案、人" label="搜尋任務">
            <TaskSearchResults
              pm={pm}
              query={searchQuery}
              onOpen={(t) => {
                onSearchClose?.();
                open(t);
              }}
            />
          </SearchOverlay>
          <AllTasks pm={pm} onOpen={open} onAdd={add} person={personFilter} setPerson={setPersonFilter} query={searchQuery} />
        </>
      ) : (
        <>
          {/* 手機：放大鏡 → 跳出搜尋欄，結果列在下方；電腦：標題列輸入，結果取代清單 */}
          <SearchOverlay open={searchOpen} query={searchQuery} onQuery={(v) => onSearchQuery?.(v)} onClose={() => onSearchClose?.()} placeholder="搜尋任務、標籤" label="搜尋任務">
            <TaskSearchResults
              pm={pm}
              query={searchQuery}
              onOpen={(t) => {
                onSearchClose?.();
                open(t);
              }}
            />
          </SearchOverlay>
          {searchQuery.trim() ? (
            <div className="hidden md:flex flex-col gap-5">
              <TaskSearchResults pm={pm} query={searchQuery} onOpen={open} />
            </div>
          ) : null}
          <div className={searchQuery.trim() ? "md:hidden flex flex-col gap-5" : "contents"}>{listView()}</div>
        </>
      )}
      <TaskSheet pm={pm} open={!!sheet} taskId={sheet?.id ?? null} preset={sheet?.preset} onClose={() => setSheet(null)} />
    </div>
  );
}

/** 子頁：左上返回＋標題 */
function SubPage({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={onBack} aria-label="返回" className="w-11 h-11 rounded-full bg-white shadow-card flex items-center justify-center active:scale-95 transition-transform shrink-0">
          <Icon name="chevron_left" weight={500} className="text-[26px] text-[#18181B]" />
        </button>
        <h1 className="text-[22px] font-bold tracking-tight text-[#18181B]">{title}</h1>
      </div>
      {children}
    </>
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
        on ? "bg-[#18181B] text-white" : "bg-white ring-1 ring-inset ring-black/[0.06] text-[#3F3F46] active:bg-[#F4F4F5]"
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
  // 行事曆只用清單：專心看任務、打勾完成（切換檢視、新增都拿掉）
  const view = "list" as View;
  const setView = (_v: View) => {};
  const { today } = pm;
  const [day, setDay] = useState(today);
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const mine = useMemo(() => pm.tasks.filter((t) => isAssignee(t, pm.me?.email)), [pm.tasks, pm.me?.email]);
  const [calMode, setCalMode] = useStored<"week" | "month">("pm:my:cal", "week");
  const [goalOpen, setGoalOpen] = useState<string | null>(null);

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
            <span className="mt-1.5 block text-[13px] text-[#A1A1AA]">{pm.isManager ? "到「任務」分頁安排工作，指派給同事" : "有新任務會通知你"}</span>
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

      {/* 日期：週／月切換；公司目標以橫條顯示 */}
      <CalendarCard
        mode={calMode}
        setMode={setCalMode}
        mine={mine}
        goals={pm.goals}
        today={today}
        day={smart === "day" && view === "list" ? day : null}
        weekStart={weekStart}
        setWeekStart={setWeekStart}
        onPick={pick}
        onOpenGoal={setGoalOpen}
      />
      <GoalSheet pm={pm} open={!!goalOpen} goalId={goalOpen} onClose={() => setGoalOpen(null)} onOpenTask={onOpen} />

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

      <h2 className="text-[22px] font-bold tracking-tight text-[#18181B] truncate">{title}</h2>

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
          />
        ) : (
          <Group>
            <Empty
              icon={smart === "done" ? "task_alt" : "celebration"}
              title={smart === "day" ? `${shortDay}沒有要做的任務` : smart === "done" ? "最近 30 天還沒有完成的任務" : "沒有任務"}
              hint={pm.isManager ? "到「任務」分頁的專案裡新增任務、指派給同事，對方的 APP 會收到通知。" : "主管指派任務給你時，會出現在這裡，也會收到通知。"}
            />
          </Group>
        ))}
    </>
  );
}

/* ── 日期：週／月切換 ─────────────────────────────────────
   週：一週七天（原本的日期列）。月：整個月的月曆（像 iCloud 行事曆）。
   兩種都會把公司目標畫成橫跨日期的橫條，點橫條打開目標；點日期看那天的任務。
   左右滑：週模式換週、月模式換月。 */

const MONTH_FIRST = (iso: string) => `${iso.slice(0, 7)}-01`;
const addMonths = (first: string, n: number) => {
  const d = toDay(first);
  d.setMonth(d.getMonth() + n, 1);
  return todayISO(d);
};

/** 一週（週一開始的 7 天）裡要畫的目標橫條：起訖欄位，最多 maxLanes 排 */
function weekBars(goals: GoalItem[], weekStart: string, maxLanes: number) {
  const weekEnd = addDays(weekStart, 6);
  const segs = goals
    .filter((g) => (g.start || g.due) && (g.start ?? g.due)! <= weekEnd && (g.due ?? g.start)! >= weekStart)
    .map((g) => {
      const s = g.start ?? g.due!;
      const e = g.due ?? g.start!;
      return {
        g,
        from: Math.max(0, diffDays(weekStart, s)),
        to: Math.min(6, diffDays(weekStart, e)),
        openLeft: s < weekStart,
        openRight: e > weekEnd,
      };
    })
    .sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from));
  const lanes: number[] = [];
  const placed: ((typeof segs)[number] & { lane: number })[] = [];
  let hidden = 0;
  for (const seg of segs) {
    let lane = lanes.findIndex((end) => end < seg.from);
    if (lane < 0) lane = lanes.length;
    if (lane >= maxLanes) {
      hidden++;
      continue;
    }
    lanes[lane] = seg.to;
    placed.push({ ...seg, lane });
  }
  return { bars: placed, lanes: Math.min(maxLanes, lanes.length), hidden };
}

function GoalBarsRow({
  goals,
  weekStart,
  maxLanes,
  onOpenGoal,
}: {
  goals: GoalItem[];
  weekStart: string;
  maxLanes: number;
  onOpenGoal: (id: string) => void;
}) {
  const { bars, lanes, hidden } = weekBars(goals, weekStart, maxLanes);
  if (!lanes) return null;
  const LANE = 18;
  return (
    <div className="relative mx-1" style={{ height: lanes * LANE + (hidden ? 14 : 0) }}>
      {bars.map((b) => (
        <button
          key={b.g.id}
          type="button"
          onClick={() => onOpenGoal(b.g.id)}
          title={b.g.title}
          className="absolute h-[15px] px-1.5 text-[10.5px] leading-[15px] font-medium text-white truncate text-left active:opacity-80"
          style={{
            top: b.lane * LANE,
            left: `calc(${(b.from / 7) * 100}% + 2px)`,
            width: `calc(${((b.to - b.from + 1) / 7) * 100}% - 4px)`,
            background: b.g.color,
            borderRadius: `${b.openLeft ? 0 : 5}px ${b.openRight ? 0 : 5}px ${b.openRight ? 0 : 5}px ${b.openLeft ? 0 : 5}px`,
          }}
        >
          {b.g.title}
        </button>
      ))}
      {hidden > 0 && (
        <span className="absolute left-1 text-[10px] text-[#A1A1AA]" style={{ top: lanes * LANE }}>
          另有 {hidden} 個目標
        </span>
      )}
    </div>
  );
}

function CalendarCard({
  mode,
  setMode,
  mine,
  goals,
  today,
  day,
  weekStart,
  setWeekStart,
  onPick,
  onOpenGoal,
}: {
  mode: "week" | "month";
  setMode: (m: "week" | "month") => void;
  mine: Task[];
  goals: GoalItem[];
  today: string;
  /** 目前選的日子（不在「當日」模式時是 null） */
  day: string | null;
  weekStart: string;
  setWeekStart: (d: string) => void;
  onPick: (d: string) => void;
  onOpenGoal: (id: string) => void;
}) {
  const [month, setMonth] = useState(() => MONTH_FIRST(day ?? weekStart));
  const touch = useRef<number | null>(null);
  const dated = goals.filter((g) => g.start || g.due);

  // 切到月曆時，對齊目前看的那週
  useEffect(() => {
    if (mode === "month") setMonth(MONTH_FIRST(day ?? addDays(weekStart, 3)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const first = toDay(weekStart);
  const last = toDay(addDays(weekStart, 6));
  const m = toDay(month);
  const title =
    mode === "month"
      ? `${m.getFullYear() !== toDay(today).getFullYear() ? `${m.getFullYear()}年 ` : ""}${m.getMonth() + 1}月`
      : first.getMonth() === last.getMonth()
        ? `${first.getMonth() + 1}月 ${first.getDate()}–${last.getDate()}日`
        : `${first.getMonth() + 1}/${first.getDate()} – ${last.getMonth() + 1}/${last.getDate()}`;
  const atToday = mode === "month" ? month === MONTH_FIRST(today) : weekStart === mondayOf(today);
  const step = (n: number) => (mode === "month" ? setMonth(addMonths(month, n)) : setWeekStart(addDays(weekStart, 7 * n)));

  const pickDay = (d: string) => {
    setWeekStart(mondayOf(d));
    if (mode === "month" && d.slice(0, 7) !== month.slice(0, 7)) setMonth(MONTH_FIRST(d));
    onPick(d);
  };

  const swipe = {
    onTouchStart: (e: React.TouchEvent) => {
      e.stopPropagation();
      touch.current = e.touches[0].clientX;
    },
    onTouchMove: (e: React.TouchEvent) => e.stopPropagation(),
    onTouchEnd: (e: React.TouchEvent) => {
      e.stopPropagation();
      const start = touch.current;
      touch.current = null;
      if (start === null) return;
      const dx = e.changedTouches[0].clientX - start;
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    },
  };

  // 月曆：從當月 1 號那週的週一，到月底那週的週日
  const weeks = useMemo(() => {
    if (mode !== "month") return [];
    const start = mondayOf(month);
    const end = addDays(addMonths(month, 1), -1);
    const out: string[] = [];
    for (let w = start; w <= end; w = addDays(w, 7)) out.push(w);
    return out;
  }, [mode, month]);

  return (
    <section className="bg-white rounded-[22px] shadow-card px-2 pt-3 pb-2.5">
      <div className="flex items-center justify-between pl-3 pr-1 pb-2">
        <span className="text-[15px] font-semibold text-[#18181B] tabular-nums">{title}</span>
        <span className="flex items-center gap-1">
          {!atToday && (
            <button
              type="button"
              onClick={() => {
                setMonth(MONTH_FIRST(today));
                setWeekStart(mondayOf(today));
                onPick(today);
              }}
              className="h-8 px-3 rounded-full text-[13px] font-medium bg-[var(--accent-soft)] text-[var(--accent-ink)]"
            >
              今天
            </button>
          )}
          <button type="button" onClick={() => step(-1)} aria-label={mode === "month" ? "上個月" : "上一週"} className="w-9 h-9 rounded-full flex items-center justify-center text-[#71717A] active:bg-[#F4F4F5]">
            <Icon name="chevron_left" className="text-[20px]" />
          </button>
          <button type="button" onClick={() => step(1)} aria-label={mode === "month" ? "下個月" : "下一週"} className="w-9 h-9 rounded-full flex items-center justify-center text-[#71717A] active:bg-[#F4F4F5]">
            <Icon name="chevron_right" className="text-[20px]" />
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === "month" ? "week" : "month")}
            aria-label={mode === "month" ? "切換成週" : "切換成整個月"}
            title={mode === "month" ? "切換成週" : "看整個月"}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${mode === "month" ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "text-[#71717A] active:bg-[#F4F4F5]"}`}
          >
            <Icon name={mode === "month" ? "calendar_view_week" : "calendar_month"} className="text-[20px]" />
          </button>
        </span>
      </div>

      {mode === "week" ? (
        <div {...swipe}>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => {
              const on = d === day;
              const isToday = d === today;
              const list = tasksOn(mine, d, today);
              const late = isToday && list.some((t) => isLate(t, today));
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => pickDay(d)}
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
          {dated.length > 0 && (
            <div className="mt-1.5">
              <GoalBarsRow goals={dated} weekStart={weekStart} maxLanes={3} onOpenGoal={onOpenGoal} />
            </div>
          )}
        </div>
      ) : (
        <div {...swipe}>
          <div className="grid grid-cols-7 pb-1">
            {[1, 2, 3, 4, 5, 6, 0].map((w) => (
              <span key={w} className="text-center text-[11px] text-[#A1A1AA]">
                {WEEKDAYS[w]}
              </span>
            ))}
          </div>
          {weeks.map((w) => (
            <div key={w} className="border-t border-[#F2F2F4] pt-1 pb-1.5">
              <div className="grid grid-cols-7">
                {Array.from({ length: 7 }, (_, i) => addDays(w, i)).map((d) => {
                  const inMonth = d.slice(0, 7) === month.slice(0, 7);
                  const on = d === day;
                  const isToday = d === today;
                  const list = tasksOn(mine, d, today);
                  const late = list.some((t) => isLate(t, today)) && d <= today;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => pickDay(d)}
                      aria-pressed={on}
                      aria-label={`${MONTH_DAY(d)}，${list.length} 件`}
                      className="h-[46px] flex flex-col items-center justify-start gap-1 pt-0.5"
                    >
                      <span
                        className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-[15px] tabular-nums ${
                          on ? "text-white font-semibold" : isToday ? "text-[var(--accent)] font-bold" : inMonth ? "text-[#18181B]" : "text-[#C7C7CC]"
                        }`}
                        style={on ? { background: "var(--accent)" } : undefined}
                      >
                        {toDay(d).getDate()}
                      </span>
                      <span className="h-1.5 flex items-center gap-0.5" aria-hidden>
                        {list.length > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: late ? RED : inMonth ? "var(--accent)" : "#D4D4D8" }} />}
                        {list.length > 2 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 45%, transparent)" }} />}
                      </span>
                    </button>
                  );
                })}
              </div>
              {dated.length > 0 && <GoalBarsRow goals={dated} weekStart={w} maxLanes={2} onOpenGoal={onOpenGoal} />}
            </div>
          ))}
        </div>
      )}
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
  query,
}: {
  pm: Pm;
  onOpen: (t: Task) => void;
  onAdd: (p?: Partial<Task>) => void;
  /** undefined＝全部人；null＝未指派 */
  person: string | null | undefined;
  setPerson: (v: string | null | undefined) => void;
  /** 搜尋字（標題列／左側欄的搜尋框） */
  query?: string;
}) {
  const [view, setView] = useStored<View>("pm:all:view", "list");
  const [group, setGroup] = useStored<"project" | "date">("pm:all:group", "project");
  const [showDone, setShowDone] = useState(false);
  const q = query ?? "";

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    return pm.tasks.filter((t) => {
      if (person === null && t.assigneeEmail) return false;
      if (person && !isAssignee(t, person)) return false;
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
    if (t.status === "done") return;
    for (const e of taskAssignees(t)) {
      counts.set(e, (counts.get(e) ?? 0) + 1);
      if (isLate(t, pm.today)) lates.set(e, (lates.get(e) ?? 0) + 1);
    }
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

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-[22px] font-bold tracking-tight text-[#18181B]">{who}</h2>
        <div className="flex items-center gap-2">
          <AddButton onClick={() => onAdd(person ? { assigneeEmail: person } : undefined)} label="新增任務" />
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
