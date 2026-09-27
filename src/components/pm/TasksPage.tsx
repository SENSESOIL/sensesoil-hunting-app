"use client";

import React, { useEffect, useMemo, useState } from "react";
import { addDays } from "@/lib/project-ops";
import type { Task } from "@/lib/pm/model";
import { Icon } from "./ui";
import { Avatar, Empty, Group, ORANGE, Pill, RED, SegmentedIcons, Spinner, BLUE, GRAY } from "./kit";
import { TaskList } from "./TaskList";
import { TaskBoard } from "./TaskBoard";
import { TaskGantt } from "./TaskGantt";
import { Workload } from "./Workload";
import { TaskSheet } from "./TaskSheet";
import { SetupNotice } from "./SetupNotice";
import { isLate, usePm, type Pm } from "./usePm";

/* ══════════════════════════════════════════════════════════
   任務頁
   我的    —— 每個人都有：今天／已排程／全部／已完成（提醒事項的智慧型列表）
   全部    —— 管理者：所有人的任務，可依人、專案篩選
   工作量  —— 管理者：每個人手上有多少、接下來每天幾件
   三種檢視：清單、看板、甘特圖
   ══════════════════════════════════════════════════════════ */

export const TASK_TABS_MANAGER = ["我的", "全部", "工作量"];
export const TASK_TABS_MEMBER = ["我的"];

type View = "list" | "board" | "gantt";
type Smart = "today" | "scheduled" | "all" | "done";

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
    <div className="px-5 lg:px-10 pb-28 w-full max-w-5xl mx-auto flex flex-col gap-4">
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

/* ── 我的 ─────────────────────────────────────────────── */

function MyTasks({ pm, onOpen, onAdd }: { pm: Pm; onOpen: (t: Task) => void; onAdd: (p?: Partial<Task>) => void }) {
  const [smart, setSmart] = useStored<Smart>("pm:my:smart", "today");
  const [view, setView] = useStored<View>("pm:my:view", "list");
  const { today } = pm;
  const mine = useMemo(() => pm.tasks.filter((t) => t.assigneeEmail === pm.me?.email), [pm.tasks, pm.me?.email]);

  const sets = useMemo(() => {
    const open = mine.filter((t) => t.status !== "done");
    const todayList = open.filter(
      (t) => isLate(t, today) || t.due === today || (t.start && t.start <= today && (!t.due || t.due >= today) && t.kind !== "等待")
    );
    const scheduled = open.filter((t) => t.due && t.due > today);
    const done = mine.filter((t) => t.status === "done" && (t.doneAt ?? "") >= addDays(today, -30));
    return { today: todayList, scheduled, all: open, done };
  }, [mine, today]);

  const newCount = mine.filter((t) => !t.ackAt && t.status !== "done" && t.assignedBy && t.assignedBy !== pm.me?.email).length;
  const tiles: { key: Smart; label: string; icon: string; color: string; count: number }[] = [
    { key: "today", label: "今天", icon: "today", color: ORANGE, count: sets.today.length },
    { key: "scheduled", label: "已排程", icon: "calendar_month", color: RED, count: sets.scheduled.length },
    { key: "all", label: "全部", icon: "inbox", color: BLUE, count: sets.all.length },
    { key: "done", label: "已完成", icon: "check", color: GRAY, count: sets.done.length },
  ];
  const cur = tiles.find((t) => t.key === smart)!;
  // 看板依狀態分欄，要看到全部（含最近完成）；甘特圖看全部未完成
  const list = view === "list" ? sets[smart] : view === "board" ? [...sets.all, ...sets.done] : smart === "done" ? sets.done : sets.all;

  return (
    <>
      {/* 智慧型列表 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {tiles.map((t) => {
          const on = t.key === smart;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setSmart(t.key);
                if (view !== "list") setView("list");
              }}
              className={`rounded-[14px] p-3 text-left transition-all active:scale-[0.98] ${on ? "text-white" : "bg-white border border-[#EBEBED]"}`}
              style={on ? { background: t.color } : undefined}
            >
              <div className="flex items-start justify-between">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: on ? "rgba(255,255,255,0.25)" : t.color }}
                >
                  <Icon name={t.icon} weight={500} className="text-[18px] text-white" />
                </span>
                <span className={`text-[26px] font-bold leading-none tabular-nums ${on ? "text-white" : "text-[#18181B]"}`}>{t.count}</span>
              </div>
              <p className={`mt-2 text-[14px] font-semibold ${on ? "text-white" : "text-[#71717A]"}`}>{t.label}</p>
            </button>
          );
        })}
      </div>

      {newCount > 0 && (
        <button
          type="button"
          onClick={() => {
            setSmart("all");
            setView("list");
          }}
          className="text-[13px] px-1 flex items-center gap-1.5 text-left"
          style={{ color: ORANGE }}
        >
          <Icon name="notifications_active" weight={500} className="text-[16px] shrink-0" />
          有 {newCount} 件新指派的任務（標「新」），打開後按「收到」讓對方知道
        </button>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <h2 className="text-[26px] font-bold tracking-tight" style={{ color: view !== "list" || cur.color === GRAY ? "#18181B" : cur.color }}>
          {view === "list" ? cur.label : view === "board" ? "我的看板" : "我的排程"}
        </h2>
        <div className="flex items-center gap-2">
          <SegmentedIcons label="檢視方式" value={view} options={VIEWS} onChange={setView} />
          <AddButton onClick={() => onAdd(smart === "today" ? { due: today } : undefined)} />
        </div>
      </div>

      {view === "list" &&
        (list.length ? (
          <TaskList pm={pm} tasks={list} groupBy={smart === "done" ? "project" : "date"} showProject showDone={smart === "done"} hideSingleHeader={smart !== "done"} onOpen={onOpen} onAdd={() => onAdd(smart === "today" ? { due: today } : undefined)} />
        ) : (
          <Empty
            icon={smart === "done" ? "task_alt" : "celebration"}
            title={smart === "today" ? "今天沒有要做的任務" : smart === "done" ? "最近 30 天還沒有完成的任務" : "沒有任務"}
            hint={pm.isManager ? "按「＋」建立任務，指派給同事，對方的 APP 會收到通知。" : "主管指派任務給你時，會出現在這裡，也會收到通知。"}
          />
        ))}
      {view === "board" && <TaskBoard pm={pm} tasks={list} showProject onOpen={onOpen} onAdd={() => onAdd()} />}
      {view === "gantt" && <TaskGantt pm={pm} tasks={list} showProject onOpen={onOpen} />}
    </>
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

  // 人員篩選列：有任務的人在前
  const counts = new Map<string, number>();
  pm.tasks.forEach((t) => t.status !== "done" && t.assigneeEmail && counts.set(t.assigneeEmail, (counts.get(t.assigneeEmail) ?? 0) + 1));
  const people = [...pm.people].sort((a, b) => (counts.get(b.email) ?? 0) - (counts.get(a.email) ?? 0));
  const unassigned = pm.tasks.filter((t) => !t.assigneeEmail && t.status !== "done").length;

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[#A1A1AA]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋任務、專案、人"
            className="w-full h-11 rounded-[12px] bg-white border border-[#E4E4E7] pl-9 pr-3 text-[16px] text-[#18181B] outline-none focus:border-[#F39C12]"
          />
        </div>
        <AddButton onClick={() => onAdd(person ? { assigneeEmail: person } : undefined)} label />
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5 lg:mx-0 lg:px-0">
        <Pill on={person === undefined} onClick={() => setPerson(undefined)}>
          全部人
        </Pill>
        {people.map((p) => (
          <Pill key={p.email} on={person === p.email} onClick={() => setPerson(person === p.email ? undefined : p.email)}>
            <Avatar name={p.name} email={p.email} size={22} />
            {p.email === pm.me?.email ? "我" : p.name}
            {(counts.get(p.email) ?? 0) > 0 && <span className="opacity-60 tabular-nums">{counts.get(p.email)}</span>}
          </Pill>
        ))}
        {unassigned > 0 && (
          <Pill on={person === null} onClick={() => setPerson(person === null ? undefined : null)}>
            未指派 <span className="opacity-60 tabular-nums">{unassigned}</span>
          </Pill>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[13px] text-[#8E8E93]">
          {openCount} 件未完成
          {lateCount > 0 && <span style={{ color: RED }}>　逾期 {lateCount}</span>}
          {unacked > 0 && <span style={{ color: ORANGE }}>　對方未確認 {unacked}</span>}
        </p>
        <div className="flex items-center gap-2">
          {view === "list" && (
            <button
              onClick={() => setGroup(group === "project" ? "date" : "project")}
              className="h-9 px-3 rounded-full text-[13px] font-medium text-[#3F3F46] bg-white border border-[#E4E4E7] inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Icon name="swap_vert" className="text-[16px]" />
              {group === "project" ? "依專案" : "依日期"}
            </button>
          )}
          {view !== "board" && (
            <button
              onClick={() => setShowDone(!showDone)}
              aria-pressed={showDone}
              className={`h-9 px-3 rounded-full text-[13px] font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${showDone ? "bg-[#18181B] text-white" : "text-[#3F3F46] bg-white border border-[#E4E4E7]"}`}
            >
              <Icon name="check" className="text-[16px]" />
              已完成
            </button>
          )}
          <SegmentedIcons label="檢視方式" value={view} options={VIEWS} onChange={setView} />
        </div>
      </div>

      {view === "list" &&
        (filtered.some((t) => showDone || t.status !== "done") ? (
          <TaskList pm={pm} tasks={filtered} groupBy={group} showProject={group === "date"} showAssignee={!person} showDone={showDone} onOpen={onOpen} />
        ) : (
          <Group>
            <Empty icon="checklist" title="沒有符合的任務" hint="換個篩選條件，或按「新增任務」。" />
          </Group>
        ))}
      {view === "board" && <TaskBoard pm={pm} tasks={filtered} showProject onOpen={onOpen} onAdd={() => onAdd()} />}
      {view === "gantt" && <TaskGantt pm={pm} tasks={filtered.filter((t) => showDone || t.status !== "done")} showProject onOpen={onOpen} />}
    </>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 ${label ? "px-4" : "w-11"} rounded-full text-white flex items-center justify-center gap-1 shrink-0 active:opacity-85 text-[15px] font-semibold`}
      style={{ background: ORANGE }}
      aria-label="新增任務"
    >
      <Icon name="add" weight={500} className="text-[22px]" />
      {label && <span className="hidden sm:inline">新增任務</span>}
    </button>
  );
}
