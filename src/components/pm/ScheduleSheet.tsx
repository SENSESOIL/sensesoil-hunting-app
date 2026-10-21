"use client";

import React, { useEffect, useState } from "react";
import { tourEmit } from "./tour/bus";
import { addDays, diffDays, toDay, WEEKDAYS } from "@/lib/project-ops";
import { isAssignee, type Task } from "@/lib/pm/model";
import { endOf, predecessorOf, startAfter, wouldCycle } from "@/lib/pm/deps";
import type { TaskMeta } from "@/lib/pm/tags";
import { Sheet, SheetActions } from "./Sheet";
import { FieldGroup, Row } from "./fields";
import { Icon } from "./ui";
import { RangeCalendar } from "./RangeCalendar";
import { dateShortcuts, RED } from "./kit";
import { canEditProject, type Pm } from "./usePm";
import { treeOrder } from "./tree";

/* ══════════════════════════════════════════════════════════
   時間安排：只管開始日、期限、天數（甘特圖點時間軸、清單長按「自訂日期…」）
   - 改開始日：天數不變，整段平移
   - 改天數：從開始日往後算期限（沒有開始日就從期限往前推）
   - 期限早於開始日時，開始日一起拿掉
   - 接在哪個任務之後開始（WBS 前置任務）：選了就從它結束的隔天開始；它之後改日期，這個跟著平移
   完整的任務細節（指派、狀態、備註…）在任務名稱那邊打開
   ══════════════════════════════════════════════════════════ */

const md = (iso: string) => {
  const d = toDay(iso);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
};

export function ScheduleSheet({ pm, taskId, open, onClose }: { pm: Pm; taskId: string | null; open: boolean; onClose: () => void }) {
  const task = taskId ? pm.tasks.find((t) => t.id === taskId) : undefined;
  const [start, setStart] = useState<string | undefined>();
  const [due, setDue] = useState<string | undefined>();
  const [after, setAfter] = useState<string | undefined>();
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open || !task) return;
    setStart(task.start);
    setDue(task.due);
    setAfter(task.meta?.after);
    setPicking(false);
    setQ("");
    // 只在打開時讀一次，編輯中自動更新不會蓋掉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId]);

  if (!task) return <Sheet open={false} title="時間安排" onClose={onClose}>{null}</Sheet>;

  const me = pm.me?.email;
  const canEdit = canEditProject(pm, task.code) || (task.createdBy === me && isAssignee(task, me));
  const days = start && due ? diffDays(start, due) + 1 : start || due ? 1 : undefined;
  const dirty = (start ?? "") !== (task.start ?? "") || (due ?? "") !== (task.due ?? "") || (after ?? "") !== (task.meta?.after ?? "");
  // 前一個任務：同專案、還在的才算
  const pred = after ? predecessorOf(pm.tasks, { ...task, meta: { ...(task.meta ?? {}), after } }) : undefined;
  const predEnd = pred ? endOf(pred) : undefined;
  const snapStart = pred ? startAfter(pred) : undefined;
  const gap = snapStart && start ? diffDays(snapStart, start) : 0;
  // 可以選的：同專案、不是自己、不會繞成一圈；照清單順序
  const sameProject = pm.tasks.filter((t) => t.code === task.code && t.id !== task.id);
  const candidates = treeOrder(sameProject)
    .map((r) => r.task)
    .filter((t) => !wouldCycle(pm.tasks, task.id, t.id))
    .filter((t) => !q.trim() || t.title.toLowerCase().includes(q.trim().toLowerCase()));
  const bad = !!(start && due && due < start);

  const changeDue = (v: string | undefined) => {
    setDue(v);
    if (v && start && v < start) setStart(undefined);
  };
  const changeDays = (n: number) => {
    if (n < 1) return;
    if (start) setDue(addDays(start, n - 1));
    else if (due) setStart(addDays(due, -(n - 1)));
    else {
      setStart(pm.today);
      setDue(addDays(pm.today, n - 1));
    }
  };

  /** 選前一個任務：從它結束的隔天開始，天數不變 */
  const pick = (p: Task) => {
    setAfter(p.id);
    setPicking(false);
    setQ("");
    const s = startAfter(p);
    if (!s) return;
    const n = days ?? task.meta?.days ?? 1;
    setStart(s);
    setDue(addDays(s, Math.max(1, n) - 1));
  };

  const save = () => {
    if (bad) return;
    const n = start && due ? diffDays(start, due) + 1 : undefined;
    // 有區間就同步標籤裡的「預計完工天數」，兩邊不會對不起來；前置任務也存在 meta
    const meta: TaskMeta = { ...(task.meta ?? {}) };
    if (n) meta.days = n;
    else delete meta.days;
    if (after) meta.after = after;
    else delete meta.after;
    pm.saveTask({ id: task.id, start, due, ...(JSON.stringify(meta) !== JSON.stringify(task.meta ?? {}) ? { meta } : {}) });
    if (after) tourEmit("wbs-set", after);
    onClose();
  };

  return (
    <Sheet
      open={open}
      title="時間安排"
      subtitle={task.title}
      onClose={onClose}
      dirty={dirty}
      footer={
        canEdit ? (
          // 教學：選好前一個任務之後圈「儲存」
          <div data-tour="schedule-save">
            <SheetActions onCancel={onClose} onSave={save} disabled={!dirty || bad} />
          </div>
        ) : undefined
      }
    >
      <div className="px-4 pt-3 pb-6 flex flex-col gap-4">
        {/* 一眼看懂排在哪 */}
        <div className="rounded-[18px] bg-white shadow-card px-4 py-4 text-center">
          {start || due ? (
            <>
              <p className="text-[19px] font-bold text-[#18181B] tabular-nums">
                {start && due && start !== due ? (
                  <>
                    {md(start)}
                    <Icon name="arrow_forward" className="mx-1.5 text-[18px] align-[-3px] text-[#A1A1AA]" />
                    {md(due)}
                  </>
                ) : (
                  md((start ?? due)!)
                )}
              </p>
              <p className="mt-1 text-[13px] text-[#71717A]">
                共 {days} 天{due && due < pm.today && task.status !== "done" ? <span style={{ color: RED }}>・已過期限</span> : null}
              </p>
            </>
          ) : (
            <p className="text-[16px] text-[#A1A1AA]">還沒排日期</p>
          )}
        </div>

        {!canEdit && <p className="text-[13px] text-[#8E8E93] px-1">這個任務的日期由指派的人安排，你只能查看。</p>}

        <div className={canEdit ? "" : "pointer-events-none opacity-60"}>
          <FieldGroup title="日期">
            {/* 同一個月曆點開始、再點結束（中間有色帶）；只做一天就同一天點兩下 */}
            <div className="px-3 pt-3 pb-2">
              <RangeCalendar
                start={start}
                end={due}
                today={pm.today}
                onChange={(s, e) => {
                  setStart(s);
                  setDue(e);
                }}
              />
            </div>
            <Row label="天數">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => changeDays((days ?? 1) - 1)} disabled={!days || days <= 1} aria-label="少一天" className="w-10 h-10 rounded-full bg-[#F2F2F4] flex items-center justify-center disabled:opacity-35">
                  <Icon name="remove" className="text-[20px]" />
                </button>
                <span className="w-12 text-center text-[18px] font-semibold tabular-nums">{days ?? "—"}</span>
                <button type="button" onClick={() => changeDays((days ?? 0) + 1)} aria-label="多一天" className="w-10 h-10 rounded-full bg-[#F2F2F4] flex items-center justify-center">
                  <Icon name="add" className="text-[20px]" />
                </button>
              </div>
              <p className="mt-1.5 text-[12px] text-[#A1A1AA]">改天數會從開始日往後算期限</p>
            </Row>
          </FieldGroup>

          <div data-tour="wbs" data-wbs-pick={after && after !== task.meta?.after ? pred?.title ?? "" : ""}>
          <FieldGroup title="接在哪個任務之後開始" hint={pred ? "前一個任務改日期時，這個任務會跟著平移同樣的天數。" : "選了就從那個任務結束的隔天開始，之後也會跟著它移動。"}>
            {pred && (
              <div className="px-4 py-3 flex items-center gap-3">
                <span className="w-9 h-9 rounded-[10px] bg-[#F2F2F4] flex items-center justify-center shrink-0 text-[#52525B]">
                  <Icon name="subdirectory_arrow_right" weight={300} className="text-[20px]" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-[#18181B] truncate">{pred.title}</p>
                  <p className="text-[13px] text-[#71717A] tabular-nums">
                    {predEnd ? `${md(predEnd)} 結束` : "還沒排日期"}
                    {predEnd && start ? (gap === 0 ? "・隔天接著開始" : gap > 0 ? `・隔 ${gap} 天開始` : `・重疊 ${-gap} 天`) : ""}
                  </p>
                </div>
                <button type="button" onClick={() => setAfter(undefined)} aria-label="不接在這個任務後面" className="w-9 h-9 -mr-1.5 rounded-full flex items-center justify-center text-[#A1A1AA] active:bg-[#F2F2F4]">
                  <Icon name="close" className="text-[20px]" />
                </button>
              </div>
            )}
            {pred && snapStart && gap !== 0 && (
              <button type="button" onClick={() => pick(pred)} className="w-full px-4 h-11 text-left text-[15px] text-[var(--accent)] active:bg-[#F7F7F8]">
                改成 {md(snapStart)} 接著開始
              </button>
            )}
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              aria-expanded={picking}
              className="w-full px-4 h-12 flex items-center gap-2 text-left active:bg-[#F7F7F8]"
            >
              <span className={`flex-1 text-[15px] ${pred ? "text-[#3F3F46]" : "text-[var(--accent)] font-semibold"}`}>{pred ? "換一個任務" : "選擇前一個任務"}</span>
              <Icon name={picking ? "expand_less" : "expand_more"} className="text-[20px] text-[#A1A1AA]" />
            </button>
            {picking && (
              <div>
                {sameProject.length > 8 && (
                  <div className="px-3 pt-2.5 pb-1">
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="搜尋任務"
                      className="w-full h-10 rounded-[10px] bg-[#F2F2F4] px-3 text-[16px] outline-none placeholder:text-[#A1A1AA]"
                    />
                  </div>
                )}
                <div className="max-h-[280px] overflow-y-auto overscroll-contain py-1">
                  {candidates.length === 0 ? (
                    <p className="px-4 py-3 text-[14px] text-[#A1A1AA]">{q ? "找不到這個任務" : "這個專案沒有其他任務"}</p>
                  ) : (
                    candidates.map((t) => {
                      const e = endOf(t);
                      const on = t.id === after;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => pick(t)}
                          aria-pressed={on}
                          className="w-full px-4 min-h-[48px] py-2 flex items-center gap-3 text-left active:bg-[#F7F7F8]"
                        >
                          <span className={`flex-1 min-w-0 text-[15px] truncate ${t.parentId ? "pl-4" : ""} ${t.status === "done" ? "text-[#A1A1AA] line-through" : "text-[#18181B]"}`}>
                            {t.title || "（未命名）"}
                          </span>
                          <span className="text-[13px] text-[#8E8E93] tabular-nums shrink-0">{e ? `${md(e)} 結束` : "未排程"}</span>
                          {on && <Icon name="check" weight={500} className="text-[18px] text-[var(--accent)]" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </FieldGroup>
          </div>

          <FieldGroup title="期限快選">
            <div className="px-3 py-3 flex flex-wrap gap-2">
              {dateShortcuts(pm.today).map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => changeDue(s.value)}
                  aria-pressed={due === s.value}
                  className={`h-9 px-3.5 rounded-full text-[14px] transition-colors ${due === s.value ? "bg-[var(--accent)] text-white" : "bg-[#F2F2F4] text-[#3F3F46]"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </FieldGroup>

          {(start || due) && (
            <button
              type="button"
              onClick={() => {
                setStart(undefined);
                setDue(undefined);
              }}
              className="w-full h-11 rounded-[14px] bg-white shadow-card text-[15px] text-[#E5484D] active:bg-[#FDECEC]"
            >
              清除日期（變回未排程）
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
