"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mutate } from "swr";
import type { Task } from "@/lib/pm/model";
import { addDays } from "@/lib/project-ops";
import { toast } from "../Sheet";
import { Icon } from "../ui";
import { PM_KEY, pmPost, usePm } from "../usePm";
import { onTour, tourEmit, tourState, type TourEvent } from "./bus";

/* ══════════════════════════════════════════════════════════
   新手教學：專案情報＋任務追蹤
   - 從頭像設定「新手教學」開始；新的裝置第一次打開時會邀請一次
   - 每個人一個自己的「新手練習」專案（伺服器建立），教學結束或中途離開都會刪掉
   - 每一步：聚光燈圈住真的按鈕，提示卡說明要做什麼；做到了自動進下一步（也可以略過這步）
   - 不擋操作：暗色遮罩只是視覺，畫面上什麼都能點
   ══════════════════════════════════════════════════════════ */

interface Ctx {
  code: string;
  isManager: boolean;
  /** 練習專案裡的任務 */
  tasks: Task[];
  today: string;
}

interface Step {
  id: string;
  title: string;
  body: string | ((c: Ctx) => string);
  /** 聚光燈要圈的東西 */
  target?: (c: Ctx) => Element | null;
  /** 做到才往下：收到 app 的事件且符合就前進 */
  until?: (e: TourEvent, c: Ctx) => boolean;
  /** 做到才往下：資料變成這樣就前進（每 0.2 秒檢查一次） */
  done?: (c: Ctx, snap: unknown) => boolean;
  /** 進到這一步時記下的狀態（給 done 比較） */
  snapshot?: (c: Ctx) => unknown;
  /** 找不到聚光燈的目標時，「帶我過去」 */
  goto?: (c: Ctx) => void;
  /** 只有符合的人才有這一步 */
  when?: (c: Ctx) => boolean;
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
const go = (g: Record<string, unknown>) => {
  // 要換的檢視先記著：專案清單頁可能這時候才開始畫，等它畫好再套用
  if (typeof g.view === "string") tourState.pendingView = g.view;
  if (typeof g.project === "string") tourState.pendingProject = g.project;
  if (typeof g.openProject === "string") tourState.pendingOpen = g.openProject;
  tourEmit("goto", g);
};
const toProject = (c: Ctx) => go({ nav: "tasks", tab: "任務", project: c.code, view: "list" });

const STEPS: Step[] = [
  /* ── 介面 ── */
  {
    id: "nav",
    title: "四個主頁",
    body: "這一排切換主頁。新手先學兩個：「專案情報」看專案的狀況，「任務追蹤」排任務、打勾完成。",
    target: () => pick('[data-tour="nav"]'),
  },
  {
    id: "nav-project",
    title: "打開專案情報",
    body: "點房子圖示，到「專案情報」。",
    target: () => pick('[data-tour="nav-project_info"]'),
    until: (e) => e.type === "nav" && e.data === "project_info",
    goto: () => go({ nav: "project_info", intelTab: "專案" }),
  },
  {
    id: "open-project",
    title: "你的練習專案",
    body: "這是只給你練習的「新手練習」，教學結束會自動刪掉。點它看看專案頁。",
    target: (c) => pick(`[data-tour="project-${c.code}"]`),
    until: (e, c) => e.type === "project-screen" && e.data === c.code,
    goto: (c) => go({ nav: "project_info", intelTab: "專案", openProject: c.code }),
  },
  {
    id: "summary",
    title: "專案頁",
    body: "上面是摘要：階段、進度、開工與完工、還剩幾天。下面的「資料」直接點右邊就能改，改完自動存。",
    target: () => pick('[data-tour="project-summary"]'),
  },
  {
    id: "back",
    title: "回到清單",
    body: "按左上角的返回。",
    target: () => pick('[data-tour="subscreen-back"]'),
    until: (e) => e.type === "project-screen" && !e.data,
  },
  /* ── 建立任務 ── */
  {
    id: "nav-tasks",
    title: "任務追蹤",
    body: "點勾勾清單圖示，到「任務追蹤」。每天的工作都在這裡。",
    target: () => pick('[data-tour="nav-tasks"]'),
    until: (e) => e.type === "nav" && e.data === "tasks",
    goto: () => go({ nav: "tasks", tab: "任務" }),
  },
  {
    id: "open-list",
    title: "每個專案一張清單",
    body: "右邊的數字是還沒完成的件數。點「新手練習」。",
    target: (c) => pick(`[data-tour="list-${c.code}"]`),
    until: (e, c) => e.type === "route" && e.data === c.code,
    goto: toProject,
  },
  {
    id: "add",
    title: "建立兩個任務",
    body: "點虛線圓圈直接打字，按 Enter 會接著下一個。打兩個，例如「放樣」「打底」。",
    target: () => pick('[data-tour="add-row"]'),
    done: (c) => tops(c).length >= 2,
    goto: toProject,
  },
  /* ── 長按與滑動 ── */
  {
    id: "longpress",
    title: "長按叫出選單",
    body: "長按一個任務（電腦按右鍵）。期限、完成度、指派、廠商、標籤都在這個選單裡。",
    target: (c) => taskRow(c, 0),
    until: (e) => e.type === "menu-open",
    goto: toProject,
  },
  {
    id: "assign",
    title: "指派給同事",
    body: "在選單點「指派 ›」，選一位同事（選自己也可以）。對方會收到通知，打開任務按「收到」回覆你。",
    target: (c) => pick('[data-tour="row-menu"]') ?? taskRow(c, 0),
    when: (c) => c.isManager,
    // 在指派名單點了人才算做到（直接打字新增的任務本來就掛在自己身上，不能看資料判斷）
    until: (e) => e.type === "assigned",
  },
  {
    id: "assign-info",
    title: "被指派的任務",
    body: "主管會用選單裡的「指派」把任務交給你。收到通知後打開任務、按「收到」，對方就知道你看到了。",
    target: (c) => pick('[data-tour="row-menu"]') ?? taskRow(c, 0),
    when: (c) => !c.isManager,
  },
  {
    id: "vendor",
    title: "指定廠商",
    body: "長按任務 →「廠商 ›」，可以搜尋，選一家協力廠商。名單和指揮中心的協力廠商同一份。",
    target: (c) => pick('[data-tour="row-menu"]') ?? taskRow(c, 0),
    done: (c) => c.tasks.some((t) => !!t.meta?.vendor),
    goto: toProject,
  },
  {
    id: "tag",
    title: "加上標籤",
    body: "長按任務 →「標籤 ›」→「工種」，選一個，例如「泥作」。之後可以依標籤找任務。",
    target: (c) => pick('[data-tour="row-menu"]') ?? taskRow(c, 0),
    done: (c) => c.tasks.some((t) => !!(t.meta?.trade || t.meta?.areas?.length || t.meta?.tags?.length)),
    goto: toProject,
  },
  {
    id: "swipe-left",
    title: "往左滑",
    body: "把任務往左滑，出現「重要｜緊急｜刪除」。按「緊急」試試。",
    target: (c) => taskRow(c, 0),
    done: (c) => c.tasks.some((t) => !!t.meta?.urgent || t.flagged),
    goto: toProject,
  },
  {
    id: "swipe-right",
    title: "往右滑：變成子任務",
    body: "把第二個任務往右滑，它會縮排，變成上一個任務的子任務。再往右滑一次就取消。",
    target: (c) => taskRow(c, 1) ?? taskRow(c, 0),
    done: (c) => c.tasks.some((t) => !!t.parentId),
    goto: toProject,
  },
  /* ── 看板與甘特 ── */
  {
    id: "board",
    title: "換成看板",
    body: "右上這顆切換檢視：清單 → 看板 → 甘特圖。點一下換成看板。",
    target: () => pick('[data-tour="view-switch"]'),
    until: (e) => e.type === "view" && e.data === "board",
    goto: (c) => go({ nav: "tasks", tab: "任務", project: c.code, view: "board" }),
  },
  {
    id: "board-drag",
    title: "拖曳卡片",
    body: "按住一張卡片，拖到「進行中」。完成的拖到「完成」。",
    target: () => pick('[data-tour="board"]'),
    done: (c) => c.tasks.some((t) => t.status !== "todo"),
  },
  {
    id: "gantt",
    title: "換成甘特圖",
    body: "再點一下右上那顆，換成甘特圖。",
    target: () => pick('[data-tour="view-switch"]'),
    until: (e) => e.type === "view" && e.data === "gantt",
    goto: (c) => go({ nav: "tasks", tab: "任務", project: c.code, view: "gantt" }),
  },
  {
    id: "gantt-edit",
    title: "進入編輯",
    body: "甘特圖平常只看不改。按鉛筆進入編輯。",
    target: () => pick('[data-tour="gantt-edit"]'),
    until: (e) => e.type === "gantt-edit" && e.data === true,
  },
  {
    id: "gantt-drag",
    title: "排日期",
    body: "拖曳色條換日期，拉左右兩端改天數（手機先長按一下再拖）。左上「週」可以換成日、月。改好按右上打勾。",
    target: () => pick('[data-tour="gantt"]'),
    snapshot: (c) => JSON.stringify(c.tasks.map((t) => [t.id, t.start, t.due])),
    done: (c, snap) => JSON.stringify(c.tasks.map((t) => [t.id, t.start, t.due])) !== snap,
  },
  /* ── 搜尋 ── */
  {
    id: "search",
    title: "搜尋",
    body: "點放大鏡，打任務名稱或標籤，例如「打底」，所有專案的任務都找得到。",
    target: () => pick('[data-tour="search"]'),
    until: (e) => e.type === "search" && typeof e.data === "string" && e.data.trim().length > 0,
  },
];

type Phase = "idle" | "welcome" | "starting" | "running" | "finish";
const INVITED = "pm:tour:invited";
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

export function TourHost() {
  const pm = usePm();
  const [phase, setPhase] = useState<Phase>("idle");
  const [invite, setInvite] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [success, setSuccess] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [covered, setCovered] = useState(false);
  const [lost, setLost] = useState(false);
  const missingSince = useRef<number | null>(null);
  const scrolled = useRef<string | null>(null);
  const snap = useRef<unknown>(undefined);
  const busy = useRef(false);
  // 一步只算一次做到（開發模式下事件可能連發兩次，會一口氣跳兩步）
  const completing = useRef(false);

  const ctx: Ctx | null = useMemo(
    () => (code ? { code, isManager: pm.isManager, tasks: pm.tasks.filter((t) => t.code === code), today: pm.today } : null),
    [code, pm.isManager, pm.tasks, pm.today]
  );
  const steps = useMemo(() => (ctx ? STEPS.filter((s) => !s.when || s.when(ctx)) : STEPS), [ctx]);
  const step = phase === "running" ? steps[i] : undefined;

  /* 從頭像設定開始；新的裝置第一次打開時邀請一次 */
  useEffect(() => onTour((e) => e.type === "tour-start" && phase === "idle" && (setInvite(false), setPhase("welcome"))), [phase]);
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
    await mutate(PM_KEY);
    setI(0);
    setPhase("running");
  };

  const end = async (finished: boolean) => {
    completing.current = false;
    setPhase("idle");
    setCode(null);
    tourState.code = null;
    store.set(ACTIVE, null);
    setRect(null);
    const r = await pmPost<{ purged?: boolean }>({ op: "tutorial.end" });
    await mutate(PM_KEY);
    toast(finished ? "教學完成，練習專案已刪除" : r.ok ? "已結束教學，練習專案已刪除" : "已結束教學");
  };

  const advance = () => {
    completing.current = false;
    setSuccess(false);
    if (i + 1 >= steps.length) {
      setPhase("finish");
      return;
    }
    setI((n) => n + 1);
  };
  const complete = () => {
    if (completing.current) return;
    completing.current = true;
    setSuccess(true);
    setTimeout(advance, 650);
  };

  // 進到新的一步：記下狀態、重設「找不到」
  useEffect(() => {
    if (!step || !ctx) return;
    snap.current = step.snapshot?.(ctx);
    missingSince.current = null;
    scrolled.current = null;
    setLost(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id]);

  // 建好兩個任務之後：幫還沒有日期的任務排上日期，看板、甘特圖才有東西可以拖
  useEffect(() => {
    if (!ctx || step?.id !== "longpress") return;
    tops(ctx).forEach((t, n) => {
      if (!t.start && !t.due) pm.saveTask({ id: t.id, start: addDays(ctx.today, n * 2), due: addDays(ctx.today, n * 2 + 2) }, { quiet: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id]);

  // 事件：做到了
  useEffect(() => {
    if (!step?.until || !ctx || success) return;
    return onTour((e) => step.until!(e, ctx) && complete());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ctx, success]);

  // 資料：做到了
  useEffect(() => {
    if (!step?.done || !ctx || success) return;
    if (step.done(ctx, snap.current)) complete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ctx, success]);

  // 聚光燈跟著目標走（捲動、換頁、選單打開都會變）
  useEffect(() => {
    if (phase !== "running" || !step || !ctx) return;
    const tick = () => {
      const el = step.target?.(ctx) ?? null;
      // 抽屜、長按選單打開時：拿掉遮罩，提示卡移到上面，不要蓋住選單
      setCovered(!!document.querySelector('[data-pm-sheet], [role="dialog"][aria-label="任務選單"]'));
      if (el) {
        missingSince.current = null;
        setLost(false);
        const r = el.getBoundingClientRect();
        if ((r.top < 60 || r.bottom > window.innerHeight - 40) && scrolled.current !== step.id) {
          scrolled.current = step.id;
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        setRect((p) => (p && p.top === r.top && p.left === r.left && p.width === r.width && p.height === r.height ? p : r));
      } else {
        setRect(null);
        if (step.target) {
          missingSince.current ??= Date.now();
          if (Date.now() - missingSince.current > 1200) setLost(true);
        }
      }
    };
    tick();
    const t = setInterval(tick, 180);
    return () => clearInterval(t);
  }, [phase, step, ctx]);

  if (typeof document === "undefined" || phase === "idle") return null;

  /* ── 開始前、結束後：置中的卡片 ── */
  if (phase === "welcome" || phase === "starting" || phase === "finish") {
    const fin = phase === "finish";
    return createPortal(
      <div className="fixed inset-0 z-[175] flex items-end sm:items-center justify-center p-3 bg-black/40 tour-fade font-sans" role="dialog" aria-modal="true" aria-label="新手教學">
        <div className="w-full max-w-[400px] bg-white rounded-[22px] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.35)] p-5 pb-4 tour-rise">
          <div className="w-12 h-12 rounded-[14px] bg-[var(--accent-soft)] flex items-center justify-center">
            <Icon name={fin ? "task_alt" : "school"} weight={400} className="text-[28px] text-[var(--accent-strong)]" />
          </div>
          <h2 className="mt-3 text-[22px] leading-[28px] font-bold tracking-tight text-[#18181B]">{fin ? "完成了" : "新手教學"}</h2>
          <p className="mt-1.5 text-[15px] leading-[22px] text-[#52525B]">
            {fin
              ? "你已經會建立任務、長按、滑動、看板、甘特圖、指派、廠商、標籤和搜尋。之後隨時可以從頭像 →「新手教學」再看一次。"
              : "大約 5 分鐘，一步一步帶你用「專案情報」和「任務追蹤」：建立任務、長按與滑動、看板、甘特圖、指派、廠商、標籤、搜尋。"}
          </p>
          {!fin && (
            <p className="mt-3 rounded-[12px] bg-[#F6F6F7] px-3 py-2.5 text-[13px] leading-[19px] text-[#6E6E73]">
              會建立一個只給你練習的專案，結束或中途離開都會自動刪掉，不會動到正式資料。
            </p>
          )}
          <div className="mt-5 flex gap-2">
            {fin ? (
              <button type="button" onClick={() => end(true)} className="flex-1 h-12 rounded-[14px] bg-[#18181B] text-white text-[16px] font-semibold active:opacity-85">
                結束並刪除練習專案
              </button>
            ) : (
              <>
                <button type="button" onClick={() => setPhase("idle")} disabled={phase === "starting"} className="h-12 px-5 rounded-[14px] bg-[#F2F2F4] text-[16px] font-semibold text-[#3F3F46] active:bg-[#E4E4E7]">
                  {invite ? "之後再說" : "取消"}
                </button>
                <button type="button" onClick={start} disabled={phase === "starting"} className="flex-1 h-12 rounded-[14px] bg-[var(--accent)] text-white text-[16px] font-semibold active:opacity-85 disabled:opacity-70 inline-flex items-center justify-center gap-2">
                  {phase === "starting" && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
                  {phase === "starting" ? "準備練習專案…" : "開始"}
                </button>
              </>
            )}
          </div>
          {invite && !fin && <p className="mt-3 text-center text-[12px] text-[#A1A1AA]">之後可以從頭像 →「新手教學」開始</p>}
        </div>
        <TourStyles />
      </div>,
      document.body
    );
  }

  if (!step || !ctx) return null;

  /* ── 進行中：聚光燈＋提示卡 ── */
  const pad = 6;
  const hole = rect && !covered ? { x: rect.left - pad, y: rect.top - pad, w: rect.width + pad * 2, h: rect.height + pad * 2 } : null;
  const cardTop = covered || (rect ? rect.top + rect.height / 2 > window.innerHeight * 0.55 : false);
  const waits = !!(step.until || step.done);
  const body = typeof step.body === "function" ? step.body(ctx) : step.body;

  return createPortal(
    <>
      {/* 暗色遮罩（只是視覺，不擋點擊）：四塊圍出一個洞 */}
      {hole && (
        <div className="fixed inset-0 z-[135] pointer-events-none tour-fade" aria-hidden>
          <div className="absolute left-0 right-0 top-0 bg-black/40" style={{ height: Math.max(0, hole.y) }} />
          <div className="absolute left-0 right-0 bottom-0 bg-black/40" style={{ top: hole.y + hole.h }} />
          <div className="absolute left-0 bg-black/40" style={{ top: hole.y, height: hole.h, width: Math.max(0, hole.x) }} />
          <div className="absolute right-0 bg-black/40" style={{ top: hole.y, height: hole.h, left: hole.x + hole.w }} />
          <div className="absolute rounded-[14px] tour-ring" style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }} />
        </div>
      )}
      {/* 提示卡：目標在下半部就放上面，反之放下面；選單或抽屜打開時放上面 */}
      <div
        className="fixed left-0 right-0 z-[175] px-3 flex justify-center pointer-events-none font-sans"
        style={cardTop ? { top: "calc(env(safe-area-inset-top, 0px) + 10px)" } : { bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      >
        <div key={step.id} role="dialog" aria-live="polite" aria-label={`新手教學：${step.title}`} className="pointer-events-auto w-full max-w-[420px] bg-white rounded-[18px] shadow-[0_16px_44px_-10px_rgba(0,0,0,0.32)] overflow-hidden tour-rise">
          <div className="h-[3px] bg-[#F0F0F2]">
            <div className="h-full bg-[var(--accent)] transition-[width] duration-500 ease-out" style={{ width: `${((i + (success ? 1 : 0)) / steps.length) * 100}%` }} />
          </div>
          <div className="px-4 pt-3 pb-3">
            <div className="flex items-start gap-2">
              <h3 className="flex-1 text-[17px] leading-[22px] font-semibold text-[#18181B] flex items-center gap-1.5">
                {success && <Icon name="check_circle" fill={1} weight={500} className="text-[20px] text-[#30A46C]" />}
                {success ? "做到了" : step.title}
              </h3>
              <button type="button" onClick={() => end(false)} aria-label="結束教學" title="結束教學" className="-mr-1.5 -mt-1 w-8 h-8 rounded-full flex items-center justify-center text-[#A1A1AA] active:bg-[#F2F2F4]">
                <Icon name="close" className="text-[20px]" />
              </button>
            </div>
            {!success && <p className="mt-1 text-[15px] leading-[22px] text-[#3F3F46]">{body}</p>}
            {!success && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[12px] text-[#A1A1AA] tabular-nums mr-auto">
                  {i + 1} / {steps.length}
                </span>
                {lost && step.goto && (
                  <button type="button" onClick={() => step.goto!(ctx)} className="h-9 px-3.5 rounded-full bg-[var(--accent-soft)] text-[14px] font-semibold text-[var(--accent-ink)] active:opacity-80">
                    帶我過去
                  </button>
                )}
                {waits ? (
                  <button type="button" onClick={() => !completing.current && advance()} className="h-9 px-3 rounded-full text-[14px] text-[#8E8E93] active:bg-[#F2F2F4]">
                    略過這步
                  </button>
                ) : (
                  <button type="button" onClick={() => !completing.current && advance()} className="h-9 px-4 rounded-full bg-[var(--accent)] text-white text-[14px] font-semibold active:opacity-85">
                    {i + 1 >= steps.length ? "完成" : "下一步"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <TourStyles />
    </>,
    document.body
  );
}

/** 聚光燈的呼吸光圈、提示卡進場：只有這一個動態；系統設定「減少動態」就關掉 */
function TourStyles() {
  return (
    <style>{`
      .tour-ring { box-shadow: 0 0 0 2px var(--accent), 0 0 0 6px color-mix(in srgb, var(--accent) 28%, transparent); animation: tour-breathe 1.8s cubic-bezier(0.16,1,0.3,1) infinite; }
      @keyframes tour-breathe { 0%,100% { box-shadow: 0 0 0 2px var(--accent), 0 0 0 5px color-mix(in srgb, var(--accent) 30%, transparent); } 50% { box-shadow: 0 0 0 2px var(--accent), 0 0 0 11px color-mix(in srgb, var(--accent) 0%, transparent); } }
      .tour-rise { animation: tour-rise 0.42s cubic-bezier(0.16,1,0.3,1) both; }
      @keyframes tour-rise { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
      .tour-fade { animation: tour-fade 0.25s ease-out both; }
      @keyframes tour-fade { from { opacity: 0; } to { opacity: 1; } }
      @media (prefers-reduced-motion: reduce) { .tour-ring, .tour-rise, .tour-fade { animation: none; } }
    `}</style>
  );
}
