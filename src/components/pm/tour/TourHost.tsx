"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mutate } from "swr";
import { newSectionId, type Section, type Task } from "@/lib/pm/model";
import { addDays, diffDays } from "@/lib/project-ops";
import { toast } from "../Sheet";
import { Icon } from "../ui";
import { realSections } from "../tree";
import { PM_KEY, pmPost, usePm, type Pm } from "../usePm";
import { onTour, tourEmit, tourState, TOUR_PREFIX, type TourEvent } from "./bus";

/* ══════════════════════════════════════════════════════════
   新手教學：專案情報＋任務追蹤，教完可以接「實戰教學」
   - 從頭像設定「新手教學」開始；新的裝置第一次打開時會邀請一次
   - 每個人一個自己的「新手練習」專案（伺服器建立），新手教學結束或中途離開都會刪掉
   - 每一步：圈住真的按鈕，提示卡說明要做什麼；做到了自動進下一步
   - 畫面凍結：暗下來的地方點不到（只有圈起來的東西、打開的選單／抽屜、提示卡可以點），
     不會誤觸跳到別的頁面（例如左上的返回），提示卡和畫面對不起來
   - ← 上一步：撤銷那一步做的事（例如刪掉剛打的任務），回到那一步開始的畫面，重做一次
   - → 略過這步：先幫你做到（例如自動建好任務、換到正確的頁面），後面的步驟才接得上
   - 人在別的頁面、找不到要圈的東西：自動帶過去
   實戰教學：用正式的專案（從「展開其他專案」找）新增任務、排日期、截圖匯入，最後說明刪除專案不會動到 CRM
   ══════════════════════════════════════════════════════════ */

interface Ctx {
  code: string;
  isManager: boolean;
  /** 這次操作的專案（練習專案，或實戰選的專案）裡的任務 */
  tasks: Task[];
  sections: Section[];
  today: string;
  pm: Pm;
  /** 正在打字（虛線圓圈打開了輸入列） */
  typing: boolean;
  /** 實戰：選的專案原本沒有任何資料（可以放心示範刪除） */
  fresh: boolean;
  /** 手機轉成橫的 */
  landscape: boolean;
  /** 手機（觸控、窄螢幕）：教學開始時判斷一次，轉橫轉直不會變 */
  phone: boolean;
}

interface Step {
  id: string;
  title: string;
  body: string | ((c: Ctx) => string);
  /** 要圈的東西（只有它可以點） */
  target?: (c: Ctx) => Element | null;
  /** 除了目標，還可以點的東西（例如分組改名的輸入框） */
  allow?: string;
  /** 做到才往下：收到 app 的事件且符合就前進 */
  until?: (e: TourEvent, c: Ctx, snap: unknown) => boolean;
  /** 做到才往下：畫面或資料變成這樣就前進（每 0.2 秒檢查一次） */
  done?: (c: Ctx, snap: unknown) => boolean;
  /** 進到這一步時記下的狀態（給 done、until 比較） */
  snapshot?: (c: Ctx) => unknown;
  /** 人在別的頁面：自動帶過去 */
  goto?: (c: Ctx) => void;
  /** 只有符合的人才有這一步 */
  when?: (c: Ctx) => boolean;
  /** 這一步要在清單上操作：進來時先把還開著的抽屜、長按選單關掉 */
  clear?: boolean;
  /** 進來時先收起鍵盤（上一步還在打字） */
  blur?: boolean;
  /** 按「略過這步」：先幫忙做到，後面的步驟才有東西可以操作 */
  skip?: (c: Ctx) => void;
  /** 只圈起來給人看，不能點（例如「新專案」：點進去會出不來） */
  look?: boolean;
  /** 進到這一步時先做（例如進入甘特圖編輯） */
  enter?: () => void;
  /** 提示卡不要蓋住這一塊（例如整張甘特圖）：放它上面，放不下才放下面 */
  clearOf?: () => Element | null;
  /** 按 ← 回到這一步：撤銷這一步做的事（例如刪掉剛打的任務），才能重做一次 */
  undo?: (c: Ctx) => void;
  /** 按 ← 回到這一步：先帶到這一步開始時的畫面（沒寫就用 goto） */
  backTo?: (c: Ctx) => void;
  /** 按 ← 時不停在這一步，再往前一步（例如要先打開選單、抽屜才做得了的步驟） */
  passBack?: boolean;
  /** 一定要自己做，不能按 → 略過（例如選哪個正式專案）：按 → 只跳出這句提醒 */
  must?: string;
}

/** 蓋在清單上的東西：抽屜、長按選單、搜尋層 */
const LAYERS = '[data-pm-sheet], [role="dialog"][aria-label="任務選單"], [data-tour-layer]';
/** 打開了就可以點的地方（長按選單只開放選單本身：點背景會關掉選單，跟提示卡對不起來） */
const OPEN_LAYERS = '[data-pm-sheet], [data-tour="row-menu"], [data-tour-layer], [data-tour-card]';
/** 關掉抽屜、長按選單（它們都聽 Esc） */
function closeLayers() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

/** 畫面上看得到的第一個 */
function pick(sel: string): Element | null {
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}
const tops = (c: Ctx) => c.tasks.filter((t) => !t.parentId).sort((a, b) => a.seq - b.seq);
const taskRow = (c: Ctx, i: number) => {
  const t = tops(c)[i];
  return t ? pick(`[data-tour-task="${t.id}"]`) : null;
};
/** 甘特圖上某個任務那一列 */
const ganttRow = (t?: Task) => (t ? pick(`[data-tour="gantt"] [role="button"][aria-label^="${CSS.escape(t.title)}"]`) : null);
const go = (g: Record<string, unknown>) => {
  // 要換的檢視先記著：專案清單頁可能這時候才開始畫，等它畫好再套用
  if (typeof g.view === "string") tourState.pendingView = g.view;
  if (typeof g.project === "string") tourState.pendingProject = g.project;
  if (typeof g.openProject === "string") tourState.pendingOpen = g.openProject;
  tourEmit("goto", g);
};
const toProject = (view = "list") => (c: Ctx) => {
  if (c.code) go({ nav: "tasks", tab: "任務", project: c.code, view });
};
const toTasksHome = () => go({ nav: "tasks", tab: "任務", home: true });
const toIntel = () => go({ nav: "project_info", intelTab: "專案" });
const sheetOpen = () => !!pick("[data-pm-sheet]");
/** 教學自己幫忙點的：畫面凍結不擋 */
let bypass = false;
const tap = (sel: string) => {
  const el = pick(sel) as HTMLElement | null;
  if (!el) return;
  bypass = true;
  try {
    el.click();
  } finally {
    bypass = false;
  }
};
/** 甘特圖要在編輯模式（點日期排入、拖曳、時間安排）：還沒進編輯就幫忙按鉛筆 */
const ensureEdit = () => tap('[data-tour="gantt-edit"][aria-pressed="false"]');

/* 略過時幫忙做的事 */
const addTasks = (c: Ctx, n: number) => {
  const names = ["泥作", "打底", "粉光"];
  for (let k = tops(c).length; k < n; k++) c.pm.saveTask({ code: c.code, title: names[k] ?? `任務 ${k + 1}`, seq: k }, { quiet: true });
};
const patchMeta = (c: Ctx, t: Task | undefined, m: Partial<NonNullable<Task["meta"]>>) => {
  if (t) c.pm.saveTask({ id: t.id, meta: { ...(t.meta ?? {}), ...m } }, { quiet: true });
};
const shift = (c: Ctx, t: Task | undefined, s: number, e: number) => {
  if (t && (t.start || t.due)) c.pm.saveTask({ id: t.id, start: addDays(t.start ?? t.due!, s), due: addDays(t.due ?? t.start!, e) }, { quiet: true });
};
const addSection = (c: Ctx, name: string) => {
  c.pm.saveSections(c.code, [...c.sections, { id: newSectionId(), name }]);
};
/** 有幾個分組裡面有任務 */
const sectionsUsed = (c: Ctx) => {
  const valid = new Set(realSections(c.sections).map((s) => s.id));
  return new Set(c.tasks.filter((t) => !t.parentId && valid.has(t.meta?.section ?? "")).map((t) => t.meta!.section)).size;
};
/** 第 i 個主任務在哪個分組（沒有＝undefined） */
const sectionOfTop = (c: Ctx, i: number) => {
  const valid = new Set(realSections(c.sections).map((x) => x.id));
  const sec = tops(c)[i]?.meta?.section;
  return sec && valid.has(sec) ? sec : undefined;
};
/** 略過時：把第 i 個主任務（連子任務）放進第 k 個分組 */
const moveTop = (c: Ctx, i: number, k: number) => {
  const secs = realSections(c.sections);
  const t = tops(c)[i];
  if (!t || !secs[k]) return;
  patchMeta(c, t, { section: secs[k].id });
  for (const kid of c.tasks.filter((x) => x.parentId === t.id)) patchMeta(c, kid, { section: secs[k].id });
};
/**
 * 長按選單現在在哪：在某個子頁（廠商、指派、移到分組…）＝子頁名稱；在第一頁＝"main"；沒打開＝null。
 * 提示卡的說明跟著它走，才不會人已經在「廠商」子頁了還叫他「回到選單點廠商」
 */
const menuAt = (): string | null => {
  const b = pick('[data-tour="menu-back"]');
  if (b) return (b.textContent ?? "").replace("chevron_left", "").trim();
  return pick('[data-tour="row-menu"]') ? "main" : null;
};
/** 照選單的位置給說明：已經在 page 子頁／在別的子頁／在第一頁／選單沒開 */
const byMenu = (page: string, item: string, task: string, there: string) => {
  const at = menuAt();
  if (at && at.includes(page)) return there;
  if (at && at !== "main") return `按上方的「‹」回到選單，點「${item} ›」，${there}`;
  if (at === "main") return `點「${item} ›」，${there}`;
  return `長按「${task}」，點「${item} ›」，${there}`;
};
const renaming = () => !!pick('input[aria-label="分組名稱"]');
/**
 * 略過「新增分組」：已經按了「新增分組」、正在改名（框裡是「新分組」）就幫忙打好名字存起來；
 * 還沒按就直接建一個。不然會多一個叫「新分組」的分組
 */
const nameSection = (c: Ctx, name: string) => {
  const el = pick('input[aria-label="分組名稱"]') as HTMLInputElement | null;
  if (!el) {
    // 按 → 的那一下輸入框可能已經失焦、存成「新分組」了：改掉它的名字，不要再多建一個
    const fresh = [...realSections(c.sections)].reverse().find((x) => x.name === "新分組");
    if (fresh) return c.pm.saveSections(c.code, c.sections.map((x) => (x.id === fresh.id ? { ...x, name } : x)));
    return addSection(c, name);
  }
  // 用原生的 setter 才會觸發 React 的 onChange；等它更新完再 blur（blur 時才存）
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, name);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  setTimeout(() => el.blur(), 80);
};
/** 還沒排日期的任務（甘特圖教「點日期排入」用） */
// 先挑沒完成的；都完成了（例如看板那步把它拖到完成）也照樣用，不然這一步會直接跳過
const undated = (c: Ctx) => {
  const list = tops(c).filter((t) => !t.start && !t.due);
  return list.find((t) => t.status !== "done") ?? list[0];
};
/** 「點日期排入」排的是哪個任務（按 ← 回來時清掉它的日期） */
const picked: { id?: string } = {};
const firstOpen = (c: Ctx) => tops(c).find((t) => t.status !== "done");
/** WBS：最後一個任務（粉光）接在哪個後面——挑還沒完成的（完成的在甘特圖上藏起來了，看不到箭頭） */
const wbsPair = (c: Ctx) => {
  const list = tops(c);
  const b = list[list.length - 1];
  const a = c.tasks.find((t) => t.status !== "done" && t.id !== b?.id && t.parentId) ?? c.tasks.find((t) => t.status !== "done" && t.id !== b?.id);
  return { a, b };
};

/* 按「上一步」時撤銷的事 */
/** 只留前 n 個主任務（連子任務），後面的刪掉 */
const keepTops = (c: Ctx, n: number) => {
  for (const t of tops(c).slice(n)) {
    for (const kid of c.tasks.filter((x) => x.parentId === t.id)) c.pm.deleteTask(kid.id);
    c.pm.deleteTask(t.id);
  }
};
/** 所有任務都拿掉這些欄位 */
const clearMeta = (c: Ctx, keys: string[], test: (t: Task) => boolean) => {
  for (const t of c.tasks.filter(test)) {
    const m = { ...(t.meta ?? {}) } as Record<string, unknown>;
    for (const k of keys) delete m[k];
    c.pm.saveTask({ id: t.id, meta: m as Task["meta"], ...(keys.includes("urgent") ? { flagged: false } : {}) }, { quiet: true });
  }
};
/** 只留前 n 個分組 */
const keepSections = (c: Ctx, n: number) => {
  const real = realSections(c.sections);
  if (real.length <= n) return;
  const keep = new Set(real.slice(0, n).map((x) => x.id));
  c.pm.saveSections(
    c.code,
    c.sections.filter((x) => !real.includes(x) || keep.has(x.id))
  );
};
/** 第 i 個主任務（連子任務）移出分組 */
const unmoveTop = (c: Ctx, i: number) => {
  const t = tops(c)[i];
  if (t) clearMeta(c, ["section"], (x) => x.id === t.id || x.parentId === t.id);
};
const setStatus = (c: Ctx, from: Task["status"], to: Task["status"]) => {
  for (const t of c.tasks.filter((x) => x.status === from)) c.pm.saveTask({ id: t.id, status: to }, { quiet: true });
};
const closeThen = (g: (c: Ctx) => void) => (c: Ctx) => {
  closeLayers();
  g(c);
};
const toIntelList = () => {
  closeLayers();
  toIntel();
};
const BACK: Record<string, Pick<Step, "undo" | "backTo" | "passBack">> = {
  "open-project": { backTo: toIntelList },
  back: { backTo: (c) => go({ nav: "project_info", intelTab: "專案", openProject: c.code }) },
  "nav-tasks": { backTo: toIntel },
  "open-list": { backTo: toTasksHome },
  "add-1": { undo: (c) => keepTops(c, 0) },
  "add-2": { undo: (c) => keepTops(c, 1) },
  "add-3": { undo: (c) => keepTops(c, 2) },
  longpress: { backTo: closeThen(toProject()) },
  // 指派、回到選單要先長按打開選單：直接回到「長按」
  assign: { passBack: true },
  "menu-back": { passBack: true },
  "assign-info": { backTo: closeThen(toProject()) },
  vendor: { undo: (c) => clearMeta(c, ["vendor"], (t) => !!t.meta?.vendor), backTo: closeThen(toProject()) },
  tag: { undo: (c) => clearMeta(c, ["trade", "areas", "tags"], (t) => !!(t.meta?.trade || t.meta?.areas?.length || t.meta?.tags?.length)), backTo: closeThen(toProject()) },
  "swipe-left": { undo: (c) => clearMeta(c, ["urgent"], (t) => !!t.meta?.urgent || t.flagged) },
  "swipe-right": {
    undo: (c) => {
      for (const t of c.tasks.filter((x) => x.parentId)) c.pm.saveTask({ id: t.id, parentId: undefined }, { quiet: true });
    },
  },
  "section-add": { undo: (c) => keepSections(c, 0) },
  "section-add-2": { undo: (c) => keepSections(c, 1) },
  "section-move": { undo: (c) => unmoveTop(c, 0), backTo: closeThen(toProject()) },
  "section-move-2": { undo: (c) => unmoveTop(c, tops(c).length - 1), backTo: closeThen(toProject()) },
  board: { backTo: toProject("list") },
  "board-doing": { undo: (c) => setStatus(c, "doing", "todo") },
  "board-done": { undo: (c) => setStatus(c, "done", "doing") },
  gantt: { backTo: toProject("board") },
  // 回到這步：先收起已完成，才能再點一次
  "gantt-show-done": { undo: () => tap('[data-tour="show-done"][aria-pressed="true"]') },
  "gantt-edit": { undo: () => tap('[data-tour="gantt-edit"][aria-pressed="true"]') },
  "gantt-pick": {
    // 把這一步排上日期的那個任務（記在 picked）清回沒有日期，才能再點一次
    undo: (c) => {
      const list = tops(c);
      const t = c.tasks.find((x) => x.id === picked.id) ?? list[list.length - 1];
      if (t && (t.start || t.due)) c.pm.saveTask({ id: t.id, start: undefined, due: undefined }, { quiet: true });
    },
  },
  "wbs-open": { backTo: closeThen(toProject("gantt")) },
  // 要先打開時間安排：直接回到「點色條」
  "wbs-pick": { passBack: true, undo: (c) => clearMeta(c, ["after"], (t) => !!t.meta?.after) },
  "gantt-done": { undo: ensureEdit },
  "export-gantt": { backTo: closeThen(toProject("gantt")) },
  "export-gantt-see": { passBack: true },
  "export-list": { backTo: closeThen(toProject("list")) },
  "export-list-see": { passBack: true },
  // 實戰：正式專案的資料不幫忙刪，只帶回畫面
  "real-nav-tasks": { backTo: toIntel },
  "real-expand": { backTo: toTasksHome },
  "real-pick": { backTo: toTasksHome },
  "real-date": { backTo: closeThen(toProject()) },
};

/** 時間安排裡剛選好、還沒儲存的前一個任務（沒選＝空） */
const wbsChosen = () => pick('[data-tour="wbs"]')?.getAttribute("data-wbs-pick") || "";
const ganttEl = () => pick('[data-tour="gantt"]');
const STEPS_RAW: Step[] = [
  /* ── 介面 ── */
  {
    id: "nav",
    look: true,
    title: "四個主頁",
    body: "這一排切換主頁。先學兩個：「專案情報」看專案狀況，「任務追蹤」排任務、打勾完成。",
    target: () => pick('[data-tour="nav"]'),
  },
  {
    id: "nav-project",
    title: "打開專案情報",
    body: "點房子圖示，到「專案情報」。",
    target: () => pick('[data-tour="nav-project_info"]'),
    // 一定要真的點（就算現在已經在專案情報），不然一下子就跳到下一步，看不懂發生什麼事
    until: (e) => e.type === "nav" && e.data === "project_info",
    skip: toIntel,
    goto: toTasksHome,
  },
  {
    id: "intel-all",
    title: "篩選：全部",
    body: "這排是篩選。點「全部」，看 CRM 上所有的專案。",
    target: () => pick('[data-tour="intel-all"]'),
    until: (e) => e.type === "intel-filter" && e.data === "all",
    goto: toIntel,
  },
  {
    id: "intel-build",
    title: "篩選：施工中",
    body: "點「施工」，只看施工中的專案。",
    target: () => pick('[data-tour="intel-build"]'),
    until: (e) => e.type === "intel-filter" && e.data === "build",
    goto: toIntel,
  },
  {
    id: "intel-active",
    title: "回到進行中",
    body: "點「進行」，回到平常看的專案。",
    target: () => pick('[data-tour="intel-active"]'),
    until: (e) => e.type === "intel-filter" && e.data === "active",
    goto: toIntel,
    skip: () => tap('[data-tour="intel-active"]'),
  },
  {
    id: "open-project",
    title: "你的練習專案",
    body: "這是你的練習專案，教學結束會自動刪掉。點它看看。",
    target: (c) => pick(`[data-tour="project-${c.code}"]`),
    until: (e, c) => e.type === "project-screen" && e.data === c.code,
    goto: (c) => go({ nav: "project_info", intelTab: "專案", openProject: c.code }),
    skip: (c) => go({ nav: "project_info", intelTab: "專案", openProject: c.code }),
  },
  {
    id: "summary",
    title: "專案頁",
    body: "上面是摘要：階段、進度、工期。下面的資料點右邊就能改，自動存。",
    target: () => pick('[data-tour="project-summary"]'),
    goto: (c) => go({ nav: "project_info", intelTab: "專案", openProject: c.code }),
  },
  {
    id: "back",
    title: "回到清單",
    body: "按左上角的返回。",
    target: () => pick('[data-tour="subscreen-back"]'),
    until: (e) => e.type === "project-screen" && !e.data,
    skip: closeLayers,
  },
  /* ── 建立任務 ── */
  {
    id: "nav-tasks",
    title: "任務追蹤",
    body: "點勾勾圖示，到「任務追蹤」。每天的工作都在這裡。",
    target: () => pick('[data-tour="nav-tasks"]'),
    until: (e) => e.type === "nav" && e.data === "tasks",
    skip: toTasksHome,
    goto: toTasksHome,
  },
  {
    id: "open-list",
    title: "每個專案一張清單",
    body: "每個專案一張清單，數字是還沒完成的件數。點「新手練習」。",
    target: (c) => pick(`[data-tour="list-${c.code}"]`),
    until: (e, c) => e.type === "route" && e.data === c.code,
    goto: toTasksHome,
    skip: toProject(),
  },
  {
    id: "add-1",
    title: "第一個任務",
    body: (c) => (c.typing ? "打「泥作」，按鍵盤上方的 ✓ 存起來。" : "點虛線圓圈，新增第一個任務「泥作」。"),
    target: () => pick('[data-tour="draft-row"]') ?? pick('[data-tour="add-row"]'),
    done: (c) => tops(c).length >= 1,
    goto: toProject(),
    skip: (c) => addTasks(c, 1),
  },
  {
    id: "add-2",
    title: "接著打第二個",
    body: (c) => (c.typing ? "打「打底」，按 ✓。" : "再點虛線圓圈，新增「打底」。"),
    target: () => pick('[data-tour="draft-row"]') ?? pick('[data-tour="add-row"]'),
    done: (c) => tops(c).length >= 2,
    goto: toProject(),
    skip: (c) => addTasks(c, 2),
  },
  {
    id: "add-3",
    title: "再一個",
    body: (c) => (c.typing ? "打「粉光」，按 ✓。" : "再點虛線圓圈，新增「粉光」。"),
    target: () => pick('[data-tour="draft-row"]') ?? pick('[data-tour="add-row"]'),
    done: (c) => tops(c).length >= 3,
    goto: toProject(),
    skip: (c) => addTasks(c, 3),
  },
  /* ── 長按與滑動 ── */
  {
    id: "longpress",
    blur: true,
    title: "長按叫出選單",
    body: "長按「泥作」（電腦按右鍵）叫出選單。期限、指派、廠商、標籤都在這裡。",
    target: (c) => taskRow(c, 0),
    until: (e) => e.type === "menu-open",
    goto: toProject(),
  },
  {
    id: "assign",
    title: "指派給同事",
    body: () => byMenu("指派", "指派", "泥作", "選一位同事（選自己也行）。對方會收到通知。"),
    target: (c) => pick('[data-tour="row-menu"]') ?? taskRow(c, 0),
    when: (c) => c.isManager,
    // 在指派名單點了人才算做到（直接打字新增的任務本來就掛在自己身上，不能看資料判斷）
    until: (e) => e.type === "assigned",
    goto: toProject(),
  },
  {
    id: "menu-back",
    title: "回到選單",
    body: "按上方的「‹ 指派」回到選單。",
    target: () => pick('[data-tour="menu-back"]'),
    when: (c) => c.isManager,
    // 回到選單第一頁（或選單已經關了）就算做到
    done: () => !pick('[data-tour="menu-back"]'),
  },
  {
    id: "assign-info",
    look: true,
    title: "被指派的任務",
    body: "主管會把任務指派給你。收到通知後打開任務、按「收到」就好。",
    target: (c) => pick('[data-tour="row-menu"]') ?? taskRow(c, 0),
    when: (c) => !c.isManager,
  },
  {
    id: "vendor",
    title: "指定廠商",
    // 廠商給「打底」（實際發包的工序），「泥作」是大項不放廠商；上一步的選單開在「泥作」上，進來先關掉
    clear: true,
    // 說明跟著畫面：選單開著／在別的子頁／選單關了，各說各的
    body: () => byMenu("廠商", "廠商", "打底", "搜尋或往下找，點一家廠商。"),
    target: (c) => pick('[data-tour="row-menu"]') ?? taskRow(c, 1) ?? taskRow(c, 0),
    done: (c) => !!(tops(c)[1] ?? tops(c)[0])?.meta?.vendor,
    goto: toProject(),
    skip: (c) => patchMeta(c, tops(c)[1] ?? tops(c)[0], { vendor: "練習廠商" }),
  },
  {
    id: "tag",
    title: "加上標籤",
    // 一樣標「打底」：上一步選完廠商，選單還開在它上面就接著用
    body: () => (sheetOpen() ? "點「工種」，選「泥作」。" : byMenu("標籤", "標籤", "打底", "點「工種」，選「泥作」。")),
    target: (c) => pick('[data-tour="menu-back"]') ?? pick('[data-tour="row-menu"]') ?? taskRow(c, 1) ?? taskRow(c, 0),
    done: (c) => {
      const t = tops(c)[1] ?? tops(c)[0];
      return !!(t?.meta?.trade || t?.meta?.areas?.length || t?.meta?.tags?.length);
    },
    goto: toProject(),
    skip: (c) => patchMeta(c, tops(c)[1] ?? tops(c)[0], { trade: "泥作" }),
  },
  {
    id: "swipe-left",
    clear: true,
    title: "往左滑",
    // 一樣在「打底」上操作（泥作是大項）
    body: "把「打底」往左滑，按「緊急」。",
    target: (c) => taskRow(c, 1) ?? taskRow(c, 0),
    done: (c) => {
      const t = tops(c)[1] ?? tops(c)[0];
      return !!t?.meta?.urgent || !!t?.flagged;
    },
    goto: toProject(),
    skip: (c) => patchMeta(c, tops(c)[1] ?? tops(c)[0], { urgent: true }),
  },
  {
    id: "swipe-right",
    clear: true,
    title: "往右滑：變成子任務",
    body: "把「打底」往右滑，變成「泥作」的子任務。再滑一次可取消。",
    target: (c) => taskRow(c, 1) ?? taskRow(c, 0),
    done: (c) => c.tasks.some((t) => !!t.parentId),
    goto: toProject(),
    skip: (c) => {
      const [a, b] = tops(c);
      if (a && b) c.pm.saveTask({ id: b.id, parentId: a.id }, { quiet: true });
    },
  },
  /* ── 分組（管理者才能建分組） ── */
  {
    id: "section-add",
    clear: true,
    blur: true,
    title: "新增分組",
    body: () => (renaming() ? "打「售票亭」，按 ✓。" : "分組用來分區域，例如售票亭、展售區。點最下面的「新增分組」。"),
    // 點了「新增分組」之後：圈改名的輸入框（不然被暗掉、被提示卡蓋住）
    target: () => pick('input[aria-label="分組名稱"]')?.parentElement ?? pick('[data-tour="add-section"]'),
    allow: 'input[aria-label="分組名稱"]',
    when: (c) => c.isManager,
    done: (c) => realSections(c.sections).length >= 1 && !renaming(),
    goto: toProject(),
    skip: (c) => nameSection(c, "售票亭"),
  },
  {
    id: "section-add-2",
    title: "再一個分組",
    body: () => (renaming() ? "打「展售區」，按 ✓。" : "再點「新增分組」，新增「展售區」。"),
    // 點了「新增分組」之後：圈改名的輸入框（不然被暗掉、被提示卡蓋住）
    target: () => pick('input[aria-label="分組名稱"]')?.parentElement ?? pick('[data-tour="add-section"]'),
    allow: 'input[aria-label="分組名稱"]',
    when: (c) => c.isManager,
    done: (c) => realSections(c.sections).length >= 2 && !renaming(),
    goto: toProject(),
    skip: (c) => nameSection(c, "展售區"),
  },
  // 一次只教一件事：先把「泥作」放進第一組，再把「粉光」放進第二組
  {
    id: "section-move",
    blur: true,
    title: "把任務放進分組（1/2）",
    body: (c) => {
      const sec = realSections(c.sections)[0]?.name ?? "售票亭";
      const there = `選「${sec}」。子任務會一起移。`;
      return byMenu("移到分組", "移到分組", tops(c)[0]?.title ?? "泥作", there);
    },
    target: (c) => pick('[data-tour="row-menu"]') ?? pick('[data-tour="menu-back"]') ?? taskRow(c, 0),
    when: (c) => c.isManager,
    done: (c) => !!sectionOfTop(c, 0),
    goto: toProject(),
    skip: (c) => moveTop(c, 0, 0),
  },
  {
    id: "section-move-2",
    blur: true,
    title: "把任務放進分組（2/2）",
    body: (c) => {
      const list = tops(c);
      const sec = realSections(c.sections)[1]?.name ?? "展售區";
      return byMenu("移到分組", "移到分組", list[list.length - 1]?.title ?? "粉光", `選「${sec}」。`);
    },
    target: (c) => pick('[data-tour="row-menu"]') ?? pick('[data-tour="menu-back"]') ?? taskRow(c, tops(c).length - 1),
    when: (c) => c.isManager,
    done: (c) => sectionsUsed(c) >= 2,
    goto: toProject(),
    skip: (c) => moveTop(c, tops(c).length - 1, 1),
  },
  /* ── 看板 ── */
  {
    id: "board",
    clear: true,
    title: "換成看板",
    body: "右上這顆切換清單、看板、甘特圖。點一下換成看板。",
    target: () => pick('[data-tour="view-switch"]'),
    until: (e) => e.type === "view" && e.data === "board",
    goto: toProject("list"),
    skip: toProject("board"),
  },
  {
    id: "board-doing",
    title: "拖到進行中",
    body: "把「待辦」的一張卡片拖到「進行中」（手機先長按）。",
    target: () => pick('[data-tour="board"]'),
    done: (c) => c.tasks.some((t) => t.status !== "todo"),
    goto: toProject("board"),
    skip: (c) => {
      const t = firstOpen(c);
      if (t) c.pm.saveTask({ id: t.id, status: "doing" }, { quiet: true });
    },
  },
  {
    id: "board-done",
    title: "再拖到完成",
    body: "再把它拖到「完成」。",
    target: () => pick('[data-tour="board"]'),
    done: (c) => c.tasks.some((t) => t.status === "done"),
    goto: toProject("board"),
    skip: (c) => {
      const t = c.tasks.find((x) => x.status === "doing") ?? tops(c)[0];
      if (t) c.pm.saveTask({ id: t.id, status: "done" }, { quiet: true });
    },
  },
  /* ── 甘特圖 ── */
  {
    id: "gantt",
    clear: true,
    title: "換成甘特圖",
    body: "再點右上那顆，換成甘特圖。",
    target: () => pick('[data-tour="view-switch"]'),
    until: (e) => e.type === "view" && e.data === "gantt",
    goto: toProject("board"),
    skip: toProject("gantt"),
  },
  {
    id: "gantt-read",
    title: "看懂甘特圖",
    body: (c) =>
      (realSections(c.sections).length ? "灰底的列是分組，下面是任務。" : "每一列是一個任務。") +
      "灰＝待辦、橘＝進行中，橘色直線是今天。",
    target: () => pick('[data-tour="gantt"]'),
    goto: toProject("gantt"),
  },
  {
    id: "gantt-show-done",
    title: "顯示已完成",
    body: "完成的任務先藏起來了。點甘特圖下面的「顯示已完成」打開。",
    target: () => pick('[data-tour="show-done"]'),
    until: (e) => e.type === "show-done" && e.data === true,
    goto: toProject("gantt"),
    skip: () => tap('[data-tour="show-done"][aria-pressed="false"]'),
  },
  {
    id: "gantt-landscape",
    title: "轉橫的看",
    body: (c) => (c.landscape ? "橫的看得更多。看完轉回直的。" : "把手機轉成橫的看看（先關掉直向鎖定）。"),
    target: () => pick('[data-tour="gantt"]'),
    // 只有手機（觸控、窄螢幕）才教；電腦直接跳過
    when: (c) => c.phone,
    snapshot: () => ({ seen: false }),
    done: (c, snap) => {
      const s0 = snap as { seen: boolean };
      if (c.landscape) s0.seen = true;
      return s0.seen && !c.landscape;
    },
    goto: toProject("gantt"),
  },
  {
    id: "gantt-zoom",
    title: "日／週／月",
    body: "左上這顆切換日／週／月。依序點成「月」、「日」，再回到「週」。",
    target: () => pick('[data-tour="gantt-zoom"]'),
    snapshot: () => new Set<string>(),
    until: (e, _c, snap) => {
      if (e.type !== "gantt-zoom") return false;
      const seen = snap as Set<string>;
      seen.add(String(e.data));
      return seen.has("day") && seen.has("month") && e.data === "week";
    },
    goto: toProject("gantt"),
  },
  {
    id: "gantt-edit",
    title: "進入編輯",
    body: "平常只能看，避免手滑。按右上的鉛筆進入編輯。",
    target: () => pick('[data-tour="gantt-edit"]'),
    until: (e) => e.type === "gantt-edit" && e.data === true,
    goto: toProject("gantt"),
    // 略過也要真的進入編輯，後面的拖曳、點日期排入才做得了
    skip: ensureEdit,
  },
  {
    id: "gantt-pick",
    enter: ensureEdit,
    title: "點日期排入",
    body: (c) => `「${undated(c)?.title ?? "粉光"}」還沒排日期。在它那一列點要開始的那天。`,
    target: (c) => ganttRow(undated(c)) ?? pick('[data-tour="gantt"]'),
    // 按 ← 回來時畫面可能還是舊資料（日期還沒清掉）：找不到就用上次記下的那個
    snapshot: (c) => {
      const id = undated(c)?.id;
      if (id) picked.id = id;
      return id ?? picked.id;
    },
    done: (c, snap) => !snap || !!c.tasks.find((t) => t.id === snap && (t.start || t.due)),
    goto: toProject("gantt"),
    skip: (c) => {
      const t = undated(c);
      if (t) c.pm.saveTask({ id: t.id, start: addDays(c.today, 3), due: addDays(c.today, 5) }, { quiet: true });
    },
  },
  {
    id: "gantt-start",
    enter: ensureEdit,
    title: "拉開始日",
    body: "長按色條左端拖移：只改開始日。",
    target: () => pick('[data-tour="gantt"]'),
    until: (e) => e.type === "gantt-drag" && e.data === "start",
    goto: toProject("gantt"),
    skip: (c) => shift(c, firstOpen(c), -1, 0),
  },
  {
    id: "gantt-end",
    enter: ensureEdit,
    title: "拉結束日",
    body: "長按色條右端拖移：只改結束日。",
    target: () => pick('[data-tour="gantt"]'),
    until: (e) => e.type === "gantt-drag" && e.data === "end",
    goto: toProject("gantt"),
    skip: (c) => shift(c, firstOpen(c), 0, 1),
  },
  {
    id: "gantt-move",
    enter: ensureEdit,
    title: "整條移動",
    body: "長按色條中間拖移：整條一起移，天數不變。",
    target: () => pick('[data-tour="gantt"]'),
    until: (e) => e.type === "gantt-drag" && e.data === "move",
    goto: toProject("gantt"),
    skip: (c) => shift(c, firstOpen(c), 1, 1),
  },
  {
    id: "wbs-open",
    enter: ensureEdit,
    title: "前後任務（WBS）",
    body: "有些工序要等前一個做完。點「粉光」的色條，打開時間安排。",
    // 只圈時間軸那一段（點名稱會打開任務細節，不是時間安排）
    target: (c) => ganttRow(tops(c)[tops(c).length - 1])?.children[1] ?? pick('[data-tour="gantt"]'),
    until: (e) => e.type === "schedule-open",
    goto: toProject("gantt"),
  },
  {
    id: "wbs-pick",
    title: "接在哪個任務之後",
    body: (c) => {
      const chosen = wbsChosen();
      if (chosen) return `選好「${chosen}」了，按下面的「儲存」。`;
      const a = wbsPair(c).a?.title ?? "上一個任務";
      return `點「選擇前一個任務」，選「${a}」，再按「儲存」。它會從${a}結束隔天開始。`;
    },
    // 選好了就改圈「儲存」
    target: () => (wbsChosen() ? pick('[data-tour="schedule-save"]') : null) ?? pick('[data-tour="wbs"]'),
    until: (e) => e.type === "wbs-set",
    // 之前已經設好、存過了（畫面上「儲存」按不下去）：算做到
    done: (c) => !!wbsPair(c).b?.meta?.after && !wbsChosen(),
    skip: (c) => {
      const { a, b } = wbsPair(c);
      closeLayers();
      if (!a || !b || a === b) return;
      const end = a.due ?? a.start;
      const n = b.start && b.due ? diffDays(b.start, b.due) : 0;
      c.pm.saveTask({ id: b.id, meta: { ...(b.meta ?? {}), after: a.id }, ...(end ? { start: addDays(end, 1), due: addDays(end, 1 + n) } : {}) }, { quiet: true });
    },
  },
  {
    id: "wbs-line",
    look: true,
    clear: true,
    title: "連起來了",
    body: (c) => {
      const { a, b } = wbsPair(c);
      return `箭頭把兩個任務連起來。「${a?.title ?? "前一個"}」改日期，「${b?.title ?? "後一個"}」會自動跟著移。`;
    },
    target: () => pick('[data-tour="gantt"]'),
    goto: toProject("gantt"),
  },
  {
    id: "gantt-done",
    title: "改好了",
    body: "按右上的打勾，結束編輯。",
    target: () => pick('[data-tour="gantt-edit"]'),
    until: (e) => e.type === "gantt-edit" && e.data === false,
    goto: toProject("gantt"),
    skip: () => tap('[data-tour="gantt-edit"][aria-pressed="true"]'),
  },
  {
    id: "gantt-level",
    title: "顯示到哪一層",
    body: "「週」旁邊這顆切換顯示：只看分組 → 分組和主任務 → 全部。點到繞回「全部」。",
    target: () => pick('[data-tour="gantt-level"]'),
    snapshot: () => new Set<string>(),
    until: (e, _c, snap) => {
      if (e.type !== "gantt-level") return false;
      const seen = snap as Set<string>;
      seen.add(String(e.data));
      return seen.size >= 2 && e.data === "all";
    },
    goto: toProject("gantt"),
  },
  /* ── 分享 ── */
  {
    id: "export-gantt",
    title: "分享甘特圖",
    body: "點上方的分享鍵。甘特圖可存成圖片，或轉成 MS Project、Excel、行事曆檔。",
    target: () => pick('[data-tour="export"]'),
    until: (e) => e.type === "export-open" && e.data === "gantt",
    goto: toProject("gantt"),
  },
  {
    id: "export-gantt-see",
    title: "選格式",
    body: "按「存成圖片」就能傳 LINE；往下是排程軟體的檔案。看完按 ✕ 關掉。",
    target: () => pick("[data-pm-sheet]"),
    done: () => !sheetOpen(),
    skip: closeLayers,
  },
  {
    id: "export-list-view",
    clear: true,
    title: "回到清單",
    body: "點右上的切換鍵，換回清單。",
    target: () => pick('[data-tour="view-switch"]'),
    until: (e) => e.type === "view" && e.data === "list",
    goto: toProject("gantt"),
    skip: toProject("list"),
  },
  {
    id: "export-list",
    title: "分享清單",
    body: "再點分享鍵，這次分享清單。",
    target: () => pick('[data-tour="export"]'),
    until: (e) => e.type === "export-open" && e.data === "list",
    goto: toProject("list"),
  },
  {
    id: "export-list-see",
    title: "文字也能分享",
    body: "「複製文字」貼到 LINE，分組、日期、負責人都排好了。看完按 ✕ 關掉。",
    target: () => pick("[data-pm-sheet]"),
    done: () => !sheetOpen(),
    skip: closeLayers,
  },
  /* ── 搜尋 ── */
  {
    id: "search",
    clear: true,
    title: "搜尋",
    body: "點放大鏡，打任務名稱或標籤，例如「打底」，所有專案都找得到。",
    target: () => pick('[data-tour="search"]'),
    until: (e) => e.type === "search" && typeof e.data === "string" && e.data.trim().length > 0,
  },
];

/** 甘特圖的步驟：提示卡不要蓋住甘特圖 */
const STEPS: Step[] = STEPS_RAW.map((st) => ({ ...st, ...BACK[st.id], ...(st.id.startsWith("gantt") || st.id.startsWith("wbs-") ? { clearOf: ganttEl } : {}) }));

/* ── 實戰教學：正式的專案 ── */
/** 實戰選的專案（只在這次教學用） */
const realPick: { code: string | null; fresh: boolean } = { code: null, fresh: false };
const toProjectScreen = (c: Ctx) => {
  if (c.code) go({ nav: "project_info", intelTab: "專案", openProject: c.code });
};
const REAL_STEPS_RAW: Step[] = [
  {
    id: "real-nav",
    title: "實戰：專案情報",
    body: "接下來用正式專案。點房子圖示，到「專案情報」。",
    target: () => pick('[data-tour="nav-project_info"]'),
    until: (e) => e.type === "nav" && e.data === "project_info",
    skip: toIntel,
    goto: toTasksHome,
  },
  {
    id: "real-newproj",
    title: "不用按「新專案」",
    body: "「新專案」只給 CRM 上沒有的案子用。公司的專案都已經從 CRM 帶進來，不用按。",
    target: () => pick('[data-tour="new-project"]'),
    look: true,
    when: (c) => c.isManager,
    goto: toIntel,
  },
  {
    id: "real-nav-tasks",
    title: "到任務追蹤",
    body: "點勾勾清單圖示，到「任務追蹤」。",
    target: () => pick('[data-tour="nav-tasks"]'),
    until: (e) => e.type === "nav" && e.data === "tasks",
    skip: toTasksHome,
    goto: toTasksHome,
  },
  {
    id: "real-expand",
    title: "展開其他專案",
    body: "點「展開其他專案」，還沒排任務的專案都在這裡。",
    target: () => pick('[data-tour="expand-projects"]'),
    until: (e) => e.type === "home-expand" && e.data === true,
    goto: toTasksHome,
    skip: () => tap('[data-tour="expand-projects"]'),
  },
  {
    id: "real-pick",
    title: "選一個專案",
    body: "點一個要排程的專案。",
    target: () => pick('[data-tour="home-projects"]'),
    until: (e, c) => {
      if (e.type !== "route" || typeof e.data !== "string" || e.data.startsWith(TOUR_PREFIX) || ["home", "smart", "tag"].includes(e.data)) return false;
      const p = c.pm.projectBy.get(e.data);
      realPick.code = e.data;
      // 原本完全沒有資料（沒有任務、APP 裡也沒存過專案資料）：最後可以放心示範刪除
      realPick.fresh = !!p && !p.hasRow && !c.pm.tasks.some((t) => t.code === e.data);
      return true;
    },
    goto: toTasksHome,
    must: "先點一個專案，後面的步驟都用它",
  },
  {
    id: "real-add",
    title: "新增任務",
    body: (c) => (c.typing ? "打完按 ✓；要再加一個就再點虛線圓圈。" : "點虛線圓圈，把要做的事一項一項打進去。"),
    target: () => pick('[data-tour="draft-row"]') ?? pick('[data-tour="add-row"]'),
    snapshot: (c) => c.tasks.length,
    done: (c, snap) => c.tasks.length > (snap as number) && !c.typing,
    goto: toProject(),
  },
  {
    id: "real-date",
    blur: true,
    title: "排日期",
    body: () => byMenu("期限", "期限", "任務", "選一天。") + "要排區間就換成甘特圖編輯。",
    target: (c) => pick('[data-tour="row-menu"]') ?? pick('[data-tour="menu-back"]') ?? taskRow(c, 0),
    snapshot: (c) => JSON.stringify(c.tasks.map((t) => [t.id, t.start, t.due])),
    done: (c, snap) => JSON.stringify(c.tasks.map((t) => [t.id, t.start, t.due])) !== snap,
    goto: toProject(),
  },
  {
    id: "real-import",
    clear: true,
    title: "截圖匯入",
    body: "用 iPhone「提醒事項」記工作的話：先截圖清單，再點這顆選截圖、選專案，整批匯入。沒有截圖就按 →。",
    target: () => pick('[data-tour="import"]'),
    until: (e) => e.type === "import-done",
    goto: toTasksHome,
  },
  {
    id: "real-delete-try",
    clear: true,
    title: "刪除專案",
    body: "「刪除專案」只清掉任務、排程、分組，CRM 的資料不會動。這個專案剛開始排，按「刪除專案」→「刪除」試試。",
    target: () => pick('[data-tour="project-delete"]'),
    when: (c) => c.isManager && c.fresh,
    until: (e) => e.type === "project-purged",
    goto: toProjectScreen,
  },
  {
    id: "real-delete-info",
    look: true,
    clear: true,
    title: "刪除專案",
    body: "「刪除專案」在專案頁最下面，只清掉任務、排程、分組，CRM 的資料不會動。這個專案已有資料，看位置就好。",
    target: () => pick('[data-tour="project-delete"]'),
    when: (c) => c.isManager && !c.fresh,
    goto: toProjectScreen,
  },
  {
    id: "real-delete-member",
    title: "刪除專案",
    body: "要清掉專案的全部任務，請管理者在專案頁最下面按「刪除專案」。CRM 的資料不會動。",
    when: (c) => !c.isManager,
  },
];

const REAL_STEPS: Step[] = REAL_STEPS_RAW.map((st) => ({ ...st, ...BACK[st.id] }));

type Phase = "idle" | "welcome" | "starting" | "running" | "finish" | "real-ask" | "real-intro" | "real-finish";
type Mode = "practice" | "real";
const INVITED = "pm:tour:invited";
/** 介面導覽做完過：從設定點「實戰操演」就不再問「做過介面導覽了嗎」 */
const DONE = "pm:tour:done";
const ACTIVE = "pm:tour:active";
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* 私密瀏覽 */
    }
  },
};
/** 畫面凍結時擋的事件：只擋「開始」的那一下（放開、移動不擋，拖曳放到框外才不會卡住） */
const BLOCK_EVENTS = ["pointerdown", "mousedown", "touchstart", "click", "dblclick", "contextmenu"] as const;

export function TourHost() {
  const pm = usePm();
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("practice");
  const [invite, setInvite] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [realCode, setRealCode] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [success, setSuccess] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [covered, setCovered] = useState(false);
  const [lost, setLost] = useState(false);
  const [typing, setTyping] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const phoneRef = useRef(false);
  const checkPhone = () => {
    phoneRef.current = window.matchMedia("(pointer: coarse)").matches && Math.min(window.innerWidth, window.innerHeight) < 600;
  };
  // 提示卡要讓開的區塊、提示卡實際的高度（決定放上面還是下面）
  const [clearRect, setClearRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardBody = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(170);
  // 按了提示卡的 ✕：先問一次，免得想關抽屜卻把教學整個關掉
  const [askEnd, setAskEnd] = useState(false);
  const missingSince = useRef<number | null>(null);
  const autoWent = useRef(false);
  const scrolled = useRef<string | null>(null);
  const snap = useRef<unknown>(undefined);
  const busy = useRef(false);
  // 一步只算一次做到（開發模式下事件可能連發兩次，會一口氣跳兩步）
  const completing = useRef(false);
  // 按「上一步」回來的：不因為「已經做過」就自動跳走，看完自己按 →
  const revisit = useRef(false);
  const backAt = useRef(0);
  // 現在可以點的東西（畫面凍結用）
  const allowEls = useRef<Element[]>([]);
  const allowSel = useRef<string | undefined>(undefined);

  const activeCode = mode === "real" ? realCode : code;
  const ctx: Ctx | null = useMemo(() => {
    if (phase !== "running" || (mode === "practice" && !code)) return null;
    const c = activeCode ?? "";
    return {
      code: c,
      isManager: pm.isManager,
      tasks: c ? pm.tasks.filter((t) => t.code === c) : [],
      sections: (c && pm.projectBy.get(c)?.sections) || [],
      today: pm.today,
      pm,
      typing,
      fresh: realPick.fresh,
      landscape,
      phone: phoneRef.current,
    };
    // pm 每次重繪都是新物件：只看用得到的欄位
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode, code, activeCode, pm.isManager, pm.tasks, pm.projectBy, pm.today, typing, landscape]);
  const all = mode === "real" ? REAL_STEPS : STEPS;
  const steps = useMemo(() => (ctx ? all.filter((s) => !s.when || s.when(ctx)) : all), [ctx, all]);
  const step = phase === "running" ? steps[i] : undefined;

  /* 從頭像設定開始；新的裝置第一次打開時邀請一次 */
  // 設定裡的「介面導覽」＝新手教學；「實戰操演」直接進實戰教學（不建練習專案）
  useEffect(
    () =>
      onTour((e) => {
        if (phase !== "idle") return;
        if (e.type === "tour-start") {
          setInvite(false);
          setPhase("welcome");
        } else if (e.type === "tour-start-real") {
          setInvite(false);
          // 還沒做過介面導覽：先問一下（建議先做）
          setPhase(store.get(DONE) ? "real-intro" : "real-ask");
        }
      }),
    [phase]
  );
  useEffect(() => {
    if (!pm.data || phase !== "idle") return;
    // 上次教學沒結束就關掉了：把留下的練習專案清掉
    const left = store.get(ACTIVE);
    if (left) {
      store.set(ACTIVE, null);
      pmPost({ op: "tutorial.end" }).then(() => mutate(PM_KEY));
    }
    if (store.get(INVITED)) return;
    const t = setTimeout(() => {
      store.set(INVITED, "1");
      setInvite(true);
      setPhase("welcome");
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!pm.data]);

  const start = async () => {
    if (busy.current) return;
    checkPhone();
    busy.current = true;
    setPhase("starting");
    const r = await pmPost<{ status: string; code?: string }>({ op: "tutorial.start" });
    busy.current = false;
    if (!r.ok || !r.data.code) {
      toast(r.data.error || "練習專案建立失敗，請稍後再試", { tone: "error" });
      setPhase("idle");
      return;
    }
    tourState.code = r.data.code;
    // 練習專案一律從清單開始（不管這台裝置上次停在看板還是甘特圖）
    tourState.pendingView = "list";
    store.set(ACTIVE, r.data.code);
    setCode(r.data.code);
    setMode("practice");
    await mutate(PM_KEY);
    picked.id = undefined;
    revisit.current = false;
    completing.current = false;
    setI(0);
    setPhase("running");
  };

  /** 刪掉練習專案（新手教學結束，或要接實戰教學時） */
  const dropPractice = async () => {
    setCode(null);
    tourState.code = null;
    store.set(ACTIVE, null);
    const r = await pmPost<{ purged?: boolean }>({ op: "tutorial.end" });
    await mutate(PM_KEY);
    return r.ok;
  };

  const end = async (finished: boolean) => {
    completing.current = false;
    tourState.lockSchedule = false;
    const wasReal = mode === "real";
    setPhase("idle");
    setRect(null);
    setMode("practice");
    setRealCode(null);
    realPick.code = null;
    if (wasReal) {
      toast(finished ? "實戰教學完成" : "已結束實戰教學");
      return;
    }
    const ok = await dropPractice();
    toast(finished ? "教學完成，練習專案已刪除" : ok ? "已結束教學，練習專案已刪除" : "已結束教學");
  };

  const startReal = async () => {
    checkPhone();
    await dropPractice();
    realPick.code = null;
    realPick.fresh = false;
    setRealCode(null);
    setMode("real");
    revisit.current = false;
    completing.current = false;
    setI(0);
    setPhase("running");
  };

  /** by：一次往下跳幾步（略過時，連後面「要先打開選單才做得了」的步驟一起帶過） */
  const advance = (by = 1) => {
    completing.current = false;
    revisit.current = false;
    setSuccess(false);
    // 實戰：選好專案了，之後的步驟都用它
    if (mode === "real" && realPick.code && realPick.code !== realCode) setRealCode(realPick.code);
    if (i + by >= steps.length) {
      if (mode === "practice") store.set(DONE, "1");
      setPhase(mode === "real" ? "real-finish" : "real-intro");
      return;
    }
    setI((n) => n + by);
  };
  /** ←：撤銷上一步做的事、回到它開始的畫面，重做一次 */
  const back = () => {
    if (i === 0 || completing.current || !ctx) return;
    let k = i - 1;
    steps[k].undo?.(ctx);
    while (k > 0 && steps[k].passBack) {
      k--;
      steps[k].undo?.(ctx);
    }
    const to = steps[k];
    (to.backTo ?? to.goto)?.(ctx);
    setSuccess(false);
    // 撤銷了＝要重做才往下；沒辦法撤銷的「做到才往下」：不因為已經做過就跳走
    revisit.current = !to.undo && !!to.done;
    // 撤銷還在存：等一下再檢查「做到了沒」，免得拿到舊資料又自動跳走
    backAt.current = Date.now();
    setI(k);
  };
  const complete = () => {
    if (completing.current) return;
    completing.current = true;
    setSuccess(true);
    setTimeout(advance, 650);
  };
  /** →：看完的步驟＝下一步；要動手的步驟＝略過（先幫忙做到，後面才接得上） */
  const next = () => {
    if (completing.current || !step || !ctx) return;
    if (revisit.current || !(step.until || step.done)) return advance();
    if (step.must) {
      toast(step.must);
      return;
    }
    // 略過時幫忙做到的事可能也會觸發這一步的「做到了」：先擋著，不然一次跳兩步
    completing.current = true;
    step.skip?.(ctx);
    // 下一步要靠這一步打開的選單、抽屜才做得了（例如長按後的「指派」、打開時間安排後的「選前一個任務」）：一起略過
    let by = 1;
    while (i + by < steps.length && steps[i + by].passBack) {
      steps[i + by].skip?.(ctx);
      by++;
    }
    advance(by);
  };

  // 進到新的一步：記下狀態、重設「找不到」
  useEffect(() => {
    if (!step || !ctx) return;
    snap.current = step.snapshot?.(ctx);
    setAskEnd(false);
    missingSince.current = null;
    autoWent.current = false;
    scrolled.current = null;
    setLost(false);
    // 收起還開著的輸入列（空白的那一列按 Esc 就消失、鍵盤收起）
    if (step.enter) setTimeout(step.enter, 300);
    // 甘特圖的步驟（前後任務那兩步除外）：點長條不打開時間安排
    tourState.lockSchedule = !!step.clearOf && step.id !== "wbs-open" && step.id !== "wbs-pick";
    if (step.blur) {
      const ta = document.querySelector<HTMLTextAreaElement>('[data-tour="draft-row"] textarea');
      if (ta && !ta.value.trim()) ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
    // 要在清單上操作：上一步的標籤、廠商抽屜或選單還開著就先關掉（關不掉的，提示卡會請人自己關）
    if (step.clear) {
      const timers = [150, 450, 800].map((ms) => setTimeout(() => document.querySelector(LAYERS) && closeLayers(), ms));
      return () => timers.forEach(clearTimeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, mode]);

  // 建好任務之後：幫還沒有日期的任務排上日期，看板、甘特圖才有東西可以拖（最後一個留著，教「點日期排入」）
  useEffect(() => {
    if (!ctx || mode !== "practice" || step?.id !== "longpress") return;
    tops(ctx).forEach((t, n, all) => {
      if (n === all.length - 1 && all.length > 2) return;
      if (!t.start && !t.due) pm.saveTask({ id: t.id, start: addDays(ctx.today, n * 2), due: addDays(ctx.today, n * 2 + 2) }, { quiet: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id]);

  // 事件：做到了
  useEffect(() => {
    if (!step?.until || !ctx || success) return;
    return onTour((e) => step.until!(e, ctx, snap.current) && complete());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ctx, success]);

  // 畫面凍結：暗下來的地方點不到（在最前面攔下來，app 收不到）
  useEffect(() => {
    if (phase !== "running") return;
    const ok = (t: EventTarget | null) => {
      const el = t instanceof Element ? t : t instanceof Node ? t.parentElement : null;
      if (!el) return true;
      if (el.closest(OPEN_LAYERS)) return true;
      if (allowSel.current && el.closest(allowSel.current)) return true;
      return allowEls.current.some((a) => a.contains(el));
    };
    const block = (e: Event) => {
      if (bypass || ok(e.target)) return;
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    };
    for (const t of BLOCK_EVENTS) window.addEventListener(t, block, { capture: true, passive: false });
    return () => {
      for (const t of BLOCK_EVENTS) window.removeEventListener(t, block, { capture: true });
    };
  }, [phase]);

  // 聚光燈跟著目標走（捲動、換頁、選單打開都會變）；畫面／資料條件也在這裡檢查
  useEffect(() => {
    if (phase !== "running" || !step || !ctx) return;
    const tick = () => {
      const el = step.target?.(ctx) ?? null;
      allowEls.current = el && !step.look ? [el] : [];
      allowSel.current = step.allow;
      setTyping(!!pick('[data-tour="draft-row"]'));
      setLandscape(window.innerWidth > window.innerHeight);
      const cr = step.clearOf?.()?.getBoundingClientRect() ?? null;
      setClearRect((p) => (!cr ? null : p && p.top === cr.top && p.bottom === cr.bottom ? p : cr));
      const ch = cardBody.current?.scrollHeight;
      if (ch) setCardH((p) => (Math.abs(p - ch) > 2 ? ch : p));
      const layer = document.querySelector(LAYERS);
      // 抽屜、長按選單打開、目標不在裡面：拿掉圈圈，提示卡移到上面，不要蓋住選單
      setCovered(!!layer && !(el && el.closest(LAYERS)));
      if (step.done && !revisit.current && !completing.current && Date.now() - backAt.current > 800 && step.done(ctx, snap.current)) complete();
      if (el) {
        missingSince.current = null;
        setLost(false);
        const r = el.getBoundingClientRect();
        if ((r.top < 60 || r.bottom > window.innerHeight - 40) && scrolled.current !== step.id && !el.closest(LAYERS)) {
          scrolled.current = step.id;
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        setRect((p) => (p && p.top === r.top && p.left === r.left && p.width === r.width && p.height === r.height ? p : r));
      } else {
        setRect(null);
        if (step.target) {
          missingSince.current ??= Date.now();
          const gone = Date.now() - missingSince.current;
          // 人在別的頁面：自動帶過去（抽屜、選單開著時不動，可能正在操作）
          if (gone > 900 && step.goto && !autoWent.current && !layer) {
            autoWent.current = true;
            step.goto(ctx);
          }
          if (gone > 2500) setLost(true);
        }
      }
    };
    tick();
    const t = setInterval(tick, 180);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, step, ctx]);

  if (typeof document === "undefined" || phase === "idle") return null;

  /* ── 開始前、結束後：深色卡片（和步驟提示同一種） ── */
  if (phase !== "running") {
    const done = phase === "finish" || phase === "real-finish";
    // code 還在＝剛做完介面導覽，直接接實戰
    const afterPractice = phase === "real-intro" && !!code;
    const title =
      phase === "finish" ? "介面導覽完成" : afterPractice ? "介面導覽完成！接著實戰操演" : phase === "real-intro" || phase === "real-ask" ? "實戰操演" : phase === "real-finish" ? "實戰完成" : "介面導覽";
    const text =
      phase === "finish"
        ? "你已經會篩選專案、建立任務、長按、滑動、分組、看板、甘特圖、前後任務、分享和搜尋。\n接著可以做「實戰教學」：用正式的專案排任務、截圖匯入，再看刪除專案會刪掉什麼。"
        : phase === "real-ask"
          ? "建議先做「介面導覽」，學會每個按鈕，再用正式專案實戰。\n你已經做過介面導覽了嗎？"
          : phase === "real-intro"
          ? (afterPractice ? "練習專案會刪掉。接下來" : "") +
            "用公司正式的專案（做的都會留下來）：從「展開其他專案」找到專案、新增任務、排日期、截圖匯入，最後說明刪除專案不會動到 CRM。"
          : phase === "real-finish"
            ? "以後排程就照這樣：任務追蹤 → 找到專案 → 新增任務、排日期。之後隨時可以從頭像 →「說明」再看一次。"
            : "大約 8 分鐘，一步一步帶你用「專案情報」和「任務追蹤」：篩選、建立任務、長按與滑動、分組、看板、甘特圖、前後任務、分享、搜尋。";
    return createPortal(
      <div data-tour-card className="fixed inset-0 z-[175] flex items-end sm:items-center justify-center p-3 bg-[rgba(17,17,20,0.55)] tour-fade font-sans" role="dialog" aria-modal="true" aria-label={title}>
        <div className="w-full max-w-[400px] bg-[#1C1C22] rounded-[20px] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.55)] p-5 pb-4 tour-rise">
          <div className="w-11 h-11 rounded-[13px] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] flex items-center justify-center">
            <Icon name={done || afterPractice ? "task_alt" : phase === "real-intro" || phase === "real-ask" ? "construction" : "school"} weight={300} className="text-[26px] text-[var(--accent)]" />
          </div>
          <h2 className="mt-3 text-[22px] leading-[28px] font-bold tracking-tight text-white">{title}</h2>
          <p className="mt-1.5 text-[15px] leading-[22px] text-white/75 whitespace-pre-line">{text}</p>
          {(phase === "welcome" || phase === "starting") && (
            <p className="mt-3 rounded-[12px] bg-white/[0.07] px-3 py-2.5 text-[13px] leading-[19px] text-white/60">會建立一個只給你練習的專案，結束或中途離開都會自動刪掉，不會動到正式資料。</p>
          )}
          <div className="mt-5 flex gap-2">
            {phase === "finish" ? (
              <>
                <button type="button" onClick={() => end(true)} className="h-12 px-4 rounded-[14px] bg-white/10 text-[15px] font-semibold text-white active:bg-white/15">
                  先到這裡
                </button>
                <button type="button" onClick={() => setPhase("real-intro")} className="flex-1 h-12 rounded-[14px] bg-[var(--accent)] text-white text-[16px] font-semibold active:opacity-85 inline-flex items-center justify-center gap-2">
                  實戰教學
                  <Icon name="arrow_forward" weight={400} className="text-[20px]" />
                </button>
              </>
            ) : phase === "real-ask" ? (
              <>
                <button type="button" onClick={startReal} className="h-12 px-4 rounded-[14px] bg-white/10 text-[15px] font-semibold text-white active:bg-white/15">
                  已完成，直接開始
                </button>
                <button type="button" onClick={() => setPhase("welcome")} className="flex-1 h-12 rounded-[14px] bg-[var(--accent)] text-white text-[16px] font-semibold active:opacity-85 inline-flex items-center justify-center gap-2">
                  先做介面導覽
                  <Icon name="arrow_forward" weight={400} className="text-[20px]" />
                </button>
              </>
            ) : phase === "real-intro" ? (
              <>
                <button type="button" onClick={() => (code ? end(true) : setPhase("idle"))} className="h-12 px-4 rounded-[14px] bg-white/10 text-[15px] font-semibold text-white active:bg-white/15">
                  之後再說
                </button>
                <button type="button" onClick={startReal} className="flex-1 h-12 rounded-[14px] bg-[var(--accent)] text-white text-[16px] font-semibold active:opacity-85 inline-flex items-center justify-center gap-2">
                  開始
                  <Icon name="arrow_forward" weight={400} className="text-[20px]" />
                </button>
              </>
            ) : phase === "real-finish" ? (
              <button type="button" onClick={() => end(true)} className="flex-1 h-12 rounded-[14px] bg-white text-[#18181B] text-[16px] font-semibold active:opacity-85">
                完成
              </button>
            ) : (
              <>
                <button type="button" onClick={() => setPhase("idle")} disabled={phase === "starting"} className="h-12 px-5 rounded-[14px] bg-white/10 text-[16px] font-semibold text-white active:bg-white/15">
                  {invite ? "之後再說" : "取消"}
                </button>
                <button type="button" onClick={start} disabled={phase === "starting"} className="flex-1 h-12 rounded-[14px] bg-[var(--accent)] text-white text-[16px] font-semibold active:opacity-85 disabled:opacity-70 inline-flex items-center justify-center gap-2">
                  {phase === "starting" && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
                  {phase === "starting" ? "準備練習專案…" : "開始"}
                  {phase !== "starting" && <Icon name="arrow_forward" weight={400} className="text-[20px]" />}
                </button>
              </>
            )}
          </div>
          {phase === "finish" && <p className="mt-3 text-center text-[12px] text-white/40">不管選哪個，練習專案都會刪掉</p>}
          {invite && phase === "welcome" && <p className="mt-3 text-center text-[12px] text-white/40">之後可以從頭像 →「說明」開始</p>}
          {phase === "real-ask" && <p className="mt-3 text-center text-[12px] text-white/40">建議：先做介面導覽，大約 8 分鐘</p>}
        </div>
        <TourStyles />
      </div>,
      document.body
    );
  }

  if (!step || !ctx) return null;

  /* ── 進行中：暗化畫面（點不到）、目標保持亮白、深色提示卡帶小箭頭指著目標 ── */
  const vw = window.innerWidth;
  // 看得到的範圍：iPhone 打開鍵盤時只剩鍵盤上面那一塊（visualViewport）
  const vv = window.visualViewport;
  const vTop = vv?.offsetTop ?? 0;
  const vh = vv?.height ?? window.innerHeight;
  const sx = window.scrollX;
  const sy = window.scrollY;
  const pad = 6;
  const hole = rect && !covered ? { x: rect.left - pad, y: rect.top - pad, w: rect.width + pad * 2, h: rect.height + pad * 2 } : null;
  const waits = !!(step.until || step.done) && !revisit.current;
  const body = typeof step.body === "function" ? step.body(ctx) : step.body;
  const chapters = CHAPTERS.filter((c) => steps.some((s) => s.id === c));
  const chapter = chapterOf(steps, i, chapters);

  // 提示卡位置：放在目標的上面或下面，小箭頭指著目標；上下都放不下（目標很大）就貼在畫面上緣或底部
  const cardW = Math.min(vw - 24, 400);
  // 用提示卡「實際的高度」決定放哪（鍵盤打開時可見範圍很矮，用固定的 200 會判斷成上下都放不下，卡片就蓋到圈圈上）
  const GAP = 12;
  const need = cardH + 4;
  let place: { top?: number; bottom?: number; left: number; caret?: { side: "top" | "bottom"; x: number }; maxH?: number } = { left: (vw - cardW) / 2 };
  if (hole) {
    const cx = hole.x + hole.w / 2;
    const left = Math.max(12, Math.min(cx - cardW / 2, vw - cardW - 12));
    const caretX = Math.max(22, Math.min(cx - left, cardW - 22));
    const avoid = clearRect && !covered ? clearRect : null;
    // 先試「連要讓開的區塊（整張甘特圖）一起讓開」，放不下再只讓開圈圈
    const tryPlace = (top: number, bottom: number, preferAbove: boolean, strict: boolean) => {
      const above = top - vTop - GAP - 8;
      const below = vTop + vh - bottom - GAP - 8;
      const caretDown = hole.y - top < 40 ? { caret: { side: "bottom" as const, x: caretX } } : {};
      const caretUp = bottom - (hole.y + hole.h) < 40 ? { caret: { side: "top" as const, x: caretX } } : {};
      if (preferAbove ? above >= need : below < need && above >= need) return { bottom: top - GAP, left, ...caretDown };
      if (below >= need) return { top: bottom + GAP, left, ...caretUp };
      if (!preferAbove && above >= need) return { bottom: top - GAP, left, ...caretDown };
      if (strict) return null;
      // 上下都放不下：放在空間大的那一邊、緊貼圈圈（不蓋住它），卡片內容自己捲動
      return above > below
        ? { bottom: top - GAP, left, maxH: Math.max(110, above), ...caretDown }
        : { top: bottom + GAP, left, maxH: Math.max(110, below), ...caretUp };
    };
    const lower = hole.y - vTop + hole.h / 2 > vh / 2;
    const big = hole.h > vh * 0.45;
    place =
      (avoid && tryPlace(Math.min(avoid.top, hole.y), Math.max(avoid.bottom, hole.y + hole.h), true, true)) ||
      (big
        ? // 圈的東西很大（整個看板、抽屜）：卡片貼在畫面上緣或下緣，蓋住它的一小角
          (tryPlace(hole.y, hole.y + hole.h, lower, true) ?? (lower ? { top: vTop + 12, left: (vw - cardW) / 2 } : { bottom: vTop + vh - 16, left: (vw - cardW) / 2 }))
        : tryPlace(hole.y, hole.y + hole.h, lower, false)!);
  }
  if (place.top === undefined && place.bottom === undefined) {
    if (covered) place.top = vTop + 12;
    else place.bottom = vTop + vh - 16;
  }
  // 換成整頁座標；bottom＝卡片的下緣（往上長）
  const cardStyle: React.CSSProperties =
    place.top !== undefined
      ? { width: cardW, left: place.left + sx, top: place.top + sy }
      : { width: cardW, left: place.left + sx, top: place.bottom! + sy, transform: "translateY(-100%)" };

  return createPortal(
    <>
      {/* 暗化：圓角的洞（目標保持原本的亮度）。點擊由「畫面凍結」擋，這層只是視覺 */}
      {hole ? (
        <div
          className="absolute z-[170] pointer-events-none rounded-[16px] transition-[left,top,width,height] duration-300 ease-out tour-fade"
          aria-hidden
          style={{ left: hole.x + sx, top: hole.y + sy, width: hole.w, height: hole.h, boxShadow: "0 0 0 9999px rgba(17,17,20,0.55), inset 0 0 0 1.5px rgba(255,255,255,0.9)" }}
        />
      ) : (
        !covered && <div className="fixed inset-0 z-[170] pointer-events-none bg-[rgba(17,17,20,0.55)] tour-fade" aria-hidden />
      )}
      <div
        key={`${mode}-${step.id}`}
        data-tour-card
        role="dialog"
        aria-live="polite"
        aria-label={`新手教學：${step.title}`}
        ref={cardRef}
        className="absolute z-[175] font-sans pointer-events-auto"
        style={cardStyle}
      >
        <div className="relative tour-rise">
        {/* 小箭頭：指著目標 */}
        {place.caret && (
          <span
            aria-hidden
            className="absolute w-0 h-0"
            style={
              place.caret.side === "top"
                ? { top: -9, left: place.caret.x - 10, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderBottom: "10px solid #1C1C22" }
                : { bottom: -9, left: place.caret.x - 10, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderTop: "10px solid #1C1C22" }
            }
          />
        )}
        <div ref={cardBody} className="bg-[#1C1C22] rounded-[18px] shadow-[0_18px_44px_-12px_rgba(0,0,0,0.55)] px-4 pt-3.5 pb-3 overflow-y-auto overscroll-contain" style={place.maxH ? { maxHeight: place.maxH } : undefined}>
          <div className="flex items-start gap-2">
            <h3 className="flex-1 text-[15px] leading-[21px] font-semibold text-[var(--accent)] flex items-center gap-1.5">
              {success && <Icon name="check_circle" fill={1} weight={500} className="text-[18px]" />}
              {success ? "做到了" : askEnd ? `要結束${mode === "real" ? "實戰" : "新手"}教學嗎？` : step.title}
            </h3>
            {!askEnd && !success && (
              <button type="button" onClick={() => setAskEnd(true)} aria-label="結束教學" title="結束教學" className="-mr-1.5 -mt-1 w-8 h-8 rounded-full flex items-center justify-center text-white/45 active:bg-white/10">
                <Icon name="close" className="text-[19px]" />
              </button>
            )}
          </div>

          {askEnd ? (
            <>
              <p className="mt-1 text-[15px] leading-[22px] text-white/85">
                {mode === "real" ? "剛剛新增的任務會留著。" : "練習專案會一起刪掉。"}只是想關掉後面的視窗的話，按「繼續教學」再關。
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => end(false)} className="h-9 px-3.5 rounded-full text-[14px] text-[#FF6B6E] active:bg-white/10">
                  結束教學
                </button>
                <button type="button" onClick={() => setAskEnd(false)} className="h-9 px-4 rounded-full bg-white text-[#18181B] text-[14px] font-semibold active:opacity-85">
                  繼續教學
                </button>
              </div>
            </>
          ) : (
            !success && (
              <>
                <p className="mt-1 text-[15px] leading-[22px] text-white/90">
                  {body}
                  {covered && (
                    <button type="button" onClick={closeLayers} className="mt-2 h-8 px-3 rounded-full bg-white/10 text-[13px] font-semibold text-[var(--accent)] flex w-fit items-center gap-1 active:bg-white/15">
                      <Icon name="close" className="text-[16px]" />
                      關掉後面的視窗
                    </button>
                  )}
                </p>
                <div className="mt-3.5 flex items-center gap-2">
                  {/* ←：回上一步再看一次 */}
                  <button
                    type="button"
                    onClick={back}
                    disabled={i === 0}
                    aria-label="上一步"
                    title="上一步"
                    className="w-9 h-9 rounded-[11px] flex items-center justify-center text-white ring-1 ring-inset ring-white/20 active:bg-white/10 disabled:opacity-25"
                  >
                    <Icon name="arrow_back" weight={500} className="text-[20px]" />
                  </button>
                  {/* 進度：每一章一個點，現在這一章是長條 */}
                  <span className="mx-auto flex items-center gap-1.5" aria-label={`第 ${i + 1} 步，共 ${steps.length} 步`}>
                    {chapters.map((c, n) => (
                      <span key={c} className={`h-[5px] rounded-full transition-all duration-300 ${n === chapter ? "w-5 bg-white" : n < chapter ? "w-[5px] bg-white/70" : "w-[5px] bg-white/25"}`} />
                    ))}
                  </span>
                  {lost && step.goto && (
                    <button type="button" onClick={() => step.goto!(ctx)} className="h-9 px-3 rounded-full text-[14px] font-semibold text-[var(--accent)] active:bg-white/10">
                      帶我過去
                    </button>
                  )}
                  {/* →：下一步（要動手的步驟＝略過這步：先幫你做到再往下，所以是淡一點的外框） */}
                  <button
                    type="button"
                    onClick={next}
                    aria-label={waits ? "略過這步" : i + 1 >= steps.length ? "完成" : "下一步"}
                    title={waits ? "略過這步" : "下一步"}
                    className={`w-9 h-9 rounded-[11px] flex items-center justify-center transition-opacity active:opacity-75 ${waits ? "bg-white/12 text-white ring-1 ring-inset ring-white/25" : "bg-white text-[#18181B]"}`}
                  >
                    <Icon name="arrow_forward" weight={500} className="text-[20px]" />
                  </button>
                </div>
              </>
            )
          )}
        </div>
        </div>
      </div>
      <TourStyles />
    </>,
    document.body
  );
}

/** 章（每章第一步的 id）。新手：介面、建立任務、長按與滑動、分組、看板、甘特圖、分享、搜尋；實戰：專案情報、任務追蹤、匯入、刪除 */
const CHAPTERS = ["nav", "nav-tasks", "longpress", "section-add", "board", "gantt", "export-gantt", "search", "real-nav", "real-nav-tasks", "real-import", "real-delete-try", "real-delete-info", "real-delete-member"];
function chapterOf(steps: Step[], i: number, chapters: string[]): number {
  let c = 0;
  for (let n = 0; n <= i && n < steps.length; n++) {
    const k = chapters.indexOf(steps[n].id);
    if (k >= 0) c = k;
  }
  return c;
}

/** 提示卡進場、遮罩淡入：只有這兩個動態；系統設定「減少動態」就關掉 */
function TourStyles() {
  return (
    <style>{`
      .tour-rise { animation: tour-rise 0.42s cubic-bezier(0.16,1,0.3,1) both; }
      @keyframes tour-rise { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
      .tour-fade { animation: tour-fade 0.25s ease-out both; }
      @keyframes tour-fade { from { opacity: 0; } to { opacity: 1; } }
      @media (prefers-reduced-motion: reduce) { .tour-rise, .tour-fade { animation: none; } }
    `}</style>
  );
}
