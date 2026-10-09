"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { TeamMember } from "@/lib/pm/model";
import { Sheet, toast } from "@/components/pm/Sheet";
import { Avatar, ORANGE, Spinner } from "@/components/pm/kit";
import { IconCamera, IconPhoto } from "@tabler/icons-react";
import { removeAvatar, teamPost } from "./useTeam";

/* ══════════════════════════════════════════════════════════
   大頭照：拍照／選照片 → 拖曳、縮放對準 → 裁成統一規格的圓形大頭照
   全 APP 共用（團隊、任務指派、參與者頭像）。
   輸出固定 320×320 JPEG（正方形存檔，顯示一律裁成圓形），大小控制在伺服器上限 60KB 內。
   不再做卡牌與 AI 生成：想要更好看的大頭貼，先用 Gemini 做好再上傳。
   ══════════════════════════════════════════════════════════ */

const OUT = 320;
const MAX_LEN = 58000; // 伺服器上限 60000 字元（data URL），留一點餘裕
const MAX_ZOOM = 4;

/** 觸控不要傳給外層（抽屜下拉關閉、指揮中心左右滑換分頁） */
const stop = {
  onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
  onTouchMove: (e: React.TouchEvent) => e.stopPropagation(),
  onTouchEnd: (e: React.TouchEvent) => e.stopPropagation(),
};

interface Crop {
  img: HTMLImageElement;
  url: string;
}

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
  const [crop, setCrop] = useState<Crop | null>(null);
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const cropper = useRef<CropperApi>(null);

  useEffect(() => {
    if (!open || !member) return;
    setCrop(null);
    setTitle(member.title ?? "");
    setBio(member.bio ?? "");
    setError(null);
    setConfirmRemove(false);
  }, [open, member]);

  // 換照片或關閉時釋放上一張的 object URL
  useEffect(
    () => () => {
      if (crop) URL.revokeObjectURL(crop.url);
    },
    [crop]
  );

  if (!member) return null;

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("請選擇照片檔（JPG、PNG）");
      return;
    }
    setError(null);
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => setCrop({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("這張照片讀不出來，請換一張（iPhone 的 HEIC 請先轉成 JPG）");
    };
    img.src = url;
  };

  const changed = !!crop || title !== (member.title ?? "") || bio !== (member.bio ?? "");

  const save = async () => {
    setSaving(true);
    const patch: Record<string, unknown> = { title: title.trim() || null, bio: bio.trim() || null };
    if (crop) {
      const avatar = cropper.current?.export();
      if (!avatar) {
        setSaving(false);
        toast("照片處理失敗，請換一張", { tone: "error" });
        return;
      }
      patch.avatar = avatar;
      patch.card = null; // 舊的卡牌人像一併清掉，全 APP 只剩圓形大頭照
    }
    const r = await teamPost({ op: "profile.save", email: member.email, patch });
    setSaving(false);
    if (!r.ok) {
      toast(r.data.error || "儲存失敗", { tone: "error" });
      return;
    }
    toast(crop ? "大頭照已更新" : "已更新");
    onSaved();
    onClose();
  };

  const dropPhoto = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setSaving(true);
    const r = await removeAvatar(member.email);
    setSaving(false);
    if (!r.ok) {
      toast(r.error || "移除失敗", { tone: "error" });
      return;
    }
    toast("已移除大頭照");
    onSaved();
    onClose();
  };

  return (
    <Sheet
      open={open}
      title={member.avatar ? "更換大頭照" : "上傳大頭照"}
      subtitle={member.name}
      onClose={() => !saving && onClose()}
      dirty={changed && !saving}
      footer={
        <button
          onClick={save}
          disabled={!changed || saving}
          className="w-full h-12 rounded-full text-white text-[16px] font-medium disabled:opacity-35 inline-flex items-center justify-center gap-2"
          style={{ background: ORANGE }}
        >
          {saving && <Spinner size={16} color="#fff" />}
          {saving ? "儲存中…" : "儲存"}
        </button>
      }
    >
      <div className="px-4 pt-2 pb-6 flex flex-col gap-5">
        {crop ? (
          <Cropper key={crop.url} ref={cropper} img={crop.img} />
        ) : (
          <div className="flex flex-col items-center gap-3 py-4">
            {member.avatar ? (
              <Avatar name={member.name} email={member.email} src={member.avatar} size={128} />
            ) : (
              <span className="w-32 h-32 rounded-full border-[1.5px] border-dashed border-[#D4D4D8] flex items-center justify-center text-[#A1A1AA]">
                <IconCamera size={32} stroke={1.25} />
              </span>
            )}
            <p className="text-[13px] leading-[20px] text-[#A1A1AA] text-center max-w-[30ch]">
              選一張正面照，下一步可以拖曳、縮放，對準臉部後裁成圓形
            </p>
            {member.avatar && (
              <button
                type="button"
                onClick={dropPhoto}
                disabled={saving}
                className={`h-8 px-3 rounded-full text-[13px] transition-colors disabled:opacity-50 ${
                  confirmRemove ? "bg-[#FDECEC] text-[#B42318]" : "text-[#A1A1AA] active:bg-[#F4F4F5]"
                }`}
              >
                {confirmRemove ? "確定移除照片？" : "移除照片"}
              </button>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-[12px] px-3.5 py-2.5 text-[13px] leading-relaxed bg-[#FDECEC] text-[#B42318]">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => cam.current?.click()}
            className="h-12 rounded-full bg-[#F4F4F5] text-[#18181B] text-[15px] font-medium inline-flex items-center justify-center gap-2 active:bg-[#E4E4E7]"
          >
            <IconCamera size={20} stroke={1.5} />
            拍照
          </button>
          <button
            type="button"
            onClick={() => lib.current?.click()}
            className="h-12 rounded-full bg-[#F4F4F5] text-[#18181B] text-[15px] font-medium inline-flex items-center justify-center gap-2 active:bg-[#E4E4E7]"
          >
            <IconPhoto size={20} stroke={1.5} />
            {crop ? "換一張" : "從相簿選"}
          </button>
          <input ref={cam} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          <input ref={lib} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        </div>

        <div className="bg-white rounded-[18px] shadow-card divide-y divide-[#F4F4F5]">
          <label className="flex items-center gap-3 px-4 min-h-[52px]">
            <span className="w-12 text-[15px] text-[#71717A] shrink-0">職稱</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 30))}
              placeholder="例：工地主任、泥作師傅"
              className="flex-1 min-w-0 h-11 bg-transparent outline-none text-[16px] text-[#18181B] placeholder:text-[#C4C4C8]"
            />
          </label>
          <label className="flex items-center gap-3 px-4 min-h-[52px]">
            <span className="w-12 text-[15px] text-[#71717A] shrink-0">專長</span>
            <input
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 200))}
              placeholder="一句話，例：灰泥、磨石子十年"
              className="flex-1 min-w-0 h-11 bg-transparent outline-none text-[16px] text-[#18181B] placeholder:text-[#C4C4C8]"
            />
          </label>
        </div>
      </div>
    </Sheet>
  );
}

/* ── 裁切：正方形取景框＋圓形遮罩，拖曳移動、雙指或滑桿縮放 ───────── */

interface CropperApi {
  export: () => string | null;
}

const Cropper = React.forwardRef<CropperApi, { img: HTMLImageElement }>(function Cropper({ img }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(280); // 取景框邊長（CSS px）
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // 圖片中心相對取景框中心的位移（CSS px）
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 縮放 1 = 短邊剛好填滿取景框
  const base = size / Math.min(img.naturalWidth, img.naturalHeight);
  const scale = base * zoom;
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;

  // 圖片永遠蓋滿取景框，不露出空白
  const clamp = useCallback(
    (p: { x: number; y: number }, z = zoom) => {
      const s = base * z;
      const mx = Math.max(0, (img.naturalWidth * s - size) / 2);
      const my = Math.max(0, (img.naturalHeight * s - size) / 2);
      return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
    },
    [base, img, size, zoom]
  );

  const setZoomClamped = (z: number) => {
    const nz = Math.min(MAX_ZOOM, Math.max(1, z));
    setZoom(nz);
    setPos((p) => clamp({ x: (p.x * nz) / zoom, y: (p.y * nz) / zoom }, nz));
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      setZoomClamped((pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist);
    } else {
      setPos((p) => clamp({ x: p.x + cur.x - prev.x, y: p.y + cur.y - prev.y }));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  React.useImperativeHandle(ref, () => ({
    export: () => {
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, OUT, OUT);
      // 取景框在原圖上的範圍
      const k = 1 / scale;
      const sx = (img.naturalWidth * scale - size) / 2 - pos.x;
      const sy = (img.naturalHeight * scale - size) / 2 - pos.y;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx * k, sy * k, size * k, size * k, 0, 0, OUT, OUT);
      for (const q of [0.88, 0.8, 0.7, 0.6, 0.5]) {
        const url = canvas.toDataURL("image/jpeg", q);
        if (url.length <= MAX_LEN) return url;
      }
      return null;
    },
  }));

  return (
    <div className="flex flex-col items-center gap-4" {...stop}>
      <div
        ref={box}
        className="relative w-[min(78vw,300px)] aspect-square rounded-[20px] overflow-hidden bg-[#18181B] touch-none select-none cursor-grab active:cursor-grabbing"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={(e) => setZoomClamped(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
        aria-label="拖曳調整位置，雙指縮放"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img.src}
          alt=""
          draggable={false}
          className="absolute left-1/2 top-1/2 max-w-none pointer-events-none"
          style={{ width: w, height: h, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }}
        />
        {/* 圓形取景：圓外壓暗，就是最後會顯示的樣子 */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none ring-1 ring-white/70"
          style={{ boxShadow: "0 0 0 999px rgba(24,24,27,0.55)" }}
          aria-hidden
        />
      </div>
      <label className="w-[min(78vw,300px)] flex items-center gap-3">
        <span className="text-[13px] text-[#A1A1AA] shrink-0">縮放</span>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoomClamped(Number(e.target.value))}
          className="flex-1 accent-[#F39C12]"
        />
      </label>
    </div>
  );
});
