"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { todayISO } from "@/lib/project-ops";
import { personColor } from "@/lib/pm/model";
import { Sheet, toast } from "./Sheet";
import { Icon } from "./ui";
import { GREEN, ORANGE, RED, Spinner } from "./kit";
import { ProjectPicker } from "./TaskSheet";
import { usePm } from "./usePm";

/* ══════════════════════════════════════════════════════════
   上傳工程照（底部「＋」）
   1. 選專案（記住上次的）、可選工項
   2. 拍照或從相簿選（可多張）
   3. 點選幾張 → 選一個說明（打底、面層…）→ 套用；可以分好幾批給不同說明
   4. 上傳：自動壓縮、命名「日期_代碼_說明_序號.jpg」，Drive「說明」欄也寫入
   ══════════════════════════════════════════════════════════ */

const CAPTIONS = ["施工前", "保護", "打底", "面層", "收邊", "完工", "缺失", "驗收", "材料", "施工中"];
const LAST_KEY = "pm:photo:last-project";
const MAX_EDGE = 2048;
const THUMB_EDGE = 240;
const PARALLEL = 2;

interface Item {
  key: string;
  file: File;
  url: string;
  caption: string;
  selected: boolean;
  state: "ready" | "uploading" | "done" | "error";
  error?: string;
  takenOn: string;
}

export function PhotoUpload({ open, onClose, presetCode }: { open: boolean; onClose: () => void; presetCode?: string }) {
  const pm = usePm();
  const [code, setCode] = useState<string>("");
  const [taskId, setTaskId] = useState<string>("");
  const [picking, setPicking] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [custom, setCustom] = useState("");
  const [running, setRunning] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let last = "";
    try {
      last = localStorage.getItem(LAST_KEY) ?? "";
    } catch {
      /* 忽略 */
    }
    const c = presetCode || (last && pm.projectBy.has(last) ? last : "");
    setCode(c);
    setPicking(!c);
    setTaskId("");
    setCustom("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetCode]);

  // 關閉時釋放預覽
  useEffect(() => {
    if (open) return;
    setItems((cur) => {
      cur.forEach((i) => URL.revokeObjectURL(i.url));
      return [];
    });
  }, [open]);

  const project = code ? pm.projectBy.get(code) : undefined;
  const tasks = useMemo(() => (project?.tasks ?? []).filter((t) => t.status !== "done").slice(0, 20), [project]);
  const selected = items.filter((i) => i.selected && i.state !== "done");
  const pending = items.filter((i) => i.state !== "done");
  const doneCount = items.filter((i) => i.state === "done").length;
  const ready = !!pm.data?.photoReady;

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const now = todayISO();
    const list: Item[] = [...files]
      .filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name))
      .map((f, i) => ({
        key: `${Date.now()}-${i}-${f.name}`,
        file: f,
        url: URL.createObjectURL(f),
        caption: "",
        selected: true,
        state: "ready" as const,
        takenOn: f.lastModified ? todayISO(new Date(f.lastModified)) : now,
      }));
    // 新加入的預設選取（方便馬上套說明），舊的取消選取
    setItems((cur) => [...cur.map((c) => ({ ...c, selected: false })), ...list]);
  };

  const applyCaption = (cap: string) => {
    if (!selected.length) {
      toast("先點選要套用的照片", { tone: "error" });
      return;
    }
    setItems((cur) => cur.map((i) => (i.selected && i.state !== "done" ? { ...i, caption: cap, selected: false } : i)));
    setCustom("");
  };

  const toggle = (key: string) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, selected: !i.selected } : i)));
  const remove = (key: string) =>
    setItems((cur) => {
      const it = cur.find((i) => i.key === key);
      if (it) URL.revokeObjectURL(it.url);
      return cur.filter((i) => i.key !== key);
    });

  const upload = async () => {
    if (!code || !pending.length) return;
    try {
      localStorage.setItem(LAST_KEY, code);
    } catch {
      /* 忽略 */
    }
    setRunning(true);
    const task = tasks.find((t) => t.id === taskId);
    // 同一批裡同樣說明的照片編流水號
    const counters = new Map<string, number>();
    const numbered = pending.map((it) => {
      const cap = it.caption || "工程照";
      const n = (counters.get(cap) ?? 0) + 1;
      counters.set(cap, n);
      return { it, cap, n };
    });
    let idx = 0;
    const worker = async () => {
      while (idx < numbered.length) {
        const { it, cap, n } = numbered[idx++];
        setItems((cur) => cur.map((x) => (x.key === it.key ? { ...x, state: "uploading", error: undefined } : x)));
        const err = await uploadOne(it, code, cap, n, task?.id, task?.title);
        setItems((cur) => cur.map((x) => (x.key === it.key ? { ...x, state: err ? "error" : "done", error: err ?? undefined } : x)));
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, numbered.length) }, worker));
    setRunning(false);
    pm.refresh();
  };

  // 全部上傳完成 → 提示並關閉
  useEffect(() => {
    if (!running && items.length && items.every((i) => i.state === "done")) {
      toast(`已上傳 ${items.length} 張到「${project?.name ?? code}」的工程照資料夾`);
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, items]);

  const failed = items.filter((i) => i.state === "error").length;

  return (
    <Sheet
      open={open}
      title="上傳工程照"
      subtitle={project ? `${project.code}　${project.name}` : undefined}
      onClose={() => {
        if (running) return;
        onClose();
      }}
      dirty={pending.length > 0 && !running}
      footer={
        <button
          onClick={upload}
          disabled={!ready || !code || !pending.length || running}
          className="w-full h-12 rounded-[14px] text-white text-[15px] font-semibold disabled:opacity-35 inline-flex items-center justify-center gap-2 active:opacity-85"
          style={{ background: ORANGE }}
        >
          {running && <Spinner size={16} color="#fff" />}
          {!ready
            ? "上傳功能尚未設定"
            : running
            ? `上傳中 ${doneCount}/${items.length}`
            : failed
            ? `重新上傳失敗的 ${failed} 張`
            : pending.length
            ? `上傳 ${pending.length} 張`
            : "先選照片"}
        </button>
      }
    >
      <div className="px-4 pt-3 pb-6 flex flex-col gap-4">
        {!ready && (
          <p className="rounded-[12px] px-3 py-2.5 text-[13px] leading-relaxed" style={{ background: "#FFF6E8", color: "#8A5A00" }}>
            工程照上傳還沒設定（需要部署 Google Apps Script）。管理者請看 apps-script/工程照上傳.gs 的說明。
          </p>
        )}

        {/* 1. 專案 */}
        <div className="bg-white rounded-[16px] border border-[#EBEBED] overflow-hidden">
          <button type="button" disabled={running} onClick={() => setPicking((v) => !v)} className="w-full flex items-center gap-3 px-4 min-h-[56px] text-left">
            <span className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: project ? personColor(project.code) : "#D4D4D8" }}>
              <Icon name="folder" weight={400} className="text-[18px] text-white" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[12px] text-[#8E8E93]">上傳到</span>
              <span className="block text-[16px] font-semibold text-[#18181B] truncate">{project ? project.name : "選擇專案"}</span>
            </span>
            <Icon name={picking ? "expand_less" : "expand_more"} className="text-[20px] text-[#C7C7CC]" />
          </button>
          {picking && (
            <div className="border-t border-[#F2F2F4]">
              <ProjectPicker
                pm={pm}
                value={code}
                onPick={(c) => {
                  setCode(c);
                  setTaskId("");
                  setPicking(false);
                }}
              />
            </div>
          )}
          {project && tasks.length > 0 && !picking && (
            <div className="border-t border-[#F2F2F4] px-4 py-3">
              <p className="text-[12px] text-[#8E8E93] mb-2">哪個工項？（選填）</p>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4">
                {tasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTaskId(taskId === t.id ? "" : t.id)}
                    className={`shrink-0 h-9 px-3.5 rounded-full text-[13px] ${taskId === t.id ? "bg-[#18181B] text-white" : "bg-[#F4F4F5] text-[#3F3F46]"}`}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 2. 照片 */}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={running} onClick={() => camera.current?.click()} className="h-14 rounded-[14px] bg-[#18181B] text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 active:opacity-85 disabled:opacity-40">
            <Icon name="photo_camera" weight={400} className="text-[22px]" />
            拍照
          </button>
          <button type="button" disabled={running} onClick={() => library.current?.click()} className="h-14 rounded-[14px] bg-white border border-[#E4E4E7] text-[#18181B] text-[15px] font-semibold inline-flex items-center justify-center gap-2 active:bg-[#F4F4F5] disabled:opacity-40">
            <Icon name="photo_library" weight={400} className="text-[22px]" />
            從相簿選
          </button>
          <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={library} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>

        {items.length > 0 && (
          <>
            {/* 3. 說明 */}
            <div className="bg-white rounded-[16px] border border-[#EBEBED] px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[13px] text-[#3F3F46]">
                  {selected.length ? (
                    <>
                      已選 <b>{selected.length}</b> 張，選一個說明套用
                    </>
                  ) : (
                    "點照片選取，再選說明（可以分批）"
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const all = pending.every((i) => i.selected);
                    setItems((cur) => cur.map((i) => (i.state === "done" ? i : { ...i, selected: !all })));
                  }}
                  className="h-8 px-2.5 rounded-full text-[13px] font-semibold"
                  style={{ color: ORANGE }}
                >
                  {pending.every((i) => i.selected) ? "取消全選" : "全選"}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CAPTIONS.map((c) => (
                  <button key={c} type="button" disabled={running} onClick={() => applyCaption(c)} className="h-10 px-3.5 rounded-full bg-[#F4F4F5] text-[14px] text-[#18181B] active:bg-[#E4E4E7] disabled:opacity-40">
                    {c}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value.replace(/[\\/:*?"<>|_]/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && custom.trim() && !e.nativeEvent.isComposing) applyCaption(custom.trim());
                  }}
                  maxLength={30}
                  placeholder="自訂說明，例：二樓浴室防水"
                  className="flex-1 min-w-0 h-10 rounded-[10px] border border-[#E4E4E7] bg-[#FCFCFC] px-3 text-[16px] text-[#18181B] outline-none focus:border-[#F39C12]"
                />
                <button type="button" disabled={!custom.trim() || running} onClick={() => applyCaption(custom.trim())} className="h-10 px-4 rounded-[10px] bg-[#18181B] text-white text-[14px] font-semibold disabled:opacity-30">
                  套用
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {items.map((it) => (
                <div key={it.key} className="relative">
                  <button
                    type="button"
                    disabled={running || it.state === "done"}
                    onClick={() => toggle(it.key)}
                    className={`relative block w-full aspect-square rounded-[12px] overflow-hidden bg-[#F2F2F4] ${it.selected ? "ring-[3px] ring-offset-1" : ""}`}
                    style={it.selected ? ({ "--tw-ring-color": ORANGE } as React.CSSProperties) : undefined}
                    aria-pressed={it.selected}
                    aria-label={`照片 ${it.caption || "未加說明"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.url} alt="" className="w-full h-full object-cover" />
                    {it.selected && (
                      <span className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: ORANGE }}>
                        <Icon name="check" weight={700} className="text-[16px] text-white" />
                      </span>
                    )}
                    {it.state !== "ready" && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                        {it.state === "uploading" && <Spinner size={24} color="#fff" />}
                        {it.state === "done" && <Icon name="check_circle" fill={1} weight={500} className="text-[34px]" style={{ color: GREEN }} />}
                        {it.state === "error" && <Icon name="error" fill={1} weight={500} className="text-[30px]" style={{ color: RED }} />}
                      </span>
                    )}
                  </button>
                  <p className={`mt-1 text-[12px] truncate text-center ${it.caption ? "text-[#18181B] font-medium" : "text-[#A1A1AA]"}`} title={it.error}>
                    {it.state === "error" ? <span style={{ color: RED }}>{it.error ?? "失敗"}</span> : it.caption || "未加說明"}
                  </p>
                  {it.state === "ready" && !running && (
                    <button type="button" onClick={() => remove(it.key)} className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-[#18181B] text-white flex items-center justify-center shadow" aria-label="移除這張">
                      <Icon name="close" weight={500} className="text-[16px]" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[12px] text-[#A1A1AA] leading-relaxed">
              檔名會是「日期_{code || "代碼"}_說明_序號.jpg」，說明也會寫進雲端硬碟的「說明」欄，之後在 Drive 搜尋「打底」就找得到。
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}

/* ── 壓縮與上傳 ───────────────────────────────────────── */

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    // 舊版 Safari：退回 <img>
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

function draw(src: ImageBitmap | HTMLImageElement, edge: number, quality: number): { dataUrl: string; w: number; h: number } {
  const sw = "naturalWidth" in src ? src.naturalWidth : src.width;
  const sh = "naturalHeight" in src ? src.naturalHeight : src.height;
  const k = Math.min(1, edge / Math.max(sw, sh));
  const w = Math.round(sw * k);
  const h = Math.round(sh * k);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  return { dataUrl: c.toDataURL("image/jpeg", quality), w, h };
}

async function uploadOne(it: Item, code: string, caption: string, n: number, taskId?: string, taskTitle?: string): Promise<string | null> {
  try {
    const img = await decode(it.file);
    let full = draw(img, MAX_EDGE, 0.85);
    // 太大就再壓一次（Vercel 單次請求上限 4.5MB）
    if (full.dataUrl.length > 4_000_000) full = draw(img, 1600, 0.78);
    const thumb = draw(img, THUMB_EDGE, 0.7);
    if ("close" in img) img.close();
    const date = it.takenOn.replace(/-/g, "");
    const safeCap = caption.replace(/[\\/:*?"<>|_\s]+/g, "").slice(0, 30) || "工程照";
    const fileName = `${date}_${code}_${safeCap}_${String(n).padStart(2, "0")}.jpg`;
    const res = await fetch("/api/pm/photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: `ph-${crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2)}`,
        code,
        taskId,
        taskTitle,
        caption: caption === "工程照" ? "" : caption,
        fileName,
        takenOn: it.takenOn,
        mimeType: "image/jpeg",
        data: full.dataUrl.split(",")[1],
        thumb: thumb.dataUrl,
        width: full.w,
        height: full.h,
      }),
    });
    if (res.ok) return null;
    const j = await res.json().catch(() => ({}));
    return (j as { error?: string }).error || `上傳失敗（${res.status}）`;
  } catch (e) {
    console.error("[photo]", e);
    return "這張照片讀不到（格式不支援？）";
  }
}
