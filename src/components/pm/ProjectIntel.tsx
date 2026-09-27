"use client";

import React, { useMemo, useState } from "react";
import {
  ACTIVE_STAGES,
  addDays,
  fmtDate,
  fmtMoney,
  fmtWan,
  healthRank,
  STAGES,
  todayISO,
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
import { DataNotice, SetupGuide } from "./ProjectDossier";
import { DossierScreen } from "./DossierScreen";
import { ToastHost } from "./Sheet";
import { useProjectOps, type ProjectOps } from "./useProjectOps";

export const INTEL_TABS = ["總覽", "專案清單"];

/* ── 清單篩選 ─────────────────────────────────────────────
   定義刻意與總覽 KPI 一致：點「施工中」KPI 進來看到的件數要跟卡片上的數字一樣。
   都以「階段」判斷（需注意、未建檔除外），彼此不重疊。 */
type StatusFilter =
  | "全部"
  | "需注意"
  | "施工中"
  | "待開工"
  | "洽談報價"
  | "暫停"
  | "驗收"
  | "已完工"
  | "未建檔"
  | "本機修改";
const STATUS_FILTERS: StatusFilter[] = ["全部", "需注意", "施工中", "待開工", "洽談報價", "暫停", "驗收", "已完工", "未建檔"];
const STATUS_LABEL: Partial<Record<StatusFilter, string>> = { 全部: "所有狀態", 洽談報價: "洽談／報價" };
const ATTENTION = new Set(["逾期", "落後", "注意"]);

function matchStatus(p: ProjectView, f: StatusFilter, isDraft: (code: string) => boolean): boolean {
  const st = p.ops?.stage;
  switch (f) {
    case "全部":
      return true;
    case "需注意":
      return ATTENTION.has(p.health);
    case "施工中":
      return st === "施工中";
    case "待開工":
      // 只算已簽約還沒動工的；洽談、報價還不是「待開工」
      return st === "簽約";
    case "洽談報價":
      return st === "洽談" || st === "報價";
    case "暫停":
      return st === "暫停";
    case "驗收":
      return st === "驗收";
    case "已完工":
      return st === "保固" || st === "結案";
    case "未建檔":
      return !p.ops;
    case "本機修改":
      return isDraft(p.code);
  }
}

type SortKey = "最新" | "完工日" | "進度落後" | "應收";

/** 應收裡真正該催的部分（保固期內的保固金還沒到期，不算） */
const dueReceivable = (v: ProjectView) => Math.max(0, (v.receivable ?? 0) - (v.retentionHeld ?? 0));
const isRetention = (v: ProjectView) => (v.retentionHeld ?? 0) > 0;
/** 應收排序：該催的在前、保固金其次、沒有應收的最後 */
const receivableTier = (v: ProjectView) => ((v.receivable ?? 0) <= 0 ? 2 : isRetention(v) ? 1 : 0);

/** 「14:05」；不是今天讀到的就加上日期，免得把昨天的資料當成剛剛的 */
function fmtClock(iso: string | undefined, today: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = todayISO(d);
  return day === today ? hm : `${fmtDate(day, today)} ${hm}`;
}

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

  const goList = (opts: { status?: StatusFilter; stage?: Stage; company?: string; sort?: SortKey }) => {
    setStatus(opts.status ?? "全部");
    setStageFilter(opts.stage ?? null);
    setCompany(opts.company ?? "全部");
    if (opts.sort) setSort(opts.sort);
    setQ("");
    onTabChange("專案清單");
    window.scrollTo({ top: 0 });
  };

  const forbidden = ops.errorStatus === 403;

  return (
    <>
      {/* 底部導覽列的空間由外層殼負責，這裡只留一般間距 */}
      <div className="px-6 lg:px-10 pb-6">
        {/* 先判斷「失敗且沒有任何資料」：SWR 自動重試時 loading 會再變 true，
            若先判斷 loading，錯誤卡會和骨架畫面來回閃 */}
        {ops.error && !ops.hasData ? (
          <Card>
            <EmptyState
              icon={forbidden ? "lock" : "cloud_off"}
              title={forbidden ? "目前只開放管理者使用" : "讀取專案資料失敗"}
              hint={forbidden ? undefined : ops.error}
              action={forbidden ? undefined : <RetryButton onClick={ops.refresh} busy={ops.loading} solid />}
            />
          </Card>
        ) : ops.loading ? (
          <Skeleton />
        ) : (
          <>
            {/* 重新整理失敗但手上有舊資料：照常顯示，只在上方提醒，不擋住畫面 */}
            {ops.error && <StaleStrip ops={ops} />}

            {ops.registryError ? (
              // 名冊讀不到時畫面上一件專案都沒有；這跟「工程資料未連接」是兩回事，不能顯示連接說明
              <Card>
                <EmptyState
                  icon="sync_problem"
                  title="讀不到專案CRM 名冊"
                  hint="服務帳號可能失去拾壤CRM 的檢視權限，或 Google 暫時無回應"
                  action={<RetryButton onClick={ops.refresh} solid />}
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
          </>
        )}
      </div>

      <DossierScreen
        code={openCode}
        ops={ops}
        onOpenProject={setOpenCode}
        onClose={() => setOpenCode(null)}
        onOpenSetup={() => setSetupOpen(true)}
      />
      <ToastHost />

      <SubScreen open={setupOpen} title="連接工程資料" onClose={() => setSetupOpen(false)}>
        {setupOpen && <SetupGuide ops={ops} />}
      </SubScreen>
    </>
  );
}

/* ── 讀取狀態 ─────────────────────────────────────────── */

function RetryButton({ onClick, busy, solid }: { onClick: () => void; busy?: boolean; solid?: boolean }) {
  // refresh() 不回傳結果，沒辦法知道何時結束；按下後短暫顯示「重試中」讓人知道有反應，也避免連按
  const [ack, setAck] = useState(false);
  const pending = busy || ack;
  return (
    <button
      onClick={() => {
        if (pending) return;
        setAck(true);
        onClick();
        window.setTimeout(() => setAck(false), 1200);
      }}
      disabled={pending}
      className={
        solid
          ? "h-11 px-5 rounded-full bg-[#18181B] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 active:opacity-80 disabled:opacity-60 border-2 border-transparent focus-visible:border-[#F39C12]"
          : "relative shrink-0 h-9 px-3.5 rounded-full bg-white border border-[#E4E4E7] text-[12.5px] font-semibold text-[#18181B] inline-flex items-center gap-1 active:bg-[#F4F4F5] disabled:text-[#A1A1AA] focus-visible:border-[#F39C12] after:content-[''] after:absolute after:-inset-1"
      }
    >
      <Icon name="refresh" weight={400} className={`text-[16px] ${pending ? "animate-spin" : ""}`} />
      {pending ? "重試中" : "重試"}
    </button>
  );
}

function StaleStrip({ ops }: { ops: ProjectOps }) {
  const at = fmtClock(ops.fetchedAt, ops.today);
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 min-h-11 pl-3 pr-1 py-1 rounded-[12px] bg-white border border-[#E4E4E7] flex items-center gap-2"
    >
      <Icon name="cloud_off" weight={300} className="text-[18px] text-[#A1A1AA] shrink-0" />
      <p className="flex-1 min-w-0 text-[12.5px] text-[#3F3F46] leading-snug">
        更新失敗，目前顯示{at ? <b className="font-semibold text-[#18181B] tabular-nums"> {at} </b> : "先前讀到"}的資料
      </p>
      <RetryButton onClick={ops.refresh} />
    </div>
  );
}

/** 本機試編標記：只存在這台裝置、還沒同步到雲端的專案 */
function DraftMark({ className = "" }: { className?: string }) {
  return (
    <span role="img" aria-label="本機修改" title="本機修改（只存在這台裝置）" className={`inline-flex align-[-2px] ${className}`}>
      <Icon name="phone_iphone" weight={300} className="text-[13px] leading-none text-[#A1A1AA]" />
    </span>
  );
}

/** 本機試編模式下，這個專案是否有尚未同步的修改（雲端模式不顯示標記） */
function useDraftCheck(ops: ProjectOps) {
  const sandbox = ops.saveMode === "sandbox";
  const { isDrafted } = ops;
  return React.useCallback((code: string) => sandbox && isDrafted(code), [sandbox, isDrafted]);
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
  // 有沒有任何工程資料（不同於 ops.hasData：那是「有沒有讀到回應」）
  const hasOps = views.some((v) => v.ops);
  const isDraft = useDraftCheck(ops);

  const m = useMemo(() => {
    const active = views.filter((v) => v.ops?.stage && ACTIVE_STAGES.includes(v.ops.stage));
    const attention = views
      .filter((v) => ATTENTION.has(v.health))
      .sort((a, b) => healthRank(a.health) - healthRank(b.health) || (a.variance ?? 0) - (b.variance ?? 0));
    const receivables = views
      .filter((v) => (v.receivable ?? 0) > 0)
      .sort((a, b) => receivableTier(a) - receivableTier(b) || (b.receivable ?? 0) - (a.receivable ?? 0));
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
      // 應收未收只算到期該收的；保固金另計，不然 KPI 會把還不能請的錢當成催收對象
      receivableTotal: views.reduce((s, v) => s + dueReceivable(v), 0),
      receivableDue: receivables.filter((v) => dueReceivable(v) > 0).length,
      retentionTotal: views.reduce((s, v) => s + (v.retentionHeld ?? 0), 0),
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

  /* ── 右欄（全貌）的各區塊：沒有工程資料時也要顯示，所以抽出來兩種版面共用 ── */
  const companySection = (
    <section>
      <SectionTitle title="公司別" />
      <div className="grid grid-cols-2 gap-3">
        {m.companies.map((c) => (
          <button
            key={c.company}
            onClick={() => goList({ company: c.company })}
            className="group text-left outline-none rounded-[18px]"
          >
            <Card className="px-4 py-3.5 active:bg-[#FAFAFA] h-full group-focus-visible:border-[#F39C12]">
              <p className="text-[13px] font-bold text-[#18181B]">{c.company}</p>
              <p className="text-[22px] font-semibold text-[#18181B] mt-1 leading-none">
                {c.n}
                <span className="text-[12px] font-medium text-[#71717A] ml-1">件專案</span>
              </p>
              {hasOps && (
                <p className="text-[11.5px] text-[#71717A] mt-2 tabular-nums">
                  在手 {c.active} 件　·　{fmtMoney(c.backlog)}
                </p>
              )}
            </Card>
          </button>
        ))}
      </div>
    </section>
  );

  const recentSection = (
    <section>
      <SectionTitle title="最近新增" meta="依專案CRM 序列" action={<LinkButton onClick={() => goList({})}>全部</LinkButton>} />
      <Card className="overflow-hidden">
        {m.recent.map((v, i, arr) => (
          <ProjectRow key={v.code} v={v} today={today} onOpen={onOpen} last={i === arr.length - 1} drafted={isDraft(v.code)} />
        ))}
      </Card>
    </section>
  );

  // 同案場多合約：參考資訊，放在最後（手機上排在整頁最底）；沒有就整段不出現
  const siteSection =
    m.siteGroups.length > 0 ? (
      <section>
        <SectionTitle title="同一案場的多份合約" meta={`${m.siteGroups.length} 處　·　依專案名稱判斷`} />
        <Card className="overflow-hidden">
          {m.siteGroups.slice(0, hasOps ? 5 : 8).map((g, i, arr) => (
            <div key={g.label} className={`px-4 py-3.5 ${i === arr.length - 1 ? "" : "border-b border-[#F4F4F5]"}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-bold text-[#18181B]">{g.label}</span>
                <span className="text-[11.5px] text-[#71717A] shrink-0">
                  {g.members.length} 份　·　{[...new Set(g.members.map((x) => x.company))].join("＋")}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {g.members.map((x) => (
                  <button
                    key={x.code}
                    onClick={() => onOpen(x.code)}
                    className="h-9 px-3 rounded-full bg-[#F4F4F5] border border-transparent text-[12.5px] text-[#3F3F46] active:bg-[#E4E4E7] focus-visible:border-[#F39C12] inline-flex items-center gap-1.5 max-w-full"
                  >
                    <span className="text-[#71717A] tabular-nums font-medium">{x.code}</span>
                    {isDraft(x.code) && <DraftMark />}
                    <span className="truncate">{x.name.replace(g.label, "").replace(/^[-－–]/, "") || x.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Card>
      </section>
    ) : null;

  return (
    <div className="flex flex-col gap-6">
      <DataNotice ops={ops} onOpenSetup={onOpenSetup} />

      {/* KPI：有工程資料時看營運數字；還沒有時看名冊（真實資料），不放一排「—」
          順序＝要處理的優先順序：先看出問題的，再看在做的、錢，最後才是規模 */}
      {hasOps ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
          <Kpi
            label="施工中"
            value={`${m.building.length}`}
            unit="件"
            sub={`驗收 ${m.inspecting.length}　·　簽約待開工 ${m.pending.length}`}
            onClick={() => goList({ status: "施工中" })}
          />
          <Kpi
            label="應收未收"
            value={fmtWan(m.receivableTotal)}
            unit="萬"
            sub={
              m.retentionTotal > 0
                ? `另有保固金 ${fmtWan(m.retentionTotal)} 萬未到期`
                : `${m.receivableDue} 件有未收款`
            }
            onClick={() => goList({ sort: "應收" })}
          />
          <Kpi label="在手合約" value={fmtWan(m.backlog)} unit="萬" sub={`${m.active.length} 件已簽約未交屋`} />
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

      {hasOps ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ── 左欄：要處理的事 ── */}
          <div className="flex flex-col gap-6 min-w-0">
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
                      className={`${ROW_BTN} px-4 py-3.5 flex items-start gap-3 ${
                        i === arr.length - 1 ? "" : "border-b border-[#F4F4F5]"
                      }`}
                    >
                      <HealthBadge health={v.health} compact />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-semibold text-[#18181B] truncate">
                          <span className="text-[#71717A] font-medium tabular-nums mr-1.5">{v.code}</span>
                          {isDraft(v.code) && <DraftMark className="mr-1.5" />}
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

            {m.receivables.length > 0 && (
              <section>
                <SectionTitle
                  title="應收帳款"
                  meta={
                    m.retentionTotal > 0
                      ? `應收 ${fmtMoney(m.receivableTotal)}　·　保固金 ${fmtMoney(m.retentionTotal)}`
                      : `共 ${fmtMoney(m.receivableTotal)}`
                  }
                  action={
                    m.receivables.length > 5 ? (
                      <LinkButton onClick={() => goList({ sort: "應收" })}>全部</LinkButton>
                    ) : undefined
                  }
                />
                <Card className="overflow-hidden">
                  {m.receivables.slice(0, 5).map((v, i, arr) => {
                    const retention = isRetention(v);
                    return (
                      <button
                        key={v.code}
                        onClick={() => onOpen(v.code)}
                        className={`${ROW_BTN} px-4 py-3 flex items-center gap-3 ${
                          i === arr.length - 1 ? "" : "border-b border-[#F4F4F5]"
                        }`}
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block text-[14px] font-medium text-[#18181B] truncate">
                            <span className="text-[#71717A] tabular-nums mr-1.5">{v.code}</span>
                            {isDraft(v.code) && <DraftMark className="mr-1.5" />}
                            {v.name}
                          </span>
                          <span className="block text-[11.5px] text-[#71717A] mt-0.5 tabular-nums truncate">
                            已請 {fmtMoney(v.ops?.billed)}　·　已收 {fmtMoney(v.ops?.collected)}　·
                            {retention ? "保固金" : v.ops?.stage ?? "—"}
                          </span>
                        </span>
                        {/* 保固金還不能請，金額降一階，不跟該催的款混在一起 */}
                        <span
                          className={`text-[15px] tabular-nums shrink-0 ${
                            retention ? "font-semibold text-[#71717A]" : "font-bold text-[#18181B]"
                          }`}
                        >
                          {fmtMoney(v.receivable)}
                        </span>
                      </button>
                    );
                  })}
                </Card>
              </section>
            )}

            <section>
              <SectionTitle title="30 天內預計完工" meta={m.upcoming.length ? `${m.upcoming.length} 件` : undefined} />
              <Card className="overflow-hidden">
                {m.upcoming.length === 0 ? (
                  <p className="px-4 py-5 text-[13px] text-[#71717A]">未來 30 天沒有預計完工的專案。</p>
                ) : (
                  m.upcoming.slice(0, 6).map((v, i, arr) => (
                    <button
                      key={v.code}
                      onClick={() => onOpen(v.code)}
                      className={`${ROW_BTN} px-4 py-3 flex items-center gap-3 ${
                        i === arr.length - 1 ? "" : "border-b border-[#F4F4F5]"
                      }`}
                    >
                      <span className="w-12 shrink-0 text-center">
                        <span className="block text-[15px] font-bold text-[#18181B] tabular-nums leading-tight">
                          {fmtDate(v.ops!.dueAt, today)}
                        </span>
                        <span className="block text-[10.5px] text-[#71717A]">
                          {v.daysLeft === 0 ? "今天" : `${v.daysLeft} 天後`}
                        </span>
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-medium text-[#18181B] truncate">{v.name}</span>
                        <span className="flex items-center gap-2 mt-1.5">
                          <span className="flex-1">
                            <ProgressBar actual={v.ops?.progress} planned={v.plannedPct} health={v.health} height={4} />
                          </span>
                          <span className="text-[11px] text-[#71717A] tabular-nums w-8 text-right">{v.ops?.progress ?? 0}%</span>
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </Card>
            </section>
          </div>

          {/* ── 右欄：全貌 ── */}
          <div className="flex flex-col gap-6 min-w-0">
            {m.byStage.length > 0 && (
              <section>
                <SectionTitle title="階段分布" meta={`${views.filter((v) => v.ops).length} 件已建檔`} />
                <Card className="px-2 py-2">
                  {m.byStage.map((s) => (
                    <button
                      key={s.stage}
                      onClick={() => goList({ stage: s.stage })}
                      className="w-full flex items-center gap-3 min-h-11 px-2 rounded-[10px] text-left group outline-none active:bg-[#F4F4F5] focus-visible:bg-[#F4F4F5]"
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
            {companySection}
            {recentSection}
            {siteSection}
          </div>
        </div>
      ) : (
        // 還沒有工程資料：左欄沒有東西可放，改成兩欄各放名冊資訊，桌機上不會空半邊
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="flex flex-col gap-6 min-w-0">
            {companySection}
            {recentSection}
          </div>
          {siteSection && <div className="flex flex-col gap-6 min-w-0">{siteSection}</div>}
        </div>
      )}
    </div>
  );
}

/** 清單列的共用互動樣式：按下／鍵盤聚焦都用底色表示（全域 CSS 把 outline、ring 都拿掉了） */
const ROW_BTN = "w-full text-left outline-none active:bg-[#F4F4F5] focus-visible:bg-[#F4F4F5] lg:hover:bg-[#FAFAFA] transition-colors";

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
    <Card
      className={`px-4 py-3.5 h-full ${
        onClick ? "active:bg-[#FAFAFA] transition-colors group-focus-visible:border-[#F39C12]" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-semibold text-[#71717A]">{label}</p>
        {emphasis && <Icon name="error" weight={400} fill={1} className="text-[16px] text-[#d03b3b]" />}
      </div>
      <p className="text-[28px] font-semibold text-[#18181B] leading-none mt-2 tabular-nums">
        {value}
        {unit && value !== "—" && <span className="text-[13px] font-medium text-[#71717A] ml-1">{unit}</span>}
      </p>
      {sub && <p className="text-[11.5px] text-[#71717A] mt-2 truncate">{sub}</p>}
    </Card>
  );
  return onClick ? (
    <button onClick={onClick} className="group text-left outline-none rounded-[18px]">
      {inner}
    </button>
  ) : (
    inner
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      // 視覺上是一行小字，點擊範圍用偽元素撐到 44px
      className="relative text-[12.5px] font-semibold text-[#71717A] flex items-center gap-0.5 shrink-0 outline-none active:text-[#18181B] focus-visible:text-[#F39C12] after:content-[''] after:absolute after:-inset-x-2 after:-inset-y-3"
    >
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
  drafted,
}: {
  v: ProjectView;
  today: string;
  onOpen: (code: string) => void;
  last?: boolean;
  metric?: React.ReactNode;
  /** 本機試編模式下有尚未同步的修改 */
  drafted?: boolean;
}) {
  const o = v.ops;
  const done = v.health === "完工";
  const progress = done ? 100 : o?.progress;
  const showBar = !!o && progress !== undefined && o.stage !== "洽談" && o.stage !== "報價";
  return (
    <button
      onClick={() => onOpen(v.code)}
      className={`${ROW_BTN} px-4 py-3.5 flex items-center gap-3 ${last ? "" : "border-b border-[#F4F4F5]"}`}
    >
      {/* 標記放在代碼下方：欄寬固定，每列的專案名稱才會對齊 */}
      <span className="w-10 shrink-0 self-start mt-[2px] flex flex-col items-start gap-1">
        <span className="text-[12px] font-semibold text-[#71717A] tabular-nums">{v.code}</span>
        {drafted && <DraftMark />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[14.5px] font-semibold text-[#18181B] truncate">{v.name}</span>
        <span className="block text-[11.5px] text-[#71717A] mt-0.5 truncate">
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
  const hasOps = views.some((v) => v.ops);
  const isDraft = useDraftCheck(ops);

  // 「本機修改」只在本機試編、而且真的有改過東西時才出現；放在第二個，測試編輯時一眼找得到
  const draftCount = useMemo(() => views.filter((v) => isDraft(v.code)).length, [views, isDraft]);
  const filters = useMemo<StatusFilter[]>(
    () => (draftCount > 0 ? ["全部", "本機修改", ...STATUS_FILTERS.slice(1)] : STATUS_FILTERS),
    [draftCount]
  );
  // 本機修改全部清掉後，這個篩選鈕會消失；不要留下一個看不到的篩選條件
  const effStatus: StatusFilter = status === "本機修改" && draftCount === 0 ? "全部" : status;

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
    const out = base.filter((v) => (stageFilter ? v.ops?.stage === stageFilter : matchStatus(v, effStatus, isDraft)));
    const byDue = (v: ProjectView) => v.ops?.dueAt || "9999";
    switch (sort) {
      case "完工日":
        return out.sort((a, b) => byDue(a).localeCompare(byDue(b)) || b.seq - a.seq);
      case "進度落後":
        return out.sort((a, b) => (a.variance ?? 999) - (b.variance ?? 999) || healthRank(a.health) - healthRank(b.health));
      case "應收":
        // 與總覽「應收帳款」同一套順序：該催的在前，保固金排在後面
        return out.sort(
          (a, b) => receivableTier(a) - receivableTier(b) || (b.receivable ?? -1) - (a.receivable ?? -1) || b.seq - a.seq
        );
      default:
        return out.sort((a, b) => b.seq - a.seq);
    }
  }, [base, effStatus, stageFilter, sort, isDraft]);

  const statusCounts = useMemo(() => {
    const c = {} as Record<StatusFilter, number>;
    filters.forEach((f) => (c[f] = base.filter((v) => matchStatus(v, f, isDraft)).length));
    return c;
  }, [base, filters, isDraft]);

  const filtered = !!q.trim() || company !== "全部" || effStatus !== "全部" || !!stageFilter;

  return (
    <div className="flex flex-col gap-4">
      {(ops.demo || !hasOps) && <DataNotice ops={ops} onOpenSetup={onOpenSetup} />}

      {/* 搜尋＋排序 */}
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0 group">
          <Icon
            name="search"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-[#A1A1AA] group-focus-within:text-[#F39C12] transition-colors pointer-events-none"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="代碼、專案名稱、案場或工地主任"
            className="w-full bg-white border border-[#E4E4E7] focus:border-[#F39C12] text-[#18181B] text-[14px] rounded-full pl-11 pr-11 h-11 outline-none transition-colors placeholder:text-[#A1A1AA]"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-[#A1A1AA] outline-none active:bg-[#F4F4F5] focus-visible:bg-[#F4F4F5]"
              aria-label="清除搜尋"
            >
              <Icon name="close" className="text-[16px]" />
            </button>
          )}
        </div>
        {hasOps && (
          <label className="relative shrink-0">
            <span className="sr-only">排序</span>
            {/* 16px 字：iOS 點小於 16px 的欄位會自動放大畫面；color-scheme 固定淺色，選單不會跟著暗色主題變黑 */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="appearance-none h-11 pl-4 pr-9 rounded-full bg-white border border-[#E4E4E7] text-[16px] font-semibold text-[#18181B] outline-none focus:border-[#F39C12] [color-scheme:light]"
            >
              {(["最新", "完工日", "進度落後", "應收"] as SortKey[]).map((s) => (
                <option key={s} value={s} className="text-[#18181B] bg-white">
                  {s === "最新" ? "最新建立" : s === "完工日" ? "完工日近到遠" : s === "進度落後" ? "落後最多" : "應收最多"}
                </option>
              ))}
            </select>
            <Icon name="expand_more" className="absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-[#A1A1AA] pointer-events-none" />
          </label>
        )}
      </div>

      {/* 篩選：手機上橫向捲動（左右貼齊螢幕邊緣），桌機空間夠就換行，不用靠橫捲才看得到 */}
      <div className="flex flex-col gap-2 -mx-6 lg:mx-0">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-6 lg:px-0 lg:flex-wrap">
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
        {hasOps && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide px-6 lg:px-0 lg:flex-wrap">
            {stageFilter ? (
              <Chip active onClick={clearStage}>
                階段：{stageFilter}
                <Icon name="close" className="text-[14px] ml-1 align-[-2px]" />
              </Chip>
            ) : (
              filters.map((f) => (
                <Chip
                  key={f}
                  active={effStatus === f}
                  onClick={() => setStatus(f)}
                  count={f === "全部" ? undefined : statusCounts[f]}
                >
                  {f === "本機修改" && <Icon name="phone_iphone" weight={300} className="text-[14px] mr-1 align-[-2px]" />}
                  {STATUS_LABEL[f] ?? f}
                </Chip>
              ))
            )}
          </div>
        )}
      </div>

      <p className="text-[12px] text-[#71717A] px-1 -mb-2">
        {list.length === views.length ? `共 ${list.length} 件` : `顯示 ${list.length} / ${views.length} 件`}
      </p>

      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <EmptyState
            icon="search_off"
            title="沒有符合條件的專案"
            action={
              filtered ? (
                <button
                  onClick={() => {
                    setQ("");
                    setCompany("全部");
                    setStatus("全部");
                  }}
                  className="h-11 px-5 rounded-full bg-white border border-[#E4E4E7] text-[13px] font-semibold text-[#18181B] outline-none active:bg-[#F4F4F5] focus-visible:border-[#F39C12]"
                >
                  清除所有條件
                </button>
              ) : undefined
            }
          />
        ) : (
          list.map((v, i) => (
            <ProjectRow
              key={v.code}
              v={v}
              today={today}
              onOpen={onOpen}
              last={i === list.length - 1}
              drafted={isDraft(v.code)}
              metric={
                sort === "應收" && v.receivable ? (
                  isRetention(v) ? (
                    <span className="text-[12px] font-semibold text-[#71717A] tabular-nums">保固金 {fmtMoney(v.receivable)}</span>
                  ) : (
                    <span className="text-[12px] font-bold text-[#18181B] tabular-nums">{fmtMoney(v.receivable)}</span>
                  )
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
