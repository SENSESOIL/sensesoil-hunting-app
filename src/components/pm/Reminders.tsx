"use client";

import { IconCheck, IconPencil } from "@tabler/icons-react";
import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addDays, toDay } from "@/lib/project-ops";
import { isAssignee, newSectionId, newTaskId, personColor, taskAssignees, type Task } from "@/lib/pm/model";
import { metaChips, tagKeys } from "@/lib/pm/tags";
import { Icon } from "./ui";
import { Avatar, CheckCircle, dueLabel, ORANGE, RED } from "./kit";
import { Sheet, toast } from "./Sheet";
import { ProjectPicker } from "./TaskSheet";
import { TaskGantt } from "./TaskGantt";
import { ScheduleSheet } from "./ScheduleSheet";
import { ProjectInfoSheet } from "./ProjectInfoSheet";
import { TaskBoard } from "./TaskBoard";
import { TagSheet } from "./TagSheet";
import { assigneeLabel, assigneePatch, canEditProject, isLate, personLabel, personMark, type Pm } from "./usePm";
import { OTHER_SECTION, realSections, sectionOf, splitBySection, treeOrder, type TreeRow } from "./tree";

export { treeOrder };

/* ══════════════════════════════════════════════════════════
   任務追蹤（Apple 提醒事項風格）
   - 首頁：智慧清單（今天、已排程、全部、重要…）＋ 專案清單 ＋ 標籤
   - 專案頁：直接在清單裡打字新增，Enter 接著下一個；點名稱就能改
   - 右滑：縮排／取消縮排（子任務只有一層，順序與甘特圖同步）
   - 左滑：重要、刪除；長按（或右鍵）：完整選單（期限、標籤、指派、移到專案…）
   ══════════════════════════════════════════════════════════ */

export type SmartId = "today" | "scheduled" | "all" | "flagged" | "mine" | "done";
export type ListRoute =
  | { kind: "home" }
  | { kind: "project"; code: string }
  | { kind: "smart"; id: SmartId }
  | { kind: "tag"; tag: string }
  | { kind: "calendar" }
  | { kind: "team" };

export const SMART: Record<SmartId, { label: string; icon: string; color: string }> = {
  today: { label: "今天", icon: "today", color: "#2F7FD8" },
  scheduled: { label: "已排程", icon: "calendar_month", color: "#E5484D" },
  all: { label: "全部", icon: "inbox", color: "#3F3F46" },
  flagged: { label: "重要", icon: "flag", color: "#F39C12" },
  mine: { label: "指派給我", icon: "person", color: "#7C3AED" },
  done: { label: "已完成", icon: "check", color: "#8E8E93" },
};

export function smartTasks(pm: Pm, id: SmartId): Task[] {
  const { today } = pm;
  const open = pm.tasks.filter((t) => t.status !== "done");
  switch (id) {
    case "today":
      return open.filter((t) => (t.due && t.due <= today) || (t.start && t.start <= today && (!t.due || t.due >= today)));
    case "scheduled":
      return open.filter((t) => t.due && t.due > today);
    case "flagged":
      return open.filter((t) => t.flagged);
    case "mine":
      return open.filter((t) => isAssignee(t, pm.me?.email));
    case "done":
      return pm.tasks.filter((t) => t.status === "done" && (t.doneAt ?? "") >= addDays(today, -30));
    default:
      return open;
  }
}

const canEditAll = (pm: Pm, t: Task) => canEditProject(pm, t.code) || t.createdBy === pm.me?.email;
const canToggle = (pm: Pm, t: Task) => pm.isManager || isAssignee(t, pm.me?.email) || t.createdBy === pm.me?.email;

/* ══════════════════════════════════════════════════════════
   首頁
   ══════════════════════════════════════════════════════════ */

/** 搜尋：任務名稱、備註、標籤 */
export function searchTasks(pm: Pm, q: string): Task[] {
  const k = q.trim().toLowerCase();
  if (!k) return [];
  return pm.tasks.filter(
    (t) => t.title.toLowerCase().includes(k) || (t.note ?? "").toLowerCase().includes(k) || tagKeys(t.meta).some((x) => x.toLowerCase().includes(k))
  );
}

/** 搜尋結果（手機在跳出的搜尋欄下方、電腦取代清單） */
export function TaskSearchResults({ pm, query, onOpen }: { pm: Pm; query: string; onOpen: (t: Task) => void }) {
  const results = useMemo(() => searchTasks(pm, query), [pm, query]);
  if (!query.trim()) return null;
  return results.length ? (
    <ReminderTasks pm={pm} tasks={results} grouped showDone onOpen={onOpen} />
  ) : (
    <p className="text-center text-[15px] text-[#8E8E93] py-10">找不到「{query.trim()}」</p>
  );
}

/** 置頂的專案（存在這支裝置，依帳號分開） */
function usePinned(email?: string): [string[], (code: string) => void] {
  const key = `pm:pinned:${email ?? ""}`;
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? "[]");
      setList(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
    } catch {
      setList([]);
    }
  }, [key]);
  const toggle = (code: string) =>
    setList((cur) => {
      const next = cur.includes(code) ? cur.filter((c) => c !== code) : [code, ...cur];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* 無痕模式 */
      }
      return next;
    });
  return [list, toggle];
}

export function RemindersHome({ pm, go }: { pm: Pm; go: (r: ListRoute) => void }) {
  const [allProjects, setAllProjects] = useState(false);
  const [pinned, togglePin] = usePinned(pm.me?.email);
  // 長按專案：置頂、編輯（刪除＝封存，在編輯裡面）
  const [projMenu, setProjMenu] = useState<{ code: string; rect: DOMRect } | null>(null);
  const [editCode, setEditCode] = useState<string | null>(null);

  const projects = useMemo(() => {
    const active = (p: (typeof pm.projects)[number]) => p.tasks.length > 0 || (p.stage && ["簽約", "施工中", "驗收"].includes(p.stage));
    return pm.projects
      .filter((p) => !p.archived && (pm.isManager ? true : p.tasks.length > 0))
      .sort((a, b) => Number(!!active(b)) - Number(!!active(a)) || b.openCount - a.openCount || b.code.localeCompare(a.code))
      .map((p) => ({ p, active: !!active(p) }));
  }, [pm]);
  // 置頂的排最前面，而且一定顯示（不受「只顯示進行中」限制）
  const pinnedRows = pinned.map((c) => projects.find((x) => x.p.code === c)).filter((x): x is (typeof projects)[number] => !!x);
  const rest = projects.filter((x) => !pinned.includes(x.p.code));
  const shownProjects = [...pinnedRows, ...(allProjects ? rest : rest.filter((x) => x.active).slice(0, 12))];
  const hiddenCount = projects.length - shownProjects.length;

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of pm.tasks) if (t.status !== "done") for (const k of tagKeys(t.meta)) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [pm.tasks]);

  return (
    <div className="flex flex-col gap-6 pt-1">
      <>
          {/* 專案（智慧清單已移到「行事曆」分頁的篩選，這裡直接列專案） */}
          <section>
            {shownProjects.length ? (
              <div className="bg-white rounded-[16px] shadow-card overflow-hidden">
                {shownProjects.map(({ p }) => (
                  <ListRow
                    key={p.code}
                    badge={p.code}
                    color={personColor(p.code)}
                    label={p.name}
                    count={p.openCount}
                    pinned={pinned.includes(p.code)}
                    onClick={() => go({ kind: "project", code: p.code })}
                    onLongPress={(rect) => setProjMenu({ code: p.code, rect })}
                  />
                ))}
                {(hiddenCount > 0 || allProjects) && (
                  // 公司的專案（拾壤CRM 名冊）都已經在這裡，只是沒有任務的先收起來；展開找到專案就能直接寫任務，不用另外新增專案
                  <button
                    type="button"
                    onClick={() => setAllProjects((v) => !v)}
                    aria-expanded={allProjects}
                    className="w-full h-11 px-4 flex items-center justify-center gap-0.5 text-[15px] text-[var(--accent)] font-medium active:bg-[#F4F4F5]"
                  >
                    {allProjects ? "收起沒有任務的專案" : "展開其他專案新增任務排程"}
                    <Icon name={allProjects ? "expand_less" : "expand_more"} className="text-[20px]" />
                  </button>
                )}
              </div>
            ) : (
              <p className="px-1 text-[14px] text-[#8E8E93]">還沒有專案。</p>
            )}
          </section>

          {/* 標籤 */}
          {tags.length > 0 && (
            <section>
              <h2 className="px-1 pb-2 text-[22px] font-bold tracking-tight text-[#18181B]">標籤</h2>
              <div className="bg-white rounded-[16px] shadow-card p-3 flex flex-wrap gap-2">
                {tags.map(([k, n]) => (
                  <button key={k} type="button" onClick={() => go({ kind: "tag", tag: k })} className="h-9 px-3.5 rounded-full bg-[#F2F2F4] text-[15px] text-[#3F3F46] active:bg-[#E4E4E7]">
                    {k.startsWith("#") ? k : `#${k}`}
                    <span className="ml-1.5 text-[12px] text-[#A1A1AA] tabular-nums">{n}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
      </>
      {projMenu && (
        <ProjectMenu
          rect={projMenu.rect}
          pinned={pinned.includes(projMenu.code)}
          canEdit={pm.isManager}
          onClose={() => setProjMenu(null)}
          onPin={() => togglePin(projMenu.code)}
          onEdit={() => setEditCode(projMenu.code)}
        />
      )}
      {pm.isManager && <ProjectInfoSheet pm={pm} code={editCode} open={!!editCode} onClose={() => setEditCode(null)} />}
    </div>
  );
}

/** 清單列：左邊圓形圖示，或專案代碼方塊（badge，和專案情報一樣），名稱一行 */
function ListRow({
  icon,
  badge,
  color,
  label,
  hint,
  count,
  pinned,
  onClick,
  onLongPress,
}: {
  icon?: string;
  badge?: string;
  color: string;
  label: string;
  hint?: string;
  count?: number;
  pinned?: boolean;
  onClick: () => void;
  /** 長按（或滑鼠右鍵）：叫出選單 */
  onLongPress?: (rect: DOMRect) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => {
        if (fired.current) {
          fired.current = false;
          return;
        }
        onClick();
      }}
      onPointerDown={
        onLongPress
          ? (e) => {
              if (e.pointerType === "mouse") return;
              fired.current = false;
              start.current = { x: e.clientX, y: e.clientY };
              clear();
              timer.current = setTimeout(() => {
                fired.current = true;
                window.getSelection()?.removeAllRanges();
                try {
                  navigator.vibrate?.(10);
                } catch {
                  /* iPhone 不支援震動 */
                }
                if (ref.current) onLongPress(ref.current.getBoundingClientRect());
              }, 450);
            }
          : undefined
      }
      onPointerMove={(e) => {
        if (start.current && (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8)) clear();
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
      onContextMenu={
        onLongPress
          ? (e) => {
              e.preventDefault();
              clear();
              if (ref.current) onLongPress(ref.current.getBoundingClientRect());
            }
          : undefined
      }
      style={onLongPress ? { WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" } : undefined}
      className="w-full flex items-center gap-3 pl-3 pr-2.5 min-h-[54px] text-left active:bg-[#F4F4F5] group"
    >
      {badge ? (
        <span className="w-9 h-9 rounded-[10px] flex items-center justify-center text-white shrink-0 text-[11.5px] font-bold tracking-tight" style={{ background: color }}>
          {badge}
        </span>
      ) : (
        <span className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: color }}>
          <Icon name={icon ?? "format_list_bulleted"} weight={500} className="text-[18px]" />
        </span>
      )}
      <span className="flex-1 min-w-0 self-stretch flex items-center gap-2 border-b border-[#F0F0F2] group-last:border-b-0 pr-1">
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="block text-[16px] text-[#18181B] truncate">{label}</span>
            {pinned && <Icon name="keep" fill={1} className="text-[15px] text-[#A1A1AA] shrink-0" aria-label="已置頂" />}
          </span>
          {hint && <span className="block text-[12px] text-[#A1A1AA] truncate -mt-0.5">{hint}</span>}
        </span>
        {count !== undefined && <span className="text-[16px] text-[#8E8E93] tabular-nums">{count}</span>}
        <Icon name="chevron_right" className="text-[20px] text-[#C7C7CC]" />
      </span>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════
   清單頁（專案、智慧清單、標籤）
   ══════════════════════════════════════════════════════════ */

type PageView = "list" | "board" | "gantt";

function useStoredView(): [PageView, (v: PageView) => void] {
  const [v, setV] = useState<PageView>("list");
  useEffect(() => {
    try {
      const s = localStorage.getItem("pm:my:view");
      if (s === "list" || s === "board" || s === "gantt") setV(s);
    } catch {
      /* 讀不到就用清單 */
    }
  }, []);
  return [
    v,
    (n) => {
      setV(n);
      try {
        localStorage.setItem("pm:my:view", n);
      } catch {
        /* 忽略 */
      }
    },
  ];
}

export function ReminderPage({
  pm,
  title,
  color,
  subtitle,
  tasks,
  code,
  grouped,
  onBack,
  onOpen,
  onAddFull,
  showDoneDefault,
}: {
  pm: Pm;
  title: string;
  color: string;
  subtitle?: string;
  tasks: Task[];
  /** 專案頁：可以直接打字新增、縮排 */
  code?: string;
  /** 跨專案（智慧清單、標籤）：依專案分組 */
  grouped?: boolean;
  onBack: () => void;
  onOpen: (t: Task) => void;
  /** 跨專案頁按「＋」：開完整表單 */
  onAddFull?: () => void;
  /** 一進來就顯示已完成（「已完成」清單） */
  showDoneDefault?: boolean;
}) {
  const [showDone, setShowDone] = useState(!!showDoneDefault);
  const [view, setView] = useStoredView();
  const [addSignal, setAddSignal] = useState(0);
  // 返回鍵和內容（標題、卡片）的左緣對齊：電腦要讓開側欄，內容的左右留白也會依寬度變（側欄收合、展開跟著量）
  const pageRef = useRef<HTMLDivElement>(null);
  const [contentLeft, setContentLeft] = useState(20);
  useEffect(() => {
    const el = pageRef.current;
    const main = document.querySelector("main");
    if (!el) return;
    const measure = () => setContentLeft(Math.max(0, Math.round(el.getBoundingClientRect().left)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (main) ro.observe(main);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  // 甘特圖：預設閱讀模式，按「編輯」才能拖曳調整（離開甘特圖就回到閱讀）
  const [ganttEdit, setGanttEdit] = useState(false);
  const pageView: PageView = code ? view : "list";
  const doneCount = tasks.filter((t) => t.status === "done").length;
  // 專案頁：清單裡每段最後都有虛線圓點可以直接打字新增，不放右下「＋」；跨專案頁（今天、重要…）才用「＋」開完整表單
  const canAdd = !code && !!onAddFull;

  // 檢視切換放進標題列分頁那一排的右邊（hunting-mgmt 的 #pm-header-slot）
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById("pm-header-slot")), []);

  // 專案頁：清單／看板／甘特圖三個圖示直接切換（不用打開選單）；跨專案頁只有「顯示已完成」
  const VIEWS: [PageView, string, string][] = [
    ["list", "format_list_bulleted", "清單"],
    ["board", "view_kanban", "看板"],
    ["gantt", "view_timeline", "甘特圖"],
  ];
  const cur = VIEWS.find(([v]) => v === view) ?? VIEWS[0];
  const next = VIEWS[(VIEWS.indexOf(cur) + 1) % VIEWS.length];
  // 專案頁：同一個位置一顆按鈕，點一下換下一種檢視（清單 → 看板 → 甘特圖）；跨專案頁只有「顯示已完成」
  const canGantt = !!code && pageView === "gantt" && canEditProject(pm, code);
  const editButton = canGantt ? (
    <button
      type="button"
      onClick={() => setGanttEdit((v) => !v)}
      aria-pressed={ganttEdit}
      aria-label={ganttEdit ? "完成編輯，回到閱讀模式" : "編輯甘特圖"}
      title={ganttEdit ? "完成編輯" : "編輯"}
      className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${ganttEdit ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "text-[#71717A] hover:bg-[#F4F4F5] active:bg-[#F4F4F5]"}`}
    >
      {ganttEdit ? <IconCheck size={21} stroke={1.15} /> : <IconPencil size={21} stroke={1.15} />}
    </button>
  ) : null;
  const menuButton = code ? (
    <div className="flex items-center gap-1">
    {editButton}
    <button
      type="button"
      onClick={() => {
        setGanttEdit(false);
        setView(next[0]);
      }}
      aria-label={`檢視：${cur[2]}，點一下換成${next[2]}`}
      title={`換成${next[2]}`}
      className="w-9 h-9 rounded-full flex items-center justify-center text-[#71717A] hover:bg-[#F4F4F5] active:bg-[#F4F4F5] transition-colors"
    >
      <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'wght' 200" }}>
        {cur[1]}
      </span>
    </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setShowDone((v) => !v)}
      aria-pressed={showDone}
      aria-label={showDone ? "隱藏已完成" : "顯示已完成"}
      title={showDone ? "隱藏已完成" : "顯示已完成"}
      className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${showDone ? "bg-[#F4F4F5] text-[var(--accent)]" : "text-[#71717A] hover:bg-[#F4F4F5]"}`}
    >
      <Icon name={showDone ? "visibility" : "visibility_off"} weight={200} className="text-[22px]" />
    </button>
  );
  const add = () => {
    if (code) {
      // 在點擊當下先叫出鍵盤（iPhone 只在使用者點擊的那一刻允許），新的一列出現後再把游標交給它
      primeKeyboard();
      if (pageView !== "list") setView("list");
      setAddSignal((n) => n + 1);
    } else onAddFull?.();
  };

  return (
    <div ref={pageRef} className="flex flex-col gap-3">
      {slot ? createPortal(menuButton, slot) : <div className="flex justify-end">{menuButton}</div>}


      <div className="px-1 pt-1">
        <h1 className="text-[32px] leading-[38px] font-bold tracking-tight" style={{ color }}>
          {title}
        </h1>
        {subtitle && <p className="text-[13px] text-[#8E8E93] mt-0.5">{subtitle}</p>}
      </div>

      {pageView === "list" && (
        <ReminderTasks pm={pm} tasks={tasks} code={code} grouped={grouped} showDone={showDone} onOpen={onOpen} addSignal={addSignal} color={color} tapToAdd />
      )}
      {pageView === "board" && <TaskBoard pm={pm} tasks={tasks} onOpen={onOpen} onAdd={add} />}
      {code && pageView !== "board" && (
        <button
          type="button"
          onClick={() => setShowDone((v) => !v)}
          className="self-center h-9 px-4 rounded-full text-[13px] text-[#8E8E93] active:bg-[#F4F4F5] inline-flex items-center gap-1.5 order-last"
        >
          <Icon name={showDone ? "visibility_off" : "visibility"} className="text-[17px]" />
          {showDone ? "隱藏已完成" : `顯示已完成${doneCount ? `（${doneCount}）` : ""}`}
        </button>
      )}
      {pageView === "gantt" && <TaskGantt pm={pm} tasks={tasks.filter((t) => showDone || t.status !== "done")} onOpen={onOpen} editable={ganttEdit && canGantt} project={code} />}

      {/* 手機：返回（左下）與新增（右下）放在原本底部導覽列的位置 */}
      <button
        type="button"
        onClick={onBack}
        aria-label="返回"
        title="返回"
        className="fixed z-40 w-14 h-14 rounded-full bg-white shadow-[0_6px_20px_rgba(0,0,0,0.14)] flex items-center justify-center active:scale-95 transition-transform"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)", left: contentLeft }}
      >
        <Icon name="chevron_left" weight={500} className="text-[28px] text-[#18181B]" />
      </button>
      {canAdd && (
        <button
          type="button"
          onClick={add}
          aria-label="新增任務"
          className="fixed z-40 right-5 md:right-10 md:!bottom-8 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-[0_8px_20px_rgba(243,156,18,0.4)] active:scale-95 transition-transform"
          style={{ background: ORANGE, bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
        >
          <Icon name="add" weight={500} className="text-[30px]" />
        </button>
      )}
    </div>
  );
}

/** 在使用者點擊的當下先讓一個暫時的輸入框取得焦點，鍵盤就會跳出來；
 *  之後新出現的輸入框再接手焦點時，鍵盤會留著（iPhone 不允許在點擊之後才叫出鍵盤） */
export function primeKeyboard() {
  if (typeof document === "undefined") return;
  const tmp = document.createElement("input");
  tmp.setAttribute("aria-hidden", "true");
  tmp.style.cssText = "position:fixed;top:40%;left:0;opacity:0;height:0;width:1px;font-size:16px;border:0;padding:0;";
  document.body.appendChild(tmp);
  tmp.focus();
  setTimeout(() => tmp.remove(), 1000);
}

function MenuItem({ icon, label, onClick, checked, danger, disabled }: { icon: string; label: string; onClick: () => void; checked?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 h-11 text-left text-[16px] active:bg-[#F4F4F5] disabled:opacity-40 ${danger ? "text-[#E5484D]" : "text-[#18181B]"}`}
    >
      <span className="w-5 flex justify-center">{checked && <Icon name="check" weight={600} className="text-[18px]" />}</span>
      <span className="flex-1">{label}</span>
      <Icon name={icon} className="text-[20px] opacity-80" />
    </button>
  );
}

/* ══════════════════════════════════════════════════════════
   清單本體（專案頁、智慧清單、專案情報裡的任務分頁共用）
   ══════════════════════════════════════════════════════════ */

const LINGER_MS = 1200;

interface Draft {
  id: string;
  parentId?: string;
  /** 插在哪一列後面；沒有就加在最後 */
  afterId?: string;
  /** 新任務放進哪個分組（"" 或沒有＝其他） */
  section?: string;
}

/** 清單列的底色＝所在頁面的底色（像提醒事項一樣沒有卡片；滑動時要蓋住後面的按鈕） */
const RowBg = createContext("bg-[#FAFAFA]");

export function ReminderTasks({
  pm,
  tasks,
  code,
  grouped,
  showDone,
  onOpen,
  addSignal,
  color = ORANGE,
  tapToAdd,
  addRow,
  surface = "page",
}: {
  pm: Pm;
  tasks: Task[];
  code?: string;
  grouped?: boolean;
  showDone?: boolean;
  onOpen: (t: Task) => void;
  /** 數字一變就在最後新增一列（右下「＋」） */
  addSignal?: number;
  color?: string;
  /** 點清單下方空白處新增 */
  tapToAdd?: boolean;
  /** 清單最後顯示「新增任務」列 */
  addRow?: boolean;
  /** 放在哪種底色上：一般頁面（淺灰）或白底的子畫面 */
  surface?: "page" | "white";
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [linger, setLinger] = useState<Set<string>>(new Set());
  const [swiped, setSwiped] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ task: Task; rect: DOMRect; depth: 0 | 1 } | null>(null);
  // 長按 → 期限 → 自訂日期…：時間安排
  const [schedId, setSchedId] = useState<string | null>(null);
  const [tagFor, setTagFor] = useState<string | null>(null);
  const [moveFor, setMoveFor] = useState<Task | null>(null);
  // 分組：收合、改名中
  const [foldSec, setFoldSec] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const projSections = useMemo(() => (code && !grouped ? pm.projectBy.get(code)?.sections ?? [] : []), [pm.projectBy, code, grouped]);
  const taskById = useMemo(() => new Map(pm.tasks.map((t) => [t.id, t])), [pm.tasks]);
  const validSec = useMemo(() => new Set(realSections(projSections).map((s) => s.id)), [projSections]);
  const secOf = (t: Task) => sectionOf(t, taskById, validSec);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // 右下「＋」：在最後加一列
  const lastSignal = useRef(addSignal ?? 0);
  useEffect(() => {
    if (addSignal === undefined || addSignal === lastSignal.current) return;
    lastSignal.current = addSignal;
    if (code) startDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addSignal]);

  /** 這個專案全部的任務（含已完成），順序以這份為準 */
  const projectAll = useMemo(() => (code ? pm.tasks.filter((t) => t.code === code) : []), [pm.tasks, code]);

  const visible = useMemo(() => tasks.filter((t) => showDone || t.status !== "done" || linger.has(t.id)), [tasks, showDone, linger]);

  const sections = useMemo((): { code: string; rows: TreeRow[]; sectionId?: string; sectionName?: string }[] => {
    // 專案有分組：每個分組一段，最後是「其他」
    if (!grouped && realSections(projSections).length)
      return splitBySection(visible, projSections, taskById).map((g) => ({ code: code ?? "", rows: treeOrder(g.tasks), sectionId: g.id, sectionName: g.name }));
    if (!grouped) return [{ code: code ?? "", rows: treeOrder(visible) }];
    const by = new Map<string, Task[]>();
    for (const t of visible) by.set(t.code, [...(by.get(t.code) ?? []), t]);
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([c, list]) => ({ code: c, rows: treeOrder(list) }));
  }, [visible, grouped, code, projSections, taskById]);

  const toggleDone = (t: Task) => {
    const done = t.status !== "done";
    if (done && !showDone) {
      setLinger((s) => new Set(s).add(t.id));
      clearTimeout(timers.current.get(t.id));
      timers.current.set(
        t.id,
        setTimeout(() => setLinger((s) => {
          const n = new Set(s);
          n.delete(t.id);
          return n;
        }), LINGER_MS)
      );
    }
    pm.saveTask({ id: t.id, status: done ? "done" : "todo" });
  };

  /* ── 新增與編輯 ── */

  const startDraft = (after?: Task, section?: string) => {
    if (!code) return;
    setSwiped(null);
    const parentId = after ? after.parentId ?? undefined : undefined;
    setDraft({ id: newTaskId(), parentId, afterId: after?.id, section: after ? secOf(after) : section ?? "" });
    setEditing(null);
  };

  /* ── 分組 ── */

  /** 移到分組（子任務一起）；"new"＝新增一個分組再移過去 */
  const moveToSection = (t: Task, sid: string) => {
    if (!code) return;
    let target = sid;
    if (sid === "new") {
      target = newSectionId();
      pm.saveSections(code, [...projSections, { id: target, name: "新分組" }]);
      setRenaming(target);
    }
    const kids = pm.tasks.filter((x) => x.parentId === t.id);
    for (const x of [t, ...kids]) {
      const meta = { ...(x.meta ?? {}) };
      if (target) meta.section = target;
      else delete meta.section;
      pm.saveTask({ id: x.id, meta });
    }
  };
  const addSection = () => {
    if (!code) return;
    const id = newSectionId();
    pm.saveSections(code, [...projSections, { id, name: "新分組" }]);
    setRenaming(id);
  };
  const renameSection = (id: string, name: string) => {
    setRenaming(null);
    const n = name.trim();
    const key = id || OTHER_SECTION;
    const cur = projSections.find((s) => s.id === key)?.name ?? (key === OTHER_SECTION ? "其他" : "");
    if (!code || !n || cur === n) return;
    pm.saveSections(code, projSections.some((s) => s.id === key) ? projSections.map((s) => (s.id === key ? { ...s, name: n } : s)) : [...projSections, { id: key, name: n }]);
  };
  // 分組長按選單：上移、下移、重新命名、刪除
  const [secMenu, setSecMenu] = useState<{ id: string; rect: DOMRect } | null>(null);
  const moveSection = (id: string, dir: -1 | 1) => {
    if (!code) return;
    const real = realSections(projSections);
    const i = real.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= real.length) return;
    const next = [...real];
    [next[i], next[j]] = [next[j], next[i]];
    // 「其他」的名稱設定（不是真的分組）接在後面保留
    pm.saveSections(code, [...next, ...projSections.filter((x) => x.id === OTHER_SECTION)]);
  };
  const deleteSection = (id: string) => {
    setRenaming(null);
    if (!code) return;
    const before = projSections;
    pm.saveSections(code, before.filter((s) => s.id !== id));
    // 任務不用改：分組不在了就自動回到「其他」
    toast("已刪除分組，裡面的任務移到「其他」", { action: { label: "復原", run: () => pm.saveSections(code, before) } });
  };

  /** 依顯示順序算出整個專案的新順序（新任務插在指定位置） */
  const orderWith = (newId: string, afterId?: string, parentId?: string): string[] => {
    const rows = treeOrder(projectAll).map((r) => r.task.id);
    if (!afterId) {
      if (parentId) {
        // 加在上層的最後一個子任務後面
        const lastChild = treeOrder(projectAll).filter((r) => r.task.parentId === parentId).pop();
        const anchor = lastChild?.task.id ?? parentId;
        const i = rows.indexOf(anchor);
        rows.splice(i + 1, 0, newId);
        return rows;
      }
      return [...rows, newId];
    }
    const anchor = projectAll.find((t) => t.id === afterId);
    let i = rows.indexOf(afterId);
    // 上層任務後面新增：接在它的子任務之後
    if (anchor && !anchor.parentId) {
      while (i + 1 < rows.length && projectAll.find((t) => t.id === rows[i + 1])?.parentId === afterId) i++;
    }
    rows.splice(i + 1, 0, newId);
    return rows;
  };

  const commitDraft = (title: string, next: boolean) => {
    const d = draft;
    if (!d || !code) return;
    const text = title.trim();
    if (!text) {
      setDraft(null);
      return;
    }
    const order = orderWith(d.id, d.afterId, d.parentId);
    const p = pm.saveTask({ id: d.id, code, title: text, ...(d.parentId ? { parentId: d.parentId } : {}), ...(d.section && !d.parentId ? { meta: { section: d.section } } : {}) });
    pm.reorderTasks(order, { localOnly: true });
    p.then((saved) => saved && pm.reorderTasks(order));
    if (next) setDraft({ id: newTaskId(), parentId: d.parentId, afterId: d.id, section: d.section });
    else setDraft(null);
  };

  const commitEdit = (t: Task, title: string, next: boolean) => {
    const text = title.trim();
    setEditing(null);
    if (text && text !== t.title) pm.saveTask({ id: t.id, title: text });
    if (next && code) startDraft(t);
  };

  /* ── 縮排 ── */

  const indent = (t: Task) => {
    if (!code) return;
    const rows = treeOrder(projectAll);
    const i = rows.findIndex((r) => r.task.id === t.id);
    const prevTop = rows.slice(0, i).reverse().find((r) => r.depth === 0 && r.task.id !== t.id);
    if (!prevTop) return toast("上面沒有任務可以歸入");
    if (rows[i]?.childCount) return toast("有子任務的項目不能再縮排");
    pm.saveTask({ id: t.id, parentId: prevTop.task.id });
    setCollapsed((s) => {
      const n = new Set(s);
      n.delete(prevTop.task.id);
      return n;
    });
  };

  const outdent = (t: Task) => {
    if (!code || !t.parentId) return;
    const parent = t.parentId;
    // 取消縮排後放在原上層的最後一個子任務後面（跟提醒事項一樣）
    const rows = treeOrder(projectAll).map((r) => r.task);
    const without = rows.filter((x) => x.id !== t.id);
    let at = without.findIndex((x) => x.id === parent);
    while (at + 1 < without.length && without[at + 1].parentId === parent) at++;
    without.splice(at + 1, 0, t);
    const order = without.map((x) => x.id);
    const p = pm.saveTask({ id: t.id, parentId: null });
    pm.reorderTasks(order, { localOnly: true });
    p.then((saved) => saved && pm.reorderTasks(order));
  };

  const remove = async (t: Task) => {
    setSwiped(null);
    const prev = await pm.deleteTask(t.id);
    if (prev && typeof prev === "object") {
      toast(`已刪除「${prev.title}」`, {
        action: {
          label: "復原",
          run: () => {
            const { id, code: c, title, kind, status, progress, flagged, assigneeEmail, assigneeName, coAssignees, start, due, note, seq, goalId, meta } = prev;
            pm.saveTask({ id, code: c, title, kind, status, progress, flagged, assigneeEmail, assigneeName, ...(coAssignees?.length ? { coAssignees } : {}), start, due, note, seq, goalId, meta });
          },
        },
      });
    }
  };

  const flag = (t: Task) => {
    setSwiped(null);
    pm.saveTask({ id: t.id, flagged: !t.flagged });
  };

  /* ── 畫面 ── */

  const tapEmpty = tapToAdd && !!code;

  /** 草稿要插在第幾列（只在單一專案的清單裡） */
  const draftIndex = (rows: TreeRow[]): number => {
    if (!draft) return -1;
    const lastChildIdx = (pid: string) => {
      let i = rows.findIndex((r) => r.task.id === pid);
      while (i + 1 < rows.length && rows[i + 1].task.parentId === pid) i++;
      return i;
    };
    if (!draft.afterId) return draft.parentId ? lastChildIdx(draft.parentId) + 1 : rows.length;
    const i = rows.findIndex((r) => r.task.id === draft.afterId);
    if (i < 0) return rows.length;
    const anchor = rows[i];
    if (anchor.depth === 0 && !draft.parentId) return lastChildIdx(anchor.task.id) + 1;
    return i + 1;
  };

  return (
    <RowBg.Provider value={surface === "white" ? "bg-white" : "bg-[#FAFAFA]"}>
    <div className="flex flex-col gap-5">
      {sections.map((sec) => {
        const project = pm.projectBy.get(sec.code);
        const rows = sec.rows.filter((r) => !(r.depth === 1 && r.task.parentId && collapsed.has(r.task.parentId)));
        if (grouped && !rows.length) return null;
        const secKey = sec.sectionId ?? "";
        const folded = sec.sectionId !== undefined && foldSec.has(secKey);
        const at = !grouped && (draft?.section ?? "") === secKey && (sec.sectionId !== undefined || true) ? draftIndex(rows) : -1;
        const items: React.ReactNode[] = rows.map((r) => (
          <TaskRow
            key={r.task.id}
            pm={pm}
            task={r.task}
            depth={r.depth}
            childCount={r.childCount}
            collapsed={collapsed.has(r.task.id)}
            onCollapse={() =>
              setCollapsed((s0) => {
                const n = new Set(s0);
                if (n.has(r.task.id)) n.delete(r.task.id);
                else n.add(r.task.id);
                return n;
              })
            }
            color={color}
            showProject={false}
            editing={editing === r.task.id}
            onStartEdit={() => {
              if (!canEditAll(pm, r.task)) return onOpen(r.task);
              setDraft(null);
              setSwiped(null);
              setEditing(r.task.id);
            }}
            onCommitEdit={(title, next) => commitEdit(r.task, title, next)}
            onToggle={() => toggleDone(r.task)}
            onInfo={() => onOpen(r.task)}
            swiped={swiped === r.task.id}
            onSwipeOpen={(open) => setSwiped(open ? r.task.id : null)}
            onIndent={code && canEditAll(pm, r.task) ? () => (r.depth ? outdent(r.task) : indent(r.task)) : undefined}
            onFlag={canEditAll(pm, r.task) ? () => flag(r.task) : undefined}
            onDelete={canEditAll(pm, r.task) ? () => remove(r.task) : undefined}
            onLongPress={(rect) => setMenu({ task: r.task, rect, depth: r.depth })}
            linger={linger.has(r.task.id)}
          />
        ));
        if (draft && at >= 0) items.splice(at, 0, <DraftRow key={draft.id} depth={draft.parentId ? 1 : 0} color={color} onCommit={commitDraft} />);
        // 有分組的專案：每段一個標題（可收合、管理者可改名）＋最後一列虛線圓點新增
        if (sec.sectionId !== undefined) {
          const isOther = sec.sectionId === "";
          return (
            <section key={`sec-${secKey}`}>
              <SectionHeader
                name={sec.sectionName ?? ""}
                muted={isOther}
                count={rows.length}
                folded={folded}
                editing={renaming === (sec.sectionId || OTHER_SECTION)}
                canEdit={pm.isManager}
                canDelete={!isOther}
                onFold={() =>
                  setFoldSec((s0) => {
                    const n = new Set(s0);
                    if (n.has(secKey)) n.delete(secKey);
                    else n.add(secKey);
                    return n;
                  })
                }
                onStartEdit={() => setRenaming(sec.sectionId || OTHER_SECTION)}
                onRename={(name) => renameSection(sec.sectionId!, name)}
                onDelete={() => deleteSection(sec.sectionId!)}
                onMenu={pm.isManager ? (rect) => setSecMenu({ id: sec.sectionId!, rect }) : undefined}
              />
              {!folded && (
                <div className="overflow-hidden">
                  {items}
                  {code && !(draft && (draft.section ?? "") === secKey) && (
                    <button
                      type="button"
                      onClick={() => {
                        primeKeyboard();
                        startDraft(undefined, secKey);
                      }}
                      aria-label={`在「${sec.sectionName}」新增任務`}
                      className="w-full flex items-center gap-3 pl-1 pr-1 h-11 text-left active:bg-[#F2F2F4]"
                    >
                      <span className="w-[22px] h-[22px] rounded-full border-[1.5px] border-dashed border-[#C7C7CC] shrink-0" />
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        }
        return (
          <section key={sec.code || "list"}>
            {grouped && (
              <h3 className="px-1 pb-1.5 text-[17px] font-bold" style={{ color: personColor(sec.code) }}>
                {project?.name ?? sec.code}
              </h3>
            )}
            <div className="overflow-hidden">
              {items}
              {!addRow && code && !grouped && !draft && (
                <button
                  type="button"
                  onClick={() => {
                    primeKeyboard();
                    startDraft();
                  }}
                  aria-label="新增任務"
                  className="w-full flex items-center gap-3 pl-1 pr-1 h-11 text-left active:bg-[#F2F2F4]"
                >
                  <span className="w-[22px] h-[22px] rounded-full border-[1.5px] border-dashed border-[#C7C7CC] shrink-0" />
                </button>
              )}
              {addRow && code && !draft && (
                <button type="button" onClick={() => { primeKeyboard(); startDraft(); }} className="w-full flex items-center gap-3 pl-1 pr-1 h-12 text-left text-[15px] text-[#8E8E93] active:bg-[#F2F2F4]">
                  <Icon name="add_circle" className="text-[24px]" style={{ color }} />
                  新增任務
                </button>
              )}
              {!rows.length && !draft && !addRow && (
                <p className="px-4 py-8 text-center text-[14px] text-[#A1A1AA]">{code ? "還沒有任務。點虛線圓點開始輸入。" : "沒有任務"}</p>
              )}
            </div>
          </section>
        );
      })}
      {code && !grouped && pm.isManager && (
        <button type="button" onClick={addSection} className="self-start h-9 px-3 rounded-full text-[14px] font-medium inline-flex items-center gap-1 active:bg-[#F4F4F5]" style={{ color }}>
          <Icon name="add" weight={500} className="text-[19px]" />
          新增分組
        </button>
      )}
      {/* 點清單下方空白處新增：每段最後已經有虛線圓點可以新增，不再保留一大塊空白點擊區（會讓頁面底部多出一大段空白） */}

      {menu && (
        <RowMenu
          pm={pm}
          task={pm.tasks.find((t) => t.id === menu.task.id) ?? menu.task}
          rect={menu.rect}
          depth={menu.depth}
          inProject={!!code}
          onClose={() => setMenu(null)}
          onOpen={() => onOpen(menu.task)}
          onSchedule={() => setSchedId(menu.task.id)}
          onToggle={() => toggleDone(menu.task)}
          onFlag={() => flag(menu.task)}
          onDelete={() => remove(menu.task)}
          onIndent={() => (menu.depth ? outdent(menu.task) : indent(menu.task))}
          onTags={() => setTagFor(menu.task.id)}
          onMove={() => setMoveFor(menu.task)}
          sections={code && !grouped ? realSections(projSections) : undefined}
          currentSection={secOf(menu.task)}
          onSection={(sid) => moveToSection(pm.tasks.find((t) => t.id === menu.task.id) ?? menu.task, sid)}
        />
      )}
      <TagSheet pm={pm} taskId={tagFor} open={!!tagFor} onClose={() => setTagFor(null)} />
      {secMenu &&
        (() => {
          const real = realSections(projSections);
          const isOther = secMenu.id === "";
          const i = real.findIndex((x) => x.id === secMenu.id);
          return (
            <PopMenu rect={secMenu.rect} onClose={() => setSecMenu(null)} label="分組選單">
              {!isOther && <MenuItem icon="arrow_upward" label="上移" disabled={i <= 0} onClick={() => { setSecMenu(null); moveSection(secMenu.id, -1); }} />}
              {!isOther && <MenuItem icon="arrow_downward" label="下移" disabled={i < 0 || i >= real.length - 1} onClick={() => { setSecMenu(null); moveSection(secMenu.id, 1); }} />}
              <MenuItem icon="edit" label="重新命名" onClick={() => { setSecMenu(null); setRenaming(secMenu.id || OTHER_SECTION); }} />
              {!isOther && <MenuItem icon="delete" label="刪除分組" danger onClick={() => { setSecMenu(null); deleteSection(secMenu.id); }} />}
            </PopMenu>
          );
        })()}
      <ScheduleSheet pm={pm} taskId={schedId} open={!!schedId} onClose={() => setSchedId(null)} />
      <Sheet open={!!moveFor} title="移到專案" subtitle={moveFor?.title} onClose={() => setMoveFor(null)}>
        {moveFor && (
          <div className="pb-4">
            <ProjectPicker
              pm={pm}
              value={moveFor.code}
              onPick={(c) => {
                const t = moveFor;
                setMoveFor(null);
                if (c === t.code) return;
                const kids = pm.tasks.filter((x) => x.parentId === t.id);
                pm.saveTask({ id: t.id, code: c, parentId: null });
                for (const k of kids) pm.saveTask({ id: k.id, code: c });
                toast(`已移到「${pm.projectBy.get(c)?.name ?? c}」${kids.length ? `（含 ${kids.length} 個子任務）` : ""}`);
              }}
            />
          </div>
        )}
      </Sheet>
    </div>
    </RowBg.Provider>
  );
}

/* ── 一列任務 ─────────────────────────────────────────── */

const SWIPE_OPEN = 144;
const INDENT_AT = 64;

function TaskRow({
  pm,
  task,
  depth,
  childCount,
  collapsed,
  onCollapse,
  color,
  editing,
  onStartEdit,
  onCommitEdit,
  onToggle,
  onInfo,
  swiped,
  onSwipeOpen,
  onIndent,
  onFlag,
  onDelete,
  onLongPress,
  linger,
}: {
  pm: Pm;
  task: Task;
  depth: 0 | 1;
  childCount: number;
  collapsed: boolean;
  onCollapse: () => void;
  color: string;
  showProject: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onCommitEdit: (title: string, next: boolean) => void;
  onToggle: () => void;
  onInfo: () => void;
  swiped: boolean;
  onSwipeOpen: (open: boolean) => void;
  onIndent?: () => void;
  onFlag?: () => void;
  onDelete?: () => void;
  onLongPress: (rect: DOMRect) => void;
  linger: boolean;
}) {
  const rowBg = useContext(RowBg);
  const { today } = pm;
  const done = task.status === "done";
  const due = dueLabel(task.due, today, done);
  const chips = metaChips(task.meta);
  const late = isLate(task, today);
  const rowRef = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const g = useRef<{ x: number; y: number; mode: "?" | "h" | "v"; base: number; timer?: ReturnType<typeof setTimeout>; long: boolean } | null>(null);
  const suppressClick = useRef(false);

  const offset = dragging ? dx : swiped ? -SWIPE_OPEN : 0;

  const onPointerDown = (e: React.PointerEvent) => {
    if (editing || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("[data-no-gesture]")) return;
    const base = swiped ? -SWIPE_OPEN : 0;
    g.current = { x: e.clientX, y: e.clientY, mode: "?", base, long: false };
    g.current.timer = setTimeout(() => {
      if (!g.current || g.current.mode !== "?") return;
      g.current.long = true;
      suppressClick.current = true;
      try {
        navigator.vibrate?.(10);
      } catch {
        /* iPhone 不支援震動 */
      }
      window.getSelection()?.removeAllRanges();
      if (rowRef.current) onLongPress(rowRef.current.getBoundingClientRect());
    }, 450);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s || s.long) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (s.mode === "?") {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      clearTimeout(s.timer);
      s.mode = Math.abs(mx) > Math.abs(my) ? "h" : "v";
      if (s.mode === "h") {
        setDragging(true);
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* 忽略 */
        }
      }
    }
    if (s.mode !== "h") return;
    let next = s.base + mx;
    if (next > 0 && !onIndent) next = 0;
    if (next < 0 && !onFlag && !onDelete) next = 0;
    // 超過範圍時有阻力
    if (next > INDENT_AT * 1.6) next = INDENT_AT * 1.6 + (next - INDENT_AT * 1.6) * 0.25;
    if (next < -SWIPE_OPEN) next = -SWIPE_OPEN + (next + SWIPE_OPEN) * 0.25;
    setDx(next);
  };
  const onPointerUp = () => {
    const s = g.current;
    g.current = null;
    if (!s) return;
    clearTimeout(s.timer);
    if (s.mode !== "h") return;
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 60);
    setDragging(false);
    if (dx >= INDENT_AT && onIndent) {
      onSwipeOpen(false);
      onIndent();
    } else if (dx <= -60) onSwipeOpen(true);
    else onSwipeOpen(false);
    setDx(0);
  };
  const onPointerCancel = () => {
    const s = g.current;
    g.current = null;
    if (s) clearTimeout(s.timer);
    setDragging(false);
    setDx(0);
  };

  const guardClick = (fn: () => void) => (e: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.preventDefault();
      return;
    }
    if (swiped) {
      onSwipeOpen(false);
      return;
    }
    fn();
  };

  const showIndent = offset > 0;
  const indentReady = offset >= INDENT_AT;

  return (
    <div ref={rowRef} className={`relative overflow-hidden select-none transition-opacity ${linger ? "opacity-60" : ""}`} style={{ WebkitTouchCallout: "none" }}>
      {/* 右滑：縮排／取消縮排 */}
      {showIndent && (
        <div className="absolute inset-y-0 left-0 flex items-center pl-3" style={{ width: Math.max(offset, 0) }}>
          <span
            className="h-9 px-3.5 rounded-full flex items-center gap-1.5 text-[14px] font-semibold text-white whitespace-nowrap transition-colors"
            style={{ background: indentReady ? "#8B6A52" : "#B79F8C" }}
          >
            <Icon name={depth ? "format_indent_decrease" : "format_indent_increase"} className="text-[18px]" />
            {depth ? "取消縮排" : "縮排"}
          </span>
        </div>
      )}
      {/* 左滑：重要、刪除 */}
      {offset < 0 && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: SWIPE_OPEN }}>
          {onFlag && (
            <button type="button" data-no-gesture onClick={onFlag} className="flex-1 flex flex-col items-center justify-center gap-0.5 text-white text-[12px] font-semibold" style={{ background: ORANGE }}>
              <Icon name="flag" fill={task.flagged ? 0 : 1} className="text-[20px]" />
              {task.flagged ? "取消重要" : "重要"}
            </button>
          )}
          {onDelete && (
            <button type="button" data-no-gesture onClick={onDelete} className="flex-1 flex flex-col items-center justify-center gap-0.5 text-white text-[12px] font-semibold" style={{ background: RED }}>
              <Icon name="delete" className="text-[20px]" />
              刪除
            </button>
          )}
        </div>
      )}

      <div
        className={`relative ${rowBg} flex items-start gap-3 pr-1`}
        style={{
          paddingLeft: depth ? 38 : 4,
          transform: offset ? `translateX(${offset}px)` : undefined,
          transition: dragging ? "none" : "transform 0.25s cubic-bezier(0.16,1,0.3,1)",
          touchAction: "pan-y",
          // 長按是叫出任務選單：關掉 iPhone 的選字與「拷貝／查詢」泡泡（編輯中要能選字，不套）
          ...(editing ? {} : { WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }),
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => {
          e.preventDefault();
          if (rowRef.current) onLongPress(rowRef.current.getBoundingClientRect());
        }}
      >
        <span className="pt-[11px]" data-no-gesture>
          <CheckCircle checked={done} onToggle={onToggle} color={color} disabled={!canToggle(pm, task)} label={done ? "標記為未完成" : "標記為完成"} />
        </span>
        <div className="flex-1 min-w-0 py-[11px] border-b border-[#F0F0F2] flex items-start gap-2">
          <div className="flex-1 min-w-0" onClick={guardClick(onStartEdit)}>
            {editing ? (
              <InlineInput initial={task.title} onCommit={onCommitEdit} />
            ) : (
              <p className={`text-[16px] leading-[22px] break-words ${done ? "text-[#A1A1AA]" : "text-[#18181B]"}`}>{task.title}</p>
            )}
            {(due || task.assigneeEmail || chips.length > 0 || (task.note && !editing)) && (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-[18px]">
                {due && <span style={{ color: late ? RED : due.color }}>{due.text}</span>}
                {task.assigneeEmail && (task.assigneeEmail !== pm.me?.email || !!task.coAssignees?.length) && (
                  // 大頭照＋代表字（名字最後一個字，或自己在設定裡改的字），多人就一個一個排
                  <span className="inline-flex items-center gap-2 text-[#8E8E93]" aria-label={`負責人：${assigneeLabel(pm, task)}`}>
                    {taskAssignees(task)
                      .slice(0, 4)
                      .map((e) => (
                        <span key={e} className="inline-flex items-center gap-1">
                          <Avatar name={pm.personBy.get(e)?.name} email={e} size={16} />
                          {personMark(pm, e, e === task.assigneeEmail ? task.assigneeName : undefined)}
                        </span>
                      ))}
                    {taskAssignees(task).length > 4 && <span>+{taskAssignees(task).length - 4}</span>}
                  </span>
                )}
                {chips.slice(0, 4).map((c) => (
                  <span key={c.text} className="h-[20px] px-1.5 rounded-[6px] text-[12px] leading-[20px] font-medium" style={{ color: c.color, background: c.bg }}>
                    {c.text}
                  </span>
                ))}
                {chips.length > 4 && <span className="text-[12px] text-[#A1A1AA]">+{chips.length - 4}</span>}
              </div>
            )}
            {task.note && !editing && <p className="mt-0.5 text-[13px] text-[#8E8E93] truncate">{task.note}</p>}
          </div>
          <span className="flex items-center gap-1 pt-0.5 shrink-0" data-no-gesture>
            {editing && (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onInfo} aria-label="詳細資料" className="w-7 h-7 flex items-center justify-center" style={{ color }}>
                <Icon name="info" className="text-[22px]" />
              </button>
            )}
            {task.flagged && !editing && <Icon name="flag" fill={1} className="text-[18px]" style={{ color: ORANGE }} />}
            {childCount > 0 && (
              <button type="button" onClick={onCollapse} aria-label={collapsed ? "展開子任務" : "收合子任務"} aria-expanded={!collapsed} className="w-7 h-7 flex items-center justify-center text-[#8E8E93]">
                <Icon name="expand_more" weight={500} className={`text-[22px] transition-transform ${collapsed ? "-rotate-90" : ""}`} />
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/** 列內直接編輯名稱：Enter 存好並新增下一列，點別處就存 */
function InlineInput({ initial, onCommit, placeholder }: { initial: string; onCommit: (v: string, next: boolean) => void; placeholder?: string }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: false });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [v]);
  const finish = (next: boolean) => {
    if (done.current) return;
    done.current = true;
    onCommit(v, next);
  };
  return (
    <textarea
      ref={ref}
      value={v}
      rows={1}
      maxLength={80}
      enterKeyHint="next"
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value.replace(/\n/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          done.current = true;
          onCommit(initial, false);
        }
      }}
      onBlur={() => finish(false)}
      className="block w-full resize-none bg-transparent outline-none text-[16px] leading-[22px] text-[#18181B] placeholder:text-[#C7C7CC] p-0 m-0"
    />
  );
}

function DraftRow({ depth, color, onCommit }: { depth: 0 | 1; color: string; onCommit: (title: string, next: boolean) => void }) {
  const rowBg = useContext(RowBg);
  return (
    <div className={`relative ${rowBg} flex items-start gap-3 pr-1`} style={{ paddingLeft: depth ? 38 : 4 }}>
      <span className="pt-[11px]">
        <span className="block w-6 h-6 rounded-full border-2" style={{ borderColor: `color-mix(in srgb, ${color} 45%, #D4D4D8)` }} />
      </span>
      <div className="flex-1 min-w-0 py-[11px] border-b border-[#F0F0F2]">
        <InlineInput initial="" placeholder="新任務" onCommit={onCommit} />
      </div>
    </div>
  );
}

/* ── 長按選單（像提醒事項） ─────────────────────────────── */

type MenuPage = "main" | "due" | "progress" | "assign" | "section";

function RowMenu({
  pm,
  task,
  rect,
  depth,
  inProject,
  onClose,
  onOpen,
  onSchedule,
  onToggle,
  onFlag,
  onDelete,
  onIndent,
  onTags,
  onMove,
  sections,
  currentSection,
  onSection,
}: {
  pm: Pm;
  task: Task;
  rect: DOMRect;
  depth: 0 | 1;
  inProject: boolean;
  onClose: () => void;
  onOpen: () => void;
  /** 「自訂日期…」：打開時間安排 */
  onSchedule: () => void;
  onToggle: () => void;
  onFlag: () => void;
  onDelete: () => void;
  onIndent: () => void;
  onTags: () => void;
  onMove: () => void;
  /** 專案頁：分組清單（沒有＝不顯示「移到分組」） */
  sections?: { id: string; name: string }[];
  currentSection?: string;
  onSection?: (id: string) => void;
}) {
  const [page, setPage] = useState<MenuPage>("main");
  const [shown, setShown] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;

  const edit = canEditAll(pm, task);
  const done = task.status === "done";
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const MENU_H = page === "assign" ? 380 : 420;
  // 預覽卡停在原位；下面放不下選單時整組往上移
  const previewTop = Math.max(16, Math.min(rect.top, vh - MENU_H - 90));
  const menuTop = previewTop + Math.min(rect.height, 90) + 10;
  const left = Math.max(12, Math.min(rect.left + 8, vw - 292));
  const today = pm.today;
  const dow = toDay(today).getDay();
  const dues: [string, string | undefined][] = [
    ["今天", today],
    ["明天", addDays(today, 1)],
    ["這週末", addDays(today, (6 - dow + 7) % 7 || 7)],
    ["下週一", addDays(today, ((1 - dow + 7) % 7) || 7)],
    ["無期限", undefined],
  ];

  return createPortal(
    <div className="fixed inset-0 z-[160] font-sans select-none [-webkit-touch-callout:none]" role="dialog" aria-label="任務選單">
      <div className={`absolute inset-0 bg-black/25 backdrop-blur-[2px] transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      {/* 預覽 */}
      <div
        className={`absolute bg-white rounded-[14px] shadow-[0_10px_30px_rgba(0,0,0,0.18)] px-4 py-3 flex items-center gap-3 transition-all duration-200 ${shown ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
        style={{ top: previewTop, left: 12, right: 12 }}
      >
        <span className="w-6 h-6 rounded-full border-2 border-[#D4D4D8] shrink-0" style={done ? { background: ORANGE, borderColor: ORANGE } : undefined} />
        <span className={`flex-1 min-w-0 text-[16px] truncate ${done ? "text-[#A1A1AA]" : "text-[#18181B]"}`}>{task.title}</span>
      </div>
      {/* 選單 */}
      <div
        className={`absolute w-[280px] rounded-[16px] bg-[#F7F7F8]/95 shadow-[0_16px_50px_rgba(0,0,0,0.22)] overflow-hidden transition-all duration-200 origin-top-left ${shown ? "opacity-100 scale-100" : "opacity-0 scale-90"}`}
        style={{ top: menuTop, left }}
      >
        {page === "main" && (
          <>
            <div className="grid grid-cols-3 border-b border-[#E4E4E7]">
              <TopAction icon="info" label="詳細" onClick={run(onOpen)} />
              <TopAction icon="flag" label={task.flagged ? "取消重要" : "重要"} onClick={run(onFlag)} disabled={!edit} fill={task.flagged} />
              <TopAction icon="delete" label="刪除" onClick={run(onDelete)} disabled={!edit} danger />
            </div>
            <div className="py-1">
              <MenuItem icon="event" label="期限 ›" onClick={() => setPage("due")} disabled={!edit} />
              {/* 完成度：被指派的人也能改（和打勾一樣） */}
              <MenuItem icon="donut_large" label={`完成度 ${task.progress}% ›`} onClick={() => setPage("progress")} disabled={!canToggle(pm, task)} />
              <MenuItem icon="sell" label="標籤 ›" onClick={run(onTags)} disabled={!edit} />
              {pm.isManager && <MenuItem icon="person" label="指派 ›" onClick={() => setPage("assign")} />}
            </div>
            <div className="h-px bg-[#E4E4E7]" />
            <div className="py-1">
              {inProject && <MenuItem icon={depth ? "format_indent_decrease" : "format_indent_increase"} label={depth ? "取消縮排" : "縮排"} onClick={run(onIndent)} disabled={!edit} />}
              {sections && (sections.length > 0 || pm.isManager) && <MenuItem icon="segment" label="移到分組 ›" onClick={() => setPage("section")} disabled={!edit} />}
              <MenuItem icon="drive_file_move" label="移到專案 ›" onClick={run(onMove)} disabled={!edit} />
            </div>
          </>
        )}
        {page === "section" && sections && (
          <div className="py-1 max-h-[360px] overflow-y-auto">
            <button type="button" onClick={() => setPage("main")} className="w-full flex items-center gap-1 px-3 h-11 text-[15px] font-semibold text-[#18181B] border-b border-[#E4E4E7] sticky top-0 bg-[#F7F7F8]">
              <Icon name="chevron_left" className="text-[22px]" />
              移到分組
            </button>
            <MenuItem icon="block" label="不分組（其他）" checked={!currentSection} onClick={run(() => onSection?.(""))} />
            {sections.map((s) => (
              <MenuItem key={s.id} icon="segment" label={s.name} checked={currentSection === s.id} onClick={run(() => onSection?.(s.id))} />
            ))}
            {pm.isManager && (
              <>
                <div className="h-px bg-[#E4E4E7] my-1" />
                <MenuItem icon="add" label="新增分組並移入" onClick={run(() => onSection?.("new"))} />
              </>
            )}
          </div>
        )}
        {page === "progress" && (
          <div className="py-1">
            <button type="button" onClick={() => setPage("main")} className="w-full flex items-center gap-1 px-3 h-11 text-[15px] font-semibold text-[#18181B] border-b border-[#E4E4E7]">
              <Icon name="chevron_left" className="text-[22px]" />
              完成度
            </button>
            {[0, 25, 50, 75, 100].map((p) => (
              <MenuItem
                key={p}
                icon={p === 100 ? "check_circle" : "donut_large"}
                label={p === 100 ? "100%（完成）" : `${p}%`}
                checked={task.progress === p}
                onClick={run(() => pm.saveTask({ id: task.id, progress: p }))}
              />
            ))}
          </div>
        )}
        {page === "due" && (
          <div className="py-1">
            <button type="button" onClick={() => setPage("main")} className="w-full flex items-center gap-1 px-3 h-11 text-[15px] font-semibold text-[#18181B] border-b border-[#E4E4E7]">
              <Icon name="chevron_left" className="text-[22px]" />
              期限
            </button>
            {dues.map(([label, v]) => (
              <MenuItem
                key={label}
                icon={v ? "event" : "event_busy"}
                label={label}
                checked={task.due === v}
                onClick={run(() => {
                  // 有開始日、而且新期限早於開始日時，一起把開始日拿掉
                  pm.saveTask({ id: task.id, due: v, ...(task.start && v && v < task.start ? { start: undefined } : {}) });
                })}
              />
            ))}
            <MenuItem icon="edit_calendar" label="自訂日期…" onClick={run(onSchedule)} />
          </div>
        )}
        {page === "assign" && (
          <div className="py-1 max-h-[360px] overflow-y-auto">
            <button type="button" onClick={() => setPage("main")} className="w-full flex items-center gap-1 px-3 h-11 text-[15px] font-semibold text-[#18181B] border-b border-[#E4E4E7] sticky top-0 bg-[#F7F7F8]">
              <Icon name="chevron_left" className="text-[22px]" />
              指派
            </button>
            {/* 可複選：點一下加入／移除，選單不關，選完點外面收起。第一位是主要負責人 */}
            {pm.people.map((p) => {
              const list = taskAssignees(task);
              const on = list.includes(p.email);
              const primary = list[0] === p.email;
              return (
                <button
                  key={p.email}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onClick={() => {
                    const next = on ? list.filter((e) => e !== p.email) : [...list, p.email];
                    pm.saveTask({ id: task.id, ...assigneePatch(pm, next) });
                    if (!on && p.email !== pm.me?.email) toast(`已指派給 ${p.name}，對方會收到通知`);
                  }}
                  className="w-full flex items-center gap-3 px-4 h-12 text-left active:bg-[#EDEDF0]"
                >
                  <Avatar name={p.name} email={p.email} size={28} />
                  <span className="flex-1 text-[16px] text-[#18181B]">
                    {p.email === pm.me?.email ? "我" : p.name}
                    {primary && list.length > 1 && <span className="ml-1.5 text-[12px] text-[#A1A1AA]">主要</span>}
                  </span>
                  {on && <Icon name="check" weight={600} className="text-[18px] text-[var(--accent)]" />}
                </button>
              );
            })}
            {task.assigneeEmail && <MenuItem icon="person_off" label="全部取消指派" onClick={run(() => pm.saveTask({ id: task.id, assigneeEmail: undefined, coAssignees: [] }))} />}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function TopAction({ icon, label, onClick, disabled, danger, fill }: { icon: string; label: string; onClick: () => void; disabled?: boolean; danger?: boolean; fill?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1 h-[68px] text-[13px] active:bg-[#EDEDF0] disabled:opacity-35 ${danger ? "text-[#E5484D]" : "text-[#18181B]"}`}
    >
      <Icon name={icon} fill={fill ? 1 : 0} className="text-[24px]" />
      {label}
    </button>
  );
}


/** 分組標題：點名稱改名（管理者），右邊收合；改名時可以刪除分組 */
function SectionHeader({
  name,
  muted,
  count,
  folded,
  editing,
  canEdit,
  canDelete = true,
  onFold,
  onStartEdit,
  onRename,
  onDelete,
  onMenu,
}: {
  name: string;
  muted?: boolean;
  count: number;
  folded: boolean;
  editing: boolean;
  canEdit: boolean;
  /** 「其他」不能刪（它是沒分組任務的位置），只能改名 */
  canDelete?: boolean;
  onFold: () => void;
  onStartEdit: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  /** 長按（手機）或右鍵（電腦）：叫出分組選單 */
  onMenu?: (rect: DOMRect) => void;
}) {
  const [v, setV] = useState(name);
  const headRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const gesture = onMenu
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          if (e.pointerType === "mouse") return;
          fired.current = false;
          cancelPress();
          press.current = {
            x: e.clientX,
            y: e.clientY,
            timer: setTimeout(() => {
              fired.current = true;
              window.getSelection()?.removeAllRanges();
              try {
                navigator.vibrate?.(10);
              } catch {
                /* iPhone 不支援震動 */
              }
              if (headRef.current) onMenu(headRef.current.getBoundingClientRect());
            }, 450),
          };
        },
        onPointerMove: (e: React.PointerEvent) => {
          if (press.current && (Math.abs(e.clientX - press.current.x) > 8 || Math.abs(e.clientY - press.current.y) > 8)) cancelPress();
        },
        onPointerUp: cancelPress,
        onPointerCancel: cancelPress,
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault();
          cancelPress();
          if (headRef.current) onMenu(headRef.current.getBoundingClientRect());
        },
        // 長按放開後瀏覽器補的 click 不要觸發改名／收合
        onClickCapture: (e: React.MouseEvent) => {
          if (fired.current) {
            fired.current = false;
            e.stopPropagation();
            e.preventDefault();
          }
        },
        style: { WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties,
      }
    : {};
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editing) return;
    setV(name);
    setTimeout(() => ref.current?.select(), 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  if (editing) {
    return (
      <div className="flex items-center gap-2 px-1 pb-2">
        <input
          ref={ref}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => onRename(v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") onRename(name);
          }}
          maxLength={40}
          aria-label="分組名稱"
          className="flex-1 min-w-0 h-10 text-[22px] font-bold text-[#18181B] bg-transparent border-b-2 border-[var(--accent)] outline-none"
        />
        {canDelete && <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDelete}
          className="h-9 px-3 rounded-full text-[14px] text-[#E5484D] active:bg-[#FDECEC] shrink-0"
        >
          刪除分組
        </button>}
      </div>
    );
  }
  return (
    <div ref={headRef} {...gesture} className="flex items-center gap-2 px-1 pb-2 min-h-[40px]">
      <button
        type="button"
        onClick={canEdit ? onStartEdit : onFold}
        className={`flex-1 min-w-0 text-left text-[22px] font-bold truncate ${muted && name === "其他" ? "text-[#AEAEB2]" : "text-[#18181B]"}`}
      >
        {name}
      </button>
      {folded && count > 0 && <span className="text-[14px] text-[#A1A1AA] tabular-nums">{count}</span>}
      <button type="button" onClick={onFold} aria-label={folded ? `展開「${name}」` : `收合「${name}」`} aria-expanded={!folded} className="w-9 h-9 rounded-full flex items-center justify-center text-[#3F3F46] active:bg-[#F4F4F5]">
        <Icon name="expand_more" className={`text-[24px] transition-transform ${folded ? "-rotate-90" : ""}`} />
      </button>
    </div>
  );
}

/** 專案長按選單（像提醒事項的清單選單）：置頂、編輯。刪除（封存）放在編輯裡，避免誤觸 */
function ProjectMenu({
  rect,
  pinned,
  canEdit,
  onClose,
  onPin,
  onEdit,
}: {
  rect: DOMRect;
  pinned: boolean;
  canEdit: boolean;
  onClose: () => void;
  onPin: () => void;
  onEdit: () => void;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const W = 240;
  const left = Math.min(Math.max(12, rect.left + 24), window.innerWidth - W - 12);
  const h = canEdit ? 108 : 56;
  const below = rect.bottom + 8 + h < window.innerHeight - 12;
  const top = below ? rect.bottom + 8 : Math.max(12, rect.top - 8 - h);
  const run = (f: () => void) => () => {
    onClose();
    f();
  };
  return createPortal(
    <div className="fixed inset-0 z-[160] font-sans select-none [-webkit-touch-callout:none]" role="dialog" aria-label="專案選單">
      <div className={`absolute inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <div
        className={`absolute rounded-[16px] bg-[#F7F7F8]/95 shadow-[0_16px_50px_rgba(0,0,0,0.22)] overflow-hidden py-1 transition-all duration-200 ${shown ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
        style={{ top, left, width: W }}
      >
        <MenuItem icon="keep" label={pinned ? "取消置頂" : "置頂"} onClick={run(onPin)} />
        {canEdit && <MenuItem icon="edit" label="編輯專案…" onClick={run(onEdit)} />}
      </div>
    </div>,
    document.body
  );
}

/** 長按出來的小選單：貼在那一列下方（放不下就往上），點外面關閉 */
function PopMenu({ rect, onClose, label, children }: { rect: DOMRect; onClose: () => void; label: string; children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(rect.bottom + 6);
  useLayoutEffect(() => {
    const h = box.current?.offsetHeight ?? 200;
    setTop(rect.bottom + 6 + h < window.innerHeight - 12 ? rect.bottom + 6 : Math.max(12, rect.top - 6 - h));
  }, [rect]);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const W = 240;
  const left = Math.min(Math.max(12, rect.left + 8), window.innerWidth - W - 12);
  return createPortal(
    <div className="fixed inset-0 z-[160] font-sans select-none [-webkit-touch-callout:none]" role="dialog" aria-label={label}>
      <div className={`absolute inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <div
        ref={box}
        className={`absolute rounded-[16px] bg-[#F7F7F8]/95 shadow-[0_16px_50px_rgba(0,0,0,0.22)] overflow-hidden py-1 transition-all duration-200 ${shown ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
        style={{ top, left, width: W }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
