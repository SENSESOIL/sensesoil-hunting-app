"use client";

import React, { useEffect, useState } from "react";
import { addDays, diffDays } from "@/lib/project-ops";
import { tradeColor } from "@/lib/pm/model";
import { AREAS, STATUS_FIELDS, TRADES, type StatusField, type TaskMeta } from "@/lib/pm/tags";
import { Sheet } from "./Sheet";
import { DateField, FieldGroup, Row } from "./fields";
import { Icon } from "./ui";
import { ORANGE } from "./kit";
import type { Pm } from "./usePm";

/* ══════════════════════════════════════════════════════════
   標籤（長按任務 →「標籤」，或任務細節裡的「標籤」）
   - 點一下就存，不用按儲存：不打斷清單的輸入節奏
   - 單選的再點一次＝取消
   - 工期：進場日＝任務開始日；預計天數 → 自動算期限（甘特圖跟著排好）
   ══════════════════════════════════════════════════════════ */

export function TagSheet({ pm, taskId, open, onClose }: { pm: Pm; taskId: string | null; open: boolean; onClose: () => void }) {
  const task = taskId ? pm.tasks.find((t) => t.id === taskId) : undefined;
  const [meta, setMeta] = useState<TaskMeta>({});
  const [note, setNote] = useState("");
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (!open || !task) return;
    setMeta(task.meta ?? {});
    setNote(task.meta?.methodNote ?? "");
    setCustom("");
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

  const days = meta.days;
  const start = task.start;
  const setDays = (d: number | undefined) => {
    const next = { ...meta };
    if (!d) delete next.days;
    else next.days = d;
    // 有進場日：期限＝進場日＋天數－1
    save(next, start && d ? { due: addDays(start, d - 1) } : {});
  };
  const setStart = (v: string | undefined) => {
    const extra: Record<string, unknown> = { start: v };
    if (v && days) extra.due = addDays(v, days - 1);
    else if (v && task.due && task.due < v) extra.due = undefined;
    pm.saveTask({ id: task.id, ...extra });
  };
  const span = start && task.due ? diffDays(start, task.due) + 1 : undefined;

  const addCustom = () => {
    const t = custom.trim().replace(/^#/, "");
    if (!t) return;
    set("tags", [...new Set([...(meta.tags ?? []), t])].slice(0, 20));
    setCustom("");
  };

  const groups: StatusField["group"][] = ["確認", "商務", "現場"];

  return (
    <Sheet open={open} title="標籤" subtitle={task.title} onClose={onClose}>
      <div className="pb-6">
        <FieldGroup title="工種">
          <div className="px-3 py-3 flex flex-wrap gap-2">
            {TRADES.map((t) => {
              const on = meta.trade === t;
              const c = tradeColor(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("trade", on ? undefined : t)}
                  className="h-9 px-3.5 rounded-full text-[15px] transition-colors"
                  style={on ? { background: c, color: "#fff" } : { background: "#F2F2F4", color: "#3F3F46" }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </FieldGroup>

        <FieldGroup title="工項（可多選）">
          <div className="px-3 py-3 flex flex-wrap gap-2">
            {AREAS.map((a) => {
              const on = (meta.areas ?? []).includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("areas", on ? (meta.areas ?? []).filter((x) => x !== a) : [...(meta.areas ?? []), a])}
                  className={`h-9 min-w-[44px] px-3.5 rounded-full text-[15px] transition-colors ${on ? "bg-[#18181B] text-white" : "bg-[#F2F2F4] text-[#3F3F46]"}`}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </FieldGroup>

        {groups.map((g) => (
          <FieldGroup key={g} title={g}>
            {STATUS_FIELDS.filter((f) => f.group === g).map((f) => (
              <Row key={f.key} label={f.label}>
                <Choice field={f} value={meta[f.key]} onPick={(v) => set(f.key, v)} />
                {f.key === "method" && (
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onBlur={() => note.trim() !== (meta.methodNote ?? "") && set("methodNote", note.trim() || undefined)}
                    placeholder="工法備註（例：需鋼構補強）"
                    maxLength={500}
                    className="mt-2 w-full h-10 rounded-[10px] border border-[#E4E4E7] bg-[#FCFCFC] px-3 text-[16px] outline-none focus:border-[var(--accent)]"
                  />
                )}
              </Row>
            ))}
          </FieldGroup>
        ))}

        <FieldGroup title="工期" hint="進場日＝這個任務的開始日；填了預計天數會自動算出期限，甘特圖跟著排好。">
          <DateField label="廠商進場日" value={start} onChange={setStart} today={pm.today} />
          <Row label="預計完工天數">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setDays(days && days > 1 ? days - 1 : undefined)} aria-label="減一天" className="w-10 h-10 rounded-full bg-[#F2F2F4] flex items-center justify-center">
                <Icon name="remove" className="text-[20px]" />
              </button>
              <input
                inputMode="numeric"
                value={days ?? ""}
                onChange={(e) => {
                  const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                  setDays(Number.isFinite(n) && n > 0 ? Math.min(n, 999) : undefined);
                }}
                placeholder="—"
                className="w-16 h-10 rounded-[10px] border border-[#E4E4E7] text-center text-[17px] font-semibold tabular-nums outline-none focus:border-[var(--accent)]"
              />
              <button type="button" onClick={() => setDays((days ?? 0) + 1)} aria-label="加一天" className="w-10 h-10 rounded-full bg-[#F2F2F4] flex items-center justify-center">
                <Icon name="add" className="text-[20px]" />
              </button>
              <span className="text-[14px] text-[#8E8E93]">天{task.due ? `・到 ${task.due.slice(5).replace("-", "/")}` : ""}</span>
            </div>
            {!start && days ? <p className="text-[12px] text-[#A1A1AA] mt-1.5">填了進場日，就會自動算出期限。</p> : null}
            {span && days && span !== days ? <p className="text-[12px] text-[#A1A1AA] mt-1.5">目前排程是 {span} 天。</p> : null}
          </Row>
          {STATUS_FIELDS.filter((f) => f.group === "工期").map((f) => (
            <Row key={f.key} label={f.label}>
              <Choice field={f} value={meta[f.key]} onPick={(v) => set(f.key, v)} />
            </Row>
          ))}
          <Row label={`完成度　${task.progress}%`}>
            <div className="grid grid-cols-5 gap-1.5">
              {[0, 25, 50, 75, 100].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => pm.saveTask({ id: task.id, progress: p })}
                  className={`h-9 rounded-[10px] text-[14px] tabular-nums transition-colors ${task.progress === p ? "text-white font-semibold" : "bg-[#F2F2F4] text-[#3F3F46]"}`}
                  style={task.progress === p ? { background: ORANGE } : undefined}
                >
                  {p}%
                </button>
              ))}
            </div>
          </Row>
        </FieldGroup>

        <FieldGroup title="自訂標籤">
          <div className="px-3 py-3">
            {(meta.tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2.5">
                {(meta.tags ?? []).map((t) => (
                  <span key={t} className="h-8 pl-3 pr-1 rounded-full bg-[#EAF2FC] text-[#2F7FD8] text-[14px] flex items-center gap-0.5">
                    #{t}
                    <button type="button" onClick={() => set("tags", (meta.tags ?? []).filter((x) => x !== t))} aria-label={`移除 ${t}`} className="w-7 h-7 rounded-full flex items-center justify-center">
                      <Icon name="close" className="text-[16px]" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    addCustom();
                  }
                }}
                placeholder="輸入後按 Enter，例：二樓"
                maxLength={20}
                className="flex-1 h-10 rounded-[10px] border border-[#E4E4E7] bg-[#FCFCFC] px-3 text-[16px] outline-none focus:border-[var(--accent)]"
              />
              <button type="button" onClick={addCustom} disabled={!custom.trim()} className="h-10 px-4 rounded-[10px] text-[15px] font-semibold text-white disabled:opacity-40" style={{ background: ORANGE }}>
                加入
              </button>
            </div>
          </div>
        </FieldGroup>
      </div>
    </Sheet>
  );
}

function Choice({ field, value, onPick }: { field: StatusField; value?: string; onPick: (v: string | undefined) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {field.options.map((o) => {
        const on = value === o.value;
        const tone = o.tone === "warn" ? "#C2410C" : o.tone === "ok" ? "#2E9E6B" : "#3F3F46";
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(on ? undefined : o.value)}
            className="h-9 px-3 rounded-full text-[14px] transition-colors border"
            style={on ? { background: tone, borderColor: tone, color: "#fff" } : { background: "#fff", borderColor: "#E4E4E7", color: "#3F3F46" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
