"use client";

import React, { useEffect, useState } from "react";
import { addDays, diffDays, toDay, WEEKDAYS } from "@/lib/project-ops";
import { isAssignee } from "@/lib/pm/model";
import { Sheet, SheetActions } from "./Sheet";
import { DateField, FieldGroup, Row } from "./fields";
import { Icon } from "./ui";
import { dateShortcuts, RED } from "./kit";
import type { Pm } from "./usePm";

/* ══════════════════════════════════════════════════════════
   時間安排：只管開始日、期限、天數（甘特圖點時間軸、清單長按「自訂日期…」）
   - 改開始日：天數不變，整段平移
   - 改天數：從開始日往後算期限（沒有開始日就從期限往前推）
   - 期限早於開始日時，開始日一起拿掉
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

  useEffect(() => {
    if (!open || !task) return;
    setStart(task.start);
    setDue(task.due);
    // 只在打開時讀一次，編輯中自動更新不會蓋掉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId]);

  if (!task) return <Sheet open={false} title="時間安排" onClose={onClose}>{null}</Sheet>;

  const me = pm.me?.email;
  const canEdit = pm.isManager || (task.createdBy === me && isAssignee(task, me));
  const days = start && due ? diffDays(start, due) + 1 : start || due ? 1 : undefined;
  const dirty = (start ?? "") !== (task.start ?? "") || (due ?? "") !== (task.due ?? "");
  const bad = !!(start && due && due < start);

  const changeStart = (v: string | undefined) => {
    // 天數不變，整段平移
    if (v && start && due) setDue(addDays(v, diffDays(start, due)));
    setStart(v);
  };
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

  const save = () => {
    if (bad) return;
    const n = start && due ? diffDays(start, due) + 1 : undefined;
    // 有區間就同步標籤裡的「預計完工天數」，兩邊不會對不起來
    const meta = task.meta?.days !== undefined || n ? { ...(task.meta ?? {}), ...(n ? { days: n } : {}) } : undefined;
    if (meta && !n) delete meta.days;
    pm.saveTask({ id: task.id, start, due, ...(meta && JSON.stringify(meta) !== JSON.stringify(task.meta ?? {}) ? { meta } : {}) });
    onClose();
  };

  return (
    <Sheet
      open={open}
      title="時間安排"
      subtitle={task.title}
      onClose={onClose}
      dirty={dirty}
      footer={canEdit ? <SheetActions onCancel={onClose} onSave={save} disabled={!dirty || bad} /> : undefined}
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
            <DateField label="開始" value={start} onChange={changeStart} today={pm.today} />
            <DateField label="期限" value={due} onChange={changeDue} today={pm.today} min={start} issues={bad ? [{ field: "due", level: "error", message: "期限早於開始日" }] : undefined} />
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
