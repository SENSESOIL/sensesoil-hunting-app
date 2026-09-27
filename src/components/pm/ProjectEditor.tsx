"use client";

import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  CATEGORIES,
  STAGES,
  fmtMoney,
  validateRecord,
  weightedProgress,
  type Issue,
  type OpsRecord,
  type ProjectView,
  type Risk,
  type Stage,
} from "@/lib/project-ops";
import { Sheet, SheetActions } from "./Sheet";
import {
  DateField,
  FieldGroup,
  MoneyField,
  PhraseChips,
  ProgressControl,
  Row,
  Segmented,
  TextField,
} from "./fields";
import { Consequence, previewHealth, useCommit } from "./commit";
import { Icon, STATUS } from "./ui";
import type { ProjectOps } from "./useProjectOps";

const RISKS: Risk[] = ["正常", "注意", "異常"];
const RISK_ICON: Record<Risk, { icon: string; color: string }> = {
  正常: { icon: "check_circle", color: STATUS.good },
  注意: { icon: "warning", color: STATUS.warning },
  異常: { icon: "error", color: STATUS.critical },
};
const NOTE_PHRASES = ["雨天停工", "等業主確認", "材料未到", "工班未到", "已送驗收", "驗收缺失修補中", "業主追加項目"];

const crmFetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : { activeHunters: [] }));

const isSame = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const byField = (issues: Issue[], f: string) => issues.filter((i) => i.field === f);

/** 本機試編的說明（每個編輯抽屜底部） */
export function SandboxFootnote({ ops }: { ops: ProjectOps }) {
  return (
    <p className="px-5 pt-4 text-[11.5px] text-[#71717A] leading-relaxed flex gap-1.5">
      <Icon name="phone_iphone" className="text-[15px] mt-[1px] shrink-0 text-[#A1A1AA]" />
      {ops.demo
        ? "在示範資料上試編：只存在這個 APP（這台裝置），其他人看不到；關閉示範後不會影響任何真實資料。"
        : "尚未連接雲端資料庫：先存在這個 APP（這台裝置），其他人看不到。接上資料庫後可以一鍵上傳。"}
    </p>
  );
}

/* ══════════════════════════════════════════════════════════
   完整編輯（每週／每月的管理工作；每天的回報用「今日回報」）
   ══════════════════════════════════════════════════════════ */

export function ProjectFormSheet({
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
  const initial = useMemo<OpsRecord>(
    () => p.ops ?? { code: p.code, category: p.category, risk: "正常" },
    // 以開啟當下的資料為準：編輯中即使下拉更新、重新抓資料，也不覆蓋正在填的內容
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, p.code]
  );
  const [r, setR] = useState<OpsRecord>(initial);
  useEffect(() => {
    if (open) setR(initial);
  }, [open, initial]);

  const { data: crm } = useSWR<{ activeHunters?: string[] }>(open ? "/api/crm-data" : null, crmFetcher, {
    revalidateOnFocus: false,
  });
  const hunters = crm?.activeHunters ?? [];
  const { saving, commit } = useCommit(ops);

  const issues = validateRecord(r, ops.today);
  // 新建立的專案一定要選階段
  if (!r.stage) issues.unshift({ field: "stage", level: "error", message: "請選擇階段" });
  const errors = issues.filter((i) => i.level === "error");
  const dirty = !isSame(r, initial);
  const set = <K extends keyof OpsRecord>(k: K, v: OpsRecord[K]) => setR((cur) => ({ ...cur, [k]: v }));
  const total = (r.contract ?? 0) + (r.variation ?? 0);
  const suggested = weightedProgress(p.items);
  const done = !!r.doneAt || r.stage === "保固" || r.stage === "結案";
  const after = previewHealth(p, r, p.items, ops.today);

  const save = async () => {
    if (errors.length) return;
    // 空字串一律存成「沒填」
    const clean = Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v])
    ) as OpsRecord;
    if (await commit(p.code, clean, undefined, p.ops ? "專案資料" : "工程資料")) onClose();
  };

  return (
    <Sheet
      open={open}
      title={p.ops ? "編輯專案資料" : "建立工程資料"}
      subtitle={`${p.code}　${p.name}`}
      onClose={onClose}
      dirty={dirty}
      footer={
        <SheetActions
          onSave={save}
          saving={saving}
          disabled={!!errors.length || !dirty}
          saveLabel={
            errors.length ? `有 ${errors.length} 個欄位要修正` : ops.saveMode === "sandbox" ? "存到本機" : "儲存"
          }
        />
      }
    >
      <div className="pb-5">
        <FieldGroup title="狀態">
          <Segmented<Stage>
            label="階段"
            options={STAGES}
            value={r.stage}
            onChange={(v) => set("stage", v)}
            issues={byField(issues, "stage")}
          />
          <Segmented<Risk>
            label="風險"
            options={RISKS}
            value={r.risk}
            onChange={(v) => set("risk", v)}
            columns={3}
            render={(o) => (
              <>
                <Icon
                  name={RISK_ICON[o].icon}
                  weight={400}
                  fill={1}
                  className="text-[16px]"
                  style={{ color: r.risk === o ? "#fff" : RISK_ICON[o].color }}
                />
                {o}
              </>
            )}
          />
          {done ? (
            <Row label="實際進度">
              <p className="text-[14px] text-[#71717A]">已完工（保固、結案或已填實際完工日）的專案，進度固定為 100%。</p>
            </Row>
          ) : (
            <ProgressControl
              value={r.progress}
              onChange={(v) => set("progress", v)}
              suggestion={suggested !== undefined ? { label: "依工項推算", value: suggested } : undefined}
            />
          )}
        </FieldGroup>

        <FieldGroup title="時程">
          <DateField label="簽約日" value={r.signedAt} onChange={(v) => set("signedAt", v)} today={ops.today} issues={byField(issues, "signedAt")} />
          <DateField label="開工日" value={r.startAt} onChange={(v) => set("startAt", v)} today={ops.today} issues={byField(issues, "startAt")} />
          <DateField
            label="預計完工"
            value={r.dueAt}
            onChange={(v) => set("dueAt", v)}
            today={ops.today}
            min={r.startAt}
            issues={byField(issues, "dueAt")}
          />
          <DateField label="實際完工" value={r.doneAt} onChange={(v) => set("doneAt", v)} today={ops.today} issues={byField(issues, "doneAt")} />
        </FieldGroup>

        <FieldGroup
          title="合約與請款"
          hint={
            total
              ? `合約合計 ${fmtMoney(total)}　·　應收未收 ${fmtMoney((r.billed ?? 0) - (r.collected ?? 0))}`
              : "金額可以寫 185萬 或 1850000"
          }
        >
          <MoneyField label="合約金額" value={r.contract} onChange={(v) => set("contract", v)} issues={byField(issues, "contract")} />
          <MoneyField label="追加減" value={r.variation} onChange={(v) => set("variation", v)} signed />
          <MoneyField label="已請款" value={r.billed} onChange={(v) => set("billed", v)} issues={byField(issues, "billed")} hint="累計估驗請款金額。每期請款也可以在專案頁用「＋ 登錄請款」累加。" />
          <MoneyField label="已收款" value={r.collected} onChange={(v) => set("collected", v)} issues={byField(issues, "collected")} />
        </FieldGroup>

        <FieldGroup title="近況">
          <Row label="最新狀況">
            <textarea
              value={r.note ?? ""}
              onChange={(e) => set("note", e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="例：泥作打底完成，待乾燥後上面層"
              className="w-full rounded-[12px] border border-[#E4E4E7] bg-[#FCFCFC] px-3 py-2.5 text-[16px] leading-relaxed text-[#18181B] outline-none focus:border-[#F39C12] resize-none placeholder:text-[#C4C4CC]"
            />
            <PhraseChips phrases={NOTE_PHRASES} onPick={(ph) => set("note", r.note ? `${r.note}，${ph}` : ph)} />
          </Row>
        </FieldGroup>

        <FieldGroup title="人員與地點">
          <Segmented<string>
            label="工程類別"
            options={CATEGORIES}
            value={r.category}
            onChange={(v) => set("category", v)}
            columns={3}
            allowEmpty
          />
          <TextField
            label="工地主任"
            value={r.manager}
            onChange={(v) => set("manager", v)}
            placeholder={hunters.length ? "點選或輸入姓名" : "輸入姓名"}
            list={hunters}
          />
          {hunters.length > 0 && (
            <div className="px-4 pb-3 -mt-1 flex flex-wrap gap-2">
              {hunters.slice(0, 12).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => set("manager", r.manager === h ? undefined : h)}
                  className={`h-10 px-3.5 rounded-full text-[13px] ${
                    r.manager === h ? "bg-[#18181B] text-white" : "bg-[#F4F4F5] text-[#3F3F46] active:bg-[#E4E4E7]"
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          )}
          <TextField label="業主" value={r.client} onChange={(v) => set("client", v)} placeholder="姓名或公司" />
          <TextField label="工地地址" value={r.site} onChange={(v) => set("site", v)} placeholder="縣市區＋路名" />
        </FieldGroup>

        <Consequence before={p.health} after={after} />
        {ops.saveMode === "sandbox" && <SandboxFootnote ops={ops} />}
      </div>
    </Sheet>
  );
}
