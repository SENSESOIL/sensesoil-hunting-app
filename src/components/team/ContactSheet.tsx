"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Contact, ContactKind } from "@/lib/pm/model";
import { Sheet, SheetActions, toast } from "@/components/pm/Sheet";
import { FieldGroup, TextField } from "@/components/pm/fields";
import { Icon } from "@/components/pm/ui";
import { Avatar, RED } from "@/components/pm/kit";
import { teamPost } from "./useTeam";

/* 外部職員／協力廠商／聯盟品牌：新增或編輯（管理者） */

const LABELS: Record<ContactKind, { title: string; name: string; titleField: string; titlePh: string }> = {
  external: { title: "外部職員", name: "姓名", titleField: "職稱", titlePh: "例：外聘設計師" },
  vendor: { title: "協力廠商", name: "廠商名稱", titleField: "工項", titlePh: "例：水電、木作" },
  brand: { title: "聯盟品牌", name: "品牌名稱", titleField: "類型", titlePh: "例：家具、設計公司" },
};

const newId = () => `c-${(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "").slice(0, 14)}`;

/** 頭像／logo：置中裁成正方形 160px */
async function squareImage(file: File): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = 160;
  c.height = 160;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 160, 160);
  ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 160, 160);
  bmp.close();
  return c.toDataURL("image/jpeg", 0.88);
}

export function ContactSheet({
  kind,
  contact,
  open,
  onClose,
  onSaved,
}: {
  kind: ContactKind;
  contact: Contact | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const L = LABELS[kind];
  const [d, setD] = useState<Partial<Contact>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setD(contact ? { ...contact } : { kind });
    setConfirmDel(false);
  }, [open, contact, kind]);

  const set = <K extends keyof Contact>(k: K, v: Contact[K]) => setD((c) => ({ ...c, [k]: v }));
  const dirty = JSON.stringify(d) !== JSON.stringify(contact ? { ...contact } : { kind });

  const save = async () => {
    if (!d.name?.trim()) {
      toast(`請輸入${L.name}`, { tone: "error" });
      return;
    }
    setSaving(true);
    const r = await teamPost({ op: "contact.save", contact: { ...d, id: contact?.id ?? newId(), kind } });
    setSaving(false);
    if (!r.ok) return toast(r.data.error || "儲存失敗", { tone: "error" });
    toast(contact ? "已儲存" : `已新增「${d.name}」`);
    onSaved();
    onClose();
  };

  const remove = async () => {
    if (!contact) return;
    const r = await teamPost({ op: "contact.delete", id: contact.id });
    if (!r.ok) return toast(r.data.error || "刪除失敗", { tone: "error" });
    toast(`已刪除「${contact.name}」`);
    onSaved();
    onClose();
  };

  return (
    <Sheet
      open={open}
      title={contact ? `編輯${L.title}` : `新增${L.title}`}
      onClose={onClose}
      dirty={dirty && !saving}
      footer={
        confirmDel ? (
          <div className="flex gap-2">
            <button onClick={() => setConfirmDel(false)} className="flex-1 h-12 rounded-[14px] bg-[#F4F4F5] text-[15px] font-semibold text-[#18181B]">不刪除</button>
            <button onClick={remove} className="flex-1 h-12 rounded-[14px] text-white text-[15px] font-semibold" style={{ background: RED }}>確定刪除</button>
          </div>
        ) : (
          <SheetActions
            onSave={save}
            saving={saving}
            disabled={!dirty}
            saveLabel={contact ? "儲存" : "新增"}
            extra={
              contact ? (
                <button onClick={() => setConfirmDel(true)} className="w-12 h-12 rounded-[14px] bg-white border border-[#E4E4E7] flex items-center justify-center" style={{ color: RED }} aria-label="刪除">
                  <Icon name="delete" className="text-[22px]" />
                </button>
              ) : undefined
            }
          />
        )
      }
    >
      <div className="pb-6">
        <div className="flex flex-col items-center pt-5 gap-2">
          <button type="button" onClick={() => file.current?.click()} className="relative rounded-full active:opacity-80" aria-label="更換頭像或 logo">
            <Avatar name={d.name || "?"} email={d.id ?? d.name} src={d.avatar} size={84} />
            <span className="absolute -right-1 -bottom-1 w-8 h-8 rounded-full bg-[#18181B] border-2 border-white flex items-center justify-center">
              <Icon name="photo_camera" weight={400} className="text-[16px] text-white" />
            </span>
          </button>
          {d.avatar && (
            <button type="button" onClick={() => set("avatar", undefined)} className="text-[12.5px] text-[#8E8E93] underline">
              移除圖片
            </button>
          )}
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                set("avatar", await squareImage(f));
              } catch {
                toast("讀不到這張圖片", { tone: "error" });
              }
            }}
          />
        </div>
        <FieldGroup>
          <TextField label={L.name} value={d.name} onChange={(v) => set("name", v.slice(0, 60))} />
          <TextField label={L.titleField} value={d.title} onChange={(v) => set("title", v.slice(0, 40))} placeholder={L.titlePh} />
          <TextField label={kind === "external" ? "所屬單位" : "公司全名"} value={d.company} onChange={(v) => set("company", v.slice(0, 60))} />
        </FieldGroup>
        <FieldGroup>
          <TextField label="電話" value={d.phone} onChange={(v) => set("phone", v.slice(0, 40))} placeholder="0912-345-678" />
          <TextField label="Email" value={d.email} onChange={(v) => set("email", v.slice(0, 120))} />
          <TextField label="網站／社群" value={d.website} onChange={(v) => set("website", v.slice(0, 200))} />
          <TextField label="備註" value={d.note} onChange={(v) => set("note", v.slice(0, 500))} placeholder={kind === "vendor" ? "聯絡人、報價習慣、配合狀況…" : undefined} multiline />
        </FieldGroup>
      </div>
    </Sheet>
  );
}
