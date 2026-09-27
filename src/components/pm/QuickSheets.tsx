"use client";

/**
 * 快速編輯抽屜（現場最常做的幾件事，3 次點擊內完成）：
 *   DailyReportSheet —— 今日回報：今天的工項進度＋整體進度＋近況
 *   ItemQuickSheet   —— 更新單一工項：進度、標記完成、順延此項（可連帶後續）
 *   StageSheet       —— 改階段（一點就存，附帶提示）
 *   BillingSheet     —— 登錄本期請款／收款（累加到總額）
 *
 * 都會立即儲存（本機試編或雲端），並提供「復原」。
 * 開啟方式由呼叫端控制：open + 目標專案（＋工項 id）。
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  diffDays,
  fmtDate,
  fmtMoney,
  shiftItems,
  STAGES,
  weightedProgress,
  type OpsRecord,
  type ProjectView,
  type Risk,
  type Stage,
  type WorkItem,
} from "@/lib/project-ops";
import { Sheet, SheetActions } from "./Sheet";
import { FieldGroup, MoneyField, PhraseChips, ProgressControl, Row, Segmented } from "./fields";
import { Consequence, previewHealth, useCommit } from "./commit";
import { Icon, STATUS, WORK_META } from "./ui";
import { SandboxFootnote } from "./ProjectEditor";
import type { ProjectOps } from "./useProjectOps";

export interface QuickSheetProps {
  p: ProjectView;
  ops: ProjectOps;
  open: boolean;
  onClose: () => void;
}

const RISKS: Risk[] = ["正常", "注意", "異常"];
const RISK_ICON: Record<Risk, { icon: string; color: string }> = {
  正常: { icon: "check_circle", color: STATUS.good },
  注意: { icon: "warning", color: STATUS.warning },
  異常: { icon: "error", color: STATUS.critical },
};
const NOTE_PHRASES = ["雨天停工", "等業主確認", "材料未到", "工班未到", "驗收缺失修補中", "已送估驗"];
const STOPS = [0, 25, 50, 75, 100];

const plain = (items: WorkItem[]) =>
  items.map((it) => {
    const { status: _s, ...rest } = it as WorkItem & { status?: unknown };
    return rest as WorkItem;
  });
const baseRecord = (p: ProjectView): OpsRecord => p.ops ?? { code: p.code, category: p.category };
const isDone = (r: OpsRecord) => !!r.doneAt || r.stage === "保固" || r.stage === "結案";

/** 0·25·50·75·100 五段選擇（工項進度一點就好） */
function Stops({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={label}>
      {STOPS.map((s) => {
        const on = value === s;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(s)}
            className={`flex-1 min-w-[44px] h-10 rounded-[10px] text-[13px] font-semibold tabular-nums transition-colors ${
              on ? "bg-[#18181B] text-white" : "bg-[#F4F4F5] text-[#3F3F46] active:bg-[#E4E4E7]"
            }`}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

function RiskControl({ value, onChange }: { value: Risk | undefined; onChange: (r: Risk | undefined) => void }) {
  return (
    <Segmented<Risk>
      label="風險"
      options={RISKS}
      value={value}
      onChange={onChange}
      columns={3}
      render={(o) => (
        <>
          <Icon
            name={RISK_ICON[o].icon}
            weight={400}
            fill={1}
            className="text-[16px]"
            style={{ color: value === o ? "#fff" : RISK_ICON[o].color }}
          />
          {o}
        </>
      )}
    />
  );
}

/* ══════════════════════════════════════════════════════════
   今日回報
   ══════════════════════════════════════════════════════════ */

export function DailyReportSheet({ p, ops, open, onClose }: QuickSheetProps) {
  const today = ops.today;
  const base = baseRecord(p);
  const done = isDone(base);
  // 今天的工項：今天落在起訖內、或已經延遲的；不含等待期（養護不用回報）與已完成
  const todayItems = useMemo(
    () =>
      p.items.filter(
        (i) =>
          i.kind !== "等待" &&
          i.status !== "完成" &&
          ((i.start && i.end && i.start <= today && today <= i.end) || i.status === "延遲")
      ),
    // 以開啟當下為準
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, p.code]
  );

  const [itemProg, setItemProg] = useState<Record<string, number>>({});
  const [progress, setProgress] = useState<number | undefined>(base.progress);
  const [risk, setRisk] = useState<Risk | undefined>(base.risk);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!open) return;
    setItemProg({});
    setProgress(p.ops?.progress);
    setRisk(p.ops?.risk);
    setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, p.code]);

  const { saving, commit } = useCommit(ops);
  const draftItems = plain(p.items).map((it) => (it.id && itemProg[it.id] !== undefined ? { ...it, progress: itemProg[it.id] } : it));
  const itemsChanged = Object.entries(itemProg).some(([id, v]) => p.items.find((i) => i.id === id)?.progress !== v);
  const newNote = note.trim() ? `${fmtDate(today, today)} ${note.trim()}` : undefined;
  const draftRec: OpsRecord = { ...base, progress, risk, note: newNote ?? base.note };
  const recChanged = progress !== base.progress || risk !== base.risk || !!newNote;
  const dirty = itemsChanged || recChanged;
  const est = weightedProgress(draftItems);
  const after = previewHealth(p, draftRec, draftItems, today);
  const needReason = risk === "異常" && base.risk !== "異常" && !note.trim();

  const save = async () => {
    if (needReason) return;
    const parts: string[] = [];
    if (itemsChanged) parts.push(`${Object.keys(itemProg).length} 個工項`);
    if (progress !== base.progress && progress !== undefined) parts.push(`整體 ${progress}%`);
    if (await commit(p.code, recChanged ? draftRec : undefined, itemsChanged ? draftItems : undefined, "今日回報", parts.join("、")))
      onClose();
  };

  return (
    <Sheet
      open={open}
      title="今日回報"
      subtitle={`${p.code}　${p.name}　·　${fmtDate(today, today)}`}
      onClose={onClose}
      dirty={dirty}
      footer={
        <SheetActions
          onSave={save}
          saving={saving}
          disabled={!dirty || needReason}
          saveLabel={needReason ? "異常請寫一句原因" : ops.saveMode === "sandbox" ? "存到本機" : "儲存"}
        />
      }
    >
      <div className="pb-5">
        {todayItems.length > 0 && (
          <FieldGroup title={`今天的工項（${todayItems.length}）`}>
            {todayItems.map((it) => {
              const v = itemProg[it.id!] ?? it.progress ?? 0;
              const late = it.status === "延遲";
              return (
                <div key={it.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <span className="min-w-0">
                      <span className="text-[14.5px] font-semibold text-[#18181B]">{it.trade}</span>
                      <span className="text-[12px] text-[#71717A] ml-2">
                        {it.crew || "未指定施作單位"}　·　{fmtDate(it.start, today)}–{fmtDate(it.end, today)}
                      </span>
                    </span>
                    <span className="text-[12px] tabular-nums shrink-0 flex items-center gap-1" style={{ color: late ? STATUS.critical : "#71717A" }}>
                      {late && <Icon name="error" weight={400} fill={1} className="text-[14px]" />}
                      {late ? "延遲" : `${v}%`}
                    </span>
                  </div>
                  <Stops value={v} onChange={(n) => setItemProg((c) => ({ ...c, [it.id!]: n }))} label={`${it.trade} 完成度`} />
                </div>
              );
            })}
          </FieldGroup>
        )}

        <FieldGroup
          title="整體進度"
          hint={done ? "已完工的專案，進度固定為 100%。" : p.plannedPct !== undefined ? `依工期今天應達 ${p.plannedPct}%` : undefined}
        >
          {done ? (
            <Row label="實際進度">
              <p className="text-[28px] font-semibold text-[#18181B]">100%</p>
            </Row>
          ) : (
            <ProgressControl
              value={progress}
              onChange={setProgress}
              suggestion={est !== undefined ? { label: "依工項推算", value: est } : undefined}
            />
          )}
        </FieldGroup>

        <FieldGroup title="近況">
          <RiskControl value={risk} onChange={setRisk} />
          <Row label={`今天的狀況（選填）`} issues={needReason ? [{ field: "note", level: "error", message: "改為異常時請寫一句原因" }] : undefined}>
            {base.note && (
              <p className="text-[12px] text-[#71717A] mb-2 leading-snug">
                上次：{base.note}
              </p>
            )}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="例：面層施作中，預計週五收邊"
              className="w-full h-11 rounded-[12px] border border-[#E4E4E7] bg-[#FCFCFC] px-3 text-[16px] text-[#18181B] outline-none focus:border-[#F39C12] placeholder:text-[#C4C4CC]"
            />
            <PhraseChips phrases={NOTE_PHRASES} onPick={(ph) => setNote(note ? `${note}，${ph}` : ph)} />
          </Row>
        </FieldGroup>

        <Consequence before={p.health} after={after} />
        {ops.saveMode === "sandbox" && <SandboxFootnote ops={ops} />}
      </div>
    </Sheet>
  );
}

/* ══════════════════════════════════════════════════════════
   更新單一工項
   ══════════════════════════════════════════════════════════ */

export function ItemQuickSheet({
  p,
  ops,
  open,
  onClose,
  itemId,
  onOpenProject,
}: QuickSheetProps & { itemId: string | null; onOpenProject?: () => void }) {
  const today = ops.today;
  const item = p.items.find((i) => i.id === itemId);
  const [progress, setProgress] = useState(item?.progress ?? 0);
  const [crew, setCrew] = useState(item?.crew ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [days, setDays] = useState(0);
  const [cascade, setCascade] = useState(true);
  const [moveDue, setMoveDue] = useState(true);
  useEffect(() => {
    if (!open || !item) return;
    setProgress(item.progress ?? 0);
    setCrew(item.crew ?? "");
    setNote(item.note ?? "");
    setDays(0);
    setCascade(true);
    setMoveDue(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId]);

  const { saving, commit } = useCommit(ops);
  const crewOptions = useMemo(() => {
    const s = new Set<string>();
    ops.views.forEach((v) => v.items.forEach((i) => i.crew && s.add(i.crew)));
    return [...s].sort();
  }, [ops.views]);

  if (!item) {
    return (
      <Sheet open={open} title="工項" onClose={onClose}>
        <p className="px-5 py-6 text-[13px] text-[#71717A]">找不到這個工項，可能已被刪除或順序已調整。</p>
      </Sheet>
    );
  }

  const idx = p.items.findIndex((i) => i.id === item.id);
  const laterOpen = p.items.slice(idx + 1).filter((i) => (i.progress ?? 0) < 100 && i.start).length;
  const base = plain(p.items);
  // 連帶：這一項與之後未完成的都順延；不連帶：只動這一項
  const shifted = !days
    ? base
    : cascade
    ? shiftItems(base, item.id!, days, today)
    : base.map((it, i) => (i === idx ? shiftItems([it], it.id!, days, today)[0] : it));
  const next = shifted.map((it, i) =>
    i === idx ? { ...it, progress, crew: crew.trim() || undefined, note: note.trim() || undefined } : it
  );
  const cur = next[idx];
  const lastEnd = (arr: WorkItem[]) => arr.reduce<string | undefined>((m, i) => (i.end && (!m || i.end > m) ? i.end : m), undefined);
  const newLast = lastEnd(next);
  const dueAt = p.ops?.dueAt;
  const pushesDue = !!(days > 0 && dueAt && newLast && newLast > dueAt);
  const newDue = pushesDue ? newLast : undefined;
  const dirty = JSON.stringify(next) !== JSON.stringify(base);
  const rec = pushesDue && moveDue && p.ops ? { ...p.ops, dueAt: newDue } : undefined;
  const after = previewHealth(p, rec ?? p.ops, next, today);
  const span = item.start && item.end ? diffDays(item.start, item.end) + 1 : undefined;
  const byDate =
    item.start && item.end
      ? Math.max(0, Math.min(100, Math.round(((diffDays(item.start, today) + 1) / (span || 1)) * 100)))
      : undefined;

  const save = async () => {
    const extra = [
      days ? `${days > 0 ? "順延" : "提前"} ${Math.abs(days)} 天${cascade && laterOpen ? `（含後續 ${laterOpen} 項）` : ""}` : "",
      rec ? `預計完工改為 ${fmtDate(newDue, today)}` : "",
    ]
      .filter(Boolean)
      .join("，");
    if (await commit(p.code, rec, next, item.trade, extra)) onClose();
  };

  return (
    <Sheet
      open={open}
      title={item.trade}
      subtitle={`${p.code} ${p.name}　·　${item.crew || "未指定"}　·　${fmtDate(item.start, today)}–${fmtDate(item.end, today)}${span ? `（${span} 天）` : ""}`}
      onClose={onClose}
      dirty={dirty}
      footer={
        <SheetActions
          onSave={save}
          saving={saving}
          disabled={!dirty}
          saveLabel={ops.saveMode === "sandbox" ? "存到本機" : "儲存"}
        />
      }
    >
      <div className="pb-5">
        <FieldGroup
          hint={
            item.kind === "等待"
              ? "這是等待期（養護、試水、生產期），不需要派工，照日期過去就算完成。"
              : byDate !== undefined && item.status !== "完成"
              ? `依日期今天應完成 ${byDate}%`
              : undefined
          }
        >
          <Row
            label="完成度"
            aside={
              <span className="text-[12px] flex items-center gap-1" style={{ color: item.status === "延遲" ? STATUS.critical : "#71717A" }}>
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: WORK_META[item.status].fill }} />
                目前 {WORK_META[item.status].label}
              </span>
            }
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[36px] font-semibold text-[#18181B] tabular-nums leading-none">{progress}</span>
              <span className="text-[16px] text-[#A1A1AA]">%</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setProgress(progress >= 100 ? item.progress ?? 0 : 100)}
                className={`h-11 px-4 rounded-[12px] text-[14px] font-semibold inline-flex items-center gap-1.5 ${
                  progress >= 100 ? "bg-[#18181B] text-white" : "bg-white border border-[#E4E4E7] text-[#18181B] active:bg-[#F4F4F5]"
                }`}
              >
                <Icon name="task_alt" weight={400} className="text-[18px]" />
                {progress >= 100 ? "已完成 · 取消" : "標記完成"}
              </button>
            </div>
            <Stops value={progress} onChange={setProgress} label={`${item.trade} 完成度`} />
            <div className="flex gap-2 mt-2">
              {[-5, 5].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setProgress(Math.max(0, Math.min(100, progress + d)))}
                  className="flex-1 h-10 rounded-[10px] bg-[#F4F4F5] text-[13px] font-semibold text-[#3F3F46] active:bg-[#E4E4E7] tabular-nums"
                >
                  {d > 0 ? `+${d}` : d}%
                </button>
              ))}
            </div>
          </Row>
        </FieldGroup>

        {item.status !== "完成" && item.start && (
          <FieldGroup title="順延此工項" hint="雨天、工班調度、業主延後時使用。已經開始的工項只延後結束日。">
            <Row label="天數">
              <div className="flex items-center gap-2">
                {[-1, 1, 2, 3, 7].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays((n) => n + d)}
                    className="flex-1 h-10 rounded-[10px] bg-[#F4F4F5] text-[13px] font-semibold text-[#3F3F46] active:bg-[#E4E4E7] tabular-nums"
                  >
                    {d > 0 ? `+${d}` : d}
                  </button>
                ))}
              </div>
              {days !== 0 && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-[13px] text-[#3F3F46] tabular-nums">
                    {days > 0 ? "順延" : "提前"} <b>{Math.abs(days)}</b> 天：{fmtDate(item.end, today)} → <b>{fmtDate(cur.end, today)}</b>
                  </p>
                  <button type="button" onClick={() => setDays(0)} className="h-8 px-3 rounded-full text-[12px] text-[#71717A] bg-[#F4F4F5]">
                    取消順延
                  </button>
                </div>
              )}
            </Row>
            {days !== 0 && laterOpen > 0 && (
              <label className="px-4 py-3 flex items-center gap-3 text-[13.5px] text-[#3F3F46] min-h-[48px]">
                <input
                  type="checkbox"
                  checked={cascade}
                  onChange={(e) => setCascade(e.target.checked)}
                  className="w-5 h-5 rounded border-[#D4D4D8] text-[#18181B]"
                />
                之後的 {laterOpen} 個未完成工項一併順延
              </label>
            )}
            {pushesDue && (
              <label className="px-4 py-3 flex items-center gap-3 text-[13.5px] text-[#3F3F46] min-h-[48px]">
                <input
                  type="checkbox"
                  checked={moveDue}
                  onChange={(e) => setMoveDue(e.target.checked)}
                  className="w-5 h-5 rounded border-[#D4D4D8] text-[#18181B]"
                />
                預計完工 {fmtDate(dueAt, today)} 改為 {fmtDate(newDue, today)}
              </label>
            )}
          </FieldGroup>
        )}

        <FieldGroup>
          <Row label="施作單位">
            <input
              value={crew}
              onChange={(e) => setCrew(e.target.value)}
              list="pm-crew-options"
              placeholder="工班或廠商"
              className="w-full h-11 rounded-[12px] border border-[#E4E4E7] bg-[#FCFCFC] px-3 text-[16px] text-[#18181B] outline-none focus:border-[#F39C12] placeholder:text-[#C4C4CC]"
            />
            <datalist id="pm-crew-options">
              {crewOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Row>
          <Row label="備註">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="例：等業主確認色樣"
              className="w-full h-11 rounded-[12px] border border-[#E4E4E7] bg-[#FCFCFC] px-3 text-[16px] text-[#18181B] outline-none focus:border-[#F39C12] placeholder:text-[#C4C4CC]"
            />
          </Row>
        </FieldGroup>

        <Consequence before={p.health} after={after} />

        {onOpenProject && (
          <div className="px-4 pt-4">
            <button
              type="button"
              onClick={onOpenProject}
              className="w-full h-11 rounded-[12px] bg-white border border-[#E4E4E7] text-[14px] font-semibold text-[#18181B] active:bg-[#F4F4F5] inline-flex items-center justify-center gap-1"
            >
              查看專案
              <Icon name="chevron_right" className="text-[18px]" />
            </button>
          </div>
        )}
        {ops.saveMode === "sandbox" && <SandboxFootnote ops={ops} />}
      </div>
    </Sheet>
  );
}

/* ══════════════════════════════════════════════════════════
   改階段
   ══════════════════════════════════════════════════════════ */

export function StageSheet({ p, ops, open, onClose }: QuickSheetProps) {
  const today = ops.today;
  const base = baseRecord(p);
  const [pending, setPending] = useState<Stage | null>(null);
  useEffect(() => {
    if (open) setPending(null);
  }, [open]);
  const { saving, commit } = useCommit(ops);

  /** 切換階段時順手補的欄位（問過才補） */
  const followUp = (s: Stage): { text: string; patch: Partial<OpsRecord> } | null => {
    if ((s === "保固" || s === "結案") && !base.doneAt) return { text: "要把實際完工設為今天嗎？", patch: { doneAt: today, progress: 100 } };
    if (s === "施工中" && !base.startAt) return { text: "要把開工日設為今天嗎？", patch: { startAt: today } };
    if (s === "驗收" && (base.progress ?? 0) < 100) return { text: "要把實際進度設為 100% 嗎？", patch: { progress: 100 } };
    return null;
  };

  const apply = async (s: Stage, patch: Partial<OpsRecord> = {}) => {
    if (await commit(p.code, { ...base, stage: s, ...patch }, undefined, `階段改為「${s}」`)) onClose();
  };

  return (
    <Sheet open={open} title="階段" subtitle={`${p.code}　${p.name}`} onClose={onClose}>
      <div className="px-4 py-4">
        <div className="bg-white rounded-[16px] border border-[#E4E4E7]/70 divide-y divide-[#F4F4F5] overflow-hidden" role="radiogroup" aria-label="階段">
          {STAGES.map((s) => {
            const cur = base.stage === s;
            const fu = pending === s ? followUp(s) : null;
            return (
              <div key={s}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={cur}
                  disabled={saving}
                  onClick={() => {
                    if (cur) return onClose();
                    if (followUp(s)) setPending(s);
                    else void apply(s);
                  }}
                  className="w-full min-h-[50px] px-4 flex items-center justify-between text-left active:bg-[#F4F4F5]"
                >
                  <span className={`text-[15px] ${cur ? "font-bold text-[#18181B]" : "text-[#3F3F46]"}`}>{s}</span>
                  {cur && <Icon name="check" weight={500} className="text-[20px] text-[#18181B]" />}
                </button>
                {fu && (
                  <div className="px-4 pb-3 -mt-1">
                    <p className="text-[13px] text-[#3F3F46] mb-2">{fu.text}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void apply(s, fu.patch)}
                        className="flex-1 h-11 rounded-[12px] bg-[#18181B] text-white text-[14px] font-semibold"
                      >
                        好，一起改
                      </button>
                      <button
                        type="button"
                        onClick={() => void apply(s)}
                        className="flex-1 h-11 rounded-[12px] bg-[#F4F4F5] text-[14px] font-semibold text-[#18181B]"
                      >
                        只改階段
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {ops.saveMode === "sandbox" && <SandboxFootnote ops={ops} />}
      <div className="h-5" />
    </Sheet>
  );
}

/* ══════════════════════════════════════════════════════════
   登錄本期請款／收款
   ══════════════════════════════════════════════════════════ */

export function BillingSheet({ p, ops, open, onClose, mode }: QuickSheetProps & { mode: "billed" | "collected" }) {
  const base = baseRecord(p);
  const [amount, setAmount] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (open) setAmount(undefined);
  }, [open, mode]);
  const { saving, commit } = useCommit(ops);
  const label = mode === "billed" ? "請款" : "收款";
  const before = (mode === "billed" ? base.billed : base.collected) ?? 0;
  const afterSum = before + (amount ?? 0);
  const total = (base.contract ?? 0) + (base.variation ?? 0);
  const over =
    mode === "collected"
      ? afterSum > (base.billed ?? 0)
        ? "收款累計會超過已請款，請先登錄請款"
        : undefined
      : total && afterSum > total
      ? "請款累計會超過合約合計"
      : undefined;
  const blocking = mode === "collected" && !!over;

  const save = async () => {
    if (!amount || blocking) return;
    if (await commit(p.code, { ...base, [mode]: afterSum }, undefined, `本期${label} ${fmtMoney(amount)}`)) onClose();
  };

  return (
    <Sheet
      open={open}
      title={`登錄本期${label}`}
      subtitle={`${p.code}　${p.name}`}
      onClose={onClose}
      dirty={!!amount}
      footer={
        <SheetActions
          onSave={save}
          saving={saving}
          disabled={!amount || blocking}
          saveLabel={ops.saveMode === "sandbox" ? "存到本機" : "儲存"}
        />
      }
    >
      <div className="pb-5">
        <FieldGroup hint={`輸入這一期的金額，會累加到${label}總額。`}>
          <MoneyField
            label={`本期${label}`}
            value={amount}
            onChange={setAmount}
            issues={over ? [{ field: mode, level: blocking ? "error" : "warn", message: over }] : undefined}
          />
        </FieldGroup>
        <div className="mx-4 mt-4 rounded-[14px] bg-white border border-[#E4E4E7]/70 px-4 py-3.5">
          <p className="text-[12px] text-[#71717A]">{label}累計</p>
          <p className="text-[18px] font-semibold text-[#18181B] tabular-nums mt-0.5">
            {fmtMoney(before)}
            {amount ? (
              <>
                <span className="text-[#A1A1AA] mx-1.5">→</span>
                {fmtMoney(afterSum)}
              </>
            ) : null}
          </p>
          {total > 0 && (
            <p className="text-[12px] text-[#71717A] mt-1 tabular-nums">
              {mode === "billed"
                ? `合約合計 ${fmtMoney(total)} 的 ${Math.round((afterSum / total) * 100)}%`
                : `已請款 ${fmtMoney(base.billed)}，應收未收 ${fmtMoney((base.billed ?? 0) - afterSum)}`}
            </p>
          )}
        </div>
        {ops.saveMode === "sandbox" && <SandboxFootnote ops={ops} />}
      </div>
    </Sheet>
  );
}
