"use client";

import React, { useEffect, useState } from "react";
import type { VendorInfo } from "@/lib/pm/model";
import { Sheet, SheetActions, toast } from "@/components/pm/Sheet";
import { FieldGroup, TextField } from "@/components/pm/fields";
import { Icon } from "@/components/pm/ui";
import { RED } from "@/components/pm/kit";
import { teamPost } from "./useTeam";

/* ══════════════════════════════════════════════════════════
   協力廠商：新增／編輯（寫回拾壤CRM「廠商CRM」）
   Admin、Editor 可新增、編輯；只有 Admin 看得到「刪除」。
   統編、銀行、匯款帳號不在 APP 編輯（請在試算表）。
   ══════════════════════════════════════════════════════════ */

type Form = Omit<VendorInfo, "seq">;

const EMPTY: Form = { trade: "", level: "", fullName: "", short: "", contact1: "", phone1: "", contact2: "", phone2: "", note: "" };

export function VendorSheet({
  vendor,
  open,
  canDelete,
  trades,
  levels,
  onClose,
  onSaved,
}: {
  /** null = 新增 */
  vendor: VendorInfo | null;
  open: boolean;
  canDelete: boolean;
  /** 現有的工項、等級（輸入時的建議） */
  trades: string[];
  levels: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial: Form = vendor ? { ...EMPTY, ...vendor } : EMPTY;
  delete (initial as Partial<VendorInfo>).seq;
  const [d, setD] = useState<Form>(initial);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!open) return;
    setD(initial);
    setConfirmDel(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vendor]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setD((c) => ({ ...c, [k]: v }));
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);

  const save = async () => {
    if (!d.fullName.trim()) {
      toast("請輸入公司名稱", { tone: "error" });
      return;
    }
    setSaving(true);
    // 只送有改的欄位，避免蓋掉別人同時在試算表改的內容
    const fields = vendor ? Object.fromEntries(Object.entries(d).filter(([k, v]) => v !== initial[k as keyof Form])) : d;
    const r = await teamPost({ op: "vendor.save", seq: vendor?.seq ?? null, fields });
    setSaving(false);
    if (!r.ok) return toast(r.data.error || "儲存失敗", { tone: "error" });
    toast(vendor ? "已更新廠商CRM" : `已新增「${d.short || d.fullName}」到廠商CRM`);
    onSaved();
    onClose();
  };

  const remove = async () => {
    if (!vendor) return;
    setSaving(true);
    const r = await teamPost({ op: "vendor.delete", seq: vendor.seq });
    setSaving(false);
    if (!r.ok) return toast(r.data.error || "刪除失敗", { tone: "error" });
    toast(`已從廠商CRM 刪除「${vendor.short || vendor.fullName}」`);
    onSaved();
    onClose();
  };

  return (
    <Sheet
      open={open}
      title={vendor ? "編輯協力廠商" : "新增協力廠商"}
      subtitle="會同步到拾壤CRM 的廠商CRM"
      onClose={() => !saving && onClose()}
      dirty={dirty && !saving}
      footer={
        confirmDel ? (
          <div className="flex gap-2">
            <button onClick={() => setConfirmDel(false)} className="flex-1 h-12 rounded-[14px] bg-[#F4F4F5] text-[15px] font-semibold text-[#18181B]">
              不刪除
            </button>
            <button onClick={remove} disabled={saving} className="flex-1 h-12 rounded-[14px] text-white text-[15px] font-semibold disabled:opacity-50" style={{ background: RED }}>
              確定刪除
            </button>
          </div>
        ) : (
          <SheetActions
            onSave={save}
            saving={saving}
            disabled={!dirty}
            saveLabel={vendor ? "儲存" : "新增"}
            extra={
              vendor && canDelete ? (
                <button
                  onClick={() => setConfirmDel(true)}
                  className="w-12 h-12 rounded-[14px] bg-white border border-[#E4E4E7] flex items-center justify-center"
                  style={{ color: RED }}
                  aria-label="刪除"
                >
                  <Icon name="delete" className="text-[22px]" />
                </button>
              ) : undefined
            }
          />
        )
      }
    >
      <div className="pb-6">
        {confirmDel && (
          <p className="mx-4 mt-4 rounded-[12px] px-3.5 py-3 text-[13px] leading-relaxed bg-[#FDECEC] text-[#B42318]">
            會清空廠商CRM 這一列的資料（含統編、銀行與匯款帳號），無法復原。
          </p>
        )}

        <FieldGroup title="廠商">
          <TextField label="公司全名" value={d.fullName} onChange={(v) => set("fullName", v)} placeholder="例：峻岸工程行" />
          <TextField label="簡稱" value={d.short} onChange={(v) => set("short", v)} placeholder="例：峻岸（清單上顯示這個）" />
          <TextField label="工項" value={d.trade} onChange={(v) => set("trade", v)} placeholder="例：建材、防水" list={trades} />
          <TextField label="等級" value={d.level} onChange={(v) => set("level", v)} placeholder="例：黃金" list={levels} />
        </FieldGroup>

        <FieldGroup title="聯絡人">
          <TextField label="聯絡人 1" value={d.contact1} onChange={(v) => set("contact1", v)} />
          <TextField label="聯絡電話 1" value={d.phone1} onChange={(v) => set("phone1", v)} placeholder="例：0932-288119" />
          <TextField label="聯絡人 2" value={d.contact2} onChange={(v) => set("contact2", v)} />
          <TextField label="聯絡電話 2" value={d.phone2} onChange={(v) => set("phone2", v)} />
        </FieldGroup>

        <FieldGroup title="備註">
          <TextField label="備註" value={d.note} onChange={(v) => set("note", v)} multiline />
        </FieldGroup>

        <p className="px-5 mt-3 text-[12px] leading-relaxed text-[#A1A1AA]">統編、銀行分行、匯款帳號請直接在試算表填寫，APP 不顯示這些資料。</p>
      </div>
    </Sheet>
  );
}
