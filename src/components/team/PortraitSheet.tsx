"use client";

import React, { useEffect, useRef, useState } from "react";
import { CARD_BG_KEYS, cardBg, type TeamMember } from "@/lib/pm/model";
import { Sheet, toast } from "@/components/pm/Sheet";
import { Icon } from "@/components/pm/ui";
import { ORANGE, Spinner } from "@/components/pm/kit";
import { avatarFromUrl, makePortrait, PortraitError, preloadVision } from "./portrait";
import { MemberCard } from "./MemberCard";
import { cardUrl, teamPost } from "./useTeam";

/* ══════════════════════════════════════════════════════════
   更換大頭照：拍照／選照片 → 自動去背、穿上公司制服 → 選背景色 → 儲存
   同時產生全 APP 共用的圓形大頭照（任務指派、參與者頭像）
   ══════════════════════════════════════════════════════════ */

export function PortraitSheet({
  member,
  open,
  onClose,
  onSaved,
}: {
  member: TeamMember | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [card, setCard] = useState<string | undefined>();
  const [avatar, setAvatar] = useState<string | undefined>();
  const [bg, setBg] = useState<string>("peach");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !member) return;
    setCard(undefined);
    setAvatar(undefined);
    setBg(member.cardBg && CARD_BG_KEYS.includes(member.cardBg) ? member.cardBg : CARD_BG_KEYS[0]);
    setTitle(member.title ?? "");
    setBio(member.bio ?? "");
    setStage(null);
    setError(null);
    // 先在背景載入模型，選好照片時通常已經準備好
    preloadVision().catch(() => {});
  }, [open, member]);

  if (!member) return null;
  const colors = cardBg(bg, member.email);

  const pick = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setError(null);
    try {
      const r = await makePortrait(f, colors, setStage);
      setCard(r.card);
      setAvatar(r.avatar);
      setStage(null);
    } catch (e) {
      setStage(null);
      setError(e instanceof PortraitError ? e.message : "處理失敗，請換一張照片或稍後再試（需要網路下載人像模型）");
      console.error("[portrait]", e);
    }
  };

  const changed = !!card || bg !== (member.cardBg ?? CARD_BG_KEYS[0]) || title !== (member.title ?? "") || bio !== (member.bio ?? "");

  const save = async () => {
    setSaving(true);
    const patch: Record<string, unknown> = { title: title.trim() || null, bio: bio.trim() || null, card_bg: bg };
    if (card && avatar) {
      patch.card = card;
      // 頭像的背景色以最後選的為準
      patch.avatar = await avatarFromUrl(card, colors).catch(() => avatar);
    } else if (member.hasCard && bg !== member.cardBg) {
      const url = cardUrl(member);
      if (url) patch.avatar = await avatarFromUrl(url, colors).catch(() => undefined);
    }
    const r = await teamPost({ op: "profile.save", email: member.email, patch });
    setSaving(false);
    if (!r.ok) {
      toast(r.data.error || "儲存失敗", { tone: "error" });
      return;
    }
    toast("已更新，任務指派的頭像也會一起換");
    onSaved();
    onClose();
  };

  const preview: TeamMember = { ...member, title: title || member.title, cardBg: bg };

  return (
    <Sheet
      open={open}
      title={member.hasCard || card ? "更換大頭照" : "上傳大頭照"}
      subtitle={member.name}
      onClose={() => !stage && !saving && onClose()}
      dirty={changed && !saving}
      footer={
        <button
          onClick={save}
          disabled={!changed || !!stage || saving}
          className="w-full h-12 rounded-[14px] text-white text-[15px] font-semibold disabled:opacity-35 inline-flex items-center justify-center gap-2"
          style={{ background: ORANGE }}
        >
          {saving && <Spinner size={16} color="#fff" />}
          {saving ? "儲存中…" : "儲存"}
        </button>
      }
    >
      <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
        <div className="rounded-[20px] bg-[#0E0E11] py-5 flex justify-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-40 blur-3xl" style={{ background: `radial-gradient(circle at 50% 60%, ${colors[0]}, transparent 60%)` }} />
          <div className="relative w-[200px]">
            <MemberCard member={preview} src={card ?? cardUrl(member)} active />
            {stage && (
              <div className="absolute inset-0 rounded-[22px] bg-black/55 flex flex-col items-center justify-center gap-3 px-4 text-center">
                <Spinner size={28} color="#fff" />
                <p className="text-[13px] text-white leading-snug">{stage}</p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <p className="rounded-[12px] px-3 py-2.5 text-[13px] leading-relaxed" style={{ background: "#FDECEC", color: "#B42318" }}>
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={!!stage} onClick={() => cam.current?.click()} className="h-12 rounded-[14px] bg-[#18181B] text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40">
            <Icon name="photo_camera" weight={400} className="text-[20px]" />
            自拍
          </button>
          <button type="button" disabled={!!stage} onClick={() => lib.current?.click()} className="h-12 rounded-[14px] bg-white border border-[#E4E4E7] text-[#18181B] text-[15px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40">
            <Icon name="photo_library" weight={400} className="text-[20px]" />
            從相簿選
          </button>
          <input ref={cam} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          <input ref={lib} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        </div>
        <p className="text-[12px] text-[#8E8E93] leading-relaxed -mt-1">
          正面、臉清楚、背景單純效果最好。系統會自動去背、對齊，並換上公司制服；照片只在這支手機處理。
        </p>

        <div className="bg-white rounded-[16px] border border-[#EBEBED] px-4 py-3">
          <p className="text-[13px] text-[#3F3F46] mb-2">卡牌背景</p>
          <div className="flex flex-wrap gap-2.5">
            {CARD_BG_KEYS.map((k) => {
              const [a, b] = cardBg(k, "");
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setBg(k)}
                  aria-pressed={bg === k}
                  aria-label={`背景 ${k}`}
                  className="w-10 h-10 rounded-full transition-transform active:scale-90"
                  style={{ background: `linear-gradient(135deg, ${a}, ${b})`, boxShadow: bg === k ? `0 0 0 3px #fff, 0 0 0 5px ${ORANGE}` : undefined }}
                />
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-[16px] border border-[#EBEBED] divide-y divide-[#F2F2F4]">
          <label className="flex items-center gap-3 px-4 min-h-[52px]">
            <span className="w-14 text-[14px] text-[#8E8E93] shrink-0">職稱</span>
            <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 30))} placeholder="例：工地主任、泥作師傅" className="flex-1 min-w-0 h-11 bg-transparent outline-none text-[16px] text-[#18181B] placeholder:text-[#C7C7CC]" />
          </label>
          <label className="flex items-center gap-3 px-4 min-h-[52px]">
            <span className="w-14 text-[14px] text-[#8E8E93] shrink-0">專長</span>
            <input value={bio} onChange={(e) => setBio(e.target.value.slice(0, 200))} placeholder="一句話，例：灰泥、磨石子十年" className="flex-1 min-w-0 h-11 bg-transparent outline-none text-[16px] text-[#18181B] placeholder:text-[#C7C7CC]" />
          </label>
        </div>
      </div>
    </Sheet>
  );
}
