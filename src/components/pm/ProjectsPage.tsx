"use client";

import React, { useMemo, useState } from "react";
import { ACTIVE_STAGES, fmtDate, fmtWan, healthRank, type Stage } from "@/lib/project-ops";
import { personColor } from "@/lib/pm/model";
import { HEALTH_META, Icon } from "./ui";
import { AvatarStack, Empty, Group, ORANGE, RED, Spinner } from "./kit";
import { ProjectScreen } from "./ProjectScreen";
import { ProjectInfoSheet } from "./ProjectInfoSheet";
import { SetupNotice } from "./SetupNotice";
import { usePm, type Pm, type ProjectItem } from "./usePm";
import { SearchOverlay } from "@/components/team/TeamPage";
import { GoalsPage } from "./Goals";
import { TaskSheet } from "./TaskSheet";
import { AllTasks } from "./TasksPage";
import { Workload } from "./Workload";
import { TaskSearchResults } from "./Reminders";
import type { Task } from "@/lib/pm/model";

/* ══════════════════════════════════════════════════════════
   專案情報（參考記帳 App：最上面一張總覽卡，下面是分類與明細）
   總覽卡：進行中幾個、各階段占比（色條）、施工中／需要注意／應收未收
   階段膠囊：點一下只看那個階段
   每個專案一列：代碼頭像（專案色，和任務清單的色條一致）、階段、進度條、未完成任務數
   ══════════════════════════════════════════════════════════ */

// 「目標」＝公司目標（原本在任務追蹤，移到這裡）
// 「專案」：進行中／全部改成下方篩選膠囊；「團隊」「工作量」（管理者）、「目標」＝公司目標
export const PROJECT_TABS = ["專案", "目標"];
// 「工作量」併進「團隊」：卡片右上角的圖示切換
export const PROJECT_TABS_MANAGER = ["專案", "團隊", "目標"];

const ORDER: Stage[] = ["施工中", "驗收", "簽約", "報價", "洽談", "暫停", "保固", "結案"];

/** 階段的顏色：流程由冷到暖（洽談→施工），收尾回到冷色 */
export const STAGE_COLOR: Record<Stage, string> = {
  洽談: "#A1A1AA",
  報價: "#8B5CF6",
  簽約: "#2F7FD8",
  施工中: "#F08A24",
  驗收: "#13A08A",
  保固: "#3A9A4F",
  結案: "#D4D4D8",
  暫停: "#71717A",
};

export default function ProjectsPage({
  activeTab,
  onTabChange,
  searchQuery = "",
  onSearchQuery,
  searchOpen = false,
  onSearchClose,
}: {
  activeTab: string;
  /** 工作量點某個人 → 跳到團隊分頁 */
  onTabChange?: (tab: string) => void;
  /** 標題列的搜尋（分享鍵左邊）：電腦直接篩選下方清單；手機跳出搜尋欄，結果列在搜尋欄下 */
  searchQuery?: string;
  onSearchQuery?: (q: string) => void;
  searchOpen?: boolean;
  onSearchClose?: () => void;
}) {
  const pm = usePm();
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // 目標／團隊分頁點任務：打開任務細節；團隊分頁的「＋」：新增任務
  const [taskId, setTaskId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState<Partial<Task> | null>(null);
  // 團隊分頁：只看某個人（undefined＝全部人；null＝未指派）
  const [person, setPerson] = useState<string | null | undefined>(undefined);
  // 團隊分頁：任務清單 ↔ 工作量
  const [teamMode, setTeamMode] = useState<"tasks" | "load">("tasks");
  const q = searchQuery;
  const [attention, setAttention] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);

  // 進行中（預設）或全部：用篩選膠囊切換
  const [all, setAll] = useState(false);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return pm.projects.filter((p) => {
      if (k && !`${p.code} ${p.name} ${p.company} ${p.manager ?? ""} ${p.client ?? ""}`.toLowerCase().includes(k)) return false;
      if (attention && !needsAttention(p)) return false;
      if (stage && p.stage !== stage) return false;
      if (!all && !k && !stage && !isActive(p)) return false;
      return true;
    });
  }, [pm.projects, q, attention, all, stage]);

  // 公司目標、團隊、工作量分頁
  if (pm.data && (activeTab === "目標" || (pm.isManager && activeTab === "團隊"))) {
    const openTask = (t: Task) => setTaskId(t.id);
    // 同一個位置一顆按鈕：目前是任務清單就顯示團隊圖示、工作量就顯示長條圖示，點一下切換
    const modeButton = (
      <button
        type="button"
        onClick={() => setTeamMode(teamMode === "tasks" ? "load" : "tasks")}
        aria-label={teamMode === "tasks" ? "目前：團隊任務，點一下看工作量" : "目前：工作量，點一下看團隊任務"}
        title={teamMode === "tasks" ? "看工作量" : "看團隊任務"}
        className="w-9 h-9 -mr-1.5 rounded-full flex items-center justify-center text-[#52525B] hover:bg-[#F4F4F5] active:bg-[#F4F4F5] transition-colors"
      >
        <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'wght' 200" }}>
          {teamMode === "tasks" ? "groups" : "equalizer"}
        </span>
      </button>
    );
    return (
      <div className="px-5 lg:px-10 pb-28 w-full flex flex-col gap-5">
        <SetupNotice pm={pm} />
        {activeTab === "目標" && <GoalsPage pm={pm} onOpenTask={openTask} />}
        {activeTab === "團隊" && teamMode === "load" && (
          <Workload
            pm={pm}
            headerAction={modeButton}
            onPick={(email) => {
              // 點某個人：回到任務清單、只看那個人
              setPerson(email);
              setTeamMode("tasks");
            }}
          />
        )}
        {activeTab === "團隊" && teamMode === "tasks" && (
          <>
            {/* 手機：標題列放大鏡 → 跳出搜尋欄，結果列在下方；電腦：左側欄的搜尋框，直接篩選下面的清單 */}
            <SearchOverlay open={searchOpen} query={q} onQuery={(v) => onSearchQuery?.(v)} onClose={() => onSearchClose?.()} placeholder="搜尋任務、專案、人" label="搜尋任務">
              <TaskSearchResults
                pm={pm}
                query={q}
                onOpen={(t) => {
                  onSearchClose?.();
                  openTask(t);
                }}
              />
            </SearchOverlay>
            <AllTasks pm={pm} onOpen={openTask} onAdd={(p) => setNewTask(p ?? {})} person={person} setPerson={setPerson} query={q} headerAction={modeButton} />
          </>
        )}
        <TaskSheet pm={pm} open={!!taskId} taskId={taskId} onClose={() => setTaskId(null)} />
        <TaskSheet pm={pm} open={!!newTask} taskId={null} preset={newTask ?? undefined} onClose={() => setNewTask(null)} />
      </div>
    );
  }

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
  const canMoney = pm.isManager;

  // 各階段數量（總覽色條與階段膠囊共用；結案不進色條）
  const stageCounts = ORDER.map((s) => [s, pm.projects.filter((p) => p.stage === s).length] as [Stage, number]).filter(([, n]) => n > 0);
  const barStages = stageCounts.filter(([s]) => s !== "結案");
  const barTotal = barStages.reduce((n, [, c]) => n + c, 0);

  // 依階段分組：篩階段、需要注意時也維持分組（版面不跳）；只有「全部」和搜尋改成依代碼排的一張清單
  const flat = all || !!q;
  const groups: [string, ProjectItem[]][] = flat
    ? [["", [...list].sort((a, b) => b.code.localeCompare(a.code))]]
    : ORDER.map((s) => [s, list.filter((p) => (p.stage ?? "") === s).sort(byHealth)] as [string, ProjectItem[]])
        .concat([["未設定階段", list.filter((p) => !p.stage).sort(byHealth)]])
        .filter(([, l]) => l.length);
  const stop = {
    onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
    onTouchMove: (e: React.TouchEvent) => e.stopPropagation(),
    onTouchEnd: (e: React.TouchEvent) => e.stopPropagation(),
  };

  return (
    <div className="px-5 lg:px-10 pb-28 w-full flex flex-col gap-5">
      <SetupNotice pm={pm} />

      {/* 總覽 */}
      <section className="rounded-[26px] bg-[#1C1C1F] text-white p-5 pb-4 shadow-[0_18px_40px_-22px_rgba(24,24,27,0.7)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] text-white/55">進行中專案</p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[44px] leading-none font-bold tabular-nums tracking-tight">{active.length}</span>
              <span className="text-[15px] text-white/55">個</span>
            </p>
          </div>
          {pm.isManager && pm.data.configured && !pm.data.dbError && (
            <button
              onClick={() => setCreating(true)}
              className="h-10 pl-3 pr-4 rounded-full text-white text-[14px] font-semibold inline-flex items-center gap-1 shrink-0 active:scale-95 transition-transform"
              style={{ background: ORANGE }}
            >
              <Icon name="add" weight={500} className="text-[20px]" />
              新專案
            </button>
          )}
        </div>

        {barTotal > 0 && (
          <>
            <div className="mt-4 flex h-2.5 rounded-full overflow-hidden gap-[2px]" aria-hidden>
              {barStages.map(([s, n]) => (
                <span key={s} className="first:rounded-l-full last:rounded-r-full" style={{ width: `${(n / barTotal) * 100}%`, background: STAGE_COLOR[s] }} />
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1">
              {barStages.map(([s, n]) => (
                <span key={s} className="inline-flex items-center gap-1.5 text-[12px] text-white/70">
                  <span className="w-2 h-2 rounded-full" style={{ background: STAGE_COLOR[s] }} aria-hidden />
                  {s}
                  <span className="tabular-nums text-white/45">{n}</span>
                </span>
              ))}
            </div>
          </>
        )}

        <div className={`mt-4 grid ${canMoney ? "grid-cols-3" : "grid-cols-2"} rounded-[18px] bg-white/[0.06] divide-x divide-white/10 overflow-hidden`}>
          <HeroStat label="施工中" value={building} unit="件" onClick={() => setStage(stage === "施工中" ? null : "施工中")} on={stage === "施工中"} />
          <HeroStat label="需要注意" value={attn.length} unit="件" tone={attn.length ? "#FF8A8D" : undefined} onClick={() => setAttention(!attention)} on={attention} />
          {canMoney && <HeroStat label="應收未收" value={fmtWan(receivable)} unit="萬" />}
        </div>
      </section>

      {/* 手機搜尋：放大鏡（標題列）→ 跳出搜尋欄，結果列在下方 */}
      <SearchOverlay open={searchOpen} query={q} onQuery={(v) => onSearchQuery?.(v)} onClose={() => onSearchClose?.()} placeholder="搜尋代碼、名稱、業主" label="搜尋專案">
        {q.trim() &&
          (list.length ? (
            <Group>
              {list.slice(0, 50).map((p, i, arr) => (
                <ProjectRow
                  key={p.code}
                  p={p}
                  pm={pm}
                  last={i === arr.length - 1}
                  showStage
                  onOpen={() => {
                    onSearchClose?.();
                    setOpen(p.code);
                  }}
                />
              ))}
            </Group>
          ) : (
            <Group>
              <Empty icon="search_off" title={`找不到「${q.trim()}」`} />
            </Group>
          ))}
      </SearchOverlay>

      {/* 篩選：進行中、全部、需要注意、各階段（一定顯示，才切得到「全部」） */}
      {(
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5 py-1 lg:mx-0 lg:px-0" {...stop}>
          <StageChip
            on={!all && !stage && !attention}
            onClick={() => {
              setAll(false);
              setStage(null);
              setAttention(false);
            }}
          >
            進行中
          </StageChip>
          <StageChip
            on={all && !stage && !attention}
            onClick={() => {
              setAll(true);
              setStage(null);
              setAttention(false);
            }}
            count={pm.projects.length}
          >
            全部
          </StageChip>
          {attn.length > 0 && (
            <StageChip on={attention} onClick={() => setAttention(!attention)} dot={RED} count={attn.length}>
              需要注意
            </StageChip>
          )}
          {stageCounts.map(([s, n]) => (
            <StageChip key={s} on={stage === s} onClick={() => setStage(stage === s ? null : s)} dot={STAGE_COLOR[s]} count={n}>
              {s}
            </StageChip>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <Group>
          <Empty
            icon="folder_open"
            title={q ? `找不到「${q}」` : stage ? `沒有「${stage}」的專案` : attention ? "沒有需要注意的專案" : all ? "沒有專案" : "沒有進行中的專案"}
            hint={all || stage || attention ? undefined : "進行中＝簽約、施工中、驗收，或還有未完成任務的專案。點上方的「全部」可以看名冊上所有專案。"}
          />
        </Group>
      ) : (
        groups.map(([title, items]) => {
          const shown = items.slice(0, flat ? 200 : 100);
          return (
            <section key={title || "all"}>
              {title && (
                <div className="flex items-center justify-between px-1 pb-2">
                  <h3 className="text-[14px] font-semibold text-[#52525B] flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: STAGE_COLOR[title as Stage] ?? "#D4D4D8" }} aria-hidden />
                    {title}
                  </h3>
                  <span className="text-[13px] text-[#A1A1AA] tabular-nums">{items.length}</span>
                </div>
              )}
              <Group>
                {shown.map((p, i) => (
                  <ProjectRow key={p.code} p={p} pm={pm} last={i === shown.length - 1} showStage={flat} onOpen={() => setOpen(p.code)} />
                ))}
              </Group>
            </section>
          );
        })
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

function HeroStat({
  label,
  value,
  unit,
  tone,
  onClick,
  on,
}: {
  label: string;
  value: React.ReactNode;
  unit: string;
  tone?: string;
  onClick?: () => void;
  on?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      aria-pressed={onClick ? !!on : undefined}
      className={`px-3 py-3 text-left min-w-0 transition-colors ${on ? "bg-white/[0.12]" : ""} ${onClick ? "active:bg-white/[0.12]" : ""}`}
    >
      {/* 標籤列固定高度：篩選中多出的漏斗圖示不會把卡片撐高 */}
      <p className="h-[18px] text-[12px] leading-[18px] text-white/55 flex items-center gap-1 whitespace-nowrap">
        {label}
        {on && <Icon name="filter_alt" fill={1} className="text-[13px] leading-none text-white/70" />}
      </p>
      <p className="mt-0.5 whitespace-nowrap">
        <span className="text-[22px] font-bold tabular-nums leading-none" style={{ color: tone ?? "#fff" }}>
          {value}
        </span>
        <span className="text-[12px] ml-1 text-white/45">{unit}</span>
      </p>
    </Tag>
  );
}

function StageChip({ on, onClick, dot, count, children }: { on: boolean; onClick: () => void; dot?: string; count?: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-9 px-3.5 rounded-full text-[14px] whitespace-nowrap inline-flex items-center gap-1.5 shrink-0 transition-colors ${
        on ? "bg-[var(--accent)] text-white" : "bg-white ring-1 ring-inset ring-black/[0.06] text-[#3F3F46] active:bg-[#F4F4F5]"
      }`}
    >
      {/* 選中時底色是橘色：圓點改白色（施工中的橘點才看得到） */}
      {dot && <span className="w-2 h-2 rounded-full" style={{ background: on ? "#fff" : dot }} aria-hidden />}
      {children}
      {count !== undefined && <span className={`text-[12px] tabular-nums ${on ? "text-white/70" : "text-[#A1A1AA]"}`}>{count}</span>}
    </button>
  );
}

function ProjectRow({ p, pm, last, showStage, onOpen }: { p: ProjectItem; pm: Pm; last: boolean; showStage: boolean; onOpen: () => void }) {
  const h = p.view.health;
  const warn = ["逾期", "落後", "注意"].includes(h);
  const progress = h !== "未建檔" ? p.view.ops?.progress : undefined;
  const meta: string[] = [];
  if (p.dueAt && !p.doneAt) meta.push(`預計 ${fmtDate(p.dueAt, pm.today)}`);
  if (p.manager) meta.push(p.manager);
  if (!meta.length && p.company) meta.push(p.company);
  const barColor = warn ? HEALTH_META[h].color : p.stage ? STAGE_COLOR[p.stage] : "#A1A1AA";
  const stageText = p.stage && STAGE_COLOR[p.stage] !== "#D4D4D8" ? STAGE_COLOR[p.stage] : "#A1A1AA";

  return (
    <button onClick={onOpen} className="relative w-full flex items-center gap-3.5 pl-4 pr-3 py-3.5 text-left active:bg-[#F7F7F8]">
      <span
        className="w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0 text-white text-[12px] font-bold tracking-tight tabular-nums"
        style={{ background: personColor(p.code) }}
      >
        {p.code}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-[16px] leading-[22px] font-medium text-[#18181B] truncate">{p.name}</span>
          {warn && <Icon name={HEALTH_META[h].icon} fill={1} weight={400} className="text-[16px] shrink-0" style={{ color: HEALTH_META[h].color }} />}
        </span>
        <span className="flex items-center gap-1.5 min-w-0 text-[13px] leading-[18px] text-[#A1A1AA] mt-0.5">
          {showStage && p.stage && (
            <span className="shrink-0 font-medium" style={{ color: stageText }}>
              {p.stage}
            </span>
          )}
          <span className="truncate" style={warn && p.view.reason ? { color: HEALTH_META[h].color } : undefined}>
            {warn && p.view.reason ? p.view.reason : meta.join("、")}
          </span>
        </span>
        {progress !== undefined && (
          <span className="mt-2 flex items-center gap-2" aria-label={`進度 ${progress}%`}>
            <span className="flex-1 h-1.5 rounded-full bg-[#F0F0F2] overflow-hidden">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, progress))}%`, background: barColor }} />
            </span>
            <span className="text-[12px] tabular-nums text-[#71717A] w-9 text-right">{progress}%</span>
          </span>
        )}
      </span>
      <span className="flex items-center gap-1.5 shrink-0 self-center">
        {p.participants.length > 0 && (
          <span className="hidden min-[400px]:block">
            <AvatarStack people={p.participants} max={3} size={24} label={`${p.participants.length} 位參與者`} />
          </span>
        )}
        {p.lateCount > 0 ? (
          <span
            className="h-6 min-w-6 px-1.5 rounded-full text-[12px] font-bold text-white flex items-center justify-center tabular-nums"
            style={{ background: RED }}
            title={`${p.lateCount} 件逾期`}
          >
            {p.lateCount}
          </span>
        ) : (
          p.openCount > 0 && (
            <span className="h-6 min-w-6 px-1.5 rounded-full text-[12px] font-semibold flex items-center justify-center tabular-nums bg-[#F4F4F5] text-[#52525B]" title={`${p.openCount} 件未完成`}>
              {p.openCount}
            </span>
          )
        )}
        <Icon name="chevron_right" className="text-[20px] text-[#D4D4D8]" />
      </span>
      {!last && <span className="absolute left-[74px] right-0 bottom-0 h-px bg-[#F4F4F5]" aria-hidden />}
    </button>
  );
}
