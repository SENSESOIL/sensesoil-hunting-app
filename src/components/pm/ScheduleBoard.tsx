"use client";

import React, { useMemo, useState } from "react";
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
} from "./ui";
import { DataNotice, ProjectDossier, SetupGuide } from "./ProjectDossier";
import { useProjectOps, type ProjectOps } from "./useProjectOps";

export const SCHEDULE_TABS = ["本週", "甘特圖"];

const overlaps = (it: WorkItemView, from: string, to: string) =>
  !!it.start && !!it.end && it.start <= to && it.end >= from;

export default function ScheduleBoard({ activeTab }: { activeTab: string }) {
  const ops = useProjectOps();
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  useWhiteStatusBar(openCode !== null || setupOpen);
  const open = openCode ? ops.views.find((v) => v.code === openCode) : undefined;

  return (
    <>
      <div className="px-6 lg:px-10 pb-32">
        {ops.loading ? (
          <div className="h-[320px] rounded-[18px] bg-white border border-[#E4E4E7]/60 animate-pulse" />
        ) : ops.error ? (
          <Card>
            <EmptyState
              icon={ops.errorStatus === 403 ? "lock" : "cloud_off"}
              title={ops.errorStatus === 403 ? "目前只開放管理者使用" : "讀取排程資料失敗"}
              hint={ops.errorStatus === 403 ? undefined : ops.error}
            />
          </Card>
        ) : activeTab === "甘特圖" ? (
          <GanttTab ops={ops} onOpen={setOpenCode} onOpenSetup={() => setSetupOpen(true)} />
        ) : (
          <WeekTab ops={ops} onOpen={setOpenCode} onOpenSetup={() => setSetupOpen(true)} />
        )}
      </div>

      <SubScreen
        open={!!open}
        title={open ? open.code : ""}
        subtitle={open ? `${open.name}${ops.demo ? "　·　示範資料" : ""}` : undefined}
        onClose={() => setOpenCode(null)}
      >
        {open && (
          <ProjectDossier key={open.code} p={open} ops={ops} onOpenProject={setOpenCode} onOpenSetup={() => setSetupOpen(true)} />
        )}
      </SubScreen>
      <SubScreen open={setupOpen} title="連接工程資料" onClose={() => setSetupOpen(false)}>
        {setupOpen && <SetupGuide ops={ops} />}
      </SubScreen>
    </>
  );
}

/* ══════════════════════════════════════════════════════════
   本週：派工看板
   手機：選一天看當天各工地的工項；桌機：工地 × 七天的派工表
   ══════════════════════════════════════════════════════════ */

function WeekTab({
  ops,
  onOpen,
  onOpenSetup,
}: {
  ops: ProjectOps;
  onOpen: (code: string) => void;
  onOpenSetup: () => void;
}) {
  const { views, today } = ops;
  const thisMonday = mondayOf(today);
  const [monday, setMonday] = useState(thisMonday);
  const [picked, setPicked] = useState<string | null>(null);
  const sunday = addDays(monday, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const day = picked && picked >= monday && picked <= sunday ? picked : today >= monday && today <= sunday ? today : monday;

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

  // 近期節點：14 天內結束的工項＋預計完工的專案
  const milestones = useMemo(() => {
    const end = addDays(today, 14);
    const out: { date: string; v: ProjectView; text: string; kind: "item" | "due" }[] = [];
    views.forEach((v) => {
      v.items.forEach((it) => {
        if (it.end && it.end >= today && it.end <= end && it.status !== "完成") {
          out.push({ date: it.end, v, text: `${it.trade}預定完成`, kind: "item" });
        }
      });
      if (v.ops?.dueAt && v.health !== "完工" && v.ops.dueAt >= today && v.ops.dueAt <= end) {
        out.push({ date: v.ops.dueAt, v, text: "預計完工", kind: "due" });
      }
    });
    return out.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "due" ? -1 : 1));
  }, [views, today]);

  const lateItems = useMemo(
    () =>
      views
        .flatMap((v) => v.items.filter((it) => it.status === "延遲").map((it) => ({ v, it })))
        .sort((a, b) => a.it.end!.localeCompare(b.it.end!)),
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
            hint="派工看板需要「工進排程」分頁裡各工項的起訖日期。填好之後，這裡會列出每一天哪個工地有哪些工班。"
          />
        </Card>
      </div>
    );
  }

  const weekLabel =
    monday === thisMonday ? "本週" : monday === addDays(thisMonday, 7) ? "下週" : monday === addDays(thisMonday, -7) ? "上週" : "";
  const dayActive = activeOn(day);

  return (
    <div className="flex flex-col gap-6">
      <DataNotice ops={ops} onOpenSetup={onOpenSetup} />

      {/* 週切換 */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[19px] font-bold text-[#18181B] tabular-nums leading-tight">
            {fmtDate(monday, today)} – {fmtDate(sunday, today)}
          </p>
          <p className="text-[12px] text-[#A1A1AA] mt-0.5">
            {weekLabel && `${weekLabel}　·　`}
            {sites.length} 處工地　·　{sites.reduce((s, x) => s + x.items.length, 0)} 個工項
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {monday !== thisMonday && (
            <button
              onClick={() => {
                setMonday(thisMonday);
                setPicked(null);
              }}
              className="h-9 px-3 rounded-full text-[12.5px] font-semibold text-[#18181B] bg-white border border-[#E4E4E7] active:bg-[#F4F4F5] mr-1"
            >
              本週
            </button>
          )}
          {[-7, 7].map((n) => (
            <button
              key={n}
              onClick={() => {
                setMonday(addDays(monday, n));
                setPicked(null);
              }}
              className="w-9 h-9 rounded-full bg-white border border-[#E4E4E7] flex items-center justify-center text-[#3F3F46] active:bg-[#F4F4F5]"
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
            const n = activeOn(d).length;
            const sel = d === day;
            const isToday = d === today;
            const dow = toDay(d).getDay();
            return (
              <button
                key={d}
                onClick={() => setPicked(d)}
                className={`rounded-[14px] py-2 flex flex-col items-center gap-0.5 transition-colors ${
                  sel ? "bg-[#18181B] text-white" : "bg-white border border-[#E4E4E7]/70 text-[#18181B] active:bg-[#F4F4F5]"
                }`}
              >
                <span className={`text-[11px] ${sel ? "text-white/60" : dow === 0 || dow === 6 ? "text-[#C4C4CC]" : "text-[#A1A1AA]"}`}>
                  {WEEKDAYS[dow]}
                </span>
                <span className="text-[16px] font-bold tabular-nums leading-tight">{toDay(d).getDate()}</span>
                <span className="h-[14px] flex items-center justify-center">
                  {n > 0 ? (
                    <span className={`text-[10px] font-semibold tabular-nums ${sel ? "text-white/80" : "text-[#71717A]"}`}>
                      {n}處
                    </span>
                  ) : isToday ? null : (
                    <span className={`text-[10px] ${sel ? "text-white/40" : "text-[#D4D4D8]"}`}>–</span>
                  )}
                </span>
                {isToday && <span className="w-1 h-1 rounded-full -mt-0.5" style={{ background: ACCENT }} />}
              </button>
            );
          })}
        </div>

        <div>
          <SectionTitle
            title={`${toDay(day).getMonth() + 1}/${toDay(day).getDate()}（${WEEKDAYS[toDay(day).getDay()]}）`}
            meta={day === today ? "今天" : undefined}
          />
          {dayActive.length === 0 ? (
            <Card>
              <p className="px-4 py-5 text-[13px] text-[#A1A1AA]">這天沒有排定的工項。</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {dayActive.map(({ v, items }) => (
                <SiteCard key={v.code} v={v} items={items} day={day} onOpen={onOpen} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 桌機：工地 × 七天 ── */}
      <div className="hidden lg:block">
        <Card className="overflow-hidden">
          <div className="grid" style={{ gridTemplateColumns: "220px repeat(7, minmax(0, 1fr))" }}>
            <div className="px-4 py-3 text-[11.5px] font-semibold text-[#A1A1AA] border-b border-[#E4E4E7]">工地</div>
            {days.map((d) => {
              const dow = toDay(d).getDay();
              const isToday = d === today;
              return (
                <div
                  key={d}
                  className={`px-2 py-2.5 text-center border-b border-l border-[#E4E4E7] ${isToday ? "bg-[#FFF8EC]" : ""}`}
                >
                  <span className={`block text-[11px] ${dow === 0 || dow === 6 ? "text-[#C4C4CC]" : "text-[#A1A1AA]"}`}>
                    週{WEEKDAYS[dow]}
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
                  onClick={() => onOpen(v.code)}
                  className={`px-4 py-3 text-left hover:bg-[#FAFAFA] ${ri === sites.length - 1 ? "" : "border-b border-[#F4F4F5]"}`}
                >
                  <span className="block text-[13.5px] font-semibold text-[#18181B] truncate">{v.name}</span>
                  <span className="flex items-center gap-1.5 mt-1">
                    <span className="text-[11px] text-[#A1A1AA] tabular-nums">{v.code}</span>
                    <HealthBadge health={v.health} compact />
                  </span>
                </button>
                {days.map((d) => {
                  const act = items.filter((it) => overlaps(it, d, d));
                  const dow = toDay(d).getDay();
                  return (
                    <div
                      key={d}
                      className={`border-l border-[#F4F4F5] px-1.5 py-2 flex flex-col gap-1 ${
                        ri === sites.length - 1 ? "" : "border-b border-b-[#F4F4F5]"
                      } ${d === today ? "bg-[#FFF8EC]/60" : dow === 0 || dow === 6 ? "bg-[#FCFCFC]" : ""}`}
                    >
                      {act.slice(0, 3).map((it) => (
                        <TradeChip key={it.trade} it={it} />
                      ))}
                      {act.length > 3 && <span className="text-[10.5px] text-[#A1A1AA] px-1">+{act.length - 3}</span>}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </Card>
        <p className="text-[11.5px] text-[#A1A1AA] mt-2 px-1 flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS.critical }} /> 超過預定完成日
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#A1A1AA]" /> 已完成
          </span>
          點工地名稱看細節
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <section>
          <SectionTitle title="兩週內的節點" meta={milestones.length ? `${milestones.length} 項` : undefined} />
          <Card className="overflow-hidden">
            {milestones.length === 0 ? (
              <p className="px-4 py-5 text-[13px] text-[#A1A1AA]">未來 14 天沒有預定完成的工項或完工節點。</p>
            ) : (
              milestones.slice(0, 10).map((ms, i, arr) => {
                const d = diffDays(today, ms.date);
                return (
                  <button
                    key={`${ms.v.code}-${ms.text}-${ms.date}`}
                    onClick={() => onOpen(ms.v.code)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 active:bg-[#F4F4F5] ${
                      i === arr.length - 1 ? "" : "border-b border-[#F4F4F5]"
                    }`}
                  >
                    <span className="w-12 shrink-0 text-center">
                      <span className="block text-[14px] font-bold text-[#18181B] tabular-nums leading-tight">{fmtDate(ms.date, today)}</span>
                      <span className="block text-[10.5px] text-[#A1A1AA]">{d === 0 ? "今天" : d === 1 ? "明天" : `${d} 天後`}</span>
                    </span>
                    <Icon
                      name={ms.kind === "due" ? "flag" : "radio_button_unchecked"}
                      weight={ms.kind === "due" ? 400 : 300}
                      fill={ms.kind === "due" ? 1 : 0}
                      className={`text-[16px] shrink-0 ${ms.kind === "due" ? "text-[#18181B]" : "text-[#A1A1AA]"}`}
                    />
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[13.5px] truncate ${ms.kind === "due" ? "font-bold text-[#18181B]" : "font-medium text-[#3F3F46]"}`}>
                        {ms.text}
                      </span>
                      <span className="block text-[11.5px] text-[#A1A1AA] truncate">
                        {ms.v.code} {ms.v.name}
                      </span>
                    </span>
                  </button>
                );
              })
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
              lateItems.slice(0, 8).map(({ v, it }, i, arr) => (
                <button
                  key={`${v.code}-${it.trade}`}
                  onClick={() => onOpen(v.code)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 active:bg-[#F4F4F5] ${
                    i === arr.length - 1 ? "" : "border-b border-[#F4F4F5]"
                  }`}
                >
                  <Icon name="error" weight={400} fill={1} className="text-[18px] shrink-0" style={{ color: STATUS.critical }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-semibold text-[#18181B] truncate">
                      {it.trade}
                      {it.crew && <span className="font-normal text-[#A1A1AA]">　{it.crew}</span>}
                    </span>
                    <span className="block text-[11.5px] text-[#A1A1AA] truncate">
                      {v.code} {v.name}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-[12.5px] font-semibold text-[#18181B] tabular-nums">超過 {diffDays(it.end!, today)} 天</span>
                    <span className="block text-[11px] text-[#A1A1AA] tabular-nums">完成 {it.progress ?? 0}%</span>
                  </span>
                </button>
              ))
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}

function TradeChip({ it }: { it: WorkItemView }) {
  const late = it.status === "延遲";
  const done = it.status === "完成";
  return (
    <span
      className={`rounded-md px-1.5 py-1 text-[11px] leading-tight border ${
        done ? "bg-[#FAFAFA] border-[#F0F0F2] text-[#A1A1AA]" : "bg-white border-[#E4E4E7] text-[#18181B]"
      }`}
      title={`${it.trade}${it.crew ? `｜${it.crew}` : ""}｜${it.progress ?? 0}%`}
    >
      <span className="flex items-center gap-1">
        {late && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS.critical }} />}
        <span className={`truncate font-semibold ${done ? "line-through decoration-[#D4D4D8]" : ""}`}>{it.trade}</span>
      </span>
      {it.crew && <span className="block truncate text-[10px] text-[#A1A1AA] mt-0.5">{it.crew}</span>}
    </span>
  );
}

function SiteCard({
  v,
  items,
  day,
  onOpen,
}: {
  v: ProjectView;
  items: WorkItemView[];
  day: string;
  onOpen: (code: string) => void;
}) {
  return (
    <button onClick={() => onOpen(v.code)} className="text-left w-full">
      <Card className="overflow-hidden active:bg-[#FAFAFA]">
        <div className="px-4 pt-3.5 pb-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14.5px] font-bold text-[#18181B] truncate">{v.name}</p>
            <p className="text-[11.5px] text-[#A1A1AA] mt-0.5">
              {v.code}　·　{v.company}　·　整體 {v.health === "完工" ? 100 : v.ops?.progress ?? 0}%
            </p>
          </div>
          <HealthBadge health={v.health} compact />
        </div>
        <div className="border-t border-[#F4F4F5]">
          {items.map((it) => {
            const last = it.end === day;
            return (
              <div key={it.trade} className="px-4 py-2.5 flex items-center gap-3 border-b border-[#F4F4F5] last:border-b-0">
                <span
                  className="w-1 self-stretch rounded-full shrink-0"
                  style={{
                    background: it.status === "延遲" ? STATUS.critical : it.status === "完成" ? "#D4D4D8" : INK_2,
                  }}
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-semibold text-[#18181B] truncate">{it.trade}</span>
                  <span className="block text-[11.5px] text-[#A1A1AA] truncate">
                    {it.crew || "未指定施作單位"}　·　{fmtDate(it.start)}–{fmtDate(it.end)}
                    {last && it.status !== "完成" ? "　·　今天預定完成" : ""}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-[12.5px] font-semibold text-[#18181B] tabular-nums">{it.progress ?? 0}%</span>
                  <span className="block text-[10.5px]" style={{ color: it.status === "延遲" ? STATUS.critical : "#A1A1AA" }}>
                    {it.status}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </button>
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

  const recentDone = addDays(today, -30);
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
            hint="甘特圖需要「專案情報」分頁的開工日與預計完工日。"
          />
        </Card>
      </div>
    );
  }

  const rows: GanttRow[] = rowsData.map((v) => {
    const o = v.ops!;
    const done = v.health === "完工";
    const progress = done ? 100 : o.progress ?? 0;
    return {
      id: v.code,
      label: v.name,
      sublabel: `${v.code}　·　${o.stage ?? ""}`,
      onClick: () => onOpen(v.code),
      trailing: done ? "完工" : v.health === "逾期" ? `${progress}% · 逾期` : `${progress}%`,
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
              {fmtDate(o.startAt, today)} – {fmtDate(o.dueAt, today)}　·　{o.stage}
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

  return (
    <div className="flex flex-col gap-4">
      <DataNotice ops={ops} onOpenSetup={onOpenSetup} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-6 px-6 lg:mx-0 lg:px-0">
          {companies.map((c) => (
            <Chip key={c} active={company === c} onClick={() => setCompany(c)}>
              {c}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[12.5px] text-[#52525B] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="w-4 h-4 rounded border-[#D4D4D8] text-[#18181B] focus:ring-[#F39C12]"
            />
            含已完工
          </label>
          <div className="inline-flex p-[3px] rounded-[10px] bg-[#F4F4F5]" role="group" aria-label="時間尺度">
            {(["月", "週"] as Zoom[]).map((z) => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={`h-7 px-3 rounded-[8px] text-[12.5px] font-semibold transition-colors ${
                  zoom === z ? "bg-white text-[#18181B] shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-[#A1A1AA]"
                }`}
              >
                {z}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[12px] text-[#A1A1AA] px-1 -mb-1">
        {rowsData.length} 件{late > 0 ? `　·　${late} 件逾期或落後` : ""}　·　點列看細節
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
          <span
            className="inline-block w-4 h-2.5 rounded-[3px]"
            style={{ background: `repeating-linear-gradient(135deg, ${STATUS.critical}55 0 3px, ${STATUS.critical}22 3px 6px)` }}
          />
          逾期天數
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-[1.5px] h-3" style={{ background: ACCENT }} />
          今天
        </span>
      </div>
    </div>
  );
}
