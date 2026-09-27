"use client";

import React, { useMemo, useState } from "react";
import {
  ACTIVE_STAGES,
  addDays,
  fmtDate,
  fmtMoney,
  healthRank,
  STAGES,
  type ProjectView,
  type Stage,
} from "@/lib/project-ops";
import {
  Card,
  Chip,
  EmptyState,
  HealthBadge,
  Icon,
  ProgressBar,
  SectionTitle,
  SubScreen,
  useWhiteStatusBar,
  INK_2,
} from "./ui";
import { DataNotice, ProjectDossier, SetupGuide } from "./ProjectDossier";
import { useProjectOps, type ProjectOps } from "./useProjectOps";

export const INTEL_TABS = ["總覽", "專案清單"];

/* ── 清單篩選 ─────────────────────────────────────────── */
type StatusFilter = "全部" | "需注意" | "施工中" | "待開工" | "驗收" | "已完工" | "未建檔";
const STATUS_FILTERS: StatusFilter[] = ["全部", "需注意", "施工中", "待開工", "驗收", "已完工", "未建檔"];
const ATTENTION = new Set(["逾期", "落後", "注意"]);

function matchStatus(p: ProjectView, f: StatusFilter): boolean {
  const st = p.ops?.stage;
  switch (f) {
    case "全部":
      return true;
    case "需注意":
      return ATTENTION.has(p.health);
    case "施工中":
      return st === "施工中";
    case "待開工":
      return st === "洽談" || st === "報價" || st === "簽約" || st === "暫停";
    case "驗收":
      return st === "驗收";
    case "已完工":
      return st === "保固" || st === "結案" || (!!p.ops?.doneAt && st !== "驗收");
    case "未建檔":
      return !p.ops;
  }
}

type SortKey = "最新" | "完工日" | "進度落後" | "應收";

export default function ProjectIntel({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (t: string) => void;
}) {
  const ops = useProjectOps();
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  // 清單狀態放在這一層：總覽裡的連結可以直接帶篩選條件跳到清單
  const [company, setCompany] = useState("全部");
  const [status, setStatus] = useState<StatusFilter>("全部");
  const [stageFilter, setStageFilter] = useState<Stage | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("最新");

  useWhiteStatusBar(openCode !== null || setupOpen);

  const open = openCode ? ops.views.find((v) => v.code === openCode) : undefined;

  const goList = (opts: { status?: StatusFilter; stage?: Stage; company?: string; sort?: SortKey }) => {
    setStatus(opts.status ?? "全部");
    setStageFilter(opts.stage ?? null);
    setCompany(opts.company ?? "全部");
    if (opts.sort) setSort(opts.sort);
    setQ("");
    onTabChange("專案清單");
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <div className="px-6 lg:px-10 pb-32">
        {ops.loading ? (
          <Skeleton />
        ) : ops.error ? (
          <Card>
            <EmptyState
              icon={ops.errorStatus === 403 ? "lock" : "cloud_off"}
              title={ops.errorStatus === 403 ? "目前只開放管理者使用" : "讀取專案資料失敗"}
              hint={ops.errorStatus === 403 ? undefined : ops.error}
              action={
                ops.errorStatus !== 403 ? (
                  <button onClick={ops.refresh} className="h-9 px-4 rounded-full bg-[#18181B] text-white text-[12.5px] font-semibold">
                    重試
                  </button>
                ) : undefined
              }
            />
          </Card>
        ) : activeTab === "專案清單" ? (
          <ListTab
            ops={ops}
            company={company}
            setCompany={setCompany}
            status={status}
            setStatus={(s) => {
              setStatus(s);
              setStageFilter(null);
            }}
            stageFilter={stageFilter}
            clearStage={() => setStageFilter(null)}
            q={q}
            setQ={setQ}
            sort={sort}
            setSort={setSort}
            onOpen={setOpenCode}
            onOpenSetup={() => setSetupOpen(true)}
          />
        ) : (
          <Overview ops={ops} onOpen={setOpenCode} goList={goList} onOpenSetup={() => setSetupOpen(true)} />
        )}
      </div>

      <SubScreen
        open={!!open}
        title={open ? open.code : ""}
        subtitle={open ? `${open.name}${ops.demo ? "　·　示範資料" : ""}` : undefined}
        onClose={() => setOpenCode(null)}
      >
        {open && (
          <ProjectDossier
            key={open.code}
            p={open}
            ops={ops}
            onOpenProject={setOpenCode}
            onOpenSetup={() => setSetupOpen(true)}
          />
        )}
      </SubScreen>

      <SubScreen open={setupOpen} title="連接工程資料" onClose={() => setSetupOpen(false)}>
        {setupOpen && <SetupGuide ops={ops} />}
      </SubScreen>
    </>
  );
}

/* ══════════════════════════════════════════════════════════
   總覽
   ══════════════════════════════════════════════════════════ */

function Overview({
  ops,
  onOpen,
  goList,
  onOpenSetup,
}: {
  ops: ProjectOps;
  onOpen: (code: string) => void;
  goList: (o: { status?: StatusFilter; stage?: Stage; company?: string; sort?: SortKey }) => void;
  onOpenSetup: () => void;
}) {
  const { views, today } = ops;
  const hasData = views.some((v) => v.ops);

  const m = useMemo(() => {
    const active = views.filter((v) => v.ops?.stage && ACTIVE_STAGES.includes(v.ops.stage));
    const attention = views
      .filter((v) => ATTENTION.has(v.health))
      .sort((a, b) => healthRank(a.health) - healthRank(b.health) || (a.variance ?? 0) - (b.variance ?? 0));
    const receivables = views
      .filter((v) => (v.receivable ?? 0) > 0)
      .sort((a, b) => (b.receivable ?? 0) - (a.receivable ?? 0));
    const horizon = addDays(today, 30);
    const upcoming = views
      .filter((v) => v.ops?.dueAt && !v.ops.doneAt && v.health !== "完工" && v.ops.dueAt >= today && v.ops.dueAt <= horizon)
      .sort((a, b) => a.ops!.dueAt!.localeCompare(b.ops!.dueAt!));
    const byStage = STAGES.map((s) => ({ stage: s, n: views.filter((v) => v.ops?.stage === s).length })).filter(
      (x) => x.n > 0
    );
    const companies = ["峻岸", "拾壤", "蒔壤"]
      .map((c) => {
        const all = views.filter((v) => v.company === c);
        return {
          company: c,
          n: all.length,
          active: all.filter((v) => v.ops?.stage && ACTIVE_STAGES.includes(v.ops.stage)).length,
          backlog: all
            .filter((v) => v.ops?.stage && ACTIVE_STAGES.includes(v.ops.stage))
            .reduce((s, v) => s + (v.contractTotal ?? 0), 0),
        };
      })
      .filter((c) => c.n > 0);
    const groups = new Map<string, ProjectView[]>();
    views.forEach((v) => v.siteGroup && groups.set(v.siteGroup, [...(groups.get(v.siteGroup) || []), v]));
    const siteGroups = [...groups.entries()]
      .map(([label, members]) => ({ label, members: members.sort((a, b) => a.seq - b.seq) }))
      .sort((a, b) => b.members.length - a.members.length || b.members[0].seq - a.members[0].seq);
    const recent = [...views].sort((a, b) => b.seq - a.seq).slice(0, 6);
    return {
      active,
      building: views.filter((v) => v.ops?.stage === "施工中"),
      inspecting: views.filter((v) => v.ops?.stage === "驗收"),
      pending: views.filter((v) => v.ops?.stage === "簽約"),
      backlog: active.reduce((s, v) => s + (v.contractTotal ?? 0), 0),
      receivableTotal: receivables.reduce((s, v) => s + (v.receivable ?? 0), 0),
      attention,
      receivables,
      upcoming,
      byStage,
      companies,
      siteGroups,
      recent,
    };
  }, [views, today]);

  const maxStage = Math.max(1, ...m.byStage.map((s) => s.n));

  return (
    <div className="flex flex-col gap-6">
      <DataNotice ops={ops} onOpenSetup={onOpenSetup} />

      {/* KPI：有工程資料時看營運數字；還沒有時看名冊（真實資料），不放一排「—」 */}
      {hasData ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi
            label="施工中"
            value={`${m.building.length}`}
            unit="件"
            sub={`驗收 ${m.inspecting.length}　·　待開工 ${m.pending.length}`}
            onClick={() => goList({ status: "施工中" })}
          />
          <Kpi label="在手合約" value={fmtMoney(m.backlog, { unit: false })} unit="萬" sub={`${m.active.length} 件已簽約未交屋`} />
          <Kpi
            label="應收未收"
            value={fmtMoney(m.receivableTotal, { unit: false })}
            unit="萬"
            sub={`${m.receivables.length} 件有未收款`}
            onClick={() => goList({ sort: "應收" })}
          />
          <Kpi
            label="需要注意"
            value={`${m.attention.length}`}
            unit="件"
            sub={`逾期 ${m.attention.filter((v) => v.health === "逾期").length}　·　落後 ${
              m.attention.filter((v) => v.health === "落後").length
            }`}
            emphasis={m.attention.length > 0}
            onClick={() => goList({ status: "需注意" })}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="專案總數" value={`${views.length}`} unit="件" sub="專案CRM" onClick={() => goList({})} />
          {m.companies.slice(0, 2).map((c) => (
            <Kpi
              key={c.company}
              label={c.company}
              value={`${c.n}`}
              unit="件"
              sub={`${Math.round((c.n / Math.max(1, views.length)) * 100)}% 的專案`}
              onClick={() => goList({ company: c.company })}
            />
          ))}
          <Kpi
            label="多合約案場"
            value={`${m.siteGroups.length}`}
            unit="處"
            sub={`共 ${m.siteGroups.reduce((s, g) => s + g.members.length, 0)} 份合約`}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ── 左欄：要處理的事 ── */}
        <div className="flex flex-col gap-6 min-w-0">
          {hasData && (
            <section>
              <SectionTitle
                title="需要注意"
                meta={m.attention.length ? `${m.attention.length} 件` : undefined}
                action={
                  m.attention.length > 5 ? (
                    <LinkButton onClick={() => goList({ status: "需注意" })}>全部</LinkButton>
                  ) : undefined
                }
              />
              <Card className="overflow-hidden">
                {m.attention.length === 0 ? (
                  <div className="px-4 py-5 flex items-center gap-3 text-[13px] text-[#71717A]">
                    <Icon name="verified" weight={300} className="text-[22px] text-[#0ca30c]" />
                    施工中的專案都在進度內，沒有逾期或落後。
                  </div>
                ) : (
                  m.attention.slice(0, 5).map((v, i, arr) => (
                    <button
                      key={v.code}
                      onClick={() => onOpen(v.code)}
                      className={`w-full text-left px-4 py-3.5 flex items-start gap-3 active:bg-[#F4F4F5] ${
                        i === arr.length - 1 ? "" : "border-b border-[#F4F4F5]"
                      }`}
                    >
                      <HealthBadge health={v.health} compact />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-semibold text-[#18181B] truncate">
                          <span className="text-[#A1A1AA] font-medium tabular-nums mr-1.5">{v.code}</span>
                          {v.name}
                        </span>
                        <span className="block text-[12px] text-[#71717A] mt-0.5 leading-snug">{v.reason}</span>
                      </span>
                      <Icon name="chevron_right" className="text-[20px] text-[#D4D4D8] mt-0.5" />
                    </button>
                  ))
                )}
              </Card>
            </section>
          )}

          {hasData && m.receivables.length > 0 && (
            <section>
              <SectionTitle
                title="應收帳款"
                meta={`共 ${fmtMoney(m.receivableTotal)}`}
                action={
                  m.receivables.length > 5 ? (
                    <LinkButton onClick={() => goList({ sort: "應收" })}>全部</LinkButton>
                  ) : undefined
                }
              />
              <Card className="overflow-hidden">
                {m.receivables.slice(0, 5).map((v, i, arr) => (
                  <button
                    key={v.code}
                    onClick={() => onOpen(v.code)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 active:bg-[#F4F4F5] ${
                      i === arr.length - 1 ? "" : "border-b border-[#F4F4F5]"
                    }`}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-medium text-[#18181B] truncate">
                        <span className="text-[#A1A1AA] tabular-nums mr-1.5">{v.code}</span>
                        {v.name}
                      </span>
                      <span className="block text-[11.5px] text-[#A1A1AA] mt-0.5 tabular-nums">
                        已請 {fmtMoney(v.ops?.billed)}　·　已收 {fmtMoney(v.ops?.collected)}　·　
                        {v.ops?.stage === "保固" ? "保固款" : v.ops?.stage}
                      </span>
                    </span>
                    <span className="text-[15px] font-bold text-[#18181B] tabular-nums shrink-0">{fmtMoney(v.receivable)}</span>
                  </button>
                ))}
              </Card>
            </section>
          )}

          {hasData && (
            <section>
              <SectionTitle title="30 天內預計完工" meta={m.upcoming.length ? `${m.upcoming.length} 件` : undefined} />
              <Card className="overflow-hidden">
                {m.upcoming.length === 0 ? (
                  <p className="px-4 py-5 text-[13px] text-[#A1A1AA]">未來 30 天沒有預計完工的專案。</p>
                ) : (
                  m.upcoming.slice(0, 6).map((v, i, arr) => (
                    <button
                      key={v.code}
                      onClick={() => onOpen(v.code)}
                      className={`w-full text-left px-4 py-3 flex items-center gap-3 active:bg-[#F4F4F5] ${
                        i === arr.length - 1 ? "" : "border-b border-[#F4F4F5]"
                      }`}
                    >
                      <span className="w-12 shrink-0 text-center">
                        <span className="block text-[15px] font-bold text-[#18181B] tabular-nums leading-tight">
                          {fmtDate(v.ops!.dueAt, today)}
                        </span>
                        <span className="block text-[10.5px] text-[#A1A1AA]">
                          {v.daysLeft === 0 ? "今天" : `${v.daysLeft} 天後`}
                        </span>
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-medium text-[#18181B] truncate">{v.name}</span>
                        <span className="flex items-center gap-2 mt-1.5">
                          <span className="flex-1">
                            <ProgressBar actual={v.ops?.progress} planned={v.plannedPct} health={v.health} height={4} />
                          </span>
                          <span className="text-[11px] text-[#A1A1AA] tabular-nums w-8 text-right">{v.ops?.progress ?? 0}%</span>
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </Card>
            </section>
          )}

          {/* 同案場多合約：真實資料推論，未連接也看得到 */}
          <section>
            <SectionTitle title="同一案場的多份合約" meta="依專案名稱判斷" />
            <Card className="overflow-hidden">
              {m.siteGroups.slice(0, hasData ? 5 : 8).map((g, i, arr) => (
                <div key={g.label} className={`px-4 py-3.5 ${i === arr.length - 1 ? "" : "border-b border-[#F4F4F5]"}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-bold text-[#18181B]">{g.label}</span>
                    <span className="text-[11.5px] text-[#A1A1AA] shrink-0">
                      {g.members.length} 份　·　{[...new Set(g.members.map((x) => x.company))].join("＋")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {g.members.map((x) => (
                      <button
                        key={x.code}
                        onClick={() => onOpen(x.code)}
                        className="h-7 pl-2 pr-2.5 rounded-lg bg-[#F4F4F5] text-[12px] text-[#3F3F46] active:bg-[#E4E4E7] inline-flex items-center gap-1.5 max-w-full"
                      >
                        <span className="text-[#A1A1AA] tabular-nums font-medium">{x.code}</span>
                        <span className="truncate">{x.name.replace(g.label, "").replace(/^[-－–]/, "") || x.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </Card>
          </section>
        </div>

        {/* ── 右欄：全貌 ── */}
        <div className="flex flex-col gap-6 min-w-0">
          {hasData && m.byStage.length > 0 && (
            <section>
              <SectionTitle title="階段分布" meta={`${views.filter((v) => v.ops).length} 件已建檔`} />
              <Card className="px-4 py-2">
                {m.byStage.map((s) => (
                  <button
                    key={s.stage}
                    onClick={() => goList({ stage: s.stage })}
                    className="w-full flex items-center gap-3 py-2.5 text-left group"
                  >
                    <span className="w-12 shrink-0 text-[13px] text-[#52525B] group-active:text-[#18181B]">{s.stage}</span>
                    <span className="flex-1 h-[10px] relative">
                      <span
                        className="absolute left-0 top-0 bottom-0 rounded-r-[4px] rounded-l-[2px]"
                        style={{
                          width: `${(s.n / maxStage) * 100}%`,
                          minWidth: 6,
                          background: s.stage === "施工中" ? INK_2 : "#C4C4CC",
                        }}
                      />
                    </span>
                    <span className="w-7 text-right text-[13px] font-semibold text-[#18181B] tabular-nums">{s.n}</span>
                  </button>
                ))}
              </Card>
            </section>
          )}

          <section>
            <SectionTitle title="公司別" />
            <div className="grid grid-cols-2 gap-3">
              {m.companies.map((c) => (
                <button key={c.company} onClick={() => goList({ company: c.company })} className="text-left">
                  <Card className="px-4 py-3.5 active:bg-[#FAFAFA] h-full">
                    <p className="text-[13px] font-bold text-[#18181B]">{c.company}</p>
                    <p className="text-[22px] font-semibold text-[#18181B] mt-1 leading-none">
                      {c.n}
                      <span className="text-[12px] font-medium text-[#A1A1AA] ml-1">件專案</span>
                    </p>
                    {hasData && (
                      <p className="text-[11.5px] text-[#A1A1AA] mt-2 tabular-nums">
                        在手 {c.active} 件　·　{fmtMoney(c.backlog)}
                      </p>
                    )}
                  </Card>
                </button>
              ))}
            </div>
          </section>

          <section>
            <SectionTitle title="最近新增" meta="依專案CRM 序列" action={<LinkButton onClick={() => goList({})}>全部</LinkButton>} />
            <Card className="overflow-hidden">
              {m.recent.map((v, i, arr) => (
                <ProjectRow key={v.code} v={v} today={today} onOpen={onOpen} last={i === arr.length - 1} />
              ))}
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  unit,
  sub,
  emphasis,
  onClick,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  emphasis?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <Card className={`px-4 py-3.5 h-full ${onClick ? "active:bg-[#FAFAFA] transition-colors" : ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-semibold text-[#71717A]">{label}</p>
        {emphasis && <Icon name="error" weight={400} fill={1} className="text-[16px] text-[#d03b3b]" />}
      </div>
      <p className="text-[28px] font-semibold text-[#18181B] leading-none mt-2">
        {value}
        {unit && value !== "—" && <span className="text-[13px] font-medium text-[#A1A1AA] ml-1">{unit}</span>}
      </p>
      {sub && <p className="text-[11.5px] text-[#A1A1AA] mt-2 truncate">{sub}</p>}
    </Card>
  );
  return onClick ? (
    <button onClick={onClick} className="text-left outline-none focus-visible:ring-2 focus-visible:ring-[#F39C12]/50 rounded-[18px]">
      {inner}
    </button>
  ) : (
    inner
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="text-[12.5px] font-semibold text-[#71717A] flex items-center gap-0.5 shrink-0 active:text-[#18181B]">
      {children}
      <Icon name="chevron_right" className="text-[18px]" />
    </button>
  );
}

/* ══════════════════════════════════════════════════════════
   專案清單
   ══════════════════════════════════════════════════════════ */

function ProjectRow({
  v,
  today,
  onOpen,
  last,
  metric,
}: {
  v: ProjectView;
  today: string;
  onOpen: (code: string) => void;
  last?: boolean;
  metric?: React.ReactNode;
}) {
  const o = v.ops;
  const done = v.health === "完工";
  const progress = done ? 100 : o?.progress;
  const showBar = !!o && progress !== undefined && o.stage !== "洽談" && o.stage !== "報價";
  return (
    <button
      onClick={() => onOpen(v.code)}
      className={`w-full text-left px-4 py-3.5 flex items-center gap-3 active:bg-[#F4F4F5] transition-colors ${
        last ? "" : "border-b border-[#F4F4F5]"
      }`}
    >
      <span className="w-10 shrink-0 text-[12px] font-semibold text-[#A1A1AA] tabular-nums self-start mt-[2px]">{v.code}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[14.5px] font-semibold text-[#18181B] truncate">{v.name}</span>
        <span className="block text-[11.5px] text-[#A1A1AA] mt-0.5 truncate">
          {v.company}　·　{v.category}
          {v.categoryInferred ? "（推測）" : ""}
          {o?.stage ? `　·　${o.stage}` : ""}
          {o?.manager ? `　·　${o.manager}` : ""}
        </span>
        {showBar && (
          <span className="flex items-center gap-2 mt-2">
            <span className="flex-1 max-w-[260px]">
              <ProgressBar actual={progress} planned={done ? undefined : v.plannedPct} health={v.health} height={4} />
            </span>
            <span className="text-[11px] text-[#71717A] tabular-nums whitespace-nowrap">
              {progress}%
              {!done && o?.dueAt ? `　預計 ${fmtDate(o.dueAt, today)}` : ""}
            </span>
          </span>
        )}
      </span>
      <span className="flex flex-col items-end gap-1 shrink-0">
        <HealthBadge health={v.health} compact />
        {metric}
      </span>
    </button>
  );
}

function ListTab({
  ops,
  company,
  setCompany,
  status,
  setStatus,
  stageFilter,
  clearStage,
  q,
  setQ,
  sort,
  setSort,
  onOpen,
  onOpenSetup,
}: {
  ops: ProjectOps;
  company: string;
  setCompany: (c: string) => void;
  status: StatusFilter;
  setStatus: (s: StatusFilter) => void;
  stageFilter: Stage | null;
  clearStage: () => void;
  q: string;
  setQ: (q: string) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  onOpen: (code: string) => void;
  onOpenSetup: () => void;
}) {
  const { views, today } = ops;
  const hasData = views.some((v) => v.ops);

  const companies = useMemo(
    () => ["全部", ...["峻岸", "拾壤", "蒔壤"].filter((c) => views.some((v) => v.company === c))],
    [views]
  );

  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return views.filter(
      (v) =>
        (company === "全部" || v.company === company) &&
        (!needle || v.code.toLowerCase().includes(needle) || v.name.toLowerCase().includes(needle) ||
          (v.ops?.manager || "").includes(needle) || (v.siteGroup || "").includes(needle))
    );
  }, [views, company, q]);

  const list = useMemo(() => {
    const out = base.filter((v) => (stageFilter ? v.ops?.stage === stageFilter : matchStatus(v, status)));
    const byDue = (v: ProjectView) => v.ops?.dueAt || "9999";
    switch (sort) {
      case "完工日":
        return out.sort((a, b) => byDue(a).localeCompare(byDue(b)) || b.seq - a.seq);
      case "進度落後":
        return out.sort((a, b) => (a.variance ?? 999) - (b.variance ?? 999) || healthRank(a.health) - healthRank(b.health));
      case "應收":
        return out.sort((a, b) => (b.receivable ?? -1) - (a.receivable ?? -1));
      default:
        return out.sort((a, b) => b.seq - a.seq);
    }
  }, [base, status, stageFilter, sort]);

  const statusCounts = useMemo(() => {
    const c = {} as Record<StatusFilter, number>;
    STATUS_FILTERS.forEach((f) => (c[f] = base.filter((v) => matchStatus(v, f)).length));
    return c;
  }, [base]);

  return (
    <div className="flex flex-col gap-4">
      {(ops.demo || !hasData) && <DataNotice ops={ops} onOpenSetup={onOpenSetup} />}

      {/* 搜尋＋排序 */}
      <div className="flex gap-2">
        <div className="relative flex-1 group">
          <Icon
            name="search"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-[#A1A1AA] group-focus-within:text-[#F39C12] transition-colors"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="代碼、專案名稱、案場或工地主任"
            className="w-full bg-white border border-[#E4E4E7] focus:border-[#F39C12] focus:ring-1 focus:ring-[#F39C12] text-[#18181B] text-[14px] rounded-full pl-11 pr-9 h-11 outline-none transition-all placeholder:text-[#A1A1AA]"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-[#A1A1AA] active:bg-[#F4F4F5]"
              aria-label="清除搜尋"
            >
              <Icon name="close" className="text-[16px]" />
            </button>
          )}
        </div>
        {hasData && (
          <label className="relative shrink-0">
            <span className="sr-only">排序</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="appearance-none h-11 pl-4 pr-9 rounded-full bg-white border border-[#E4E4E7] text-[13px] font-semibold text-[#3F3F46] outline-none focus:border-[#F39C12]"
            >
              {(["最新", "完工日", "進度落後", "應收"] as SortKey[]).map((s) => (
                <option key={s} value={s}>
                  {s === "最新" ? "最新建立" : s === "完工日" ? "完工日近到遠" : s === "進度落後" ? "落後最多" : "應收最多"}
                </option>
              ))}
            </select>
            <Icon name="expand_more" className="absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-[#A1A1AA] pointer-events-none" />
          </label>
        )}
      </div>

      {/* 篩選 */}
      <div className="flex flex-col gap-2 -mx-6 lg:mx-0">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-6 lg:px-0">
          {companies.map((c) => (
            <Chip
              key={c}
              active={company === c}
              onClick={() => setCompany(c)}
              count={c === "全部" ? undefined : views.filter((v) => v.company === c).length}
            >
              {c === "全部" ? "所有公司" : c}
            </Chip>
          ))}
        </div>
        {hasData && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide px-6 lg:px-0">
            {stageFilter ? (
              <Chip active onClick={clearStage}>
                階段：{stageFilter}
                <Icon name="close" className="text-[14px] ml-1 align-[-2px]" />
              </Chip>
            ) : (
              STATUS_FILTERS.map((f) => (
                <Chip key={f} active={status === f} onClick={() => setStatus(f)} count={f === "全部" ? undefined : statusCounts[f]}>
                  {f === "全部" ? "所有狀態" : f}
                </Chip>
              ))
            )}
          </div>
        )}
      </div>

      <p className="text-[12px] text-[#A1A1AA] px-1 -mb-2">
        {list.length === views.length ? `共 ${list.length} 件` : `顯示 ${list.length} / ${views.length} 件`}
      </p>

      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <EmptyState icon="search_off" title="沒有符合條件的專案" />
        ) : (
          list.map((v, i) => (
            <ProjectRow
              key={v.code}
              v={v}
              today={today}
              onOpen={onOpen}
              last={i === list.length - 1}
              metric={
                sort === "應收" && v.receivable ? (
                  <span className="text-[12px] font-bold text-[#18181B] tabular-nums">{fmtMoney(v.receivable)}</span>
                ) : sort === "完工日" && v.ops?.dueAt && v.health !== "完工" ? (
                  <span className="text-[11px] text-[#71717A] tabular-nums">{fmtDate(v.ops.dueAt, today)}</span>
                ) : undefined
              }
            />
          ))
        )}
      </Card>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse" aria-label="載入中">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[98px] rounded-[18px] bg-white border border-[#E4E4E7]/60" />
        ))}
      </div>
      <div className="h-[260px] rounded-[18px] bg-white border border-[#E4E4E7]/60" />
    </div>
  );
}
