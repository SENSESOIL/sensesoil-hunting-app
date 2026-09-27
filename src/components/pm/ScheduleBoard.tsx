"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  diffDays,
  fmtDate,
  mondayOf,
  toDay,
  WEEKDAYS,
  type ProjectView,
  type WorkItemView,
} from "@/lib/project-ops";
import Gantt, { type GanttRow } from "./Gantt";
import {
  Card,
  Chip,
  EmptyState,
  HEALTH_META,
  HealthBadge,
  Icon,
  SectionTitle,
  SubScreen,
  useWhiteStatusBar,
  ACCENT,
  INK_2,
  STATUS,
  TEXT_3,
  WORK_META,
} from "./ui";
import { DataNotice, SetupGuide } from "./ProjectDossier";
import { DossierScreen } from "./DossierScreen";
import { DailyReportSheet, ItemQuickSheet } from "./QuickSheets";
import { ToastHost } from "./Sheet";
import { useProjectOps, type ProjectOps } from "./useProjectOps";

export const SCHEDULE_TABS = ["本週", "甘特圖"];

const overlaps = (it: WorkItemView, from: string, to: string) =>
  !!it.start && !!it.end && it.start <= to && it.end >= from;

/** 等待期（養護、試水、生產期）不用派工班，不算進「幾處工地、幾個工項」 */
const needsCrew = (it: WorkItemView) => it.kind !== "等待";

/** 工項沒有 id（極舊的資料）時退回用名稱＋位置當 key；名稱會重複，不能單用名稱 */
const itemKey = (it: WorkItemView, i: number) => it.id ?? `${it.trade}-${i}`;

type Quick = null | { kind: "item"; code: string; itemId: string } | { kind: "daily"; code: string };

export default function ScheduleBoard({ activeTab }: { activeTab: string }) {
  const ops = useProjectOps();
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [quick, setQuick] = useState<Quick>(null);
  useWhiteStatusBar(openCode !== null || setupOpen);

  // 關閉抽屜時 quick 會先變成 null；保留最後一次的目標，滑出動畫才不會先變成空白
  const lastQuick = useRef<Quick>(quick);
  if (quick) lastQuick.current = quick;
  const lastItemId = useRef<string | null>(null);
  if (quick?.kind === "item") lastItemId.current = quick.itemId;
  const shownQuick = quick ?? lastQuick.current;
  const quickP = shownQuick ? ops.views.find((v) => v.code === shownQuick.code) : undefined;

  // 舊資料的工項可能沒有 id，快速編輯找不到對象 —— 改開專案細節，至少還能用完整的工項編輯器
  const openItem = (code: string, it: WorkItemView) => {
    if (it.id) setQuick({ kind: "item", code, itemId: it.id });
    else setOpenCode(code);
  };
  const openDaily = (code: string) => setQuick({ kind: "daily", code });
  const openSetup = () => setSetupOpen(true);

  const tab =
    activeTab === "甘特圖" ? (
      <GanttTab ops={ops} onOpen={setOpenCode} onOpenSetup={openSetup} />
    ) : (
      <WeekTab ops={ops} onOpen={setOpenCode} onItem={openItem} onDaily={openDaily} onOpenSetup={openSetup} />
    );

  return (
    <>
      <div className="px-6 lg:px-10 pb-6">
        {ops.loading ? (
          <BoardSkeleton gantt={activeTab === "甘特圖"} />
        ) : ops.error && !ops.hasData ? (
          <Card>
            <EmptyState
              icon={ops.errorStatus === 403 ? "lock" : "cloud_off"}
              title={ops.errorStatus === 403 ? "目前只開放管理者使用" : "讀取排程資料失敗"}
              hint={ops.errorStatus === 403 ? undefined : ops.error}
              action={ops.errorStatus !== 403 ? <RetryButton onRetry={ops.refresh} solid /> : undefined}
            />
          </Card>
        ) : (
          <>
            {/* 重新整理失敗但手上有舊資料：照常顯示，只提醒資料停在哪個時間點 */}
            {ops.error && <StaleStrip ops={ops} />}
            {ops.registryError && (
              <Card className="mb-5">
                <EmptyState
                  icon="folder_off"
                  title="讀不到專案CRM 名冊"
                  hint="工進排程依專案CRM 的代碼對應工地；名冊讀不到時，無法列出工地與工項。"
                  action={<RetryButton onRetry={ops.refresh} solid />}
                />
              </Card>
            )}
            {/* 名冊讀不到時 views 是空的，底下的「還沒有排定的工項」會誤導，乾脆不顯示 */}
            {!(ops.registryError && ops.views.length === 0) && tab}
          </>
        )}
      </div>

      <DossierScreen
        code={openCode}
        ops={ops}
        onOpenProject={setOpenCode}
        onClose={() => setOpenCode(null)}
        onOpenSetup={openSetup}
      />
      {quickP && shownQuick && (
        <>
          <ItemQuickSheet
            p={quickP}
            ops={ops}
            itemId={lastItemId.current}
            open={quick?.kind === "item"}
            onClose={() => setQuick(null)}
            onOpenProject={() => {
              setQuick(null);
              setOpenCode(shownQuick.code);
            }}
          />
          <DailyReportSheet p={quickP} ops={ops} open={quick?.kind === "daily"} onClose={() => setQuick(null)} />
        </>
      )}
      <ToastHost />
      <SubScreen open={setupOpen} title="連接工程資料" onClose={() => setSetupOpen(false)}>
        {setupOpen && <SetupGuide ops={ops} />}
      </SubScreen>
    </>
  );
}

/* ══════════════════════════════════════════════════════════
   載入／錯誤
   ══════════════════════════════════════════════════════════ */

function BoardSkeleton({ gantt }: { gantt: boolean }) {
  const block = "bg-white border border-[#E4E4E7]/60";
  return (
    <div className="flex flex-col gap-4 animate-pulse" role="status" aria-label="載入中">
      <div className="flex items-center justify-between gap-3">
        <div className={`h-[46px] w-[200px] rounded-[12px] ${block}`} />
        <div className={`h-10 w-[120px] rounded-full ${block}`} />
      </div>
      {gantt ? (
        <div className={`h-[420px] rounded-[18px] ${block}`} />
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1.5 lg:hidden">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className={`h-[64px] rounded-[14px] ${block}`} />
            ))}
          </div>
          <div className={`h-[200px] rounded-[18px] lg:hidden ${block}`} />
          <div className={`hidden lg:block h-[360px] rounded-[18px] ${block}`} />
        </>
      )}
    </div>
  );
}

/**
 * 重試：refresh 只是送出請求、沒有回傳結果，
 * 按下後短暫顯示「重試中」讓人知道有反應，避免連點。
 */
function RetryButton({ onRetry, solid }: { onRetry: () => void; solid?: boolean }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setBusy(false), 1500);
    return () => clearTimeout(t);
  }, [busy]);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        onRetry();
      }}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-colors disabled:opacity-70 ${
        solid
          ? "h-11 px-5 text-[13px] bg-[#18181B] text-white border-2 border-[#18181B] active:opacity-85 focus-visible:border-[#F39C12]"
          : "h-9 px-3 text-[12.5px] text-[#18181B] border border-transparent hover:bg-white focus-visible:bg-white focus-visible:border-[#F39C12]"
      }`}
    >
      {busy && <Icon name="progress_activity" weight={300} className="text-[16px] animate-spin" />}
      {busy ? "重試中" : "重試"}
    </button>
  );
}

function StaleStrip({ ops }: { ops: ProjectOps }) {
  const t = ops.fetchedAt ? new Date(ops.fetchedAt) : null;
  const hhmm = t ? `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}` : "先前";
  return (
    <div
      role="status"
      className="mb-4 min-h-[44px] pl-3 pr-1 py-1 flex items-center gap-2 rounded-[12px] bg-[#F4F4F5] text-[12.5px] text-[#3F3F46]"
    >
      <Icon name="cloud_off" weight={300} className="text-[18px] text-[#A1A1AA] shrink-0" />
      <span className="flex-1 min-w-0">
        更新失敗，目前顯示 <b className="font-semibold tabular-nums text-[#18181B]">{hhmm}</b> 的資料
      </span>
      <RetryButton onRetry={ops.refresh} />
    </div>
  );
}

/** 本機試編標記：這個專案有改動只存在這台裝置，還沒進雲端 */
function DraftMark() {
  return (
    <span role="img" aria-label="本機修改" title="本機修改（只存在這台裝置）" className="inline-flex shrink-0">
      <Icon name="phone_iphone" weight={300} className="text-[13px] text-[#A1A1AA]" />
    </span>
  );
}

/* ══════════════════════════════════════════════════════════
   本週：派工看板
   手機：選一天看當天各工地的工項；桌機：工地 × 七天的派工表
   點工地 → 專案細節；點工項 → 快速更新；今天 → 今日回報
   ══════════════════════════════════════════════════════════ */

function WeekTab({
  ops,
  onOpen,
  onItem,
  onDaily,
  onOpenSetup,
}: {
  ops: ProjectOps;
  onOpen: (code: string) => void;
  onItem: (code: string, it: WorkItemView) => void;
  onDaily: (code: string) => void;
  onOpenSetup: () => void;
}) {
  const { views, today } = ops;
  const thisMonday = mondayOf(today);
  const [monday, setMonday] = useState(thisMonday);
  const [picked, setPicked] = useState<string | null>(null);
  const sunday = addDays(monday, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const day = picked && picked >= monday && picked <= sunday ? picked : today >= monday && today <= sunday ? today : monday;
  const drafted = (code: string) => ops.saveMode === "sandbox" && ops.isDrafted(code);

  const scheduled = views.some((v) => v.items.some((i) => i.start && i.end));

  const sites = useMemo(
    () =>
      views
        .map((v) => ({ v, items: v.items.filter((it) => overlaps(it, monday, sunday)) }))
        .filter((x) => x.items.length > 0)
        .sort((a, b) => (a.v.ops?.dueAt || "9").localeCompare(b.v.ops?.dueAt || "9")),
    [views, monday, sunday]
  );

  const activeOn = (d: string) =>
    sites.map((s) => ({ v: s.v, items: s.items.filter((it) => overlaps(it, d, d)) })).filter((s) => s.items.length > 0);
  /** 當天需要派工的工地數（只剩等待期的工地不用排人） */
  const crewSitesOn = (d: string) => activeOn(d).filter((s) => s.items.some(needsCrew)).length;

  // 近期節點：14 天內結束的工項＋預計完工的專案
  const milestones = useMemo(() => {
    const end = addDays(today, 14);
    const out: { date: string; v: ProjectView; text: string; kind: "item" | "due"; it?: WorkItemView }[] = [];
    views.forEach((v) => {
      v.items.forEach((it) => {
        if (it.end && it.end >= today && it.end <= end && it.status !== "完成") {
          out.push({ date: it.end, v, text: it.kind === "等待" ? `${it.trade}結束` : `${it.trade}預定完成`, kind: "item", it });
        }
      });
      if (v.ops?.dueAt && v.health !== "完工" && v.ops.dueAt >= today && v.ops.dueAt <= end) {
        out.push({ date: v.ops.dueAt, v, text: "預計完工", kind: "due" });
      }
    });
    // 同一天：專案完工排在工項前面
    return out.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "due" ? 0 : 1) - (b.kind === "due" ? 0 : 1));
  }, [views, today]);

  const lateItems = useMemo(
    () =>
      views
        .flatMap((v) => v.items.filter((it) => it.status === "延遲").map((it) => ({ v, it })))
        .sort((a, b) => (a.it.end || "").localeCompare(b.it.end || "")),
    [views]
  );

  if (!scheduled) {
    return (
      <div className="flex flex-col gap-5">
        <DataNotice ops={ops} onOpenSetup={onOpenSetup} />
        <Card>
          <EmptyState
            icon="calendar_view_week"
            title="還沒有排定的工項"
            hint="打開任一專案，按「工項排程」填上各工項的起訖日期（或填在試算表的「工進排程」分頁），這裡就會列出每一天哪個工地有哪些工班。"
          />
        </Card>
      </div>
    );
  }

  const weekLabel =
    monday === thisMonday ? "本週" : monday === addDays(thisMonday, 7) ? "下週" : monday === addDays(thisMonday, -7) ? "上週" : "";
  const dayActive = activeOn(day);
  const crewSites = sites.filter((s) => s.items.some(needsCrew)).length;
  const crewItems = sites.reduce((n, s) => n + s.items.filter(needsCrew).length, 0);
  const dayCrewSites = crewSitesOn(day);
  const isTodayPicked = day === today;
  const dayMeta = [isTodayPicked ? "今天" : "", dayCrewSites > 0 ? `${dayCrewSites} 處派工` : ""].filter(Boolean).join("　·　");

  return (
    <div className="flex flex-col gap-6">
      <DataNotice ops={ops} onOpenSetup={onOpenSetup} />

      {/* 週切換 */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[19px] font-bold text-[#18181B] tabular-nums leading-tight">
            {fmtDate(monday, today)} – {fmtDate(sunday, today)}
          </p>
          <p className="text-[12px] text-[#71717A] mt-0.5">
            {weekLabel && `${weekLabel}　·　`}
            {crewSites} 處工地　·　{crewItems} 個工項
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {monday !== thisMonday && (
            <button
              type="button"
              onClick={() => {
                setMonday(thisMonday);
                setPicked(null);
              }}
              className="h-10 px-3.5 rounded-full text-[12.5px] font-semibold text-[#18181B] bg-white border border-[#E4E4E7] active:bg-[#F4F4F5] focus-visible:border-[#F39C12] mr-0.5"
            >
              本週
            </button>
          )}
          {[-7, 7].map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => {
                setMonday(addDays(monday, n));
                setPicked(null);
              }}
              // 視覺 40px，用偽元素把點擊範圍撐到 44px
              className="relative w-10 h-10 rounded-full bg-white border border-[#E4E4E7] flex items-center justify-center text-[#3F3F46] active:bg-[#F4F4F5] focus-visible:border-[#F39C12] after:absolute after:-inset-[2px] after:rounded-full"
              aria-label={n < 0 ? "上一週" : "下一週"}
            >
              <Icon name={n < 0 ? "chevron_left" : "chevron_right"} className="text-[20px]" />
            </button>
          ))}
        </div>
      </div>

      {/* ── 手機：日期列＋當日清單 ── */}
      <div className="lg:hidden flex flex-col gap-4">
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d) => {
            const n = crewSitesOn(d);
            const sel = d === day;
            const isToday = d === today;
            const dow = toDay(d).getDay();
            const weekend = dow === 0 || dow === 6;
            return (
              <button
                type="button"
                key={d}
                onClick={() => setPicked(d)}
                aria-pressed={sel}
                aria-label={`${toDay(d).getMonth() + 1}/${toDay(d).getDate()} 週${WEEKDAYS[dow]}${isToday ? "（今天）" : ""}，${
                  n > 0 ? `${n} 處派工` : "沒有派工"
                }`}
                className={`min-h-[64px] rounded-[14px] py-2 flex flex-col items-center gap-0.5 border transition-colors ${
                  sel
                    ? "bg-[#18181B] border-[#18181B] text-white focus-visible:border-[#F39C12]"
                    : `${weekend ? "bg-[#FAFAFA]" : "bg-white"} border-[#E4E4E7]/70 text-[#18181B] active:bg-[#F4F4F5] focus-visible:border-[#F39C12]`
                }`}
              >
                <span className={`text-[11px] ${sel ? "text-white/70" : "text-[#71717A]"}`}>{WEEKDAYS[dow]}</span>
                <span className="text-[16px] font-bold tabular-nums leading-tight">{toDay(d).getDate()}</span>
                <span className="h-[14px] flex items-center justify-center" aria-hidden>
                  {n > 0 ? (
                    <span className={`text-[10px] font-semibold tabular-nums ${sel ? "text-white/85" : "text-[#71717A]"}`}>{n}處</span>
                  ) : isToday ? null : (
                    <span className={`text-[10px] ${sel ? "text-white/40" : "text-[#D4D4D8]"}`}>–</span>
                  )}
                </span>
                {isToday && <span className="w-1 h-1 rounded-full -mt-0.5" style={{ background: ACCENT }} aria-hidden />}
              </button>
            );
          })}
        </div>

        <div>
          <SectionTitle
            title={`${toDay(day).getMonth() + 1}/${toDay(day).getDate()}（${WEEKDAYS[toDay(day).getDay()]}）`}
            meta={dayMeta || undefined}
          />
          {dayActive.length === 0 ? (
            <Card>
              <p className="px-4 py-5 text-[13px] text-[#71717A]">這天沒有排定的工項。</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {dayActive.map(({ v, items }) => (
                <SiteCard
                  key={v.code}
                  v={v}
                  items={items}
                  day={day}
                  today={today}
                  drafted={drafted(v.code)}
                  onOpen={onOpen}
                  onItem={onItem}
                  onDaily={onDaily}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 桌機：工地 × 七天 ── */}
      <div className="hidden lg:block">
        <Card className="overflow-hidden">
          <div className="grid" style={{ gridTemplateColumns: "220px repeat(7, minmax(0, 1fr))" }}>
            <div className="px-4 py-3 text-[11.5px] font-semibold text-[#71717A] border-b border-[#E4E4E7]">工地</div>
            {days.map((d) => {
              const dow = toDay(d).getDay();
              const isToday = d === today;
              return (
                <div
                  key={d}
                  className={`px-2 py-2.5 text-center border-b border-l border-[#E4E4E7] ${isToday ? "bg-[#FFF8EC]" : ""}`}
                >
                  <span className="block text-[11px] text-[#71717A]">
                    週{WEEKDAYS[dow]}
                    {isToday && "・今天"}
                  </span>
                  <span className={`block text-[15px] font-bold tabular-nums ${isToday ? "text-[#18181B]" : "text-[#3F3F46]"}`}>
                    {toDay(d).getMonth() + 1}/{toDay(d).getDate()}
                  </span>
                </div>
              );
            })}
            {sites.map(({ v, items }, ri) => (
              <React.Fragment key={v.code}>
                <button
                  type="button"
                  onClick={() => onOpen(v.code)}
                  className={`px-4 py-3 text-left transition-colors hover:bg-[#FAFAFA] focus-visible:bg-[#F4F4F5] ${
                    ri === sites.length - 1 ? "" : "border-b border-[#F4F4F5]"
                  }`}
                >
                  <span className="block text-[13.5px] font-semibold text-[#18181B] truncate">{v.name}</span>
                  <span className="flex items-center gap-1.5 mt-1">
                    <span className="text-[11px] text-[#71717A] tabular-nums">{v.code}</span>
                    {drafted(v.code) && <DraftMark />}
                    <HealthBadge health={v.health} compact />
                  </span>
                </button>
                {days.map((d) => {
                  // 要派工的排前面；只剩等待期的格子一眼就看得出「今天不用排人」
                  const act = items
                    .filter((it) => overlaps(it, d, d))
                    .sort((a, b) => Number(!needsCrew(a)) - Number(!needsCrew(b)));
                  const dow = toDay(d).getDay();
                  const isToday = d === today;
                  return (
                    <div
                      key={d}
                      className={`border-l border-[#F4F4F5] px-1.5 py-2 flex flex-col gap-1 ${
                        ri === sites.length - 1 ? "" : "border-b border-b-[#F4F4F5]"
                      } ${isToday ? "bg-[#FFF8EC]/60" : dow === 0 || dow === 6 ? "bg-[#FCFCFC]" : ""}`}
                    >
                      {act.slice(0, 3).map((it, i) => (
                        <TradeChip key={itemKey(it, i)} it={it} onClick={() => onItem(v.code, it)} />
                      ))}
                      {act.length > 3 && (
                        <button
                          type="button"
                          onClick={() => onOpen(v.code)}
                          className="h-6 px-1 rounded-[6px] text-left text-[10.5px] font-medium text-[#71717A] hover:text-[#18181B] hover:bg-white focus-visible:bg-white"
                        >
                          +{act.length - 3} 項
                        </button>
                      )}
                      {isToday && act.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onDaily(v.code)}
                          className="mt-auto h-7 rounded-[6px] border border-dashed border-[#D4D4D8] inline-flex items-center justify-center gap-0.5 text-[11px] font-semibold text-[#52525B] transition-colors hover:bg-white hover:border-[#A1A1AA] hover:text-[#18181B] focus-visible:bg-white focus-visible:border-[#F39C12]"
                        >
                          <Icon name="edit_note" weight={300} className="text-[15px]" />
                          今日回報
                        </button>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </Card>
        <div className="text-[11.5px] text-[#71717A] mt-2 px-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <Icon name="error" weight={400} fill={1} className="text-[13px]" style={{ color: STATUS.critical }} />
            超過預定完成日
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-[3px] bg-[#FAFAFA] border border-[#E4E4E7]" aria-hidden />
            <span className="line-through decoration-[#A1A1AA]">已完成</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-[3px] bg-[#F4F4F5]" aria-hidden />
            等待期（免派工）
          </span>
          <span className="ml-auto">點工地看專案，點工項更新進度</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <section>
          <SectionTitle title="兩週內的節點" meta={milestones.length ? `${milestones.length} 項` : undefined} />
          <Card className="overflow-hidden">
            {milestones.length === 0 ? (
              <p className="px-4 py-5 text-[13px] text-[#71717A]">未來 14 天沒有預定完成的工項或完工節點。</p>
            ) : (
              <>
                {milestones.slice(0, 10).map((ms, i, arr) => {
                  const d = diffDays(today, ms.date);
                  const due = ms.kind === "due";
                  const icon = due
                    ? "flag"
                    : ms.it?.kind === "里程碑"
                      ? "diamond"
                      : ms.it?.kind === "檢驗"
                        ? "fact_check"
                        : ms.it?.kind === "等待"
                          ? "hourglass_empty"
                          : "radio_button_unchecked";
                  return (
                    <button
                      type="button"
                      key={`${ms.v.code}-${ms.kind}-${ms.it?.id ?? ms.text}-${ms.date}-${i}`}
                      // 工項節點直接快速更新；專案完工節點打開專案細節
                      onClick={() => (!due && ms.it ? onItem(ms.v.code, ms.it) : onOpen(ms.v.code))}
                      className={`w-full min-h-[56px] text-left px-4 py-3 flex items-center gap-3 transition-colors active:bg-[#F4F4F5] hover:bg-[#FAFAFA] focus-visible:bg-[#F4F4F5] ${
                        i === arr.length - 1 ? "" : "border-b border-[#F4F4F5]"
                      }`}
                    >
                      <span className="w-12 shrink-0 text-center">
                        <span className="block text-[14px] font-bold text-[#18181B] tabular-nums leading-tight">{fmtDate(ms.date, today)}</span>
                        <span className="block text-[10.5px] text-[#71717A]">{d === 0 ? "今天" : d === 1 ? "明天" : `${d} 天後`}</span>
                      </span>
                      <Icon
                        name={icon}
                        weight={due ? 400 : 300}
                        fill={due ? 1 : 0}
                        className={`text-[16px] shrink-0 ${due ? "text-[#18181B]" : "text-[#A1A1AA]"}`}
                      />
                      <span className="flex-1 min-w-0">
                        <span className={`block text-[13.5px] truncate ${due ? "font-bold text-[#18181B]" : "font-medium text-[#3F3F46]"}`}>
                          {ms.text}
                        </span>
                        <span className="block text-[11.5px] text-[#71717A] truncate">
                          {ms.v.code} {ms.v.name}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {milestones.length > 10 && (
                  <p className="px-4 py-2.5 border-t border-[#F4F4F5] text-[11.5px] text-[#71717A]">
                    另有 {milestones.length - 10} 項，切到甘特圖看完整時程
                  </p>
                )}
              </>
            )}
          </Card>
        </section>

        <section>
          <SectionTitle title="延遲中的工項" meta={lateItems.length ? `${lateItems.length} 項` : undefined} />
          <Card className="overflow-hidden">
            {lateItems.length === 0 ? (
              <div className="px-4 py-5 flex items-center gap-3 text-[13px] text-[#71717A]">
                <Icon name="verified" weight={300} className="text-[22px] text-[#0ca30c]" />
                所有工項都在預定時間內。
              </div>
            ) : (
              <>
                {lateItems.slice(0, 8).map(({ v, it }, i, arr) => (
                  <button
                    type="button"
                    key={`${v.code}-${it.id ?? it.trade}-${i}`}
                    onClick={() => onItem(v.code, it)}
                    className={`w-full min-h-[56px] text-left px-4 py-3 flex items-center gap-3 transition-colors active:bg-[#F4F4F5] hover:bg-[#FAFAFA] focus-visible:bg-[#F4F4F5] ${
                      i === arr.length - 1 ? "" : "border-b border-[#F4F4F5]"
                    }`}
                  >
                    <Icon name="error" weight={400} fill={1} className="text-[18px] shrink-0" style={{ color: STATUS.critical }} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13.5px] font-semibold text-[#18181B] truncate">
                        {it.trade}
                        {it.crew && <span className="font-normal text-[#71717A]">　{it.crew}</span>}
                      </span>
                      <span className="block text-[11.5px] text-[#71717A] truncate">
                        {v.code} {v.name}
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-[12.5px] font-semibold text-[#18181B] tabular-nums">
                        超過 {it.end ? diffDays(it.end, today) : 0} 天
                      </span>
                      <span className="block text-[11px] text-[#71717A] tabular-nums">完成 {it.progress ?? 0}%</span>
                    </span>
                  </button>
                ))}
                {lateItems.length > 8 && (
                  <p className="px-4 py-2.5 border-t border-[#F4F4F5] text-[11.5px] text-[#71717A]">
                    另有 {lateItems.length - 8} 項延遲
                  </p>
                )}
              </>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}

function TradeChip({ it, onClick }: { it: WorkItemView; onClick: () => void }) {
  const late = it.status === "延遲";
  const done = it.status === "完成";
  const wait = it.kind === "等待";
  const sub = wait ? "等待期（免派工）" : it.crew;
  const parts = [it.trade, sub, `${it.progress ?? 0}%`, WORK_META[it.status].label].filter(Boolean);
  return (
    <button
      type="button"
      onClick={onClick}
      title={parts.join("｜")}
      aria-label={`${parts.join("，")}，點一下更新`}
      className={`w-full text-left rounded-[6px] px-1.5 py-1 text-[11px] leading-tight border transition-colors focus-visible:border-[#F39C12] ${
        wait
          ? "bg-[#F4F4F5] border-transparent text-[#71717A] hover:bg-[#EDEDEF]"
          : done
            ? "bg-[#FAFAFA] border-[#F0F0F2] text-[#71717A] hover:border-[#D4D4D8]"
            : "bg-white border-[#E4E4E7] text-[#18181B] hover:border-[#A1A1AA]"
      }`}
    >
      <span className="flex items-center gap-1 min-w-0">
        {late && <Icon name="error" weight={400} fill={1} className="text-[12px] shrink-0" style={{ color: STATUS.critical }} />}
        <span className={`truncate ${wait ? "font-medium" : "font-semibold"} ${done ? "line-through decoration-[#A1A1AA]" : ""}`}>
          {it.trade}
        </span>
      </span>
      {sub && <span className="block truncate text-[10px] text-[#71717A] mt-0.5">{wait ? "等待期" : sub}</span>}
    </button>
  );
}

function SiteCard({
  v,
  items,
  day,
  today,
  drafted,
  onOpen,
  onItem,
  onDaily,
}: {
  v: ProjectView;
  items: WorkItemView[];
  day: string;
  today: string;
  drafted: boolean;
  onOpen: (code: string) => void;
  onItem: (code: string, it: WorkItemView) => void;
  onDaily: (code: string) => void;
}) {
  const isToday = day === today;
  const overall = v.health === "完工" ? 100 : v.ops?.progress ?? 0;
  // 卡片本身不是按鈕：標題、每個工項、今日回報各自是獨立的按鈕，不巢狀
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => onOpen(v.code)}
        className="w-full min-h-[56px] text-left px-4 pt-3.5 pb-3 flex items-start justify-between gap-3 transition-colors active:bg-[#FAFAFA] focus-visible:bg-[#F4F4F5]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-bold text-[#18181B] truncate">{v.name}</span>
          <span className="flex items-center gap-1 mt-0.5 min-w-0 text-[11.5px] text-[#71717A]">
            <span className="tabular-nums shrink-0">{v.code}</span>
            {drafted && <DraftMark />}
            <span className="truncate">
              　·　{v.company}　·　整體 {overall}%
            </span>
          </span>
        </span>
        <span className="flex items-center shrink-0">
          <HealthBadge health={v.health} compact />
          <Icon name="chevron_right" weight={300} className="text-[18px] text-[#A1A1AA] -mr-1.5" />
        </span>
      </button>

      <div className="border-t border-[#F4F4F5]">
        {items.map((it, i) => {
          const wait = it.kind === "等待";
          const late = it.status === "延遲";
          const endsHere = it.end === day && it.status !== "完成";
          return (
            <button
              type="button"
              key={itemKey(it, i)}
              onClick={() => onItem(v.code, it)}
              className={`w-full min-h-[52px] text-left px-4 py-2.5 flex items-center gap-3 border-b border-[#F4F4F5] last:border-b-0 transition-colors active:bg-[#F4F4F5] focus-visible:bg-[#F4F4F5] ${
                wait ? "bg-[#FCFCFC]" : ""
              }`}
            >
              {wait ? (
                // 虛線：這段時間在「等」，不是在施工
                <span className="w-1 self-stretch shrink-0 border-l-4 border-dashed border-[#D4D4D8]" aria-hidden />
              ) : (
                <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: WORK_META[it.status].fill }} aria-hidden />
              )}
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className={`truncate text-[13.5px] ${wait ? "font-medium text-[#71717A]" : "font-semibold text-[#18181B]"}`}>
                    {it.trade}
                  </span>
                  {(it.kind === "檢驗" || it.kind === "里程碑") && (
                    <span className="shrink-0 h-[18px] px-1.5 rounded-[5px] bg-[#F4F4F5] text-[10.5px] font-semibold text-[#52525B] inline-flex items-center">
                      {it.kind}
                    </span>
                  )}
                </span>
                <span className="block text-[11.5px] text-[#71717A] truncate">
                  {wait ? "等待期（免派工）" : it.crew || "未指定施作單位"}　·　{fmtDate(it.start, today)}–{fmtDate(it.end, today)}
                  {endsHere ? (isToday ? "　·　今天預定完成" : "　·　當天預定完成") : ""}
                </span>
              </span>
              <span className="text-right shrink-0">
                <span className={`block text-[12.5px] font-semibold tabular-nums ${wait ? "text-[#71717A]" : "text-[#18181B]"}`}>
                  {it.progress ?? 0}%
                </span>
                <span
                  className="flex items-center justify-end gap-0.5 text-[10.5px] font-medium"
                  style={{ color: late ? STATUS.critical : TEXT_3 }}
                >
                  {late && <Icon name="error" weight={400} fill={1} className="text-[12px]" />}
                  {WORK_META[it.status].label}
                </span>
              </span>
              <Icon name="chevron_right" weight={300} className="text-[16px] text-[#A1A1AA] shrink-0 -mr-1.5" />
            </button>
          );
        })}
      </div>

      {isToday && (
        <button
          type="button"
          onClick={() => onDaily(v.code)}
          className="w-full h-11 border-t border-[#F4F4F5] flex items-center justify-center gap-1.5 text-[13px] font-semibold text-[#18181B] transition-colors active:bg-[#F4F4F5] focus-visible:bg-[#F4F4F5]"
        >
          <Icon name="edit_note" weight={300} className="text-[20px]" />
          今日回報
        </button>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════
   甘特圖：全部工地的時程
   ══════════════════════════════════════════════════════════ */

type Zoom = "月" | "週";

function GanttTab({
  ops,
  onOpen,
  onOpenSetup,
}: {
  ops: ProjectOps;
  onOpen: (code: string) => void;
  onOpenSetup: () => void;
}) {
  const { views, today } = ops;
  const [company, setCompany] = useState("全部");
  const [zoom, setZoom] = useState<Zoom>("月");
  const [showDone, setShowDone] = useState(false);

  // 預設只留最近 30 天內完工的，舊案不佔版面
  const recentDone = addDays(today, -30);
  const isOldDone = (v: ProjectView) => v.health === "完工" && (v.ops!.doneAt ?? v.ops!.dueAt!) < recentDone;
  const rowsData = useMemo(
    () =>
      views
        .filter((v) => v.ops?.startAt && v.ops?.dueAt)
        .filter((v) => company === "全部" || v.company === company)
        .filter((v) => showDone || v.health !== "完工" || (v.ops!.doneAt ?? v.ops!.dueAt!) >= recentDone)
        .sort((a, b) => a.ops!.startAt!.localeCompare(b.ops!.startAt!)),
    [views, company, showDone, recentDone]
  );

  const range = useMemo(() => {
    if (!rowsData.length) return null;
    const starts = rowsData.map((v) => v.ops!.startAt!);
    const ends = rowsData.map((v) => v.ops!.doneAt ?? v.ops!.dueAt!);
    const min = starts.reduce((a, b) => (a < b ? a : b));
    const max = ends.reduce((a, b) => (a > b ? a : b));
    // 往前後留白；最少涵蓋「今天前兩週～今天後一個月」
    const from = addDays(min < addDays(today, -14) ? min : addDays(today, -14), -7);
    const to = addDays(max > addDays(today, 30) ? max : addDays(today, 30), 14);
    return { from, to };
  }, [rowsData, today]);

  const withDates = views.filter((v) => v.ops?.startAt && v.ops?.dueAt);
  if (!withDates.length) {
    return (
      <div className="flex flex-col gap-5">
        <DataNotice ops={ops} onOpenSetup={onOpenSetup} />
        <Card>
          <EmptyState
            icon="view_timeline"
            title="還沒有排定開工與完工日的專案"
            hint="打開任一專案按「編輯資料」填上開工日與預計完工日（或填在試算表的「專案情報」分頁），這裡就會畫出時程。"
          />
        </Card>
      </div>
    );
  }

  const rows: GanttRow[] = rowsData.map((v) => {
    const o = v.ops!;
    const done = v.health === "完工";
    const progress = done ? 100 : o.progress ?? 0;
    const drafted = ops.saveMode === "sandbox" && ops.isDrafted(v.code);
    // 列尾一定寫出狀態文字：落後、逾期、暫停不能只靠長條顏色分辨
    const flag = v.health === "逾期" || v.health === "落後" || v.health === "暫停" ? ` · ${v.health}` : "";
    return {
      id: v.code,
      label: v.name,
      sublabel: [v.code, o.stage, drafted ? "本機修改" : ""].filter(Boolean).join("　·　"),
      onClick: () => onOpen(v.code),
      trailing: done ? "完工" : `${progress}%${flag}`,
      bars: [
        {
          start: o.startAt!,
          end: o.doneAt ?? o.dueAt!,
          progress,
          fill: done ? "#A1A1AA" : HEALTH_META[v.health].fill,
          late: v.health === "逾期",
          tip: (
            <>
              <b>
                {v.code} {v.name}
              </b>
              <br />
              {fmtDate(o.startAt, today)} – {fmtDate(o.dueAt, today)}
              {o.stage ? `　·　${o.stage}` : ""}
              <br />
              實際 {progress}%
              {v.plannedPct !== undefined && !done ? `　應達 ${v.plannedPct}%` : ""}
              {v.reason ? (
                <>
                  <br />
                  {v.reason}
                </>
              ) : null}
            </>
          ),
        },
      ],
    };
  });

  const companies = ["全部", ...["峻岸", "拾壤", "蒔壤"].filter((c) => withDates.some((v) => v.company === c))];
  const late = rowsData.filter((v) => v.health === "逾期" || v.health === "落後").length;
  const hiddenDone = showDone
    ? 0
    : withDates.filter((v) => (company === "全部" || v.company === company) && isOldDone(v)).length;

  return (
    <div className="flex flex-col gap-4">
      <DataNotice ops={ops} onOpenSetup={onOpenSetup} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-6 px-6 lg:mx-0 lg:px-0">
          {companies.map((c) => (
            <Chip key={c} active={company === c} onClick={() => setCompany(c)}>
              {c === "全部" ? "所有公司" : c}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="h-10 px-2.5 rounded-full flex items-center gap-2 text-[12.5px] font-medium text-[#52525B] cursor-pointer select-none transition-colors hover:bg-[#F4F4F5] has-[:focus-visible]:bg-[#F4F4F5]">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="w-5 h-5 shrink-0 cursor-pointer accent-[#18181B]"
            />
            顯示較早完工
          </label>
          <div className="inline-flex p-[3px] rounded-[12px] bg-[#F4F4F5]" role="group" aria-label="時間尺度">
            {(["月", "週"] as Zoom[]).map((z) => (
              <button
                type="button"
                key={z}
                onClick={() => setZoom(z)}
                aria-pressed={zoom === z}
                className={`h-9 px-3.5 rounded-[9px] text-[13px] font-semibold border transition-colors focus-visible:border-[#F39C12] ${
                  zoom === z
                    ? "bg-white border-white text-[#18181B] shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                    : "border-transparent text-[#71717A] hover:text-[#18181B]"
                }`}
              >
                {z}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[12px] text-[#71717A] px-1 -mb-1">
        {rowsData.length} 件{late > 0 ? `　·　${late} 件逾期或落後` : ""}
        {hiddenDone > 0 ? `　·　另有 ${hiddenDone} 件較早完工未顯示` : ""}　·　點列看細節
      </p>

      <Card className="overflow-hidden">
        {range && rows.length > 0 ? (
          <Gantt
            key={`${zoom}-${company}-${showDone}`}
            rows={rows}
            today={today}
            from={range.from}
            to={range.to}
            dayWidth={zoom === "月" ? 5 : 14}
            labelWidth={148}
            dense={zoom === "週"}
          />
        ) : (
          <EmptyState icon="filter_alt_off" title="這個篩選條件下沒有專案" />
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11.5px] text-[#71717A]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-2.5 rounded-[3px]" style={{ background: INK_2 }} />
          已完成比例
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-2.5 rounded-[3px]" style={{ background: HEALTH_META["落後"].fill }} />
          落後
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-2.5 rounded-[3px]" style={{ background: STATUS.critical }} />
          逾期
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-2.5 rounded-[3px]" style={{ background: "#A1A1AA" }} />
          已完工
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-4 h-2.5 rounded-[3px]"
            style={{ background: `repeating-linear-gradient(135deg, ${STATUS.critical}55 0 3px, ${STATUS.critical}22 3px 6px)` }}
          />
          超過預計完工的天數
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-[1.5px] h-3" style={{ background: ACCENT }} />
          今天
        </span>
      </div>
    </div>
  );
}
