"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { addDays, diffDays } from "@/lib/project-ops";
import { personColor, type Task } from "@/lib/pm/model";
import { Icon } from "./ui";
import { Avatar, CheckCircle, dueLabel, GRAY, Group, GREEN, ORANGE, RED } from "./kit";
import { isLate, type Pm } from "./usePm";

/* ══════════════════════════════════════════════════════════
   任務清單（提醒事項風格）
   - 一列：圓圈（完成）＋任務名稱＋一行重點（專案・期限・指派狀態）
   - 勾選後停留一下再收起，看得到自己剛完成了什麼
   - 分組：依日期（逾期／今天／明天／本週／之後／未排日期）或依專案
   ══════════════════════════════════════════════════════════ */

export type GroupBy = "date" | "project" | "manual";

export interface TaskListProps {
  pm: Pm;
  tasks: Task[];
  groupBy: GroupBy;
  showProject?: boolean;
  showAssignee?: boolean;
  showDone?: boolean;
  onOpen: (t: Task) => void;
  /** 在清單底部直接輸入新增（專案內） */
  quickAddCode?: string;
  /** 沒有 quickAddCode 時，點「新增任務」開完整表單 */
  onAdd?: () => void;
  emptyText?: string;
  /** 只有一組時不顯示組名（例如「今天」頁裡只有「今天」一組） */
  hideSingleHeader?: boolean;
}

const LINGER_MS = 1400;

export function TaskList({
  pm,
  tasks,
  groupBy,
  showProject,
  showAssignee,
  showDone,
  onOpen,
  quickAddCode,
  onAdd,
  emptyText = "沒有任務",
  hideSingleHeader,
}: TaskListProps) {
  const { today } = pm;
  // 剛勾完成的任務先留在原位一下
  const [linger, setLinger] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const toggle = (t: Task) => {
    const done = t.status !== "done";
    if (done && !showDone) {
      setLinger((s) => new Set(s).add(t.id));
      clearTimeout(timers.current.get(t.id));
      timers.current.set(
        t.id,
        setTimeout(() => {
          setLinger((s) => {
            const n = new Set(s);
            n.delete(t.id);
            return n;
          });
        }, LINGER_MS)
      );
    }
    pm.saveTask({ id: t.id, status: done ? "done" : "todo" });
  };

  const visible = useMemo(
    () => tasks.filter((t) => showDone || t.status !== "done" || linger.has(t.id)),
    [tasks, showDone, linger]
  );

  const sections = useMemo(() => buildSections(visible, groupBy, pm, today), [visible, groupBy, pm, today]);

  const rowProps = { pm, showProject, showAssignee, onOpen, onToggle: toggle, linger };

  if (groupBy === "manual") {
    const list = [...visible].sort((a, b) => a.seq - b.seq);
    const onDragEnd = (r: DropResult) => {
      if (!r.destination || r.destination.index === r.source.index) return;
      const ids = list.map((t) => t.id);
      const [moved] = ids.splice(r.source.index, 1);
      ids.splice(r.destination.index, 0, moved);
      // 完成的任務也要保留原本的順序
      const rest = tasks.filter((t) => !ids.includes(t.id)).sort((a, b) => a.seq - b.seq).map((t) => t.id);
      pm.reorderTasks([...ids, ...rest]);
    };
    return (
      <div className="flex flex-col gap-3">
        <Group>
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="list">
              {(drop) => (
                <div ref={drop.innerRef} {...drop.droppableProps}>
                  {list.map((t, i) => (
                    <Draggable key={t.id} draggableId={t.id} index={i} isDragDisabled={!pm.isManager}>
                      {(drag, snap) => (
                        <div
                          ref={drag.innerRef}
                          {...drag.draggableProps}
                          {...drag.dragHandleProps}
                          className={snap.isDragging ? "shadow-[0_8px_30px_rgba(0,0,0,0.15)] rounded-[12px] bg-white" : ""}
                        >
                          <TaskRow task={t} {...rowProps} last={i === list.length - 1 && !quickAddCode && !onAdd} />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {drop.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
          {list.length === 0 && !quickAddCode && <p className="px-4 py-5 text-[14px] text-[#A1A1AA]">{emptyText}</p>}
          {(quickAddCode || onAdd) && <AddRow pm={pm} code={quickAddCode} onAdd={onAdd} />}
        </Group>
      </div>
    );
  }

  if (!sections.length) {
    return (
      <div className="flex flex-col gap-3">
        {(quickAddCode || onAdd) ? (
          <Group>
            <p className="px-4 pt-4 pb-1 text-[14px] text-[#A1A1AA]">{emptyText}</p>
            <AddRow pm={pm} code={quickAddCode} onAdd={onAdd} />
          </Group>
        ) : (
          <p className="text-center text-[14px] text-[#A1A1AA] py-10">{emptyText}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {sections.map((s, si) => (
        <section key={s.key}>
          <div className={`flex items-baseline justify-between px-1 pb-1.5 ${hideSingleHeader && sections.length === 1 ? "hidden" : ""}`}>
            <h3 className="text-[15px] font-bold flex items-center gap-2" style={{ color: s.color ?? "#18181B" }}>
              {s.dot && <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.dot }} aria-hidden />}
              {s.title}
            </h3>
            <span className="text-[13px] text-[#A1A1AA] tabular-nums">{s.tasks.length}</span>
          </div>
          <Group>
            {s.tasks.map((t, i) => (
              <TaskRow key={t.id} task={t} {...rowProps} last={i === s.tasks.length - 1 && !(si === sections.length - 1 && (quickAddCode || onAdd))} />
            ))}
            {si === sections.length - 1 && (quickAddCode || onAdd) && <AddRow pm={pm} code={quickAddCode} onAdd={onAdd} />}
          </Group>
        </section>
      ))}
    </div>
  );
}

interface Section {
  key: string;
  title: string;
  color?: string;
  dot?: string;
  tasks: Task[];
}

function byDue(a: Task, b: Task) {
  return (a.due ?? "9999").localeCompare(b.due ?? "9999") || Number(b.flagged) - Number(a.flagged) || a.seq - b.seq;
}

function buildSections(tasks: Task[], groupBy: GroupBy, pm: Pm, today: string): Section[] {
  if (groupBy === "project") {
    const by = new Map<string, Task[]>();
    for (const t of tasks) by.set(t.code, [...(by.get(t.code) ?? []), t]);
    return [...by.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, list]) => {
        const p = pm.projectBy.get(code);
        return {
          key: code,
          title: p ? `${p.name}` : code,
          dot: personColor(code),
          tasks: list.sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.seq - b.seq),
        };
      });
  }
  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done").sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  const week = addDays(today, 7);
  const buckets: Section[] = [
    { key: "late", title: "逾期", color: RED, tasks: [] },
    { key: "today", title: "今天", color: ORANGE, tasks: [] },
    { key: "tomorrow", title: "明天", tasks: [] },
    { key: "week", title: "這 7 天", tasks: [] },
    { key: "later", title: "之後", tasks: [] },
    { key: "none", title: "未排日期", color: GRAY, tasks: [] },
  ];
  for (const t of open) {
    // 已經開始、還沒到期的任務也算「今天」要處理的
    const active = t.start && t.start <= today && (!t.due || t.due >= today);
    if (isLate(t, today)) buckets[0].tasks.push(t);
    else if (t.due === today || (active && t.kind !== "等待")) buckets[1].tasks.push(t);
    else if (!t.due) buckets[5].tasks.push(t);
    else if (diffDays(today, t.due) === 1) buckets[2].tasks.push(t);
    else if (t.due <= week) buckets[3].tasks.push(t);
    else buckets[4].tasks.push(t);
  }
  const out = buckets.filter((b) => b.tasks.length).map((b) => ({ ...b, tasks: b.tasks.sort(byDue) }));
  if (done.length) out.push({ key: "done", title: "已完成", color: GRAY, tasks: done });
  return out;
}

/* ── 一列 ─────────────────────────────────────────────── */

export function TaskRow({
  task: t,
  pm,
  showProject,
  showAssignee,
  onOpen,
  onToggle,
  linger,
  last,
}: {
  task: Task;
  pm: Pm;
  showProject?: boolean;
  showAssignee?: boolean;
  onOpen: (t: Task) => void;
  onToggle: (t: Task) => void;
  linger: Set<string>;
  last?: boolean;
}) {
  const { today, me } = pm;
  const done = t.status === "done";
  const mine = t.assigneeEmail === me?.email;
  const canToggle = pm.isManager || mine;
  const due = dueLabel(t.due, today, done);
  const project = showProject ? pm.projectBy.get(t.code) : undefined;
  const unacked = mine && !t.ackAt && !done && t.assignedBy && t.assignedBy !== me?.email;

  // 管理者看別人的任務：對方知道了沒
  let receipt: React.ReactNode = null;
  if (!done && t.assigneeEmail && !mine && pm.isManager) {
    receipt = t.ackAt ? (
      <span className="inline-flex items-center gap-0.5" style={{ color: GREEN }}>
        <Icon name="done_all" weight={500} className="text-[14px]" />
        已收到
      </span>
    ) : t.seenAt ? (
      <span className="inline-flex items-center gap-0.5 text-[#71717A]">
        <Icon name="visibility" className="text-[14px]" />
        已讀
      </span>
    ) : (
      <span className="inline-flex items-center gap-1" style={{ color: ORANGE }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: ORANGE }} />
        未讀
      </span>
    );
  }

  const meta: React.ReactNode[] = [];
  if (project) meta.push(<span key="p" className="truncate max-w-[45%]">{project.name}</span>);
  if (due) meta.push(<span key="d" style={{ color: due.color }} className="whitespace-nowrap">{due.text}</span>);
  if (t.kind !== "施工") meta.push(<span key="k" className="whitespace-nowrap">{t.kind === "等待" ? "等待期" : t.kind}</span>);
  if (!done && t.progress > 0) meta.push(<span key="g" className="tabular-nums">{t.progress}%</span>);
  if (receipt) meta.push(<span key="r" className="whitespace-nowrap">{receipt}</span>);

  return (
    <div
      className={`group relative flex items-start gap-3 pl-4 pr-3 py-3 cursor-pointer active:bg-[#F7F7F8] transition-opacity ${
        linger.has(t.id) ? "opacity-60" : ""
      }`}
      onClick={() => onOpen(t)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(t);
      }}
    >
      <div className="pt-[1px]">
        <CheckCircle
          checked={done}
          onToggle={() => onToggle(t)}
          disabled={!canToggle}
          color={ORANGE}
          label={done ? `取消完成：${t.title}` : `完成：${t.title}`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {unacked && (
            <span className="shrink-0 h-[18px] px-1.5 rounded-full text-[10.5px] font-bold text-white flex items-center" style={{ background: ORANGE }}>
              新
            </span>
          )}
          <p className={`text-[16px] leading-snug truncate ${done ? "text-[#A1A1AA] line-through decoration-[#C7C7CC]" : "text-[#18181B]"}`}>
            {t.title}
          </p>
        </div>
        {meta.length > 0 && (
          <div className="flex items-center gap-1.5 mt-0.5 text-[13px] text-[#8E8E93] min-w-0">
            {meta.map((m, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="text-[#D4D4D8]">·</span>}
                {m}
              </React.Fragment>
            ))}
          </div>
        )}
        {t.note && !done && <p className="text-[13px] text-[#A1A1AA] truncate mt-0.5">{t.note}</p>}
      </div>
      <div className="flex items-center gap-1.5 pt-0.5 shrink-0">
        {t.flagged && !done && <Icon name="flag" fill={1} weight={400} className="text-[17px]" style={{ color: ORANGE }} />}
        {showAssignee && t.assigneeEmail && !mine && <Avatar name={t.assigneeName} email={t.assigneeEmail} size={28} />}
        {showAssignee && !t.assigneeEmail && pm.isManager && !done && (
          <span className="w-6 h-6 rounded-full border border-dashed border-[#D4D4D8] flex items-center justify-center" title="未指派">
            <Icon name="person_add" className="text-[13px] text-[#C7C7CC]" />
          </span>
        )}
      </div>
      {!last && <span className="absolute left-[52px] right-0 bottom-0 h-px bg-[#EFEFF1]" aria-hidden />}
    </div>
  );
}

/* ── 新增 ─────────────────────────────────────────────── */

function AddRow({ pm, code, onAdd }: { pm: Pm; code?: string; onAdd?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  const canAdd = pm.isManager || !!code;
  if (!canAdd && !onAdd) return null;

  const submit = () => {
    const title = text.trim();
    if (!title || !code) return;
    pm.saveTask({ code, title });
    setText("");
  };

  if (!editing || !code) {
    return (
      <button
        type="button"
        onClick={() => (code ? setEditing(true) : onAdd?.())}
        className="w-full flex items-center gap-3 pl-4 pr-3 h-12 text-left active:bg-[#F7F7F8]"
      >
        <Icon name="add_circle" fill={1} weight={400} className="text-[24px]" style={{ color: ORANGE }} />
        <span className="text-[16px] font-medium" style={{ color: ORANGE }}>
          新增任務
        </span>
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3 pl-4 pr-3 py-2.5 border-t border-[#EFEFF1]">
      <span className="w-6 h-6 rounded-full border-[1.75px] border-[#C7C7CC] shrink-0" aria-hidden />
      <input
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={() => {
          submit();
          setEditing(false);
        }}
        maxLength={80}
        placeholder="輸入任務，按 Enter 再加下一個"
        enterKeyHint="next"
        className="flex-1 min-w-0 h-9 bg-transparent outline-none text-[16px] text-[#18181B] placeholder:text-[#C7C7CC]"
      />
    </div>
  );
}
