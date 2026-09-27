"use client";

import React, { useMemo, useState } from "react";
import { ACTIVE_STAGES, fmtDate, fmtWan, healthRank, type Stage } from "@/lib/project-ops";
import { personColor } from "@/lib/pm/model";
import { HEALTH_META, Icon } from "./ui";
import { Empty, Group, ORANGE, Pill, RED, Spinner } from "./kit";
import { ProjectScreen } from "./ProjectScreen";
import { ProjectInfoSheet } from "./ProjectInfoSheet";
import { SetupNotice } from "./SetupNotice";
import { usePm, type Pm, type ProjectItem } from "./usePm";

/* ══════════════════════════════════════════════════════════
   專案頁（管理者）
   上方三個數字：需要注意、施工中、應收未收
   下方像提醒事項的「我的列表」：每個專案一列，右邊是未完成任務數
   ══════════════════════════════════════════════════════════ */

export const PROJECT_TABS = ["進行中", "全部"];

const ORDER: Stage[] = ["施工中", "驗收", "簽約", "報價", "洽談", "暫停", "保固", "結案"];

export default function ProjectsPage({ activeTab }: { activeTab: string }) {
  const pm = usePm();
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [attention, setAttention] = useState(false);

  const all = activeTab === "全部";
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return pm.projects.filter((p) => {
      if (k && !`${p.code} ${p.name} ${p.company} ${p.manager ?? ""} ${p.client ?? ""}`.toLowerCase().includes(k)) return false;
      if (attention && !needsAttention(p)) return false;
      if (!all && !k && !isActive(p)) return false;
      return true;
    });
  }, [pm.projects, q, attention, all]);

  if (!pm.data) {
    return (
      <div className="flex justify-center py-20">
        {pm.error ? <p className="text-[14px] text-[#71717A]">{pm.error.message}</p> : <Spinner size={22} />}
      </div>
    );
  }

  const active = pm.projects.filter(isActive);
  const attn = pm.projects.filter(needsAttention);
  const receivable = active.reduce((s, p) => s + Math.max(0, (p.view.receivable ?? 0) - (p.view.retentionHeld ?? 0)), 0);
  const building = pm.projects.filter((p) => p.stage === "施工中").length;

  // 分組：進行中依階段；全部依代碼
  const groups: [string, ProjectItem[]][] = all || q
    ? [["", [...list].sort((a, b) => b.code.localeCompare(a.code))]]
    : ORDER.map((s) => [s, list.filter((p) => (p.stage ?? "") === s).sort(byHealth)] as [string, ProjectItem[]])
        .concat([["未設定階段", list.filter((p) => !p.stage).sort(byHealth)]])
        .filter(([, l]) => l.length);

  return (
    <div className="px-5 lg:px-10 pb-28 w-full max-w-5xl mx-auto flex flex-col gap-4">
      <SetupNotice pm={pm} />

      <div className="grid grid-cols-3 gap-2.5">
        <Kpi label="需要注意" value={attn.length} unit="件" color={attn.length ? RED : undefined} on={attention} onClick={() => setAttention(!attention)} />
        <Kpi label="施工中" value={building} unit="件" />
        <Kpi label="應收未收" value={fmtWan(receivable)} unit="萬" />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[#A1A1AA]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋代碼、名稱、業主"
            className="w-full h-11 rounded-[12px] bg-white border border-[#E4E4E7] pl-9 pr-3 text-[16px] text-[#18181B] outline-none focus:border-[#F39C12]"
          />
        </div>
        {pm.isManager && pm.data.configured && !pm.data.dbError && (
          <button onClick={() => setCreating(true)} className="h-11 px-4 rounded-full text-white text-[15px] font-semibold inline-flex items-center gap-1 shrink-0 active:opacity-85" style={{ background: ORANGE }}>
            <Icon name="add" weight={500} className="text-[22px]" />
            <span className="hidden sm:inline">新專案</span>
          </button>
        )}
      </div>

      {attention && (
        <div className="flex">
          <Pill on onClick={() => setAttention(false)} color={RED}>
            只看需要注意 <Icon name="close" className="text-[16px]" />
          </Pill>
        </div>
      )}

      {groups.length === 0 ? (
        <Group>
          <Empty
            icon="folder_open"
            title={q ? `找不到「${q}」` : all ? "沒有專案" : "沒有進行中的專案"}
            hint={all ? undefined : "進行中＝簽約、施工中、驗收，或還有未完成任務的專案。切到「全部」可以看名冊上所有專案。"}
          />
        </Group>
      ) : (
        groups.map(([title, items]) => (
          <section key={title || "all"}>
            {title && (
              <div className="flex items-baseline justify-between px-1 pb-1.5">
                <h3 className="text-[15px] font-bold text-[#18181B]">{title}</h3>
                <span className="text-[13px] text-[#A1A1AA] tabular-nums">{items.length}</span>
              </div>
            )}
            <Group>
              {items.slice(0, all || q ? 200 : 100).map((p, i) => (
                <ProjectRow key={p.code} p={p} pm={pm} last={i === items.length - 1} onOpen={() => setOpen(p.code)} />
              ))}
            </Group>
          </section>
        ))
      )}

      <ProjectScreen pm={pm} code={open} onClose={() => setOpen(null)} />
      <ProjectInfoSheet pm={pm} code={null} open={creating} onClose={() => setCreating(false)} onCreated={(c) => setOpen(c)} />
    </div>
  );
}

function isActive(p: ProjectItem) {
  return (!!p.stage && ACTIVE_STAGES.includes(p.stage)) || p.openCount > 0;
}
function needsAttention(p: ProjectItem) {
  return ["逾期", "落後", "注意"].includes(p.view.health) || p.lateCount > 0;
}
function byHealth(a: ProjectItem, b: ProjectItem) {
  return healthRank(a.view.health) - healthRank(b.view.health) || b.code.localeCompare(a.code);
}

function Kpi({ label, value, unit, color, on, onClick }: { label: string; value: React.ReactNode; unit: string; color?: string; on?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`rounded-[14px] px-3 py-2.5 text-left border ${on ? "bg-[#18181B] border-[#18181B]" : "bg-white border-[#EBEBED]"} ${onClick ? "active:scale-[0.98] transition-transform" : ""}`}
    >
      <p className={`text-[12px] ${on ? "text-white/70" : "text-[#8E8E93]"}`}>{label}</p>
      <p className="mt-0.5">
        <span className="text-[24px] font-bold tabular-nums leading-none" style={{ color: on ? "#fff" : color ?? "#18181B" }}>
          {value}
        </span>
        <span className={`text-[12px] ml-1 ${on ? "text-white/70" : "text-[#A1A1AA]"}`}>{unit}</span>
      </p>
    </Tag>
  );
}

function ProjectRow({ p, pm, last, onOpen }: { p: ProjectItem; pm: Pm; last: boolean; onOpen: () => void }) {
  const h = p.view.health;
  const meta: string[] = [];
  if (p.view.ops?.progress !== undefined && h !== "未建檔") meta.push(`${p.view.ops.progress}%`);
  if (p.dueAt && !p.doneAt) meta.push(`預計 ${fmtDate(p.dueAt, pm.today)}`);
  if (p.manager) meta.push(p.manager);
  const warn = ["逾期", "落後", "注意"].includes(h);
  return (
    <button onClick={onOpen} className="relative w-full flex items-center gap-3 pl-4 pr-3 py-3 text-left active:bg-[#F7F7F8]">
      <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-[11.5px] font-bold tracking-tight" style={{ background: personColor(p.code) }}>
        {p.code}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="text-[16px] text-[#18181B] truncate">{p.name}</span>
          {warn && <Icon name={HEALTH_META[h].icon} fill={1} weight={400} className="text-[16px] shrink-0" style={{ color: HEALTH_META[h].color }} />}
        </span>
        <span className="block text-[13px] text-[#8E8E93] truncate">
          {warn && p.view.reason ? <span style={{ color: HEALTH_META[h].color }}>{p.view.reason}</span> : meta.join("　·　") || p.company}
        </span>
      </span>
      <span className="flex items-center gap-1 shrink-0">
        {p.lateCount > 0 && (
          <span className="h-6 min-w-6 px-1.5 rounded-full text-[12px] font-bold text-white flex items-center justify-center tabular-nums" style={{ background: RED }}>
            {p.lateCount}
          </span>
        )}
        {p.openCount > 0 && <span className="text-[15px] text-[#8E8E93] tabular-nums">{p.openCount}</span>}
        <Icon name="chevron_right" className="text-[20px] text-[#C7C7CC]" />
      </span>
      {!last && <span className="absolute left-[64px] right-0 bottom-0 h-px bg-[#EFEFF1]" aria-hidden />}
    </button>
  );
}
