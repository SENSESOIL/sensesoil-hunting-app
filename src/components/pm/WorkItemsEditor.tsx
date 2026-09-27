"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  addDays,
  diffDays,
  fmtDate,
  newId,
  shiftItems,
  spreadTemplate,
  templateTrades,
  validateItem,
  weightedProgress,
  workStatus,
  WORK_KINDS,
  type ProjectView,
  type WorkItem,
  type WorkKind,
} from "@/lib/project-ops";
import { Sheet, SheetActions } from "./Sheet";
import { useCommit } from "./commit";
import { DateField, FieldGroup, ProgressControl, Row, Segmented, TextField } from "./fields";
import { EmptyState, Icon, STATUS, WORK_META, INK_2 } from "./ui";
import { SandboxFootnote } from "./ProjectEditor";
import type { ProjectOps } from "./useProjectOps";

/** 範本的預設工期（天）：專案還沒填開工／完工日時用 */
const DEFAULT_SPAN: Record<string, number> = {
  室內裝修: 60,
  泥作工藝: 30,
  拆除: 8,
  防水: 12,
  修繕維護: 8,
  追加減: 12,
};

const sameItems = (a: WorkItem[], b: WorkItem[]) => JSON.stringify(a) === JSON.stringify(b);

export function WorkItemsEditor({
  p,
  ops,
  open,
  onClose,
}: {
  p: ProjectView;
  ops: ProjectOps;
  open: boolean;
  onClose: () => void;
}) {
  const initial = useMemo<WorkItem[]>(
    () => p.items.map(({ status: _s, ...it }) => ({ ...it, id: it.id || newId() })),
    // 以開啟當下為準，編輯中不被外部更新覆蓋
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, p.code]
  );
  const [items, setItems] = useState<WorkItem[]>(initial);
  const [editing, setEditing] = useState<string | null>(null); // 工項 id 或 "new"
  const [panel, setPanel] = useState<null | "shift" | "template">(null);
  const [shiftFrom, setShiftFrom] = useState<string | null>(null);
  const [shiftDays, setShiftDays] = useState(1);
  const [moveDue, setMoveDue] = useState(true);
  /** 順延時勾選「同時改預計完工」→ 儲存時一併寫入 */
  const [pendingDue, setPendingDue] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPendingDue(null);
      setItems(initial);
      setEditing(null);
      setPanel(null);
      setShiftDays(1);
    }
  }, [open, initial]);

  const dirty = !sameItems(items, initial);
  const today = ops.today;
  const cat = p.category;
  const startAt = p.ops?.startAt;
  const dueAt = p.ops?.dueAt;
  const hasErrors = items.some((it) => validateItem(it).some((i) => i.level === "error"));
  const est = weightedProgress(items);

  const crewOptions = useMemo(() => {
    const s = new Set<string>();
    ops.views.forEach((v) => v.items.forEach((i) => i.crew && s.add(i.crew)));
    items.forEach((i) => i.crew && s.add(i.crew));
    return [...s].sort();
  }, [ops.views, items]);

  /* ── 套用範本 ── */
  const tplStart = startAt ?? today;
  const tplDue = dueAt && dueAt >= tplStart ? dueAt : addDays(tplStart, (DEFAULT_SPAN[cat] ?? 30) - 1);
  const applyTemplate = () => {
    setItems(spreadTemplate(cat, p.code, tplStart, tplDue));
    setPanel(null);
  };

  /* ── 順延預覽 ── */
  const shifted = useMemo(() => shiftItems(items, shiftFrom, shiftDays, today), [items, shiftFrom, shiftDays, today]);
  const affected = shifted.filter((it, i) => it !== items[i]).length;
  const lastEnd = (arr: WorkItem[]) => arr.reduce<string | undefined>((m, i) => (i.end && (!m || i.end > m) ? i.end : m), undefined);
  const beforeEnd = lastEnd(items);
  const afterEnd = lastEnd(shifted);

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };

  const { saving, commit } = useCommit(ops);
  const save = async () => {
    if (hasErrors) return;
    // 順延時勾選「同時改預計完工」→ 工項與預計完工一次寫入，一步就能復原
    const rec = pendingDue && p.ops && pendingDue !== p.ops.dueAt ? { ...p.ops, dueAt: pendingDue } : undefined;
    const extra = rec ? `預計完工改為 ${fmtDate(pendingDue!, today)}` : `${items.length} 個工項`;
    if (await commit(p.code, rec, items, "工項排程", extra)) {
      setPendingDue(null);
      onClose();
    }
  };

  const editingItem = editing && editing !== "new" ? items.find((i) => i.id === editing) : undefined;

  return (
    <>
      <Sheet
        open={open}
        wide
        title="工項排程"
        subtitle={`${p.code}　${p.name}`}
        onClose={onClose}
        dirty={dirty}
        footer={
          <SheetActions
            onSave={save}
            saving={saving}
            disabled={!dirty || hasErrors}
            saveLabel={dirty ? `${ops.saveMode === "sandbox" ? "存到本機" : "儲存"}（${items.length} 個工項）` : "沒有變更"}
          />
        }
      >
        <div className="pb-5">
          {/* 摘要＋工具 */}
          <div className="px-4 pt-4 flex items-center justify-between gap-3">
            <p className="text-[12.5px] text-[#71717A] min-w-0 truncate">
              {items.length ? `${items.length} 個工項` : "尚未排定工項"}
              {est !== undefined && `　·　依工項推算 ${est}%`}
              {startAt && dueAt && `　·　工期 ${fmtDate(startAt, today)}–${fmtDate(dueAt, today)}`}
            </p>
          </div>
          <div className="px-4 pt-3 grid grid-cols-3 gap-2">
            <ToolButton icon="add" label="新增工項" onClick={() => setEditing("new")} />
            <ToolButton
              icon="event_repeat"
              label="順延"
              active={panel === "shift"}
              disabled={!items.some((i) => (i.progress ?? 0) < 100 && i.start)}
              onClick={() => {
                setPanel(panel === "shift" ? null : "shift");
                setShiftFrom(items.find((i) => (i.progress ?? 0) < 100)?.id ?? null);
              }}
            />
            <ToolButton
              icon="auto_awesome_motion"
              label="套用範本"
              active={panel === "template"}
              onClick={() => setPanel(panel === "template" ? null : "template")}
            />
          </div>

          {/* 順延 */}
          {panel === "shift" && (
            <div className="mx-4 mt-3 rounded-[16px] bg-white border border-[#E4E4E7] p-4">
              <p className="text-[14px] font-bold text-[#18181B]">順延工項</p>
              <p className="text-[12px] text-[#71717A] mt-0.5">雨天停工、業主延後進場時使用。已完成的工項不會動。</p>
              <label className="block mt-3 text-[12.5px] font-semibold text-[#3F3F46]" htmlFor="shift-from">
                從哪個工項開始
              </label>
              <select
                id="shift-from"
                value={shiftFrom ?? ""}
                onChange={(e) => setShiftFrom(e.target.value || null)}
                className="mt-1.5 w-full h-11 rounded-[12px] border border-[#E4E4E7] bg-[#FCFCFC] px-3 text-[16px] text-[#18181B] outline-none focus:border-[#F39C12]"
              >
                {items.map((it) => (
                  <option key={it.id} value={it.id} disabled={(it.progress ?? 0) >= 100}>
                    {it.trade}
                    {it.start ? `（${fmtDate(it.start, today)}）` : ""}
                    {(it.progress ?? 0) >= 100 ? " — 已完成" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-3 text-[12.5px] font-semibold text-[#3F3F46]">順延天數</p>
              <div className="mt-1.5 flex items-center gap-2">
                {[-7, -1].map((d) => (
                  <StepButton key={d} label={`${d}`} onClick={() => setShiftDays((n) => n + d)} />
                ))}
                <div className="flex-1 text-center">
                  <span className="text-[28px] font-semibold tabular-nums text-[#18181B]">{shiftDays > 0 ? `+${shiftDays}` : shiftDays}</span>
                  <span className="text-[13px] text-[#A1A1AA] ml-1">天</span>
                </div>
                {[1, 7].map((d) => (
                  <StepButton key={d} label={`+${d}`} onClick={() => setShiftDays((n) => n + d)} />
                ))}
              </div>
              <p className="mt-3 text-[12.5px] text-[#52525B]">
                影響 <b className="tabular-nums">{affected}</b> 個工項
                {beforeEnd && afterEnd && beforeEnd !== afterEnd && (
                  <>
                    ，最後完成 {fmtDate(beforeEnd, today)} → <b>{fmtDate(afterEnd, today)}</b>
                  </>
                )}
              </p>
              {p.ops?.dueAt && afterEnd && afterEnd !== beforeEnd && (
                <label className="mt-2 flex items-center gap-2 text-[13px] text-[#3F3F46] min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={moveDue}
                    onChange={(e) => setMoveDue(e.target.checked)}
                    className="w-5 h-5 rounded border-[#D4D4D8] text-[#18181B] focus:ring-[#F39C12]"
                  />
                  同時把預計完工 {fmtDate(p.ops.dueAt, today)} 改為 {fmtDate(addDays(p.ops.dueAt, shiftDays), today)}
                </label>
              )}
              <button
                onClick={() => {
                  setItems(shifted);
                  if (moveDue && p.ops?.dueAt && afterEnd !== beforeEnd) setPendingDue(addDays(p.ops.dueAt, shiftDays));
                  setPanel(null);
                }}
                disabled={!affected || !shiftDays}
                className="mt-3 w-full h-11 rounded-[12px] bg-[#18181B] text-white text-[14px] font-semibold disabled:opacity-35"
              >
                套用順延（尚未儲存）
              </button>
            </div>
          )}

          {/* 套用範本 */}
          {panel === "template" && (
            <div className="mx-4 mt-3 rounded-[16px] bg-white border border-[#E4E4E7] p-4">
              <p className="text-[14px] font-bold text-[#18181B]">依「{cat}」範本產生工項</p>
              <p className="text-[12px] text-[#71717A] mt-1 leading-relaxed">
                {templateTrades(cat).join(" → ")}
              </p>
              <p className="text-[12px] text-[#71717A] mt-2">
                依工作量比例排在 {fmtDate(tplStart, today)}–{fmtDate(tplDue, today)}
                {!startAt || !dueAt ? "（專案還沒填開工／完工日，先用今天起算的預設工期）" : ""}。
              </p>
              {items.length > 0 && (
                <p className="text-[12px] font-semibold mt-2 flex items-center gap-1" style={{ color: STATUS.critical }}>
                  <Icon name="warning" weight={400} fill={1} className="text-[15px]" />
                  會取代目前的 {items.length} 個工項（儲存前都還能復原）
                </p>
              )}
              <button onClick={applyTemplate} className="mt-3 w-full h-11 rounded-[12px] bg-[#18181B] text-white text-[14px] font-semibold">
                產生 {templateTrades(cat).length} 個工項
              </button>
            </div>
          )}

          {/* 工項清單 */}
          {items.length === 0 && panel !== "template" ? (
            <div className="mx-4 mt-4 rounded-[16px] bg-white border border-[#E4E4E7]/70">
              <EmptyState
                icon="view_timeline"
                title="還沒有工項"
                hint={`可以依「${cat}」範本一次產生，再逐項調整日期與工班。`}
                action={
                  <button onClick={() => setPanel("template")} className="h-10 px-4 rounded-full bg-[#18181B] text-white text-[13px] font-semibold">
                    套用範本
                  </button>
                }
              />
            </div>
          ) : (
            <ol className="mx-4 mt-4 rounded-[16px] bg-white border border-[#E4E4E7]/70 divide-y divide-[#F4F4F5] overflow-hidden">
              {items.map((it, i) => {
                const st = workStatus(it, today);
                const err = validateItem(it, p.ops).filter((x) => x.level === "error").length;
                const days = it.start && it.end ? diffDays(it.start, it.end) + 1 : undefined;
                return (
                  <li key={it.id} className="flex items-stretch">
                    <button
                      onClick={() => setEditing(it.id!)}
                      className="flex-1 min-w-0 text-left px-3.5 py-3 flex items-center gap-3 active:bg-[#F4F4F5]"
                    >
                      <span
                        className="w-1 self-stretch rounded-full shrink-0"
                        style={{ background: st === "延遲" ? STATUS.critical : st === "完成" ? "#D4D4D8" : INK_2 }}
                        aria-hidden
                      />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="text-[14.5px] font-semibold text-[#18181B] truncate">{it.trade || "（未命名工項）"}</span>
                          {err > 0 && <Icon name="error" weight={400} fill={1} className="text-[15px]" style={{ color: STATUS.critical }} />}
                        </span>
                        <span className="block text-[11.5px] text-[#A1A1AA] truncate mt-0.5 tabular-nums">
                          {it.kind === "等待" ? "等待期（免派工）" : it.crew || "未指定施作單位"}　·
                          {it.start ? `${fmtDate(it.start, today)}–${fmtDate(it.end, today)}` : "未排日期"}
                          {days ? `（${days} 天）` : ""}
                        </span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block text-[13px] font-semibold text-[#18181B] tabular-nums">{it.progress ?? 0}%</span>
                        <span className="block text-[10.5px]" style={{ color: st === "延遲" ? STATUS.critical : "#A1A1AA" }}>
                          {WORK_META[st].label}
                        </span>
                      </span>
                    </button>
                    <div className="flex flex-col border-l border-[#F4F4F5] shrink-0">
                      <button
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        className="flex-1 w-11 flex items-center justify-center text-[#71717A] active:bg-[#F4F4F5] disabled:opacity-25"
                        aria-label={`把 ${it.trade} 往上移`}
                      >
                        <Icon name="keyboard_arrow_up" className="text-[20px]" />
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        disabled={i === items.length - 1}
                        className="flex-1 w-11 flex items-center justify-center text-[#71717A] active:bg-[#F4F4F5] border-t border-[#F4F4F5] disabled:opacity-25"
                        aria-label={`把 ${it.trade} 往下移`}
                      >
                        <Icon name="keyboard_arrow_down" className="text-[20px]" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {ops.saveMode === "sandbox" && <SandboxFootnote ops={ops} />}
        </div>
      </Sheet>

      <ItemSheet
        open={editing !== null}
        item={editingItem}
        isNew={editing === "new"}
        p={p}
        today={today}
        crewOptions={crewOptions}
        onClose={() => setEditing(null)}
        onSave={(it) => {
          setItems((cur) => (editing === "new" ? [...cur, it] : cur.map((x) => (x.id === it.id ? it : x))));
          setEditing(null);
        }}
        onDelete={(id) => {
          setItems((cur) => cur.filter((x) => x.id !== id));
          setEditing(null);
        }}
        defaultStart={items.length ? addDays(lastEnd(items) ?? today, 1) : startAt ?? today}
      />
    </>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-[52px] rounded-[14px] flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold transition-colors disabled:opacity-35 ${
        active ? "bg-[#18181B] text-white" : "bg-white border border-[#E4E4E7] text-[#3F3F46] active:bg-[#F4F4F5]"
      }`}
    >
      <Icon name={icon} weight={300} className="text-[20px]" />
      {label}
    </button>
  );
}

function StepButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-12 h-11 rounded-[12px] bg-[#F4F4F5] text-[14px] font-semibold text-[#18181B] tabular-nums active:bg-[#E4E4E7]"
    >
      {label}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════
   單一工項
   ══════════════════════════════════════════════════════════ */

function ItemSheet({
  open,
  item,
  isNew,
  p,
  today,
  crewOptions,
  onClose,
  onSave,
  onDelete,
  defaultStart,
}: {
  open: boolean;
  item?: WorkItem;
  isNew: boolean;
  p: ProjectView;
  today: string;
  crewOptions: string[];
  onClose: () => void;
  onSave: (it: WorkItem) => void;
  onDelete: (id: string) => void;
  defaultStart: string;
}) {
  const blank = (): WorkItem => ({
    id: newId(),
    code: p.code,
    trade: "",
    start: defaultStart,
    end: addDays(defaultStart, 2),
    progress: 0,
  });
  const [it, setIt] = useState<WorkItem>(item ?? blank());
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => {
    if (open) {
      setIt(item ?? blank());
      setConfirmDel(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  const issues = validateItem(it, p.ops);
  const errors = issues.filter((i) => i.level === "error");
  const dirty = isNew ? it.trade.trim() !== "" : JSON.stringify(it) !== JSON.stringify(item);
  const set = <K extends keyof WorkItem>(k: K, v: WorkItem[K]) => setIt((c) => ({ ...c, [k]: v }));
  const days = it.start && it.end ? diffDays(it.start, it.end) + 1 : undefined;
  const trades = templateTrades(p.category);

  return (
    <Sheet
      open={open}
      title={isNew ? "新增工項" : "編輯工項"}
      subtitle={p.name}
      onClose={onClose}
      dirty={dirty}
      footer={
        confirmDel ? (
          <div className="flex gap-2">
            <button onClick={() => setConfirmDel(false)} className="flex-1 h-12 rounded-[14px] bg-[#F4F4F5] text-[15px] font-semibold text-[#18181B]">
              不刪除
            </button>
            <button
              onClick={() => onDelete(it.id!)}
              className="flex-1 h-12 rounded-[14px] bg-[#d03b3b] text-white text-[15px] font-semibold"
            >
              確定刪除
            </button>
          </div>
        ) : (
          <SheetActions
            onSave={() => onSave({ ...it, trade: it.trade.trim(), crew: it.crew?.trim() || undefined, note: it.note?.trim() || undefined })}
            disabled={!!errors.length || !dirty}
            saveLabel={isNew ? "加入" : "完成"}
            extra={
              !isNew ? (
                <button
                  onClick={() => setConfirmDel(true)}
                  className="w-12 h-12 rounded-[14px] bg-white border border-[#E4E4E7] flex items-center justify-center text-[#d03b3b] active:bg-[#FEF2F2]"
                  aria-label="刪除工項"
                >
                  <Icon name="delete" className="text-[22px]" />
                </button>
              ) : undefined
            }
          />
        )
      }
    >
      <div className="pb-5">
        <FieldGroup>
          <TextField label="工項" value={it.trade} onChange={(v) => set("trade", v)} placeholder="例：面層施作" issues={isNew && !it.trade ? undefined : issues.filter((i) => i.field === "trade")} />
          <div className="px-4 pb-3 -mt-1 flex flex-wrap gap-1.5">
            {trades.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("trade", t)}
                className={`h-10 px-3.5 rounded-full text-[13px] ${it.trade === t ? "bg-[#18181B] text-white" : "bg-[#F4F4F5] text-[#3F3F46] active:bg-[#E4E4E7]"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <Segmented<WorkKind>
            label="類型"
            options={WORK_KINDS}
            value={it.kind ?? "施工"}
            onChange={(v) => set("kind", v === "施工" ? undefined : v)}
          />
          {it.kind === "等待" ? (
            <p className="px-4 pb-3 -mt-1 text-[12px] text-[#71717A] leading-relaxed">
              養護、乾燥、等料等「只要等」的期間：甘特圖畫虛線，不排進派工，也不計入進度推算。
            </p>
          ) : (
            <TextField label="施作單位" value={it.crew} onChange={(v) => set("crew", v)} placeholder="工班或廠商" list={crewOptions} />
          )}
        </FieldGroup>
        <FieldGroup hint={days ? `共 ${days} 天` : undefined}>
          <DateField label="開始" value={it.start} onChange={(v) => set("start", v)} today={today} issues={issues.filter((i) => i.field === "start")} />
          <DateField label="結束" value={it.end} onChange={(v) => set("end", v)} today={today} min={it.start} issues={issues.filter((i) => i.field === "end")} />
          {it.start && (
            <Row label="快速設定天數">
              <div className="flex gap-1.5">
                {[1, 3, 5, 7, 14].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set("end", addDays(it.start!, d - 1))}
                    className={`flex-1 h-10 rounded-[10px] text-[13px] font-semibold tabular-nums ${days === d ? "bg-[#18181B] text-white" : "bg-[#F4F4F5] text-[#3F3F46] active:bg-[#E4E4E7]"}`}
                  >
                    {d}天
                  </button>
                ))}
              </div>
            </Row>
          )}
        </FieldGroup>
        <FieldGroup>
          <ProgressControl label="完成度" value={it.progress} onChange={(v) => set("progress", v)} />
          <TextField label="備註" value={it.note} onChange={(v) => set("note", v)} placeholder="例：等業主確認色樣" />
        </FieldGroup>
      </div>
    </Sheet>
  );
}
