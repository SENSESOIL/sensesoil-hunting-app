"use client";

import React, { useEffect, useState } from "react";
import { tradeColor } from "@/lib/pm/model";
import { AREAS, metaChips, STATUS_FIELDS, TRADES, type StatusField, type TaskMeta } from "@/lib/pm/tags";
import { Sheet } from "./Sheet";
import { Icon } from "./ui";
import type { Pm } from "./usePm";
import { VendorList } from "./VendorPicker";

/* ══════════════════════════════════════════════════════════
   標籤（長按任務 →「標籤」，或任務細節裡的「標籤」）
   像 iPhone「設定」：
   - 第一頁只有一張清單，每列左邊是項目、右邊灰字是目前的值 ›，一眼看完、不用捲很久
   - 點進去才是選項（打勾）；單選選完自動回上一頁，多選（工項、自訂）留在原頁
   - 狀態類（工法、工審…）右邊帶一個小圓點：橘＝還沒處理、綠＝已確認
   - 完成度在長按選單的「期限」下面；開始日／期限在任務細節或甘特圖改
   - 點一下就存，不用按儲存
   ══════════════════════════════════════════════════════════ */

type Page = null | "trade" | "areas" | "custom" | "vendor" | StatusField["key"];

const TONE = { warn: "#E8833A", ok: "#2E9E6B", muted: "#A1A1AA" } as const;

export function TagSheet({ pm, taskId, open, onClose }: { pm: Pm; taskId: string | null; open: boolean; onClose: () => void }) {
  const task = taskId ? pm.tasks.find((t) => t.id === taskId) : undefined;
  const [meta, setMeta] = useState<TaskMeta>({});
  const [note, setNote] = useState("");
  const [custom, setCustom] = useState("");
  const [page, setPage] = useState<Page>(null);

  useEffect(() => {
    if (!open || !task) return;
    setMeta(task.meta ?? {});
    setNote(task.meta?.methodNote ?? "");
    setCustom("");
    setPage(null);
    // 只在打開時讀一次，編輯中自動更新不會蓋掉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId]);

  if (!task) return <Sheet open={false} title="標籤" onClose={onClose}>{null}</Sheet>;

  const save = (next: TaskMeta, extra: Record<string, unknown> = {}) => {
    setMeta(next);
    pm.saveTask({ id: task.id, meta: next, ...extra }, { quiet: false });
  };
  const set = <K extends keyof TaskMeta>(k: K, v: TaskMeta[K] | undefined) => {
    const next = { ...meta };
    if (v === undefined || (Array.isArray(v) && !v.length)) delete next[k];
    else next[k] = v;
    save(next);
  };

  const addCustom = () => {
    const t = custom.trim().replace(/^#/, "");
    if (!t) return;
    set("tags", [...new Set([...(meta.tags ?? []), t])].slice(0, 20));
    setCustom("");
  };

  const statusValue = (f: StatusField) => f.options.find((o) => o.value === meta[f.key]);
  const chips = metaChips(meta);

  /* ── 子頁 ── */
  if (page) {
    const field = STATUS_FIELDS.find((f) => f.key === page);
    const title = page === "trade" ? "工種" : page === "areas" ? "工項" : page === "custom" ? "自訂標籤" : page === "vendor" ? "廠商" : field?.label ?? "";
    return (
      <Sheet open={open} title="標籤" subtitle={task.title} onClose={onClose}>
        <div className="pb-8">
          <div className="sticky top-0 z-10 bg-[#FAFAFA]/95 backdrop-blur px-2 pt-2 pb-1 flex items-center">
            <button type="button" onClick={() => setPage(null)} className="h-10 pr-3 pl-1 flex items-center gap-0.5 text-[16px] text-[var(--accent)] active:opacity-60">
              <Icon name="chevron_left" weight={500} className="text-[26px]" />
              標籤
            </button>
            <h3 className="absolute left-1/2 -translate-x-1/2 text-[16px] font-semibold text-[#18181B]">{title}</h3>
          </div>

          {page === "trade" && (
            <List>
              {TRADES.map((t) => (
                <Choice
                  key={t}
                  label={t}
                  dot={tradeColor(t)}
                  on={meta.trade === t}
                  onClick={() => {
                    set("trade", meta.trade === t ? undefined : t);
                    setPage(null);
                  }}
                />
              ))}
            </List>
          )}

          {page === "areas" && (
            <>
              <List>
                {AREAS.map((a) => {
                  const on = (meta.areas ?? []).includes(a);
                  return <Choice key={a} label={a} on={on} onClick={() => set("areas", on ? (meta.areas ?? []).filter((x) => x !== a) : [...(meta.areas ?? []), a])} />;
                })}
              </List>
              <Foot>可以選很多個，選完按左上「標籤」回去。</Foot>
            </>
          )}

          {field && (
            <>
              <List>
                {field.options.map((o) => (
                  <Choice
                    key={o.value}
                    label={o.label}
                    dot={TONE[o.tone]}
                    on={meta[field.key] === o.value}
                    onClick={() => {
                      set(field.key, meta[field.key] === o.value ? undefined : o.value);
                      if (field.key !== "method") setPage(null);
                    }}
                  />
                ))}
              </List>
              {field.key === "method" && (
                <>
                  <List>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onBlur={() => note.trim() !== (meta.methodNote ?? "") && set("methodNote", note.trim() || undefined)}
                      placeholder="工法備註（例：需鋼構補強）"
                      maxLength={500}
                      className="w-full h-12 px-4 bg-transparent text-[16px] outline-none placeholder:text-[#C7C7CC]"
                    />
                  </List>
                  <Foot>再點一次已選的項目可以取消。</Foot>
                </>
              )}
            </>
          )}

          {/* 廠商：和長按選單的「廠商」同一個欄位（meta.vendor），兩邊互通 */}
          {page === "vendor" && (
            <div className="px-4 pt-3">
              <div className="rounded-[14px] overflow-hidden">
                <VendorList
                  value={meta.vendor}
                  trade={meta.trade}
                  onPick={(name) => {
                    set("vendor", name);
                    setPage(null);
                  }}
                />
              </div>
            </div>
          )}

          {page === "custom" && (
            <>
              <List>
                {(meta.tags ?? []).map((t) => (
                  <div key={t} className="flex items-center gap-3 pl-4 pr-2 h-12">
                    <span className="flex-1 text-[16px] text-[#2F7FD8]">#{t}</span>
                    <button
                      type="button"
                      onClick={() => set("tags", (meta.tags ?? []).filter((x) => x !== t))}
                      aria-label={`移除 ${t}`}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-[#C7C7CC] active:bg-[#F4F4F5]"
                    >
                      <Icon name="cancel" fill={1} className="text-[20px]" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pl-4 pr-2 h-12">
                  <Icon name="add_circle" className="text-[22px] text-[var(--accent)]" />
                  <input
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        addCustom();
                      }
                    }}
                    onBlur={addCustom}
                    placeholder="新增標籤，例：二樓"
                    maxLength={20}
                    enterKeyHint="done"
                    className="flex-1 min-w-0 h-full bg-transparent text-[16px] outline-none placeholder:text-[#C7C7CC]"
                  />
                </div>
              </List>
            </>
          )}
        </div>
      </Sheet>
    );
  }

  /* ── 第一頁 ── */
  const trade = meta.trade;
  const areas = meta.areas ?? [];
  return (
    <Sheet open={open} title="標籤" subtitle={task.title} onClose={onClose}>
      <div className="pb-8">
        {/* 目前的標籤（一眼看完） */}
        {chips.length > 0 && (
          <div className="px-4 pt-3 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c.text} className="h-7 px-2.5 rounded-[8px] text-[13px] leading-7 font-medium" style={{ color: c.color, background: c.bg }}>
                {c.text}
              </span>
            ))}
          </div>
        )}

        <Section title="分類">
          <Nav label="工種" value={trade ?? "無"} dot={trade ? tradeColor(trade) : undefined} muted={!trade} onClick={() => setPage("trade")} />
          <Nav label="工項" value={areas.length ? areas.join("、") : "無"} muted={!areas.length} onClick={() => setPage("areas")} />
          <Nav label="自訂標籤" value={(meta.tags ?? []).length ? (meta.tags ?? []).map((t) => `#${t}`).join(" ") : "無"} muted={!(meta.tags ?? []).length} onClick={() => setPage("custom")} />
        </Section>

        <Section title="確認與商務">
          {/* 順序照 STATUS_FIELDS：…工料、廠商請款 */}
          {STATUS_FIELDS.map((f) => {
            const v = statusValue(f);
            const row = <Nav key={f.key} label={f.label} value={v?.label ?? "未設定"} dot={v ? TONE[v.tone] : undefined} muted={!v} onClick={() => setPage(f.key)} />;
            // 工責下面接「廠商」：協力廠商名單（和長按選單同步）
            return f.key === "duty" ? (
              <React.Fragment key={f.key}>
                {row}
                <Nav label="廠商" value={meta.vendor ?? "未設定"} muted={!meta.vendor} onClick={() => setPage("vendor")} />
              </React.Fragment>
            ) : (
              row
            );
          })}
        </Section>

      </div>
    </Sheet>
  );
}

/* ── 小元件（iPhone 設定風格） ── */

function Section({ title, foot, children }: { title?: string; foot?: string; children: React.ReactNode }) {
  return (
    <section className="px-4 pt-5">
      {title && <h3 className="px-4 pb-1.5 text-[13px] text-[#8E8E93]">{title}</h3>}
      <div className="bg-white rounded-[14px] overflow-hidden divide-y divide-[#F0F0F2]">{children}</div>
      {foot && <p className="px-4 pt-1.5 text-[12.5px] leading-relaxed text-[#8E8E93]">{foot}</p>}
    </section>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-3">
      <div className="bg-white rounded-[14px] overflow-hidden divide-y divide-[#F0F0F2]">{children}</div>
    </div>
  );
}

function Foot({ children }: { children: React.ReactNode }) {
  return <p className="px-8 pt-1.5 text-[12.5px] text-[#8E8E93]">{children}</p>;
}

/** 一列：左邊項目、右邊灰字目前的值 › */
function Nav({ label, value, dot, muted, onClick }: { label: string; value: string; dot?: string; muted?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 pl-4 pr-2.5 h-12 text-left active:bg-[#F2F2F4]">
      <span className="text-[16px] text-[#18181B] shrink-0">{label}</span>
      <span className={`flex-1 min-w-0 flex items-center justify-end gap-1.5 text-[15px] ${muted ? "text-[#C7C7CC]" : "text-[#8E8E93]"}`}>
        {dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} aria-hidden />}
        <span className="truncate">{value}</span>
      </span>
      <Icon name="chevron_right" className="text-[20px] text-[#C7C7CC] shrink-0" />
    </button>
  );
}

/** 選項：選中右邊打勾 */
function Choice({ label, on, dot, onClick }: { label: string; on: boolean; dot?: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={on} onClick={onClick} className="w-full flex items-center gap-3 pl-4 pr-3 h-12 text-left active:bg-[#F2F2F4]">
      {dot && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dot }} aria-hidden />}
      <span className="flex-1 text-[16px] text-[#18181B]">{label}</span>
      {on && <Icon name="check" weight={600} className="text-[20px] text-[var(--accent)]" />}
    </button>
  );
}
