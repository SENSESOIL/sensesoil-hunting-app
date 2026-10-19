"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { newSectionId, newTaskId, personColor, type Section } from "@/lib/pm/model";
import { buildPlan, mergeShots, normText, type PlanRow, type Shot } from "@/lib/pm/reminder-import";
import { Spinner } from "./kit";
import { Sheet, SheetActions, toast } from "./Sheet";
import { Icon } from "./ui";
import { canEditProject, type Pm } from "./usePm";

/* ══════════════════════════════════════════════════════════
   從提醒事項截圖匯入（任務追蹤 → 任務 → 右上）
   1. 選要匯入哪個專案（從清單挑）
   2. 選截圖：一份長清單可以分好幾張截，上下留一兩列重複，會自動接起來、順序不用管
   3. 預覽：分組、縮排（子任務）、已完成、日期都會讀進來；不要的取消打勾；專案裡已有同名任務的預設不匯入
   4. 匯入：缺的分組自動建立，任務照截圖的順序排在專案最後面
   ══════════════════════════════════════════════════════════ */

interface ShotFile {
  id: string;
  file: File;
  url: string;
  status: "reading" | "ok" | "error";
  shot?: Shot;
  error?: string;
}

const MAX_EDGE = 2400;

async function toJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    let edge = MAX_EDGE;
    for (;;) {
      const k = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL("image/jpeg", 0.85).split(",")[1];
      if (data.length < 4_000_000 || edge < 1200) return data;
      edge = Math.round(edge * 0.75);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ImportSheet({ pm, open, onClose, presetCode }: { pm: Pm; open: boolean; onClose: () => void; presetCode?: string }) {
  const [code, setCode] = useState<string>("");
  const [files, setFiles] = useState<ShotFile[]>([]);
  // 使用者點過的列：true＝匯入、false＝不匯入（沒點過的照預設：同名任務不匯入，其他匯入）
  const [pick, setPick] = useState<Map<string, boolean>>(new Map());
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const touchedCode = useRef(false);

  useEffect(() => {
    if (!open) return;
    setCode(presetCode ?? "");
    touchedCode.current = !!presetCode;
    setFiles((old) => {
      old.forEach((f) => URL.revokeObjectURL(f.url));
      return [];
    });
    setPick(new Map());
    setPicking(false);
    setQ("");
    setSaving(false);
  }, [open, presetCode]);

  const projects = useMemo(() => pm.projects.filter((p) => !p.archived && canEditProject(pm, p.code)), [pm]);
  const project = code ? pm.projectBy.get(code) : undefined;

  /* ── 讀截圖 ── */
  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const add: ShotFile[] = [...list]
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, 20)
      .map((file) => ({ id: newTaskId(), file, url: URL.createObjectURL(file), status: "reading" }));
    setFiles((cur) => [...cur, ...add]);
    add.forEach(read);
  };
  const read = async (f: ShotFile) => {
    const patch = (p: Partial<ShotFile>) => setFiles((cur) => cur.map((x) => (x.id === f.id ? { ...x, ...p } : x)));
    patch({ status: "reading", error: undefined });
    try {
      const data = await toJpeg(f.file);
      const r = await fetch("/api/pm/import-shot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, mimeType: "image/jpeg", today: pm.today }),
      });
      const j = (await r.json().catch(() => ({}))) as Shot & { error?: string };
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      patch({ status: "ok", shot: { listTitle: j.listTitle, items: j.items ?? [] } });
    } catch (e) {
      patch({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  };
  const removeFile = (id: string) =>
    setFiles((cur) => {
      const f = cur.find((x) => x.id === id);
      if (f) URL.revokeObjectURL(f.url);
      return cur.filter((x) => x.id !== id);
    });

  /* ── 接起來 → 預覽 ── */
  const reading = files.some((f) => f.status === "reading");
  const okFiles = useMemo(() => files.filter((f) => f.status === "ok" && f.shot).sort((a, b) => a.file.lastModified - b.file.lastModified), [files]);
  const merged = useMemo(() => (reading ? null : mergeShots(okFiles.map((f) => f.shot!))), [okFiles, reading]);
  const plan = useMemo(() => (merged ? buildPlan(merged.items) : []), [merged]);

  // 清單名稱和專案名稱對得上就自動選
  useEffect(() => {
    if (touchedCode.current || !merged?.listTitle) return;
    const t = normText(merged.listTitle);
    const hit = projects.find((p) => t && (normText(p.name).includes(t) || t.includes(normText(p.name)) || t.includes(normText(p.code))));
    if (hit) setCode(hit.code);
  }, [merged?.listTitle, projects]);

  // 專案裡已有同名任務：預設不匯入
  const existing = useMemo(() => new Set(pm.tasks.filter((t) => t.code === code).map((t) => normText(t.title))), [pm.tasks, code]);
  const dupKeys = useMemo(() => new Set(plan.filter((r) => r.kind === "task" && existing.has(normText(r.text))).map((r) => r.key)), [plan, existing]);
  const isOn = (r: PlanRow) => pick.get(r.key) ?? !dupKeys.has(r.key);
  const toggle = (r: PlanRow) => setPick((cur) => new Map(cur).set(r.key, !isOn(r)));
  const chosen = plan.filter((r) => r.kind === "task" && isOn(r));

  const seamText = merged?.gaps.length
    ? `第 ${merged.gaps.map((g) => `${g + 1}、${g + 2}`).join("；")} 張之間找不到重複的項目，中間可能漏截了。`
    : "";

  /* ── 匯入 ── */
  const doImport = async () => {
    if (!project || !chosen.length) return;
    setSaving(true);
    try {
      // 分組：同名的沿用；沒有的新建（只有管理者能建，其他人放到「其他」）
      const cur: Section[] = project.sections ?? [];
      const secId = new Map(cur.map((s) => [normText(s.name), s.id]));
      const created: Section[] = [];
      let lost = 0;
      for (const r of chosen) {
        const n = normText(r.section);
        if (!n || secId.has(n)) continue;
        if (pm.isManager) {
          const s = { id: newSectionId(), name: r.section.slice(0, 40) };
          created.push(s);
          secId.set(n, s.id);
        } else {
          secId.set(n, "");
          lost++;
        }
      }
      if (created.length && !(await pm.saveSections(project.code, [...cur, ...created]))) return;

      const ids = new Map(chosen.map((r) => [r.key, newTaskId()]));
      const base = (r: PlanRow) => {
        const sid = secId.get(normText(r.section)) ?? "";
        return {
          id: ids.get(r.key)!,
          code: project.code,
          title: r.text,
          status: r.done ? ("done" as const) : ("todo" as const),
          due: r.due,
          note: r.note,
          flagged: r.flagged || undefined,
          meta: sid ? { section: sid } : undefined,
        };
      };
      // 先建主任務，再建子任務（子任務要掛在已存在的上層下面）；上層沒勾的子任務改成主任務
      const tops = chosen.filter((r) => r.depth === 0 || !r.parentKey || !ids.has(r.parentKey));
      const kids = chosen.filter((r) => !tops.includes(r));
      const a = await Promise.all(tops.map((r) => pm.saveTask(base(r), { quiet: true })));
      const b = await Promise.all(kids.map((r) => pm.saveTask({ ...base(r), parentId: ids.get(r.parentKey!) }, { quiet: true })));
      const ok = [...a, ...b].filter(Boolean).length;

      // 順序：原有任務在前，匯入的照截圖順序接在後面
      const before = pm.tasks.filter((t) => t.code === project.code && ![...ids.values()].includes(t.id)).sort((x, y) => x.seq - y.seq).map((t) => t.id);
      await pm.reorderTasks([...before, ...chosen.map((r) => ids.get(r.key)!)]);

      const fail = chosen.length - ok;
      toast(
        `已匯入 ${ok} 項到 ${project.name}` + (fail ? `，${fail} 項失敗` : "") + (lost ? `（${lost} 項的分組要管理者建立，先放在「其他」）` : ""),
        { tone: fail ? "error" : "ok" }
      );
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  };

  /* ── 子頁：挑專案 ── */
  if (picking) {
    const t = normText(q);
    const list = projects.filter((p) => !t || normText(`${p.code}${p.name}${p.company}`).includes(t));
    return (
      <Sheet open={open} title="匯入到哪個專案" onClose={onClose}>
        <div className="pb-8">
          <div className="sticky top-0 z-10 bg-[#FAFAFA]/95 backdrop-blur px-2 pt-2 pb-2 flex flex-col gap-2">
            <button type="button" onClick={() => setPicking(false)} className="h-10 pr-3 pl-1 self-start flex items-center gap-0.5 text-[16px] text-[var(--accent)] active:opacity-60">
              <Icon name="chevron_left" weight={500} className="text-[26px]" />
              匯入
            </button>
            <div className="mx-2 h-10 rounded-[10px] bg-[#EEEEF0] flex items-center gap-1.5 px-2.5">
              <Icon name="search" className="text-[20px] text-[#8E8E93]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋代碼、名稱" className="flex-1 min-w-0 bg-transparent text-[16px] outline-none placeholder:text-[#8E8E93]" />
            </div>
          </div>
          <div className="px-4 pt-2">
            <div className="bg-white rounded-[14px] overflow-hidden divide-y divide-[#F0F0F2]">
              {list.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => {
                    touchedCode.current = true;
                    setCode(p.code);
                    setPicking(false);
                  }}
                  className="w-full flex items-center gap-3 pl-3 pr-3 h-14 text-left active:bg-[#F2F2F4]"
                >
                  <Badge code={p.code} />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-[16px] text-[#18181B]">{p.name}</span>
                    {p.company && <span className="block truncate text-[12.5px] text-[#8E8E93]">{p.company}</span>}
                  </span>
                  {p.code === code && <Icon name="check" weight={600} className="text-[20px] text-[var(--accent)]" />}
                </button>
              ))}
              {!list.length && <p className="px-4 py-6 text-center text-[14px] text-[#8E8E93]">沒有符合的專案</p>}
            </div>
          </div>
        </div>
      </Sheet>
    );
  }

  /* ── 主頁 ── */
  const taskCount = plan.filter((r) => r.kind === "task").length;
  return (
    <Sheet
      open={open}
      title="從截圖匯入"
      subtitle="提醒事項的清單截圖 → 任務排程"
      onClose={onClose}
      dirty={files.length > 0 && !saving}
      footer={
        <SheetActions
          onSave={doImport}
          saving={saving}
          disabled={!project || !chosen.length || reading}
          saveLabel={!project ? "先選專案" : reading ? "辨識中…" : chosen.length ? `匯入 ${chosen.length} 項` : "匯入"}
        />
      }
    >
      <div className="pb-6">
        {/* 1. 專案 */}
        <section className="px-4 pt-4">
          <h3 className="px-4 pb-1.5 text-[13px] text-[#8E8E93]">匯入到</h3>
          <button type="button" onClick={() => setPicking(true)} className="w-full bg-white rounded-[14px] flex items-center gap-3 pl-3 pr-2.5 h-14 text-left active:bg-[#F2F2F4]">
            {project ? (
              <>
                <Badge code={project.code} />
                <span className="flex-1 min-w-0 truncate text-[16px] text-[#18181B]">{project.name}</span>
              </>
            ) : (
              <span className="flex-1 pl-1 text-[16px] text-[#C7C7CC]">選擇專案</span>
            )}
            <Icon name="chevron_right" className="text-[20px] text-[#C7C7CC] shrink-0" />
          </button>
        </section>

        {/* 2. 截圖 */}
        <section className="px-4 pt-5">
          <h3 className="px-4 pb-1.5 text-[13px] text-[#8E8E93]">截圖</h3>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {files.map((f) => (
              <div key={f.id} className="relative w-[76px] h-[150px] shrink-0 rounded-[12px] overflow-hidden bg-white ring-1 ring-black/[0.06]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="" className="w-full h-full object-cover object-top" />
                {f.status !== "ok" && (
                  <div className={`absolute inset-0 flex flex-col items-center justify-center gap-1 ${f.status === "error" ? "bg-[#E5484D]/80" : "bg-black/35"}`}>
                    {f.status === "reading" ? (
                      <Spinner size={20} color="#fff" />
                    ) : (
                      <button type="button" onClick={() => read(f)} className="flex flex-col items-center text-white text-[12px]" title={f.error}>
                        <Icon name="refresh" className="text-[22px]" />
                        重試
                      </button>
                    )}
                  </div>
                )}
                {merged && f.status === "ok" && okFiles.length > 1 && (
                  <span className="absolute left-1 top-1 min-w-5 h-5 px-1 rounded-full bg-black/60 text-white text-[11px] leading-5 text-center tabular-nums">
                    {merged.order.indexOf(okFiles.indexOf(f)) + 1}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  aria-label="移除這張截圖"
                  className="absolute right-0.5 top-0.5 w-7 h-7 flex items-center justify-center text-white drop-shadow"
                >
                  <Icon name="cancel" fill={1} className="text-[20px]" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="w-[76px] h-[150px] shrink-0 rounded-[12px] border border-dashed border-[#C7C7CC] bg-white flex flex-col items-center justify-center gap-1 text-[var(--accent)] active:bg-[#F2F2F4]"
            >
              <Icon name="add_photo_alternate" className="text-[26px]" />
              <span className="text-[12.5px]">{files.length ? "再加" : "選擇截圖"}</span>
            </button>
            <input
              ref={input}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <p className="px-4 pt-1.5 text-[12.5px] leading-relaxed text-[#8E8E93]">
            在提醒事項打開清單，從最上面開始截，往下滑時讓上下留一兩列重複，會自動接起來，順序不用管。分組、子任務（縮排）、已完成、日期都會讀進來。
          </p>
          {files.some((f) => f.status === "error") && (
            <p className="px-4 pt-1 text-[12.5px] text-[#E5484D]">{files.find((f) => f.status === "error")?.error}</p>
          )}
        </section>

        {/* 3. 預覽 */}
        {merged && taskCount > 0 && (
          <section className="px-4 pt-5">
            <h3 className="px-4 pb-1.5 text-[13px] text-[#8E8E93] flex justify-between">
              <span>預覽（{taskCount} 項{merged.listTitle ? `・${merged.listTitle}` : ""}）</span>
              <span>點一下可以不匯入</span>
            </h3>
            {seamText && (
              <div className="mb-2 rounded-[12px] bg-[#FFF4E5] px-3.5 py-2.5 flex gap-2 text-[13px] leading-snug text-[#9A5B13]">
                <Icon name="warning" className="text-[18px] shrink-0 mt-px" />
                {seamText}
              </div>
            )}
            <div className="bg-white rounded-[14px] overflow-hidden">
              {plan.map((r) =>
                r.kind === "section" ? (
                  <div key={r.key} className="px-4 pt-4 pb-1.5 text-[17px] font-bold text-[#18181B] border-t border-[#F0F0F2] first:border-t-0">
                    {r.text}
                  </div>
                ) : (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => toggle(r)}
                    className={`w-full flex items-start gap-2.5 pr-3 py-2.5 text-left active:bg-[#F2F2F4] ${r.depth ? "pl-11" : "pl-4"} ${isOn(r) ? "" : "opacity-40"}`}
                  >
                    <span
                      className={`mt-0.5 w-[20px] h-[20px] rounded-full shrink-0 flex items-center justify-center ${isOn(r) ? "bg-[var(--accent)]" : "ring-[1.5px] ring-inset ring-[#C7C7CC]"}`}
                      aria-hidden
                    >
                      {isOn(r) && <Icon name="check" weight={700} className="text-[14px] text-white" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[15.5px] leading-snug ${r.done ? "text-[#8E8E93] line-through" : "text-[#18181B]"}`}>{r.text}</span>
                      {(r.dateText || r.note || dupKeys.has(r.key) || r.done) && (
                        <span className="block text-[12.5px] leading-snug text-[#8E8E93] mt-0.5 truncate">
                          {[dupKeys.has(r.key) ? "專案裡已有同名任務" : "", r.done ? "已完成" : "", r.dateText ?? "", r.note && r.note !== r.dateText ? r.note : ""].filter(Boolean).join("・")}
                        </span>
                      )}
                    </span>
                    {r.flagged && <Icon name="flag" fill={1} className="text-[16px] text-[var(--accent)] mt-0.5" />}
                  </button>
                )
              )}
            </div>
            {plan.some((r) => r.kind === "section") && (
              <p className="px-4 pt-1.5 text-[12.5px] text-[#8E8E93]">
                分組名稱和專案裡現有的一樣就沿用，沒有的會自動新增{pm.isManager ? "" : "（要管理者才能新增，否則放在「其他」）"}。
              </p>
            )}
          </section>
        )}
        {merged && !reading && okFiles.length > 0 && taskCount === 0 && (
          <p className="px-8 pt-5 text-[14px] text-[#8E8E93]">截圖裡沒有讀到任務，請確認是提醒事項的清單畫面。</p>
        )}
      </div>
    </Sheet>
  );
}

function Badge({ code }: { code: string }) {
  return (
    <span className="w-10 h-10 rounded-[10px] shrink-0 flex items-center justify-center text-white text-[13px] font-bold tracking-tight" style={{ background: personColor(code) }}>
      {code.slice(0, 4)}
    </span>
  );
}
