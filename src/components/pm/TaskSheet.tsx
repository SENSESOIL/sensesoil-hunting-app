"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { fmtDate, WORK_KINDS, type WorkKind } from "@/lib/project-ops";
import { STATUS_LABEL, TASK_STATUSES, newTaskId, personColor, type Task, type TaskStatus } from "@/lib/pm/model";
import { Sheet, toast } from "./Sheet";
import { fmtDateLong } from "./fields";
import { Icon } from "./ui";
import { Avatar, dateShortcuts, GREEN, ORANGE, RED } from "./kit";
import { isLate, personLabel, type Pm } from "./usePm";

/* ══════════════════════════════════════════════════════════
   任務細節（新增／編輯）
   - 管理者：全部欄位；被指派的人：只能改狀態、進度、備註，並按「收到」
   - 期限用捷徑（今天／明天／週五／下週一），少打字
   - 指派紀錄：何時指派、對方何時看到、何時按收到 —— 不用再打電話確認
   ══════════════════════════════════════════════════════════ */

type Draft = Pick<Task, "code" | "title" | "kind" | "status" | "progress" | "flagged" | "assigneeEmail" | "start" | "due" | "note">;

const EMPTY: Draft = { code: "", title: "", kind: "施工", status: "todo", progress: 0, flagged: false };

const toDraft = (t: Task): Draft => ({
  code: t.code,
  title: t.title,
  kind: t.kind,
  status: t.status,
  progress: t.progress,
  flagged: t.flagged,
  assigneeEmail: t.assigneeEmail,
  start: t.start,
  due: t.due,
  note: t.note,
});

export function TaskSheet({
  pm,
  open,
  taskId,
  preset,
  onClose,
}: {
  pm: Pm;
  open: boolean;
  /** 編輯既有任務；沒有就是新增 */
  taskId?: string | null;
  /** 新增時的預設值（例如在某個專案裡新增） */
  preset?: Partial<Draft>;
  onClose: () => void;
}) {
  const task = taskId ? pm.tasks.find((t) => t.id === taskId) : undefined;
  const isNew = !taskId;
  const me = pm.me?.email;
  const mine = !!task && task.assigneeEmail === me;
  const canEditAll = pm.isManager || isNew || (!!task && task.createdBy === me && mine);

  const initial = useMemo<Draft>(
    () => (task ? toDraft(task) : { ...EMPTY, ...(pm.isManager ? {} : { assigneeEmail: me }), ...preset }),
    // 以打開當下為準：編輯中資料自動更新也不會蓋掉正在填的內容
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, taskId]
  );
  const [d, setD] = useState<Draft>(initial);
  const [pickProject, setPickProject] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setD(initial);
    setPickProject(isNew && !initial.code);
    setShowStart(!!initial.start);
    setConfirmDel(false);
    if (isNew) setTimeout(() => titleRef.current?.focus(), 350);
  }, [open, initial, isNew]);

  // 被指派的人打開 → 已讀
  useEffect(() => {
    if (open && task && mine && !task.seenAt) pm.markTask(task.id, "seen");
  }, [open, task, mine, pm]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((c) => ({ ...c, [k]: v }));
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const project = d.code ? pm.projectBy.get(d.code) : undefined;
  const errors: string[] = [];
  if (!d.title.trim()) errors.push("請輸入任務名稱");
  if (!d.code) errors.push("請選擇專案");
  if (d.start && d.due && d.due < d.start) errors.push("期限早於開始日");

  const save = async () => {
    if (errors.length) {
      toast(errors[0], { tone: "error" });
      return;
    }
    const patch: Partial<Task> & { id: string } = { id: task?.id ?? newTaskId() };
    (Object.keys(d) as (keyof Draft)[]).forEach((k) => {
      if (isNew || JSON.stringify(d[k]) !== JSON.stringify(initial[k])) (patch as Record<string, unknown>)[k] = d[k];
    });
    patch.code = d.code;
    if (!isNew && Object.keys(patch).length <= 2) {
      onClose();
      return;
    }
    if (patch.title) patch.title = patch.title.trim();
    if (patch.assigneeEmail !== undefined || isNew) {
      patch.assigneeName = d.assigneeEmail ? pm.personBy.get(d.assigneeEmail)?.name : undefined;
    }
    onClose();
    const saved = await pm.saveTask(patch);
    if (saved && isNew) {
      const who = saved.assigneeEmail && saved.assigneeEmail !== me ? `，已通知 ${saved.assigneeName}` : "";
      toast(`已新增「${saved.title}」${who}`);
    } else if (saved && patch.assigneeEmail && patch.assigneeEmail !== me) {
      toast(`已指派給 ${saved.assigneeName}，對方會收到通知`);
    }
  };

  const remove = async () => {
    if (!task) return;
    onClose();
    const prev = await pm.deleteTask(task.id);
    if (prev && typeof prev === "object") {
      toast(`已刪除「${prev.title}」`, {
        action: {
          label: "復原",
          run: () => {
            const { id, code, title, kind, status, progress, flagged, assigneeEmail, assigneeName, start, due, note, seq } = prev;
            pm.saveTask({ id, code, title, kind, status, progress, flagged, assigneeEmail, assigneeName, start, due, note, seq });
          },
        },
      });
    }
  };

  const ack = () => {
    if (task) pm.markTask(task.id, "ack");
    toast("已回覆收到，指派的人會看到");
  };

  const late = task && isLate({ ...task, ...d } as Task, pm.today);

  return (
    <Sheet
      open={open}
      title={isNew ? "新增任務" : project?.name ?? "任務"}
      subtitle={isNew ? undefined : project ? `${project.code}${task?.assigneeEmail ? "　·　" + personLabel(pm, task.assigneeEmail, task.assigneeName) : ""}` : undefined}
      onClose={onClose}
      dirty={dirty}
      footer={
        confirmDel ? (
          <div className="flex gap-2">
            <button onClick={() => setConfirmDel(false)} className="flex-1 h-12 rounded-[14px] bg-[#F4F4F5] text-[15px] font-semibold text-[#18181B]">
              不刪除
            </button>
            <button onClick={remove} className="flex-1 h-12 rounded-[14px] text-white text-[15px] font-semibold" style={{ background: RED }}>
              確定刪除
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            {task && canEditAll && (
              <button
                onClick={() => setConfirmDel(true)}
                className="w-12 h-12 rounded-[14px] bg-white border border-[#E4E4E7] flex items-center justify-center active:bg-[#FEF2F2]"
                aria-label="刪除任務"
                style={{ color: RED }}
              >
                <Icon name="delete" className="text-[22px]" />
              </button>
            )}
            <button
              onClick={save}
              disabled={!isNew && !dirty}
              className="flex-1 h-12 rounded-[14px] bg-[#18181B] text-white text-[15px] font-semibold active:opacity-85 disabled:opacity-35"
            >
              {isNew ? (d.assigneeEmail && d.assigneeEmail !== me ? "新增並通知" : "新增") : dirty ? "儲存" : "沒有變更"}
            </button>
          </div>
        )
      }
    >
      <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
        {/* 被指派的人：先確認收到 */}
        {task && mine && !task.ackAt && task.assignedBy && task.assignedBy !== me && task.status !== "done" && (
          <div className="rounded-[16px] p-4 flex items-center gap-3" style={{ background: "#FFF6E8" }}>
            <Avatar name={task.assignedByName} email={task.assignedBy} size={36} />
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-[#18181B]">{task.assignedByName ?? "管理者"} 指派給你</p>
              <p className="text-[12.5px] text-[#71717A]">{task.assignedAt ? fmtTime(task.assignedAt) : ""}　按收到讓對方知道</p>
            </div>
            <button onClick={ack} className="h-11 px-4 rounded-full text-white text-[15px] font-bold shrink-0 active:opacity-85" style={{ background: ORANGE }}>
              收到
            </button>
          </div>
        )}

        {/* 名稱＋備註 */}
        <div className="bg-white rounded-[16px] border border-[#EBEBED] px-4 pt-3 pb-2">
          {canEditAll ? (
            <textarea
              ref={titleRef}
              value={d.title}
              onChange={(e) => set("title", e.target.value.replace(/\n/g, ""))}
              rows={1}
              maxLength={80}
              placeholder="任務名稱，例：一樓牆面打底"
              className="w-full resize-none bg-transparent outline-none text-[20px] font-semibold leading-snug text-[#18181B] placeholder:text-[#C7C7CC] [field-sizing:content]"
            />
          ) : (
            <p className="text-[20px] font-semibold leading-snug text-[#18181B]">{d.title}</p>
          )}
          <textarea
            value={d.note ?? ""}
            onChange={(e) => set("note", e.target.value || undefined)}
            rows={2}
            maxLength={2000}
            placeholder="備註（材料、位置、注意事項…）"
            className="w-full resize-none bg-transparent outline-none text-[16px] leading-relaxed text-[#3F3F46] placeholder:text-[#C7C7CC] mt-1 [field-sizing:content] min-h-[3em]"
          />
        </div>

        {/* 專案、指派 */}
        <div className="bg-white rounded-[16px] border border-[#EBEBED] divide-y divide-[#F2F2F4]">
          <button
            type="button"
            disabled={!canEditAll}
            onClick={() => setPickProject((v) => !v)}
            className="w-full flex items-center gap-3 px-4 min-h-[52px] text-left disabled:cursor-default"
          >
            <RowIcon icon="folder" color={project ? personColor(project.code) : "#A1A1AA"} />
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] text-[#18181B] truncate">{project ? project.name : "選擇專案"}</span>
              {project && <span className="block text-[12px] text-[#8E8E93]">{project.code}　{project.company}</span>}
            </span>
            {canEditAll && <Icon name={pickProject ? "expand_less" : "expand_more"} className="text-[20px] text-[#C7C7CC]" />}
          </button>
          {pickProject && canEditAll && (
            <ProjectPicker
              pm={pm}
              value={d.code}
              onPick={(code) => {
                set("code", code);
                setPickProject(false);
              }}
            />
          )}
          <div className="px-4 py-3">
            <div className="flex items-center gap-3 mb-2.5">
              {d.assigneeEmail ? (
                <Avatar name={pm.personBy.get(d.assigneeEmail)?.name} email={d.assigneeEmail} size={32} />
              ) : (
                <RowIcon icon="person" color="#A1A1AA" />
              )}
              <span className="text-[15px] text-[#18181B]">
                {d.assigneeEmail ? `指派給 ${personLabel(pm, d.assigneeEmail)}` : "未指派"}
              </span>
            </div>
            {pm.isManager ? <AssigneeGrid pm={pm} value={d.assigneeEmail} onChange={(v) => set("assigneeEmail", v)} /> : null}
            {task?.assigneeEmail && task.assigneeEmail !== me && <Receipt task={task} pm={pm} />}
          </div>
        </div>

        {/* 日期 */}
        <div className="bg-white rounded-[16px] border border-[#EBEBED] divide-y divide-[#F2F2F4]">
          <DateRow
            icon="event"
            color={late ? RED : ORANGE}
            label="期限"
            value={d.due}
            today={pm.today}
            min={d.start}
            disabled={!canEditAll}
            onChange={(v) => set("due", v)}
            late={!!late}
          />
          {showStart || d.start ? (
            <DateRow
              icon="play_circle"
              color="#71717A"
              label="開始"
              value={d.start}
              today={pm.today}
              disabled={!canEditAll}
              onChange={(v) => set("start", v)}
              hint="排程（甘特圖）的起點；沒填就只顯示期限那一天"
            />
          ) : (
            canEditAll && (
              <button type="button" onClick={() => setShowStart(true)} className="w-full flex items-center gap-3 px-4 h-12 text-left text-[14px] text-[#71717A]">
                <RowIcon icon="add" color="#D4D4D8" />
                加上開始日（排進甘特圖）
              </button>
            )
          )}
        </div>

        {/* 狀態、進度、類型、重要 */}
        <div className="bg-white rounded-[16px] border border-[#EBEBED] divide-y divide-[#F2F2F4]">
          <div className="px-4 py-3">
            <div role="radiogroup" aria-label="狀態" className="grid grid-cols-3 gap-1.5 p-1 rounded-[12px] bg-[#F2F2F4]">
              {TASK_STATUSES.map((s) => {
                const on = d.status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setD((c) => ({ ...c, status: s, progress: s === "done" ? 100 : c.status === "done" ? 0 : c.progress }))}
                    className={`h-10 rounded-[9px] text-[14px] font-semibold transition-all flex items-center justify-center gap-1 ${
                      on ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] text-[#18181B]" : "text-[#71717A]"
                    }`}
                  >
                    {s === "done" && on && <Icon name="check_circle" fill={1} weight={400} className="text-[17px]" style={{ color: GREEN }} />}
                    {STATUS_LABEL[s as TaskStatus]}
                  </button>
                );
              })}
            </div>
          </div>
          {d.status !== "done" && d.kind === "施工" && (
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[14px] text-[#3F3F46]">完成度</span>
                <span className="text-[15px] font-semibold tabular-nums text-[#18181B]">{d.progress}%</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[0, 25, 50, 75, 100].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setD((c) => ({ ...c, progress: v, status: v >= 100 ? "done" : v > 0 ? "doing" : c.status === "doing" ? "todo" : c.status }))}
                    className={`h-10 rounded-[10px] text-[13px] font-semibold tabular-nums ${
                      d.progress === v ? "bg-[#18181B] text-white" : "bg-[#F4F4F5] text-[#3F3F46] active:bg-[#E4E4E7]"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={d.progress}
                onChange={(e) => {
                  const v = +e.target.value;
                  setD((c) => ({ ...c, progress: v, status: v >= 100 ? "done" : v > 0 ? "doing" : c.status }));
                }}
                className="w-full mt-3 accent-[#18181B] h-6"
                aria-label="完成度"
              />
            </div>
          )}
          {canEditAll && (
            <div className="px-4 py-3">
              <p className="text-[12.5px] text-[#8E8E93] mb-1.5">類型</p>
              <div className="grid grid-cols-4 gap-1.5">
                {WORK_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={d.kind === k}
                    onClick={() => set("kind", k as WorkKind)}
                    className={`h-10 rounded-[10px] text-[13px] font-semibold ${
                      d.kind === k ? "bg-[#18181B] text-white" : "bg-[#F4F4F5] text-[#3F3F46] active:bg-[#E4E4E7]"
                    }`}
                  >
                    {k === "等待" ? "等待期" : k}
                  </button>
                ))}
              </div>
              {d.kind === "等待" && <p className="text-[12px] text-[#8E8E93] mt-1.5">養護、乾燥、等料：只要等時間，甘特圖畫虛線，不算工作量</p>}
            </div>
          )}
          {canEditAll && (
            <label className="flex items-center gap-3 px-4 min-h-[52px] cursor-pointer">
              <RowIcon icon="flag" color={d.flagged ? ORANGE : "#D4D4D8"} fill />
              <span className="flex-1 text-[15px] text-[#18181B]">重要</span>
              <Toggle on={d.flagged} onChange={(v) => set("flagged", v)} label="重要" />
            </label>
          )}
        </div>

        {task && <History task={task} pm={pm} />}
      </div>
    </Sheet>
  );
}

/* ── 小元件 ───────────────────────────────────────────── */

/** 指派：大頭照格子，點一下選人；下方小字是對方手上還有幾件，方便分配 */
function AssigneeGrid({ pm, value, onChange }: { pm: Pm; value?: string; onChange: (v: string | undefined) => void }) {
  const load = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of pm.tasks) if (t.status !== "done" && t.assigneeEmail) m.set(t.assigneeEmail, (m.get(t.assigneeEmail) ?? 0) + 1);
    return m;
  }, [pm.tasks]);
  const me = pm.me?.email;
  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 gap-y-3 gap-x-1 pt-1" role="radiogroup" aria-label="指派給">
      {pm.people.map((p) => {
        const on = value === p.email;
        const n = load.get(p.email) ?? 0;
        return (
          <button
            key={p.email}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? undefined : p.email)}
            className="flex flex-col items-center gap-1 min-w-0 active:scale-95 transition-transform"
          >
            <span className="relative rounded-full p-[3px] transition-colors" style={{ background: on ? ORANGE : "transparent" }}>
              <span className="block rounded-full ring-2 ring-white">
                <Avatar name={p.name} email={p.email} size={52} />
              </span>
              {on && (
                <span className="absolute -right-0.5 -bottom-0.5 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center" style={{ background: ORANGE }}>
                  <Icon name="check" weight={700} className="text-[15px] text-white" />
                </span>
              )}
            </span>
            <span className={`text-[12.5px] leading-tight truncate max-w-full ${on ? "font-bold text-[#18181B]" : "text-[#3F3F46]"}`}>
              {p.email === me ? "我" : p.name}
            </span>
            <span className="text-[11px] leading-none text-[#A1A1AA] tabular-nums">{n ? `${n} 件` : "空閒"}</span>
          </button>
        );
      })}
    </div>
  );
}

function RowIcon({ icon, color, fill }: { icon: string; color: string; fill?: boolean }) {
  return (
    <span className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: color }}>
      <Icon name={icon} fill={fill ? 1 : 0} weight={400} className="text-[18px] text-white" />
    </span>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        onChange(!on);
      }}
      className="w-[51px] h-[31px] rounded-full relative transition-colors shrink-0"
      style={{ background: on ? GREEN : "#E4E4E7" }}
    >
      <span
        className="absolute top-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-all"
        style={{ left: on ? 22 : 2 }}
      />
    </button>
  );
}

function DateRow({
  icon,
  color,
  label,
  value,
  today,
  min,
  onChange,
  disabled,
  late,
  hint,
}: {
  icon: string;
  color: string;
  label: string;
  value?: string;
  today: string;
  min?: string;
  onChange: (v: string | undefined) => void;
  disabled?: boolean;
  late?: boolean;
  hint?: string;
}) {
  const shortcuts = dateShortcuts(today);
  const custom = value && !shortcuts.some((s) => s.value === value);
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <RowIcon icon={icon} color={color} />
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] text-[#18181B]">{label}</span>
          <span className="block text-[13px] tabular-nums" style={{ color: late ? RED : value ? "#3F3F46" : "#A1A1AA" }}>
            {value ? fmtDateLong(value, today) + (late ? "　已逾期" : "") : "未設定"}
          </span>
        </span>
        {value && !disabled && (
          <button type="button" onClick={() => onChange(undefined)} className="w-9 h-9 rounded-full flex items-center justify-center text-[#A1A1AA] active:bg-[#F4F4F5]" aria-label={`清除${label}`}>
            <Icon name="close" className="text-[18px]" />
          </button>
        )}
      </div>
      {!disabled && (
        <div className="flex gap-1.5 mt-2.5 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {shortcuts.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => onChange(s.value)}
              disabled={!!min && s.value < min}
              className={`shrink-0 h-9 px-3.5 rounded-full text-[13px] font-medium disabled:opacity-30 ${
                value === s.value ? "bg-[#18181B] text-white" : "bg-[#F4F4F5] text-[#3F3F46] active:bg-[#E4E4E7]"
              }`}
            >
              {s.label}
            </button>
          ))}
          <label
            className={`relative shrink-0 h-9 px-3.5 rounded-full text-[13px] font-medium inline-flex items-center gap-1 cursor-pointer ${
              custom ? "bg-[#18181B] text-white" : "bg-[#F4F4F5] text-[#3F3F46]"
            }`}
          >
            <Icon name="calendar_month" className="text-[16px]" />
            {custom ? fmtDate(value, today) : "選日期"}
            <input
              type="date"
              value={value ?? ""}
              min={min}
              onChange={(e) => onChange(e.target.value || undefined)}
              onClick={(e) => {
                try {
                  (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
                } catch {
                  /* 不支援就用原生行為 */
                }
              }}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              style={{ colorScheme: "light" }}
              aria-label={`${label}：選日期`}
            />
          </label>
        </div>
      )}
      {hint && !disabled && <p className="text-[12px] text-[#A1A1AA] mt-1.5">{hint}</p>}
    </div>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 對方知道了沒（管理者看） */
function Receipt({ task, pm }: { task: Task; pm: Pm }) {
  if (task.status === "done") return null;
  const name = personLabel(pm, task.assigneeEmail, task.assigneeName);
  const [icon, color, text] = task.ackAt
    ? ["done_all", GREEN, `${name} 已收到　${fmtTime(task.ackAt)}`]
    : task.seenAt
    ? ["visibility", "#71717A", `${name} 已讀，還沒按收到　${fmtTime(task.seenAt)}`]
    : ["schedule", ORANGE, `${name} 還沒打開`];
  return (
    <p className="mt-2.5 text-[13px] flex items-center gap-1.5" style={{ color }}>
      <Icon name={icon} weight={500} className="text-[16px]" />
      {text}
    </p>
  );
}

function History({ task, pm }: { task: Task; pm: Pm }) {
  const lines: string[] = [];
  if (task.createdAt) lines.push(`${fmtTime(task.createdAt)}　建立`);
  if (task.assignedAt && task.assigneeEmail) lines.push(`${fmtTime(task.assignedAt)}　${task.assignedByName ?? "—"} 指派給 ${personLabel(pm, task.assigneeEmail, task.assigneeName)}`);
  const who = personLabel(pm, task.assigneeEmail, task.assigneeName);
  if (task.seenAt && task.assignedBy !== task.assigneeEmail) lines.push(`${fmtTime(task.seenAt)}　${who} 打開`);
  if (task.ackAt && task.assignedBy !== task.assigneeEmail) lines.push(`${fmtTime(task.ackAt)}　${who} 按收到`);
  if (task.doneAt) lines.push(`${fmtTime(task.doneAt)}　完成`);
  if (!lines.length) return null;
  return (
    <div className="px-1">
      <p className="text-[12.5px] font-semibold text-[#8E8E93] mb-1">紀錄</p>
      {lines.map((l) => (
        <p key={l} className="text-[12.5px] text-[#A1A1AA] tabular-nums leading-relaxed">
          {l}
        </p>
      ))}
    </div>
  );
}

/** 專案選擇：搜尋＋最近常用在前 */
export function ProjectPicker({ pm, value, onPick }: { pm: Pm; value?: string; onPick: (code: string) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    const active = (p: (typeof pm.projects)[number]) =>
      (p.openCount > 0 ? 0 : 1) + (p.stage && ["簽約", "施工中", "驗收"].includes(p.stage) ? 0 : 1);
    return pm.projects
      .filter((p) => !p.archived && (!k || p.code.toLowerCase().includes(k) || p.name.toLowerCase().includes(k) || p.company.toLowerCase().includes(k)))
      .sort((a, b) => active(a) - active(b) || b.code.localeCompare(a.code))
      .slice(0, k ? 50 : 30);
  }, [pm.projects, q]);
  return (
    <div className="px-3 py-2.5 bg-[#FAFAFA]">
      <div className="relative mb-2">
        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[#A1A1AA]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋代碼或名稱"
          className="w-full h-10 rounded-[10px] bg-white border border-[#E4E4E7] pl-9 pr-3 text-[16px] text-[#18181B] outline-none focus:border-[#F39C12]"
        />
      </div>
      <div className="max-h-[260px] overflow-y-auto overscroll-contain rounded-[10px] bg-white border border-[#EBEBED] divide-y divide-[#F2F2F4]">
        {list.map((p) => (
          <button
            key={p.code}
            type="button"
            onClick={() => onPick(p.code)}
            className={`w-full flex items-center gap-3 px-3 h-12 text-left active:bg-[#F4F4F5] ${value === p.code ? "bg-[#FFF6E8]" : ""}`}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: personColor(p.code) }} />
            <span className="text-[12px] text-[#8E8E93] w-9 shrink-0 tabular-nums">{p.code}</span>
            <span className="flex-1 min-w-0 text-[15px] text-[#18181B] truncate">{p.name}</span>
            {p.openCount > 0 && <span className="text-[12px] text-[#A1A1AA] tabular-nums">{p.openCount}</span>}
          </button>
        ))}
        {!list.length && <p className="px-3 py-4 text-[13px] text-[#A1A1AA]">找不到「{q}」</p>}
      </div>
    </div>
  );
}

