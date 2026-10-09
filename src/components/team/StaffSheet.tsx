"use client";

import React, { useEffect, useId, useState } from "react";
import type { StaffInfo, TeamMember } from "@/lib/pm/model";
import { Sheet, SheetActions, toast } from "@/components/pm/Sheet";
import { FieldGroup, Row, TextField } from "@/components/pm/fields";
import { Icon } from "@/components/pm/ui";
import { Avatar, RED } from "@/components/pm/kit";
import { removeAvatar, teamPost } from "./useTeam";

/* ══════════════════════════════════════════════════════════
   內部職員：新增／編輯（寫回拾壤CRM「員工CRM」）
   Admin、Editor 可新增、編輯；只有 Admin 看得到「刪除」。
   個資（生日、身分證、地址、帳號）只有 Admin、Editor 拿得到，這張表也只有他們打得開。
   ══════════════════════════════════════════════════════════ */

const LEVELS = ["S", "A", "B", "C", "D", "E"];

type Form = Omit<StaffInfo, "seq">;

/** 試算表「2009/01/10」「2026/8/25」 ⇄ 日期欄「2009-01-10」 */
const toInput = (v?: string) => {
  const m = v?.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
};
const toSheet = (v: string) => v.replace(/-/g, "/");

const inputCls =
  "w-full h-11 rounded-[12px] border border-[#E4E4E7] bg-[#FCFCFC] px-3 text-[16px] text-[#18181B] outline-none focus:border-[#F39C12] focus:ring-1 focus:ring-[#F39C12] [color-scheme:light]";

function DateField({ label, value, onChange, hint }: { label: string; value?: string; onChange: (v: string) => void; hint?: string }) {
  const id = useId();
  return (
    <Row label={label} htmlFor={id} aside={value ? <button type="button" onClick={() => onChange("")} className="text-[12.5px] text-[#A1A1AA]">清除</button> : undefined}>
      <input id={id} type="date" value={toInput(value)} onChange={(e) => onChange(e.target.value ? toSheet(e.target.value) : "")} className={inputCls} />
      {hint && <p className="text-[12px] text-[#A1A1AA] mt-1.5">{hint}</p>}
    </Row>
  );
}

export function StaffSheet({
  member,
  open,
  canDelete,
  onClose,
  onSaved,
  onEditPhoto,
}: {
  /** null = 新增 */
  member: TeamMember | null;
  open: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSaved: () => void;
  onEditPhoto: (m: TeamMember) => void;
}) {
  const staff = member?.staff;
  const initial: Form = {
    name: staff?.name ?? "",
    level: staff?.level ?? "",
    phone: staff?.phone ?? "",
    gmail: staff?.gmail ?? "",
    joined: staff?.joined ?? "",
    left: staff?.left ?? "",
    birthday: staff?.birthday ?? "",
    idNo: staff?.idNo ?? "",
    address: staff?.address ?? "",
    bank: staff?.bank ?? "",
  };
  const [d, setD] = useState<Form>(initial);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  // 大頭照：移除後在這張表上立刻改回縮寫（資料重新載入前 member 還是舊的）
  const [photoGone, setPhotoGone] = useState(false);
  const [confirmPhoto, setConfirmPhoto] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState(false);

  useEffect(() => {
    if (!open) return;
    setD(initial);
    setConfirmDel(false);
    setPhotoGone(false);
    setConfirmPhoto(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setD((c) => ({ ...c, [k]: v }));
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);

  const save = async () => {
    if (!d.name?.trim()) {
      toast("請輸入姓名", { tone: "error" });
      return;
    }
    setSaving(true);
    // 只送有改的欄位，避免蓋掉別人同時在試算表改的內容
    const fields = staff
      ? Object.fromEntries(Object.entries(d).filter(([k, v]) => v !== initial[k as keyof Form]))
      : d;
    const r = await teamPost({ op: "staff.save", seq: staff?.seq ?? null, fields });
    setSaving(false);
    if (!r.ok) return toast(r.data.error || "儲存失敗", { tone: "error" });
    toast(staff ? "已更新員工CRM" : `已新增「${d.name}」到員工CRM`);
    onSaved();
    onClose();
  };

  const dropPhoto = async () => {
    if (!member) return;
    if (!confirmPhoto) {
      setConfirmPhoto(true);
      return;
    }
    setRemovingPhoto(true);
    const r = await removeAvatar(member.email);
    setRemovingPhoto(false);
    setConfirmPhoto(false);
    if (!r.ok) return toast(r.error || "移除失敗", { tone: "error" });
    setPhotoGone(true);
    toast("已移除大頭照");
    onSaved();
  };

  const remove = async () => {
    if (!staff) return;
    setSaving(true);
    const r = await teamPost({ op: "staff.delete", seq: staff.seq });
    setSaving(false);
    if (!r.ok) return toast(r.data.error || "刪除失敗", { tone: "error" });
    toast(`已從員工CRM 刪除「${staff.name}」`);
    onSaved();
    onClose();
  };

  return (
    <Sheet
      open={open}
      title={staff ? "編輯內部職員" : "新增內部職員"}
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
            saveLabel={staff ? "儲存" : "新增"}
            extra={
              staff && canDelete ? (
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
        {member && (
          <div className="flex flex-col items-center pt-5 gap-2">
            <button type="button" onClick={() => onEditPhoto(member)} className="relative rounded-full active:opacity-80" aria-label="更換大頭照">
              {/* 移除時已同步清掉全域頭像目錄，這裡不會再退回舊照片 */}
              <Avatar name={member.name} email={member.email} src={photoGone ? undefined : member.avatar} size={84} />
              <span className="absolute -right-1 -bottom-1 w-8 h-8 rounded-full bg-[#18181B] border-2 border-white flex items-center justify-center">
                <Icon name="photo_camera" weight={400} className="text-[16px] text-white" />
              </span>
            </button>
            {member.avatar && !photoGone && (
              <button
                type="button"
                onClick={dropPhoto}
                disabled={removingPhoto}
                className={`h-8 px-3 rounded-full text-[13px] transition-colors disabled:opacity-50 ${
                  confirmPhoto ? "bg-[#FDECEC] text-[#B42318]" : "text-[#A1A1AA] active:bg-[#F4F4F5]"
                }`}
              >
                {removingPhoto ? "移除中…" : confirmPhoto ? "確定移除照片？" : "移除照片"}
              </button>
            )}
          </div>
        )}

        {confirmDel && (
          <p className="mx-4 mt-4 rounded-[12px] px-3.5 py-3 text-[13px] leading-relaxed bg-[#FDECEC] text-[#B42318]">
            會清空員工CRM 這一列的所有資料（含身分證、地址、匯款帳號），無法復原。只是離職的話，請改填「離線登出日」。
          </p>
        )}

        <FieldGroup title="基本資料">
          <TextField label="姓名" value={d.name} onChange={(v) => set("name", v)} placeholder="例：陳政剛" />
          <Row label="等級">
            <div className="flex gap-1.5 flex-wrap">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => set("level", d.level === l ? "" : l)}
                  aria-pressed={d.level === l}
                  className={`w-11 h-10 rounded-[10px] text-[15px] font-medium transition-colors ${
                    d.level === l ? "bg-[#F39C12] text-white" : "bg-[#F4F4F5] text-[#3F3F46] active:bg-[#E4E4E7]"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </Row>
        </FieldGroup>

        <FieldGroup title="聯絡方式" hint="Gmail 要和登入 APP 的帳號相同，大頭照與任務指派才對得起來">
          <TextField label="聯絡電話" value={d.phone} onChange={(v) => set("phone", v)} placeholder="例：0932-288119" />
          <TextField label="Gmail" value={d.gmail} onChange={(v) => set("gmail", v)} placeholder="例：name@gmail.com" />
        </FieldGroup>

        <FieldGroup title="到職與離職">
          <DateField label="登入參戰日" value={d.joined} onChange={(v) => set("joined", v)} />
          <DateField label="離線登出日" value={d.left} onChange={(v) => set("left", v)} hint="填了就視為離職：名單不再顯示，也無法登入 APP" />
        </FieldGroup>

        <FieldGroup title="個人資料">
          <TextField label="生日" value={d.birthday} onChange={(v) => set("birthday", v)} placeholder="例：60/09/01" />
          <TextField label="身分證字號" value={d.idNo} onChange={(v) => set("idNo", v)} placeholder="例：A123456789" />
          <TextField label="地址" value={d.address} onChange={(v) => set("address", v)} />
          <TextField label="富邦匯款帳號" value={d.bank} onChange={(v) => set("bank", v)} />
        </FieldGroup>
      </div>
    </Sheet>
  );
}
