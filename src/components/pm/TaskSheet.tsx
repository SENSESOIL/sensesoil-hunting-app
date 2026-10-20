"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { addDays, diffDays, fmtDate, WORK_KINDS, type WorkKind } from "@/lib/project-ops";
import { endOf, predecessorOf, startAfter, wouldCycle } from "@/lib/pm/deps";
import { treeOrder } from "./tree";
import { isAssignee, newTaskId, personColor, taskAssignees, type Task } from "@/lib/pm/model";
import { Sheet, toast } from "./Sheet";
import { fmtDateLong } from "./fields";
import { Icon } from "./ui";
import { Avatar, AvatarStack, dateShortcuts, GREEN, ORANGE, RED } from "./kit";
import { assigneeLabel, assigneePatch, canEditProject, isLate, personLabel, type Pm } from "./usePm";
import { GoalPicker } from "./Goals";
import { TagSheet } from "./TagSheet";
import { metaChips } from "@/lib/pm/tags";
import { VendorList } from "./VendorPicker";
import { tourEmit } from "./tour/bus";

/* ══════════════════════════════════════════════════════════
   任務細節（新增／編輯），和專案頁同一套 iPhone「設定」樣式：
   - 最上面：任務名稱＋備註（直接打字）
   - 下面一組一組：狀態、時間、負責人、分類；左邊項目、右邊目前的值，點一下展開或直接改
   - 既有任務：改了就自動存（不用按儲存）；指派、完成度停手 1 秒才存，免得點來點去一直通知人
   - 新任務：填完按下面的「新增」
   - 管理者：全部欄位；被指派的人：只能改狀態、完成度、備註，並按「收到」
   - 指派紀錄：何時指派、對方何時看到、何時按收到 —— 不用再打電話確認
   ══════════════════════════════════════════════════════════ */

type Draft = Pick<Task, "code" | "title" | "kind" | "status" | "progress" | "flagged" | "assigneeEmail" | "coAssignees" | "start" | "due" | "note" | "goalId">;
type RowKey = null | "project" | "goal" | "due" | "start" | "assign" | "vendor" | "progress" | "after";

const EMPTY: Draft = { code: "", title: "", kind: "施工", status: "todo", progress: 0, flagged: false, coAssignees: [] };

const toDraft = (t: Task): Draft => ({
  code: t.code,
  title: t.title,
  kind: t.kind,
  status: t.status,
  progress: t.progress,
  flagged: t.flagged,
  assigneeEmail: t.assigneeEmail,
  coAssignees: t.coAssignees ?? [],
  start: t.start,
  due: t.due,
  note: t.note,
  goalId: t.goalId,
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
  const mine = !!task && isAssignee(task, me);
  const canEditAll = pm.isManager || isNew || (!!task && canEditProject(pm, task.code)) || (!!task && task.createdBy === me && mine);

  const initial = useMemo<Draft>(
    () => (task ? toDraft(task) : { ...EMPTY, ...(pm.isManager ? {} : { assigneeEmail: me }), ...preset }),
    // 以打開當下為準
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, taskId]
  );
  // 新任務：先填在草稿，按「新增」才存
  const [d, setD] = useState<Draft>(initial);
  // 既有任務：停手才存的欄位（指派、完成度）先放這裡，畫面先顯示
  const [pending, setPending] = useState<Partial<Draft>>({});
  const pendingRef = useRef<Partial<Draft>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [row, setRow] = useState<RowKey>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setD(initial);
    setPending({});
    pendingRef.current = {};
    setRow(isNew && !initial.code ? "project" : null);
    setConfirmDel(false);
    if (isNew) setTimeout(() => titleRef.current?.focus(), 350);
  }, [open, initial, isNew]);

  // 被指派的人打開 → 已讀
  useEffect(() => {
    if (open && task && mine && !task.seenAt) pm.markTask(task.id, "seen");
  }, [open, task, mine, pm]);

  const v: Draft = task ? { ...toDraft(task), ...pending } : d;
  const project = v.code ? pm.projectBy.get(v.code) : undefined;
  const late = task && isLate({ ...task, ...v } as Task, pm.today);

  /* ── 存檔 ── */
  const commit = async (patch: Partial<Draft>) => {
    if (!task) return;
    const full: Partial<Task> & { id: string } = { id: task.id, ...patch };
    if ("assigneeEmail" in patch) full.assigneeName = patch.assigneeEmail ? pm.personBy.get(patch.assigneeEmail)?.name : undefined;
    const before = task.assigneeEmail;
    const saved = await pm.saveTask(full);
    if (saved && "assigneeEmail" in patch && patch.assigneeEmail && patch.assigneeEmail !== before && patch.assigneeEmail !== me) {
      toast(`已指派給 ${saved.assigneeName}，對方會收到通知`);
    }
  };
  const flush = () => {
    clearTimeout(timer.current);
    const p = pendingRef.current;
    pendingRef.current = {};
    setPending({});
    if (task && Object.keys(p).length) commit(p);
  };
  /** 改欄位：新任務改草稿；既有任務馬上存（later＝停手 1 秒才存） */
  const change = (patch: Partial<Draft>, later = false) => {
    if (!task) return setD((c) => ({ ...c, ...patch }));
    const next = { ...v, ...patch };
    if (next.start && next.due && next.due < next.start) return toast("期限早於開始日", { tone: "error" });
    if (later) {
      pendingRef.current = { ...pendingRef.current, ...patch };
      setPending(pendingRef.current);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 1000);
      return;
    }
    commit(patch);
  };
  const close = () => {
    flush();
    onClose();
  };
  const toggleRow = (k: RowKey) => {
    if (row === "assign" || row === "progress") flush();
    setRow((r) => (r === k ? null : k));
  };

  /* ── 新增 ── */
  const errors: string[] = [];
  if (!d.title.trim()) errors.push("請輸入任務名稱");
  if (!d.code) errors.push("請選擇專案");
  if (d.start && d.due && d.due < d.start) errors.push("期限早於開始日");
  const create = async () => {
    if (errors.length) return toast(errors[0], { tone: "error" });
    const patch: Partial<Task> & { id: string } = { id: newTaskId(), ...d, title: d.title.trim() };
    if (!d.coAssignees?.length) delete patch.coAssignees;
    patch.assigneeName = d.assigneeEmail ? pm.personBy.get(d.assigneeEmail)?.name : undefined;
    onClose();
    const saved = await pm.saveTask(patch);
    if (saved) toast(`已新增「${saved.title}」${saved.assigneeEmail && saved.assigneeEmail !== me ? `，已通知 ${saved.assigneeName}` : ""}`);
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
            const { id, code, title, kind, status, progress, flagged, assigneeEmail, assigneeName, coAssignees, start, due, note, seq, goalId } = prev;
            pm.saveTask({ id, code, title, kind, status, progress, flagged, assigneeEmail, assigneeName, ...(coAssignees?.length ? { coAssignees } : {}), start, due, note, seq, goalId });
          },
        },
      });
    }
  };

  const ack = () => {
    if (task) pm.markTask(task.id, "ack");
    toast("已回覆收到，指派的人會看到");
  };

  const setProgress = (p: number) => change({ progress: p, status: p >= 100 ? "done" : p > 0 ? "doing" : "todo" }, true);
  const people = taskAssignees(v);
  const chips = task ? metaChips(task.meta).filter((c) => c.text !== task.meta?.vendor) : [];
  // 前置任務（WBS）：接在哪個任務之後開始（和甘特圖的「時間安排」同一個設定）
  const pred = task ? predecessorOf(pm.tasks, task) : undefined;
  const setAfter = (p: Task | null) => {
    if (!task) return;
    const meta = { ...(task.meta ?? {}) };
    if (p) meta.after = p.id;
    else delete meta.after;
    // 選了：從前一個結束的隔天開始，天數不變
    const s = p ? startAfter(p) : undefined;
    const n = task.start && task.due ? diffDays(task.start, task.due) : 0;
    pm.saveTask({ id: task.id, meta, ...(s ? { start: s, due: addDays(s, n) } : {}) });
    if (p) tourEmit("wbs-set", p.id);
    setRow(null);
  };
  const vendor = task?.meta?.vendor;
  const setVendor = (name: string | undefined) => {
    if (!task) return;
    const meta = { ...(task.meta ?? {}) };
    if (name) meta.vendor = name;
    else delete meta.vendor;
    pm.saveTask({ id: task.id, meta });
    setRow(null);
  };

  return (
    <Sheet
      open={open}
      title={isNew ? "新增任務" : project?.name ?? "任務"}
      subtitle={isNew ? undefined : project?.code}
      onClose={close}
      dirty={isNew && JSON.stringify(d) !== JSON.stringify(initial)}
      footer={
        isNew ? (
          <button onClick={create} className="w-full h-12 rounded-[14px] bg-[#18181B] text-white text-[15px] font-semibold active:opacity-85 disabled:opacity-35" disabled={!d.title.trim() || !d.code}>
            {d.assigneeEmail && d.assigneeEmail !== me ? "新增並通知" : "新增"}
          </button>
        ) : undefined
      }
    >
      <div className="px-4 pt-4 pb-8 flex flex-col gap-6">
        {/* 被指派的人：先確認收到 */}
        {task && mine && !task.ackAt && task.assignedBy && task.assignedBy !== me && task.status !== "done" && (
          <div className="rounded-[14px] p-3.5 flex items-center gap-3" style={{ background: "var(--accent-soft)" }}>
            <Avatar name={task.assignedByName} email={task.assignedBy} size={36} />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-[#18181B]">{task.assignedByName ?? "管理者"} 指派給你</p>
              <p className="text-[12.5px] text-[#71717A]">{task.assignedAt ? fmtTime(task.assignedAt) : ""}　按收到讓對方知道</p>
            </div>
            <button onClick={ack} className="h-10 px-4 rounded-full text-white text-[15px] font-bold shrink-0 active:opacity-85" style={{ background: ORANGE }}>
              收到
            </button>
          </div>
        )}

        {/* 名稱＋備註 */}
        <div className="bg-white rounded-[14px] px-4 pt-3 pb-2">
          <Editable
            ref={titleRef}
            value={v.title}
            edit={canEditAll}
            big
            placeholder="任務名稱，例：一樓牆面打底"
            onChange={isNew ? (t) => setD((c) => ({ ...c, title: t.replace(/\n/g, "") })) : undefined}
            onCommit={(t) => (t.trim() ? change({ title: t.trim() }) : toast("名稱不能空白", { tone: "error" }))}
          />
          <Editable
            value={v.note ?? ""}
            edit
            placeholder="備註（材料、位置、注意事項…）"
            onChange={isNew ? (t) => setD((c) => ({ ...c, note: t || undefined })) : undefined}
            onCommit={(t) => change({ note: t.trim() || undefined })}
          />
        </div>

        {/* 完成度、重要（狀態跟著完成度走：0%＝待辦、1–99%＝進行中、100%＝完成） */}
        <List>
          <div>
            <Line label="完成度" value={v.status === "done" ? "100%・完成" : `${v.progress}%`} open={row === "progress"} onClick={() => toggleRow("progress")} />
            {row === "progress" && (
              <div className="px-4 pb-3.5">
                <div className="grid grid-cols-5 gap-1.5">
                  {[0, 25, 50, 75, 100].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setProgress(n)}
                      className={`h-9 rounded-[9px] text-[13px] font-semibold tabular-nums ${v.progress === n ? "bg-[#18181B] text-white" : "bg-[#F2F2F4] text-[#3F3F46] active:bg-[#E4E4E7]"}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <input type="range" min={0} max={100} step={5} value={v.progress} onChange={(e) => setProgress(+e.target.value)} className="w-full mt-3 accent-[var(--accent)] h-6" aria-label="完成度" />
              </div>
            )}
          </div>
          {canEditAll && (
            <label className={`${lineCls} cursor-pointer`}>
              <span className={labelCls}>重要</span>
              <span className="flex-1" />
              <Toggle on={v.flagged} onChange={(f) => change({ flagged: f })} label="重要" />
            </label>
          )}
          {task && canEditAll && (
            <label className={`${lineCls} cursor-pointer`}>
              <span className={labelCls}>緊急</span>
              <span className="flex-1" />
              <Toggle
                on={!!task.meta?.urgent}
                onChange={(on) => {
                  const meta = { ...(task.meta ?? {}) };
                  if (on) meta.urgent = true;
                  else delete meta.urgent;
                  pm.saveTask({ id: task.id, meta });
                }}
                label="緊急"
              />
            </label>
          )}
        </List>

        {/* 時間 */}
        <List title="時間" foot={canEditAll ? (row === "after" ? "選了就從那個任務結束的隔天開始；它改日期，這個跟著移。" : "開始日是甘特圖的起點；沒填就只排在期限那一天。") : undefined}>
          <DateLine label="期限" value={v.due} min={v.start} today={pm.today} late={!!late} edit={canEditAll} open={row === "due"} onToggle={() => toggleRow("due")} onChange={(x) => change({ due: x })} />
          <DateLine label="開始" value={v.start} today={pm.today} edit={canEditAll} open={row === "start"} onToggle={() => toggleRow("start")} onChange={(x) => change({ start: x })} />
          {task && (
            <button type="button" disabled={!canEditAll} onClick={() => toggleRow("after")} className={`${lineCls} w-full text-left active:bg-[#F2F2F4] disabled:active:bg-transparent`} aria-expanded={row === "after"}>
              <span className={labelCls}>接在之後</span>
              <span className={`flex-1 min-w-0 text-right text-[16px] truncate ${pred ? "text-[#6E6E73]" : "text-[#C7C7CC]"}`}>{pred ? pred.title : "不接"}</span>
              {canEditAll && <Icon name={row === "after" ? "expand_less" : "expand_more"} className="text-[20px] text-[#C7C7CC] -ml-1" />}
            </button>
          )}
          {task && row === "after" && canEditAll && (
            <div className="max-h-[260px] overflow-y-auto overscroll-contain pb-1">
              {pred && (
                <button type="button" onClick={() => setAfter(null)} className="w-full px-4 min-h-[44px] text-left text-[15px] text-[#E5484D] active:bg-[#F2F2F4]">
                  不接在任何任務後面
                </button>
              )}
              {treeOrder(pm.tasks.filter((x) => x.code === task.code && x.id !== task.id))
                .map((r) => r.task)
                .filter((x) => !wouldCycle(pm.tasks, task.id, x.id))
                .map((x) => {
                  const e = endOf(x);
                  return (
                    <button key={x.id} type="button" onClick={() => setAfter(x)} className="w-full px-4 min-h-[44px] py-2 flex items-center gap-3 text-left active:bg-[#F2F2F4]">
                      <span className={`flex-1 min-w-0 text-[15px] truncate ${x.parentId ? "pl-4" : ""} ${x.status === "done" ? "text-[#A1A1AA]" : "text-[#18181B]"}`}>{x.title || "（未命名）"}</span>
                      <span className="text-[13px] text-[#8E8E93] tabular-nums shrink-0">{e ? `${fmtDate(e, pm.today)} 結束` : "未排程"}</span>
                      {pred?.id === x.id && <Icon name="check" weight={500} className="text-[18px] text-[var(--accent)]" />}
                    </button>
                  );
                })}
            </div>
          )}
        </List>

        {/* 負責人 */}
        <List title="負責人" foot={pm.isManager && row === "assign" ? "可複選；第一位是主要負責人，會收到回條提醒。" : undefined}>
          <button type="button" disabled={!pm.isManager} onClick={() => toggleRow("assign")} className={`${lineCls} w-full text-left active:bg-[#F2F2F4] disabled:active:bg-transparent`} aria-expanded={row === "assign"}>
            {people.length ? (
              <>
                <AvatarStack people={people.map((e) => ({ email: e, name: pm.personBy.get(e)?.name }))} max={3} size={28} />
                <span className="flex-1 min-w-0 text-[16px] text-[#18181B] truncate">{assigneeLabel(pm, v)}</span>
              </>
            ) : (
              <span className="flex-1 text-[16px] text-[#C7C7CC]">未指派</span>
            )}
            {pm.isManager && <Icon name={row === "assign" ? "expand_less" : "expand_more"} className="text-[20px] text-[#C7C7CC] -ml-1" />}
          </button>
          {row === "assign" && pm.isManager && (
            <div className="px-3 pb-3">
              <AssigneeGrid pm={pm} value={people} onChange={(list) => {
                change(assigneePatch(pm, list), true);
                tourEmit("assigned");
              }} />
            </div>
          )}
          {/* 廠商：協力廠商名單（廠商CRM）；既有任務才有，新任務存好後再選 */}
          {task && (
            <button type="button" disabled={!canEditAll} onClick={() => toggleRow("vendor")} className={`${lineCls} w-full text-left active:bg-[#F2F2F4] disabled:active:bg-transparent`} aria-expanded={row === "vendor"}>
              <span className={labelCls}>廠商</span>
              <span className={`flex-1 min-w-0 text-right text-[16px] truncate ${vendor ? "text-[#6E6E73]" : "text-[#C7C7CC]"}`}>{vendor ?? "未指定"}</span>
              {canEditAll && <Icon name={row === "vendor" ? "expand_less" : "expand_more"} className="text-[20px] text-[#C7C7CC] -ml-1" />}
            </button>
          )}
          {task && row === "vendor" && canEditAll && <VendorList value={vendor} trade={task.meta?.trade} onPick={setVendor} />}
          {task?.assigneeEmail && task.assigneeEmail !== me && task.status !== "done" && (
            <div className="px-4 py-2.5">
              <Receipt task={task} pm={pm} />
            </div>
          )}
        </List>

        {/* 分類 */}
        <List title="分類" foot={v.kind === "等待" ? "等待期：養護、乾燥、等料，只要等時間。甘特圖畫虛線，不算工作量。" : undefined}>
          <button type="button" disabled={!canEditAll} onClick={() => toggleRow("project")} className={`${lineCls} w-full text-left active:bg-[#F2F2F4] disabled:active:bg-transparent`} aria-expanded={row === "project"}>
            <span className={labelCls}>專案</span>
            <span className={`flex-1 min-w-0 text-right text-[16px] truncate ${project ? "text-[#6E6E73]" : "text-[#C7C7CC]"}`}>
              {project ? (
                <>
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: personColor(project.code) }} />
                  {project.code} {project.name}
                </>
              ) : (
                "選擇專案"
              )}
            </span>
            {canEditAll && <Icon name={row === "project" ? "expand_less" : "expand_more"} className="text-[20px] text-[#C7C7CC] -ml-1" />}
          </button>
          {row === "project" && canEditAll && (
            <ProjectPicker
              pm={pm}
              value={v.code}
              onPick={(code) => {
                if (code !== v.code) change({ code });
                setRow(null);
              }}
            />
          )}
          <PickLine
            label="類型"
            value={v.kind}
            options={WORK_KINDS.map((k) => [k, k === "等待" ? "等待期" : k])}
            edit={canEditAll}
            onChange={(k) => change({ kind: k as WorkKind })}
          />
          {task && canEditAll && (
            <button type="button" onClick={() => setTagsOpen(true)} className={`${lineCls} w-full text-left active:bg-[#F2F2F4] py-2`}>
              <span className={labelCls}>標籤</span>
              <span className="flex-1 min-w-0 flex flex-wrap justify-end gap-1">
                {chips.length ? (
                  chips.slice(0, 4).map((c) => (
                    <span key={c.text} className="h-[22px] px-2 rounded-[6px] text-[12.5px] leading-[22px] font-medium" style={{ color: c.color, background: c.bg }}>
                      {c.text}
                    </span>
                  ))
                ) : (
                  <span className="text-[16px] text-[#C7C7CC]">工種、工項、工審…</span>
                )}
                {chips.length > 4 && <span className="text-[13px] leading-[22px] text-[#A1A1AA]">+{chips.length - 4}</span>}
              </span>
              <Icon name="chevron_right" className="text-[20px] text-[#C7C7CC] -ml-1" />
            </button>
          )}
          {pm.goalsReady && (pm.goals.length > 0 || v.goalId) && (
            <>
              <button type="button" disabled={!canEditAll} onClick={() => toggleRow("goal")} className={`${lineCls} w-full text-left active:bg-[#F2F2F4] disabled:active:bg-transparent`} aria-expanded={row === "goal"}>
                <span className={labelCls}>公司目標</span>
                <span className={`flex-1 min-w-0 text-right text-[16px] truncate ${v.goalId ? "text-[#6E6E73]" : "text-[#C7C7CC]"}`}>
                  {v.goalId ? pm.goalBy.get(v.goalId)?.title ?? "（目標已刪除）" : "不連結"}
                </span>
                {canEditAll && <Icon name={row === "goal" ? "expand_less" : "expand_more"} className="text-[20px] text-[#C7C7CC] -ml-1" />}
              </button>
              {row === "goal" && canEditAll && (
                <GoalPicker
                  pm={pm}
                  value={v.goalId}
                  onPick={(id) => {
                    change({ goalId: id });
                    setRow(null);
                  }}
                />
              )}
            </>
          )}
        </List>

        {task && <History task={task} pm={pm} />}

        {task && canEditAll && (
          <div className="bg-white rounded-[14px] overflow-hidden">
            {confirmDel ? (
              <div className="flex gap-2 p-3">
                <button onClick={() => setConfirmDel(false)} className="flex-1 h-11 rounded-[12px] bg-[#F2F2F4] text-[15px] font-semibold text-[#18181B]">
                  不刪除
                </button>
                <button onClick={remove} className="flex-1 h-11 rounded-[12px] text-white text-[15px] font-semibold" style={{ background: RED }}>
                  確定刪除
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDel(true)} className="w-full h-12 text-[16px] active:bg-[#F2F2F4]" style={{ color: RED }}>
                刪除任務
              </button>
            )}
          </div>
        )}
      </div>
      <TagSheet pm={pm} taskId={task?.id ?? null} open={tagsOpen} onClose={() => setTagsOpen(false)} />
    </Sheet>
  );
}

/* ── 設定風格的列（和專案頁一樣） ── */

function List({ title, foot, children }: { title?: string; foot?: string; children: React.ReactNode }) {
  return (
    <section>
      {title && <h3 className="px-4 pb-1.5 text-[13px] text-[#8E8E93]">{title}</h3>}
      <div className="bg-white rounded-[14px] overflow-hidden divide-y divide-[#F0F0F2]">{children}</div>
      {foot && <p className="px-4 pt-1.5 text-[12.5px] leading-relaxed text-[#8E8E93]">{foot}</p>}
    </section>
  );
}

const lineCls = "relative flex items-center gap-3 pl-4 pr-3 min-h-[48px]";
const labelCls = "text-[16px] text-[#18181B] shrink-0";

/** 一列：左邊項目、右邊值、⌄ 展開 */
function Line({ label, value, open, onClick }: { label: string; value: string; open: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`${lineCls} w-full text-left active:bg-[#F2F2F4]`} aria-expanded={open}>
      <span className={labelCls}>{label}</span>
      <span className="flex-1 text-right text-[16px] text-[#6E6E73] tabular-nums">{value}</span>
      <Icon name={open ? "expand_less" : "expand_more"} className="text-[20px] text-[#C7C7CC] -ml-1" />
    </button>
  );
}

/** 名稱、備註：直接打字；新任務即時改草稿，既有任務離開輸入框才存 */
const Editable = React.forwardRef<
  HTMLTextAreaElement,
  { value: string; edit: boolean; big?: boolean; placeholder: string; onChange?: (t: string) => void; onCommit: (t: string) => void }
>(function Editable({ value, edit, big, placeholder, onChange, onCommit }, ref) {
  const [t, setT] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setT(value);
  }, [value]);
  const cls = big ? "text-[20px] font-semibold leading-snug text-[#18181B]" : "text-[16px] leading-relaxed text-[#3F3F46] mt-1 min-h-[3em]";
  if (!edit) return <p className={cls}>{value}</p>;
  return (
    <textarea
      ref={ref}
      value={onChange ? value : t}
      onChange={(e) => (onChange ? onChange(e.target.value) : setT(big ? e.target.value.replace(/\n/g, "") : e.target.value))}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        if (!onChange && t !== value) {
          if (big && !t.trim()) setT(value);
          onCommit(t);
        }
      }}
      onKeyDown={(e) => big && e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), (e.target as HTMLTextAreaElement).blur())}
      rows={big ? 1 : 2}
      maxLength={big ? 80 : 2000}
      placeholder={placeholder}
      enterKeyHint={big ? "done" : undefined}
      className={`w-full resize-none bg-transparent outline-none placeholder:text-[#C7C7CC] [field-sizing:content] ${cls}`}
    />
  );
});

/** 日期：右邊顯示日期（逾期紅字），點開是捷徑（今天、明天、週五、下週一、選日期） */
function DateLine({
  label,
  value,
  min,
  today,
  late,
  edit,
  open,
  onToggle,
  onChange,
}: {
  label: string;
  value?: string;
  min?: string;
  today: string;
  late?: boolean;
  edit: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (v: string | undefined) => void;
}) {
  const shortcuts = dateShortcuts(today);
  const custom = value && !shortcuts.some((s) => s.value === value);
  return (
    <div>
      <div className={lineCls}>
        <button type="button" disabled={!edit} onClick={onToggle} className="absolute inset-0 active:bg-[#F2F2F4] disabled:active:bg-transparent" aria-expanded={open} aria-label={`${label}：${value ? fmtDateLong(value, today) : "未設定"}`} />
        <span className={`${labelCls} relative pointer-events-none`}>{label}</span>
        <span className={`relative pointer-events-none flex-1 text-right text-[16px] tabular-nums ${late ? "text-[#E5484D]" : value ? "text-[var(--accent-ink)]" : "text-[#C7C7CC]"}`}>
          {value ? fmtDateLong(value, today) + (late ? "　逾期" : "") : "未設定"}
        </span>
        {value && edit && (
          <button type="button" onClick={() => onChange(undefined)} aria-label={`清除${label}`} className="relative -mr-1 w-8 h-8 rounded-full flex items-center justify-center text-[#C7C7CC] active:bg-[#F2F2F4]">
            <Icon name="cancel" fill={1} className="text-[19px]" />
          </button>
        )}
      </div>
      {open && edit && (
        <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {shortcuts.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => onChange(s.value)}
              disabled={!!min && s.value < min}
              className={`shrink-0 h-9 px-3.5 rounded-full text-[14px] font-medium disabled:opacity-30 ${value === s.value ? "bg-[#18181B] text-white" : "bg-[#F2F2F4] text-[#3F3F46] active:bg-[#E4E4E7]"}`}
            >
              {s.label}
            </button>
          ))}
          <label className={`relative shrink-0 h-9 px-3.5 rounded-full text-[14px] font-medium inline-flex items-center gap-1 cursor-pointer ${custom ? "bg-[#18181B] text-white" : "bg-[#F2F2F4] text-[#3F3F46]"}`}>
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
    </div>
  );
}

/** 選一個：右邊目前的值 ⌃⌄，點了跳出系統選單 */
function PickLine({ label, value, options, edit, onChange }: { label: string; value: string; options: [string, string][]; edit: boolean; onChange: (v: string) => void }) {
  return (
    <div className={lineCls}>
      <span className={labelCls}>{label}</span>
      <span className="flex-1 text-right text-[16px] text-[#6E6E73]">{options.find(([k]) => k === value)?.[1] ?? value}</span>
      {edit && (
        <>
          <Icon name="unfold_more" className="text-[18px] text-[#C7C7CC] -ml-1.5" />
          <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
            {options.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

/* ── 小元件 ───────────────────────────────────────────── */

/** 指派：大頭照格子，可複選（點一下加入／移除）；下方小字是對方手上還有幾件，方便分配。第一位＝主要負責人 */
function AssigneeGrid({ pm, value, onChange }: { pm: Pm; value: string[]; onChange: (v: string[]) => void }) {
  const load = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of pm.tasks) if (t.status !== "done") for (const e of taskAssignees(t)) m.set(e, (m.get(e) ?? 0) + 1);
    return m;
  }, [pm.tasks]);
  const me = pm.me?.email;
  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 gap-y-3 gap-x-1 pt-1" role="group" aria-label="指派給（可複選）">
      {pm.people.map((p) => {
        const on = value.includes(p.email);
        const n = load.get(p.email) ?? 0;
        return (
          <button
            key={p.email}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onChange(on ? value.filter((e) => e !== p.email) : [...value, p.email])}
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
            {value.length > 1 && value[0] === p.email && <span className="text-[10.5px] leading-none font-semibold" style={{ color: ORANGE }}>主要</span>}
            <span className="text-[11px] leading-none text-[#A1A1AA] tabular-nums">{n ? `${n} 件` : "空閒"}</span>
          </button>
        );
      })}
    </div>
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
    <p className="text-[13px] flex items-center gap-1.5" style={{ color }}>
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
    <div className="px-4 -mt-2">
      <p className="text-[13px] text-[#8E8E93] mb-1">紀錄</p>
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
          className="w-full h-10 rounded-[10px] bg-white border border-[#E4E4E7] pl-9 pr-3 text-[16px] text-[#18181B] outline-none focus:border-[var(--accent)]"
        />
      </div>
      <div className="max-h-[260px] overflow-y-auto overscroll-contain rounded-[10px] bg-white border border-[#EBEBED] divide-y divide-[#F2F2F4]">
        {list.map((p) => (
          <button
            key={p.code}
            type="button"
            onClick={() => onPick(p.code)}
            className={`w-full flex items-center gap-3 px-3 h-12 text-left active:bg-[#F4F4F5] ${value === p.code ? "bg-[var(--accent-soft)]" : ""}`}
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

