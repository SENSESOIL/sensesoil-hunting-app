"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CATEGORIES, STAGES, fmtMoney, validateRecord, weightedProgress, type Risk, type Stage } from "@/lib/project-ops";
import { taskToWorkItem, type PmProject } from "@/lib/pm/model";
import { Sheet, SheetActions, toast } from "./Sheet";
import { DateField, FieldGroup, MoneyField, ProgressControl, Segmented, TextField } from "./fields";
import type { Pm } from "./usePm";

/* ══════════════════════════════════════════════════════════
   專案資料（管理者）：建立新專案、或修改階段／日期／金額／人員／雲端資料夾
   ══════════════════════════════════════════════════════════ */

type Draft = Partial<PmProject>;
const RISKS: Risk[] = ["正常", "注意", "異常"];

const FIELDS: (keyof PmProject)[] = [
  "name", "company", "stage", "category", "risk", "progress", "signedAt", "startAt", "dueAt", "doneAt",
  "contract", "variation", "billed", "collected", "manager", "client", "site", "note", "driveFolderId",
];

/** Drive 資料夾網址 → ID（也接受直接貼 ID） */
export function folderIdFrom(v: string): string | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const m = t.match(/folders\/([\w-]{10,})/) || t.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(t) ? t : undefined;
}

export function ProjectInfoSheet({
  pm,
  code,
  open,
  onClose,
  onCreated,
}: {
  pm: Pm;
  /** 沒有 code = 建立新專案 */
  code?: string | null;
  open: boolean;
  onClose: () => void;
  onCreated?: (code: string) => void;
}) {
  const p = code ? pm.projectBy.get(code) : undefined;
  const isNew = !code;
  const initial = useMemo<Draft>(() => {
    if (!p) return { stage: "洽談" as Stage };
    const o: Draft = {};
    for (const k of FIELDS) (o as Record<string, unknown>)[k] = p[k];
    return o;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, code]);
  const [d, setD] = useState<Draft>(initial);
  const [newCode, setNewCode] = useState("");
  const [folderText, setFolderText] = useState("");
  const [saving, setSaving] = useState(false);

  // 只在打開時重設；資料在背景更新（每 30 秒）時不能蓋掉正在填的內容
  const codesRef = React.useRef<string[]>([]);
  codesRef.current = pm.projects.map((x) => x.code);
  useEffect(() => {
    if (!open) return;
    setD(initial);
    setFolderText(initial.driveFolderId ? `https://drive.google.com/drive/folders/${initial.driveFolderId}` : "");
    if (isNew) setNewCode(suggestCode(codesRef.current));
  }, [open, initial, isNew]);

  const set = <K extends keyof PmProject>(k: K, v: PmProject[K] | undefined) => setD((c) => ({ ...c, [k]: v }));
  const issues = validateRecord({ code: code ?? newCode, ...d } as never, pm.today);
  const codeTaken = isNew && pm.projectBy.has(newCode.trim());
  const errors = [
    ...issues.filter((i) => i.level === "error").map((i) => i.message),
    ...(isNew && !newCode.trim() ? ["請輸入代碼"] : []),
    ...(codeTaken ? ["這個代碼已經有專案了"] : []),
    ...(isNew && !d.name?.trim() ? ["請輸入專案名稱"] : []),
    ...(folderText.trim() && !folderIdFrom(folderText) ? ["看不懂這個雲端資料夾連結"] : []),
  ];
  const dirty = isNew || JSON.stringify(d) !== JSON.stringify(initial) || (folderIdFrom(folderText) ?? undefined) !== initial.driveFolderId;
  const auto = p ? weightedProgress(p.tasks.map(taskToWorkItem)) : undefined;
  const by = (f: string) => issues.filter((i) => i.field === f);

  const save = async () => {
    if (errors.length) {
      toast(errors[0], { tone: "error" });
      return;
    }
    const patch: Partial<PmProject> = {};
    for (const k of FIELDS) {
      const v = d[k];
      const clean = typeof v === "string" ? v.trim() || undefined : v;
      if (isNew || JSON.stringify(clean) !== JSON.stringify(initial[k])) (patch as Record<string, unknown>)[k] = clean;
    }
    patch.driveFolderId = folderIdFrom(folderText);
    if (!isNew && patch.driveFolderId === initial.driveFolderId) delete patch.driveFolderId;
    // CRM 上的專案，名稱與單位以 CRM 為準，不寫進資料庫
    if (p?.inCrm) {
      delete patch.name;
      delete patch.company;
    }
    setSaving(true);
    const target = isNew ? newCode.trim() : code!;
    const ok = await pm.saveProject(target, patch);
    setSaving(false);
    if (ok) {
      toast(isNew ? `已建立專案 ${target}` : "已儲存");
      onClose();
      if (isNew) onCreated?.(target);
    }
  };

  return (
    <Sheet
      open={open}
      title={isNew ? "新增專案" : "專案資料"}
      subtitle={p ? `${p.code}　${p.name}` : undefined}
      onClose={onClose}
      dirty={dirty && !isNew}
      footer={<SheetActions onSave={save} saving={saving} disabled={!dirty} saveLabel={errors.length ? errors[0] : isNew ? "建立專案" : "儲存"} />}
    >
      <div className="pb-6">
        {(isNew || !p?.inCrm) && (
          <FieldGroup title="專案" hint={isNew ? "代碼建議與拾壤CRM 的編號規則一致（A＝裝修、B＝泥作…）。" : undefined}>
            {isNew && <TextField label="代碼" value={newCode} onChange={(v) => setNewCode(v.toUpperCase().slice(0, 12))} placeholder="例：B44" issues={codeTaken ? [{ field: "code", level: "error", message: "這個代碼已經有專案了" }] : undefined} />}
            <TextField label="專案名稱" value={d.name} onChange={(v) => set("name", v)} placeholder="例：寶山野村泥作" />
            <TextField label="單位" value={d.company} onChange={(v) => set("company", v)} placeholder="例：拾壤" />
          </FieldGroup>
        )}

        <FieldGroup title="狀態">
          <Segmented<Stage> label="階段" options={STAGES} value={d.stage} onChange={(v) => set("stage", v)} />
          <Segmented<Risk> label="風險" options={RISKS} value={d.risk} onChange={(v) => set("risk", v)} columns={3} allowEmpty />
          <ProgressControl
            value={d.progress ?? auto}
            onChange={(v) => set("progress", v)}
            suggestion={auto !== undefined ? { label: "依任務推算", value: auto } : undefined}
          />
          {d.progress !== undefined && auto !== undefined && (
            <div className="px-4 py-2.5">
              <button type="button" onClick={() => set("progress", undefined)} className="h-9 text-[13px] text-[#71717A] underline">
                改回自動（依任務推算）
              </button>
            </div>
          )}
        </FieldGroup>

        <FieldGroup title="時程">
          <DateField label="簽約日" value={d.signedAt} onChange={(v) => set("signedAt", v)} today={pm.today} issues={by("signedAt")} />
          <DateField label="開工日" value={d.startAt} onChange={(v) => set("startAt", v)} today={pm.today} issues={by("startAt")} />
          <DateField label="預計完工" value={d.dueAt} onChange={(v) => set("dueAt", v)} today={pm.today} min={d.startAt} issues={by("dueAt")} />
          <DateField label="實際完工" value={d.doneAt} onChange={(v) => set("doneAt", v)} today={pm.today} issues={by("doneAt")} />
        </FieldGroup>

        <FieldGroup
          title="合約與請款"
          hint={
            d.contract !== undefined || d.billed !== undefined
              ? `合約合計 ${fmtMoney((d.contract ?? 0) + (d.variation ?? 0))}　·　應收未收 ${fmtMoney((d.billed ?? 0) - (d.collected ?? 0))}`
              : "金額可以寫 185萬 或 1850000"
          }
        >
          <MoneyField label="合約金額" value={d.contract} onChange={(v) => set("contract", v)} issues={by("contract")} />
          <MoneyField label="追加減" value={d.variation} onChange={(v) => set("variation", v)} signed />
          <MoneyField label="已請款（累計）" value={d.billed} onChange={(v) => set("billed", v)} issues={by("billed")} />
          <MoneyField label="已收款（累計）" value={d.collected} onChange={(v) => set("collected", v)} issues={by("collected")} />
        </FieldGroup>

        <FieldGroup title="人員與地點">
          <Segmented<string> label="工程類別" options={CATEGORIES} value={d.category} onChange={(v) => set("category", v)} columns={3} allowEmpty />
          <TextField label="工地主任" value={d.manager} onChange={(v) => set("manager", v)} placeholder="姓名" list={pm.people.map((x) => x.name)} />
          <TextField label="業主" value={d.client} onChange={(v) => set("client", v)} placeholder="姓名或公司" />
          <TextField label="工地地址" value={d.site} onChange={(v) => set("site", v)} placeholder="縣市區＋路名" />
        </FieldGroup>

        <FieldGroup title="雲端資料夾" hint="工程照會上傳到這個資料夾裡的「工程照」子資料夾。沒填的話，第一次上傳時會依代碼自動尋找。">
          <TextField label="資料夾連結" value={folderText} onChange={setFolderText} placeholder="貼上 Google Drive 資料夾網址" />
        </FieldGroup>

        <FieldGroup title="近況">
          <TextField label="最新狀況" value={d.note} onChange={(v) => set("note", v)} placeholder="例：泥作打底完成，待乾燥後上面層" multiline />
        </FieldGroup>
      </div>
    </Sheet>
  );
}

/** 建議下一個代碼：取最常用的字母前綴，數字 +1（A65 → A66） */
function suggestCode(codes: string[]): string {
  const m = codes.map((c) => c.match(/^([A-Z]+)(\d+)$/)).filter(Boolean) as RegExpMatchArray[];
  if (!m.length) return "";
  const byPrefix = new Map<string, number>();
  m.forEach((x) => byPrefix.set(x[1], Math.max(byPrefix.get(x[1]) ?? 0, +x[2])));
  const [prefix, max] = [...byPrefix.entries()].sort((a, b) => b[1] - a[1])[0];
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}
