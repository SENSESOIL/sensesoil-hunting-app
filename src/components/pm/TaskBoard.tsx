"use client";

import React, { useMemo } from "react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { STATUS_LABEL, TASK_STATUSES, type Task, type TaskStatus } from "@/lib/pm/model";
import { Icon } from "./ui";
import { Avatar, dueLabel, GREEN, ORANGE } from "./kit";
import { toast } from "./Sheet";
import type { Pm } from "./usePm";

/* ══════════════════════════════════════════════════════════
   看板：待辦／進行中／完成，拖曳換欄＝改狀態
   手機：欄位橫向滑動（一次一欄半，看得出還有下一欄）；按住卡片再拖
   ══════════════════════════════════════════════════════════ */

const COLUMN_META: Record<TaskStatus, { color: string; icon: string }> = {
  todo: { color: "#8E8E93", icon: "radio_button_unchecked" },
  doing: { color: ORANGE, icon: "timelapse" },
  done: { color: GREEN, icon: "check_circle" },
};
const DONE_LIMIT = 30;

export function TaskBoard({
  pm,
  tasks,
  showProject,
  onOpen,
  onAdd,
}: {
  pm: Pm;
  tasks: Task[];
  showProject?: boolean;
  onOpen: (t: Task) => void;
  onAdd?: () => void;
}) {
  const columns = useMemo(() => {
    const by: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] };
    for (const t of tasks) by[t.status].push(t);
    by.todo.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.seq - b.seq);
    by.doing.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.seq - b.seq);
    by.done.sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
    return by;
  }, [tasks]);

  const onDragEnd = (r: DropResult) => {
    if (!r.destination) return;
    const to = r.destination.droppableId as TaskStatus;
    if (to === r.source.droppableId) return;
    const t = tasks.find((x) => x.id === r.draggableId);
    if (!t) return;
    pm.saveTask({ id: t.id, status: to });
    if (to === "done") toast(`「${t.title}」完成`);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="-mx-5 px-5 scroll-px-5 md:mx-0 md:px-0 overflow-x-auto scrollbar-hide snap-x snap-mandatory md:snap-none">
        <div className="flex md:grid md:grid-cols-3 gap-3 pb-2 w-max md:w-auto">
          {TASK_STATUSES.map((s) => {
            const list = s === "done" ? columns.done.slice(0, DONE_LIMIT) : columns[s];
            const meta = COLUMN_META[s];
            return (
              <div key={s} className="snap-start w-[78vw] max-w-[320px] md:w-auto md:max-w-none bg-[#F2F2F4] rounded-[16px] p-2.5 flex flex-col">
                <div className="flex items-center gap-2 px-1.5 pt-0.5 pb-2">
                  <Icon name={meta.icon} fill={s === "done" ? 1 : 0} weight={500} className="text-[18px]" style={{ color: meta.color }} />
                  <span className="text-[14px] font-bold text-[#18181B]">{STATUS_LABEL[s]}</span>
                  <span className="text-[13px] text-[#A1A1AA] tabular-nums">{columns[s].length}</span>
                  {s === "todo" && onAdd && (
                    <button onClick={onAdd} className="ml-auto w-8 h-8 rounded-full flex items-center justify-center active:bg-white" aria-label="新增任務" style={{ color: ORANGE }}>
                      <Icon name="add" weight={500} className="text-[22px]" />
                    </button>
                  )}
                </div>
                <Droppable droppableId={s}>
                  {(drop, snap) => (
                    <div
                      ref={drop.innerRef}
                      {...drop.droppableProps}
                      className={`flex flex-col gap-2 min-h-[120px] rounded-[12px] transition-colors ${snap.isDraggingOver ? "bg-[#E8E8EC]" : ""}`}
                    >
                      {list.map((t, i) => {
                        const canMove = pm.isManager || t.assigneeEmail === pm.me?.email;
                        return (
                          <Draggable key={t.id} draggableId={t.id} index={i} isDragDisabled={!canMove}>
                            {(drag, ds) => (
                              <div
                                ref={drag.innerRef}
                                {...drag.draggableProps}
                                {...drag.dragHandleProps}
                                onClick={() => onOpen(t)}
                                className={`bg-white rounded-[12px] p-3 border border-[#EBEBED] cursor-pointer select-none ${
                                  ds.isDragging ? "shadow-[0_12px_30px_rgba(0,0,0,0.18)] rotate-[1.5deg]" : "active:bg-[#FAFAFA]"
                                }`}
                              >
                                <Card t={t} pm={pm} showProject={showProject} />
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {drop.placeholder}
                      {!list.length && !snap.isDraggingOver && (
                        <p className="text-center text-[12.5px] text-[#A1A1AA] py-6">{s === "done" ? "完成的任務會在這裡" : "拖曳卡片到這裡"}</p>
                      )}
                      {s === "done" && columns.done.length > DONE_LIMIT && (
                        <p className="text-center text-[12px] text-[#A1A1AA] py-1">只顯示最近 {DONE_LIMIT} 件</p>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </div>
    </DragDropContext>
  );
}

function Card({ t, pm, showProject }: { t: Task; pm: Pm; showProject?: boolean }) {
  const done = t.status === "done";
  const due = dueLabel(t.due, pm.today, done);
  const project = showProject ? pm.projectBy.get(t.code) : undefined;
  const mine = t.assigneeEmail === pm.me?.email;
  return (
    <>
      <div className="flex items-start gap-2">
        {mine && !done && !t.ackAt && t.assignedBy && t.assignedBy !== pm.me?.email && (
          <span className="shrink-0 mt-[2px] h-[18px] px-1.5 rounded-full text-[10.5px] font-bold text-white flex items-center" style={{ background: ORANGE }}>
            新
          </span>
        )}
        <p className={`flex-1 text-[15px] leading-snug ${done ? "text-[#A1A1AA] line-through" : "text-[#18181B]"}`}>{t.title}</p>
        {t.flagged && !done && <Icon name="flag" fill={1} className="text-[16px] mt-0.5" style={{ color: ORANGE }} />}
      </div>
      {project && <p className="text-[12.5px] text-[#8E8E93] mt-1 truncate">{project.name}</p>}
      {t.status === "doing" && t.progress > 0 && (
        <div className="mt-2 h-1 rounded-full bg-[#F0F0F2] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${t.progress}%`, background: ORANGE }} />
        </div>
      )}
      <div className="flex items-center gap-2 mt-2">
        {due ? (
          <span className="text-[12.5px] font-medium flex items-center gap-1" style={{ color: due.color }}>
            <Icon name="event" className="text-[14px]" />
            {due.text}
          </span>
        ) : (
          <span className="text-[12.5px] text-[#C7C7CC]">無期限</span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {!done && t.assigneeEmail && !mine && pm.isManager && (
            <Icon
              name={t.ackAt ? "done_all" : t.seenAt ? "visibility" : "schedule"}
              weight={500}
              className="text-[15px]"
              style={{ color: t.ackAt ? GREEN : t.seenAt ? "#A1A1AA" : ORANGE }}
            />
          )}
          {t.assigneeEmail && <Avatar name={t.assigneeName} email={t.assigneeEmail} size={22} />}
        </span>
      </div>
    </>
  );
}
