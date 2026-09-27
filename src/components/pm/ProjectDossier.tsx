"use client";

import React, { useMemo, useState } from "react";
import {
  addDays,
  BEHIND_PCT,
  fmtDate,
  fmtMoney,
  OPS_COLUMNS,
  OPS_TAB,
  WATCH_PCT,
  WORK_COLUMNS,
  WORK_TAB,
  type OpsRecord,
  type ProjectView,
  type WorkItem,
} from "@/lib/project-ops";
import Gantt from "./Gantt";
import {
  Card,
  CategoryTag,
  EmptyState,
  HealthBadge,
  Icon,
  ProgressBar,
  SectionTitle,
  STATUS,
  WORK_META,
  INK_2,
  ACCENT,
} from "./ui";
import { readSandbox } from "./sandbox";
import { toast } from "./Sheet";
import type { EditTarget } from "./DossierScreen";
import type { ProjectOps } from "./useProjectOps";

/* ══════════════════════════════════════════════════════════
   資料來源提示：示範中／本機試編／尚未連接／已連接
   ══════════════════════════════════════════════════════════ */

/**
 * 本機試編的內容匯出成「可以直接貼進試算表」的文字（Tab 分隔）。
 * 欄名與狩獵管理試算表一致；日期 2026/10/3、金額整數元。
 * 必須在點擊當下同步組好字串 —— iOS 的剪貼簿只接受使用者手勢裡的呼叫。
 */
function buildExport(ops: ProjectOps): string {
  const doc = readSandbox(ops.sandboxBase);
  const nameOf = new Map(ops.views.map((v) => [v.code, v.name]));
  const d = (iso?: string) => (iso ? iso.replace(/-0?/g, "/").replace(/^(\d{4})\//, "$1/") : "");
  const cell = (v: unknown) => String(v ?? "").replace(/[\t\n\r]+/g, " ");
  const opsCols = OPS_COLUMNS;
  const lines: string[] = [];
  lines.push(`【${OPS_TAB}】`);
  lines.push(["代碼", "專案（參考）", ...opsCols.filter((c) => c.key !== "code").map((c) => c.header)].join("\t"));
  for (const r of Object.values(doc.records)) {
    const row: string[] = [r.code, nameOf.get(r.code) ?? ""];
    for (const c of opsCols) {
      if (c.key === "code") continue;
      const v = r[c.key as keyof OpsRecord];
      row.push(cell(/At$/.test(c.key) ? d(v as string | undefined) : v));
    }
    lines.push(row.join("\t"));
  }
  lines.push("");
  lines.push(`【${WORK_TAB}】`);
  lines.push(WORK_COLUMNS.map((c) => c.header).join("\t"));
  for (const [code, items] of Object.entries(doc.items)) {
    for (const it of items) {
      lines.push(
        WORK_COLUMNS.map((c) => {
          const v = c.key === "code" ? code : it[c.key as keyof WorkItem];
          return cell(c.key === "start" || c.key === "end" ? d(v as string | undefined) : v);
        }).join("\t")
      );
    }
  }
  return lines.join("\n");
}

function SandboxBanner({ ops }: { ops: ProjectOps }) {
  const [confirm, setConfirm] = useState(false);
  const [open, setOpen] = useState(false);
  const n = ops.sandboxProjects;
  if (ops.saveMode !== "sandbox" || n === 0) return null;
  const exportIt = (share: boolean) => {
    const text = buildExport(ops);
    const nav = navigator as Navigator & { share?: (d: { text: string; title?: string }) => Promise<void> };
    if (share && nav.share) {
      nav.share({ title: "工程資料（本機試編）", text }).catch(() => {});
      return;
    }
    navigator.clipboard?.writeText(text).then(
      () => toast("已複製，可以直接貼到狩獵管理試算表的 A1"),
      () => toast("這個瀏覽器不允許複製", { tone: "error" })
    );
  };
  return (
    <div className="rounded-[14px] border-[1.5px] border-dashed border-[#A1A1AA] bg-white">
      {/* 平常只佔一行；要匯出或還原時再展開 */}
      <button
        onClick={() => {
          setOpen((o) => !o);
          setConfirm(false);
        }}
        aria-expanded={open}
        className="w-full min-h-[48px] px-4 py-2 flex items-center gap-3 text-left"
      >
        <Icon name="phone_iphone" weight={300} className="text-[20px] text-[#52525B] shrink-0" />
        <span className="flex-1 min-w-0 text-[13.5px] text-[#18181B]">
          <b>本機試編</b>　·　{n} 個專案有修改
          <span className="text-[#A1A1AA] hidden sm:inline">{open ? "" : "　只存在這台裝置"}</span>
        </span>
        <Icon name={open ? "expand_less" : "expand_more"} className="text-[20px] text-[#A1A1AA] shrink-0" />
      </button>
      {open && (
        <div className="px-4 pb-3.5 pl-[52px] -mt-1">
          <p className="text-[12px] text-[#71717A] leading-snug">
            修改只存在這個 APP（這台裝置），別人看不到，也不會寫回試算表或雲端。清除瀏覽資料或換手機就會消失。
            {ops.demo ? "示範資料上的修改一律不會上傳。" : ""}
          </p>
          {confirm ? (
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              <span className="text-[12.5px] text-[#18181B]">確定丟掉這 {n} 個專案的本機修改？</span>
              <button
                onClick={() => {
                  ops.clearSandbox();
                  setConfirm(false);
                  toast("已清除本機試編");
                }}
                className="h-10 px-3.5 rounded-full bg-white border border-[#E4E4E7] text-[12.5px] font-semibold text-[#d03b3b]"
              >
                全部丟掉
              </button>
              <button onClick={() => setConfirm(false)} className="h-10 px-3.5 rounded-full bg-[#F4F4F5] text-[12.5px] font-semibold text-[#18181B]">
                取消
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 mt-2.5">
              <button
                onClick={() => exportIt(false)}
                className="h-10 px-3.5 rounded-full bg-white border border-[#E4E4E7] text-[12.5px] font-semibold text-[#18181B] active:bg-[#F4F4F5] inline-flex items-center gap-1"
              >
                <Icon name="content_copy" className="text-[15px]" />
                複製為試算表格式
              </button>
              {"share" in navigator && (
                <button
                  onClick={() => exportIt(true)}
                  className="h-10 px-3.5 rounded-full bg-white border border-[#E4E4E7] text-[12.5px] font-semibold text-[#18181B] active:bg-[#F4F4F5] inline-flex items-center gap-1"
                >
                  <Icon name="ios_share" className="text-[15px]" />
                  分享
                </button>
              )}
              <button onClick={() => setConfirm(true)} className="h-10 px-3 rounded-full text-[12.5px] font-semibold text-[#d03b3b]">
                {ops.demo ? "全部還原示範" : "全部丟掉"}
              </button>
            </div>
          )}
          <p className="text-[11px] text-[#A1A1AA] mt-2">匯出內容含合約金額，分享時請留意對象。</p>
        </div>
      )}
    </div>
  );
}

export function DataNotice({ ops, onOpenSetup }: { ops: ProjectOps; onOpenSetup: () => void }) {
  const total = ops.views.length;

  if (ops.demo) {
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-[14px] border border-[#fab219]/50 bg-[#FFF9EB] px-4 py-2.5 flex items-center gap-3">
          <Icon name="science" weight={300} className="text-[22px] text-[#B7791F] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-[#18181B]">示範資料　·　可以直接試編</p>
            <p className="text-[12px] text-[#71717A] leading-snug">
              名稱是真的，日期、進度與金額是模擬的。<span className="hidden sm:inline">點任何專案都能試著回報、改排程。</span>
            </p>
          </div>
          <button
            onClick={() => ops.setDemo(false)}
            className="shrink-0 h-9 px-3.5 rounded-full bg-white border border-[#E4E4E7] text-[12.5px] font-semibold text-[#18181B] active:bg-[#F4F4F5]"
          >
            關閉示範
          </button>
        </div>
        <SandboxBanner ops={ops} />
      </div>
    );
  }

  const banner = <SandboxBanner ops={ops} />;

  if (!ops.connected || ops.realRecordCount === 0) {
    const connected = ops.connected;
    return (
      <div className="flex flex-col gap-3">
        {banner}
        <Card className="p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-[#F4F4F5] flex items-center justify-center shrink-0">
              <Icon name={connected ? "table_view" : "link_off"} weight={300} className="text-[20px] text-[#71717A]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-[#18181B]">
                {connected ? "工程資料表已連接，還沒有填任何專案" : "工程資料尚未連接"}
              </p>
              <p className="text-[12.5px] text-[#71717A] mt-1 leading-relaxed">
                專案名冊已從專案CRM 讀到 <b className="text-[#18181B] tabular-nums">{total}</b> 件。
                {connected
                  ? "在試算表填入階段、日期、進度與金額後，這裡就會出現進度追蹤與請款分析。"
                  : "可以先開示範資料試編，或直接點任一專案「建立工程資料」（先存在這台裝置）。"}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {ops.demoAvailable && (
                  <button
                    onClick={() => ops.setDemo(true)}
                    className="h-10 px-4 rounded-full bg-[#18181B] text-white text-[13px] font-semibold active:opacity-80"
                  >
                    開啟示範資料試編
                  </button>
                )}
                {connected && ops.source?.ops.sheetUrl ? (
                  <a
                    href={ops.source.ops.sheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="h-10 px-4 rounded-full bg-white border border-[#E4E4E7] text-[13px] font-semibold text-[#18181B] inline-flex items-center gap-1 active:bg-[#F4F4F5]"
                  >
                    開啟試算表
                    <Icon name="open_in_new" className="text-[15px]" />
                  </a>
                ) : (
                  <button
                    onClick={onOpenSetup}
                    className="h-10 px-4 rounded-full bg-white border border-[#E4E4E7] text-[13px] font-semibold text-[#18181B] active:bg-[#F4F4F5]"
                  >
                    如何連接
                  </button>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const time = ops.fetchedAt ? new Date(ops.fetchedAt) : null;
  return (
    <div className="flex flex-col gap-3">
      {banner}
      <div className="flex items-center justify-between gap-3 px-1 text-[12px] text-[#71717A]">
        <span className="truncate">
          已建檔 <b className="text-[#18181B] tabular-nums">{ops.realRecordCount}</b> / {total} 件
          {ops.source?.ops.state === "partial" && "　·　有分頁讀取失敗"}
          {time && `　·　更新於 ${time.getHours()}:${String(time.getMinutes()).padStart(2, "0")}`}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {ops.source?.ops.sheetUrl && (
            <a
              href={ops.source.ops.sheetUrl}
              target="_blank"
              rel="noreferrer"
              className="h-9 px-2.5 rounded-full hover:bg-[#F4F4F5] inline-flex items-center gap-1 text-[#71717A]"
            >
              <Icon name="table_view" className="text-[16px]" />
              試算表
            </a>
          )}
          <button
            onClick={ops.refresh}
            className="w-9 h-9 rounded-full hover:bg-[#F4F4F5] flex items-center justify-center text-[#71717A]"
            aria-label="重新整理"
          >
            <Icon name="refresh" className="text-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   連接說明
   ══════════════════════════════════════════════════════════ */

export function SetupGuide({ ops }: { ops: ProjectOps }) {
  const sa = ops.source?.ops.serviceAccount;
  const [copied, setCopied] = useState(false);
  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: "建立「狩獵管理」試算表",
      body: (
        <>
          在 Google 雲端硬碟新增試算表，建立兩個分頁：<b>{OPS_TAB}</b>、<b>{WORK_TAB}</b>。
          第一列放下方的欄位名稱（順序不拘，欄名對就好）。
          也可以向管理者索取範本檔（{ops.views.length} 個專案代碼已列好）直接匯入。
        </>
      ),
    },
    {
      title: "共用給 APP 的服務帳號",
      body: (
        <>
          按右上「共用」，加入下面這個帳號，權限選<b>檢視者</b>就好 —— APP 只需要讀。
          {sa && (
            <button
              onClick={() => {
                navigator.clipboard?.writeText(sa).then(
                  () => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  },
                  () => {}
                );
              }}
              className="mt-2 w-full flex items-center gap-2 rounded-[12px] bg-[#F4F4F5] px-3 py-2.5 text-left active:bg-[#E4E4E7]"
            >
              <span className="flex-1 min-w-0 text-[12px] font-mono text-[#18181B] break-all">{sa}</span>
              <Icon name={copied ? "check" : "content_copy"} className="text-[16px] text-[#71717A] shrink-0" />
            </button>
          )}
        </>
      ),
    },
    {
      title: "在 Vercel 設定試算表 ID",
      body: (
        <>
          試算表網址 <span className="font-mono text-[11.5px]">/spreadsheets/d/<b>這一段</b>/edit</span> 就是 ID。
          到 Vercel → sensesoil-hunting → Settings → Environment Variables 新增
          <span className="font-mono text-[11.5px] bg-[#F4F4F5] rounded-[4px] px-1.5 py-0.5 mx-1">SHEET_ID_HUNTING_MGMT</span>
          （勾選 Production），再重新部署一次。
        </>
      ),
    },
  ];

  return (
    <div className="px-5 py-5 max-w-2xl mx-auto flex flex-col gap-6 pb-16">
      <p className="text-[13px] text-[#71717A] leading-relaxed px-1">
        資料放在 Google 試算表，大家照原本習慣在試算表填寫；APP 負責彙整成進度追蹤、請款分析與排程。
        專案名稱一律以專案CRM 為準，試算表只用「代碼」對應。
      </p>
      <Card className="overflow-hidden">
        {steps.map((s, i) => (
          <div key={s.title} className={`px-4 py-4 flex gap-3 ${i === steps.length - 1 ? "" : "border-b border-[#F4F4F5]"}`}>
            <span className="w-6 h-6 rounded-full bg-[#18181B] text-white text-[12px] font-bold flex items-center justify-center shrink-0 mt-0.5">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-[#18181B]">{s.title}</p>
              <div className="text-[12.5px] text-[#71717A] mt-1 leading-relaxed">{s.body}</div>
            </div>
          </div>
        ))}
      </Card>
      <div>
        <SectionTitle title={`「${OPS_TAB}」分頁`} meta="一個專案一列" />
        <ColumnTable cols={OPS_COLUMNS} />
      </div>
      <div>
        <SectionTitle title={`「${WORK_TAB}」分頁`} meta="一個工項一列" />
        <ColumnTable cols={WORK_COLUMNS} />
      </div>
    </div>
  );
}

function ColumnTable({ cols }: { cols: { header: string; hint: string }[] }) {
  return (
    <Card className="overflow-hidden">
      {cols.map((c, i) => (
        <div key={c.header} className={`px-4 py-3 flex gap-3 ${i === cols.length - 1 ? "" : "border-b border-[#F4F4F5]"}`}>
          <span className="w-[76px] shrink-0 text-[13px] font-semibold text-[#18181B]">{c.header}</span>
          <span className="text-[12.5px] text-[#71717A] leading-relaxed">{c.hint || "—"}</span>
        </div>
      ))}
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════
   專案細節
   ══════════════════════════════════════════════════════════ */

/** 工項甘特圖的縮放：模組常數，避免每次重繪都產生新物件 */
const WORK_FIT = { min: 5, max: 22 } as const;

/** 單一專案的工項甘特圖 */
export function WorkGantt({ p, today, onItem }: { p: ProjectView; today: string; onItem?: (id: string) => void }) {
  const items = useMemo(() => p.items.filter((i) => i.start && i.end), [p.items]);
  const range = useMemo(() => {
    if (!items.length) return null;
    const s = items.reduce((m, i) => (i.start! < m ? i.start! : m), items[0].start!);
    const e = items.reduce((m, i) => (i.end! > m ? i.end! : m), items[0].end!);
    return { from: addDays(s < today ? s : today, -2), to: addDays(e > today ? e : today, 4) };
  }, [items, today]);
  if (!range) return null;
  return (
    <Gantt
      dense
      fit={WORK_FIT}
      anchor={0.75}
      today={today}
      from={range.from}
      to={range.to}
      dayWidth={12}
      labelWidth={104}
      rows={items.map((it, k) => ({
        id: it.id ?? `${k}`,
        label: it.trade,
        sublabel: it.kind === "等待" ? "等待期（免派工）" : it.crew,
        onClick: onItem && it.id ? () => onItem(it.id!) : undefined,
        // 只標還沒完成的；已完成的每列都寫 100% 只是雜訊
        trailing:
          it.status === "延遲" ? `${it.progress ?? 0}% · 延遲` : it.status === "完成" ? undefined : `${it.progress ?? 0}%`,
        bars: [
          {
            start: it.start!,
            end: it.end!,
            progress: it.progress,
            fill: it.kind === "等待" ? "#A1A1AA" : WORK_META[it.status].fill,
            dashed: it.kind === "等待",
            late: it.status === "延遲",
            tip: (
              <>
                <b>{it.trade}</b>
                {it.crew ? `　${it.crew}` : ""}
                <br />
                {fmtDate(it.start, today)} – {fmtDate(it.end, today)}　·　{it.progress ?? 0}%　·　{it.status}
                {it.note && (
                  <>
                    <br />
                    {it.note}
                  </>
                )}
              </>
            ),
          },
        ],
      }))}
    />
  );
}

function Field({ label, value, onClick }: { label: string; value?: React.ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <span className="text-[13px] text-[#71717A] w-[72px] shrink-0">{label}</span>
      <span className="text-[14px] text-[#18181B] flex-1 min-w-0 break-words text-left">
        {value || <span className="text-[#A1A1AA]">未填</span>}
      </span>
      {onClick && <Icon name="chevron_right" className="text-[18px] text-[#D4D4D8] shrink-0" />}
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="w-full px-4 py-3 flex items-center gap-4 border-b border-[#F4F4F5] last:border-b-0 active:bg-[#F4F4F5]">
      {inner}
    </button>
  ) : (
    <div className="px-4 py-3 flex gap-4 border-b border-[#F4F4F5] last:border-b-0">{inner}</div>
  );
}

function LinkAction({ onClick, children, icon = "edit" }: { onClick: () => void; children: React.ReactNode; icon?: string }) {
  return (
    <button
      onClick={onClick}
      className="h-9 px-3 -mr-1 rounded-full text-[13px] font-semibold text-[#52525B] active:bg-[#F4F4F5] inline-flex items-center gap-1"
    >
      <Icon name={icon} className="text-[16px]" />
      {children}
    </button>
  );
}

function stripDatePrefix(note: string | undefined, updatedAt: string | undefined, today: string) {
  if (!note || !updatedAt) return note;
  const prefix = `${fmtDate(updatedAt, today)} `;
  return note.startsWith(prefix) ? note.slice(prefix.length) : note;
}

export function ProjectDossier({
  p,
  ops,
  onOpenProject,
  onOpenSetup,
  onEdit,
}: {
  p: ProjectView;
  ops: ProjectOps;
  onOpenProject: (code: string) => void;
  onOpenSetup: () => void;
  /** 開啟編輯抽屜 */
  onEdit?: (target: EditTarget) => void;
}) {
  const today = ops.today;
  const o = p.ops;
  const mates = p.siteMates
    .map((c) => ops.views.find((v) => v.code === c))
    .filter((v): v is ProjectView => !!v);
  const done = p.health === "完工";
  const actual = done ? 100 : o?.progress;
  const [showItems, setShowItems] = useState(false);
  const unscheduled = p.items.filter((i) => !i.start || !i.end).length;

  const daysText =
    p.daysLeft === undefined
      ? done && o?.doneAt
        ? `${fmtDate(o.doneAt, today)} 完工`
        : undefined
      : p.daysLeft < 0 && (actual ?? 0) < 100
      ? `已逾期 ${-p.daysLeft} 天`
      : p.daysLeft === 0
      ? "今天到期"
      : p.daysLeft > 0
      ? `距預計完工 ${p.daysLeft} 天`
      : "已完工，待點交";

  const varianceColor =
    p.variance === undefined
      ? "#71717A"
      : p.variance >= 0
      ? STATUS.good
      : p.variance <= -BEHIND_PCT
      ? STATUS.serious
      : p.variance <= -WATCH_PCT
      ? STATUS.warning
      : "#71717A";

  return (
    <div className="px-5 py-5 max-w-3xl mx-auto flex flex-col gap-5 pb-8">
      {/* 標頭：狀態＋最新近況（老闆打開最想先看的） */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[21px] font-bold text-[#18181B] leading-snug text-balance min-w-0">{p.name}</h2>
          <HealthBadge health={p.health} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {o?.stage &&
            (onEdit ? (
              <button
                onClick={() => onEdit({ kind: "stage" })}
                className="h-8 pl-2.5 pr-1.5 rounded-[8px] bg-[#F4F4F5] text-[12.5px] font-semibold text-[#3F3F46] inline-flex items-center gap-0.5 active:bg-[#E4E4E7]"
                aria-label={`階段：${o.stage}，點一下修改`}
              >
                {o.stage}
                <Icon name="expand_more" className="text-[16px]" />
              </button>
            ) : (
              <span className="h-8 px-2.5 rounded-[8px] bg-[#F4F4F5] text-[12.5px] font-semibold text-[#3F3F46] inline-flex items-center">
                {o.stage}
              </span>
            ))}
          <CategoryTag category={p.category} inferred={p.categoryInferred} />
          {ops.demo && (
            <span className="inline-flex items-center h-[22px] px-2 rounded-[6px] bg-[#FFF9EB] border border-[#fab219]/50 text-[11px] font-semibold text-[#B7791F]">
              示範資料
            </span>
          )}
        </div>
        {p.reason && (
          <p className="mt-3 text-[13px] text-[#52525B] leading-relaxed flex gap-1.5">
            <Icon name="subdirectory_arrow_right" className="text-[16px] text-[#A1A1AA] mt-[1px]" />
            {p.reason}
          </p>
        )}
        {o && (
          <button
            onClick={() => onEdit?.({ kind: "daily" })}
            disabled={!onEdit}
            className="mt-3 w-full text-left rounded-[12px] bg-[#FAFAFA] px-3.5 py-3 active:bg-[#F4F4F5] disabled:active:bg-[#FAFAFA]"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] font-semibold text-[#71717A]">
                近況{o.updatedAt ? `　·　${fmtDate(o.updatedAt, today)} 更新` : ""}
              </span>
              {onEdit && <Icon name="chevron_right" className="text-[18px] text-[#D4D4D8]" />}
            </span>
            <span className={`block text-[14px] leading-relaxed mt-0.5 ${o.note ? "text-[#18181B]" : "text-[#A1A1AA]"}`}>
              {/* 今日回報會在近況前加日期（匯出時有用）；標題已寫更新日，這裡就不重複 */}
              {stripDatePrefix(o.note, o.updatedAt, today) || "還沒有近況，點這裡回報"}
            </span>
          </button>
        )}
        {ops.saveMode === "sandbox" && ops.isDrafted(p.code) && (
          <div className="mt-3 pt-3 border-t border-[#F4F4F5] flex items-center gap-2">
            <Icon name="phone_iphone" className="text-[16px] text-[#A1A1AA]" />
            <span className="flex-1 text-[12px] text-[#71717A]">
              {ops.demo ? "這筆示範資料有你在這台裝置的試編修改" : "這筆資料目前只存在這台裝置"}
            </span>
            <button
              onClick={() => {
                ops.resetProject(p.code);
                toast(ops.demo ? "已還原為示範資料" : "已刪除本機資料");
              }}
              className="h-9 px-3 rounded-full text-[12px] font-semibold text-[#52525B] bg-[#F4F4F5] active:bg-[#E4E4E7] shrink-0"
            >
              {ops.demo ? "還原示範" : "刪除本機資料"}
            </button>
          </div>
        )}
      </Card>

      {!o ? (
        <Card>
          <EmptyState
            icon="edit_note"
            title="這個專案還沒有工程資料"
            hint={
              ops.saveMode === "server" ? (
                <>填上階段、日期與金額後，這裡會顯示進度、請款與工項排程。</>
              ) : (
                <>
                  可以直接在這裡建立（{ops.demo ? "示範試編" : "先存在這台裝置"}），
                  或在狩獵管理試算表的「{OPS_TAB}」分頁新增代碼 <b className="text-[#52525B]">{p.code}</b> 的一列。
                </>
              )
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {onEdit && (
                  <button
                    onClick={() => onEdit({ kind: "form" })}
                    className="h-11 px-5 rounded-full bg-[#18181B] text-white text-[14px] font-semibold active:opacity-85"
                  >
                    建立工程資料
                  </button>
                )}
                {!ops.connected && (
                  <button
                    onClick={onOpenSetup}
                    className="h-11 px-5 rounded-full bg-white border border-[#E4E4E7] text-[14px] font-semibold text-[#18181B] active:bg-[#F4F4F5]"
                  >
                    如何連接
                  </button>
                )}
              </div>
            }
          />
        </Card>
      ) : (
        <>
          {/* 進度（整張卡可點：直接回報） */}
          <div>
            <SectionTitle
              title="進度"
              meta={daysText}
              action={onEdit ? <LinkAction onClick={() => onEdit({ kind: "daily" })} icon="edit_calendar">回報</LinkAction> : undefined}
            />
            <Card className="overflow-hidden">
              <button
                onClick={() => onEdit?.({ kind: "daily" })}
                disabled={!onEdit}
                className="w-full text-left p-5 active:bg-[#FAFAFA] disabled:active:bg-white"
                aria-label="更新進度"
              >
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[12px] text-[#71717A]">實際進度</p>
                    <p className="text-[40px] font-semibold text-[#18181B] leading-none mt-1.5">
                      {actual ?? "—"}
                      {actual !== undefined && <span className="text-[20px] font-medium text-[#A1A1AA] ml-0.5">%</span>}
                    </p>
                  </div>
                  {p.plannedPct !== undefined && !done && (
                    <div className="text-right">
                      <p className="text-[12px] text-[#71717A]">依工期應達</p>
                      <p className="text-[17px] font-semibold text-[#52525B] mt-1 tabular-nums">{p.plannedPct}%</p>
                      {p.variance !== undefined && (
                        <p className="text-[12px] font-semibold mt-0.5 text-[#52525B] flex items-center justify-end gap-0.5">
                          <Icon
                            name={p.variance >= 0 ? "arrow_upward" : "arrow_downward"}
                            weight={500}
                            className="text-[14px]"
                            style={{ color: varianceColor }}
                          />
                          {p.variance >= 0 ? `超前 ${p.variance}%` : `落後 ${-p.variance}%`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <ProgressBar actual={actual} planned={done ? undefined : p.plannedPct} health={p.health} height={8} />
                  {p.plannedPct !== undefined && p.plannedPct > 0 && p.plannedPct < 100 && !done && (
                    <p className="text-[11px] text-[#71717A] mt-2 flex items-center gap-1.5">
                      <span className="inline-block w-[2px] h-3 bg-[#18181B] rounded-full" />
                      直線是依開工到預計完工的天數算出的應有進度
                    </p>
                  )}
                </div>
              </button>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-2 gap-y-3 px-5 pb-5 pt-4 border-t border-[#F4F4F5]">
                {[
                  ["簽約", o.signedAt],
                  ["開工", o.startAt],
                  ["預計完工", o.dueAt],
                  ["實際完工", o.doneAt],
                ].map(([l, d]) => (
                  <div key={l} className="min-w-0">
                    <p className="text-[11px] text-[#71717A]">{l}</p>
                    <p className={`text-[13.5px] font-semibold mt-0.5 tabular-nums ${d ? "text-[#18181B]" : "text-[#A1A1AA]"}`}>
                      {fmtDate(d, today)}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* 工項排程 */}
          <div>
            <SectionTitle
              title="工項排程"
              meta={
                p.items.length
                  ? `${p.items.filter((i) => i.status === "完成").length} / ${p.items.length} 完成` +
                    (p.items.some((i) => i.status === "延遲") ? `　·　${p.items.filter((i) => i.status === "延遲").length} 項延遲` : "")
                  : undefined
              }
              action={
                onEdit && p.items.length > 0 ? <LinkAction onClick={() => onEdit({ kind: "items" })}>編輯排程</LinkAction> : undefined
              }
            />
            <Card className="overflow-hidden">
              {p.items.length > 0 ? (
                <>
                  {p.items.some((i) => i.start && i.end) ? (
                    <WorkGantt p={p} today={today} onItem={onEdit ? (id) => onEdit({ kind: "item", itemId: id }) : undefined} />
                  ) : null}
                  {unscheduled > 0 && (
                    <p className="px-4 py-3 text-[12.5px] text-[#71717A] border-t border-[#F4F4F5]">
                      {unscheduled} 個工項尚未排定日期
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 border-t border-[#F4F4F5] text-[11px] text-[#71717A]">
                    <Legend color={INK_2} label="已完成比例" />
                    <Legend color={INK_2} faint label="排定期間" />
                    <Legend color="#A1A1AA" label="已完成工項" />
                    <Legend color={STATUS.critical} label="延遲工項" />
                    <Legend color={STATUS.critical} label="超過預定的天數" hatch />
                    <Legend color="#A1A1AA" label="等待期（免派工）" dashed />
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-[1.5px] h-3" style={{ background: ACCENT }} />
                      今天
                    </span>
                  </div>
                  {/* 手機沒有滑過提示：用清單補上起訖日、狀態與備註 */}
                  <button
                    onClick={() => setShowItems((s) => !s)}
                    className="w-full px-4 py-3 border-t border-[#F4F4F5] flex items-center justify-between text-[13px] font-semibold text-[#3F3F46] active:bg-[#FAFAFA]"
                    aria-expanded={showItems}
                  >
                    工項明細（{p.items.length}）
                    <Icon name={showItems ? "expand_less" : "expand_more"} className="text-[20px] text-[#71717A]" />
                  </button>
                  {showItems && (
                    <div className="border-t border-[#F4F4F5] divide-y divide-[#F4F4F5]">
                      {p.items.map((it, i) => (
                        <button
                          key={it.id ?? `${it.trade}-${i}`}
                          onClick={() => it.id && onEdit?.({ kind: "item", itemId: it.id })}
                          className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-[#FAFAFA]"
                        >
                          <span
                            className={`w-1 self-stretch rounded-full shrink-0 ${it.kind === "等待" ? "border border-dashed border-[#A1A1AA]" : ""}`}
                            style={{ background: it.kind === "等待" ? "transparent" : WORK_META[it.status].fill }}
                          />
                          <span className="flex-1 min-w-0">
                            <span className="block text-[14px] font-semibold text-[#18181B] truncate">{it.trade}</span>
                            <span className="block text-[12px] text-[#71717A] truncate tabular-nums">
                              {it.kind === "等待" ? "等待期（免派工）" : it.crew || "未指定施作單位"}　·
                              {it.start && it.end ? `${fmtDate(it.start, today)}–${fmtDate(it.end, today)}` : "未排定"}
                              {it.note ? `　·　${it.note}` : ""}
                            </span>
                          </span>
                          <span className="text-right shrink-0">
                            <span className="block text-[13px] font-semibold text-[#18181B] tabular-nums">{it.progress ?? 0}%</span>
                            <span className="block text-[11px]" style={{ color: it.status === "延遲" ? STATUS.critical : "#71717A" }}>
                              {it.status}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <EmptyState
                  icon="view_timeline"
                  title="尚未排定工項"
                  hint={<>可以依「{p.category}」範本一次產生，再逐項調整日期與工班。</>}
                  action={
                    onEdit ? (
                      <button
                        onClick={() => onEdit({ kind: "items" })}
                        className="h-11 px-5 rounded-full bg-[#18181B] text-white text-[14px] font-semibold active:opacity-85"
                      >
                        排定工項
                      </button>
                    ) : undefined
                  }
                />
              )}
            </Card>
          </div>

          {/* 財務 */}
          <div>
            <SectionTitle
              title="合約與請款"
              action={onEdit ? <LinkAction onClick={() => onEdit({ kind: "form" })}>編輯</LinkAction> : undefined}
            />
            <Card className="overflow-hidden">
              <div className="grid grid-cols-3 divide-x divide-[#F4F4F5] border-b border-[#F4F4F5]">
                {[
                  ["合約", o.contract],
                  ["追加減", o.variation],
                  ["合計", p.contractTotal],
                ].map(([l, v], i) => (
                  <div key={l as string} className="px-4 py-3.5 min-w-0">
                    <p className="text-[11px] text-[#71717A]">{l}</p>
                    <p className={`mt-0.5 tabular-nums truncate ${i === 2 ? "text-[17px] font-bold text-[#18181B]" : "text-[15px] font-semibold text-[#3F3F46]"}`}>
                      {fmtMoney(v as number | undefined)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="px-4 py-4 flex flex-col gap-4">
                <Meter
                  label="已請款"
                  value={o.billed}
                  rate={p.billedRate}
                  caption={p.billedRate !== undefined ? `合約的 ${Math.round(p.billedRate * 100)}%` : undefined}
                />
                <Meter
                  label="已收款"
                  value={o.collected}
                  rate={p.collectedRate}
                  caption={p.collectedRate !== undefined ? `請款的 ${Math.round(p.collectedRate * 100)}%` : undefined}
                />
                <div className="flex items-center justify-between rounded-[12px] bg-[#FAFAFA] px-3.5 py-3">
                  <span className="text-[13px] text-[#52525B] flex items-center gap-1.5">
                    <Icon name="account_balance_wallet" className="text-[18px] text-[#A1A1AA]" />
                    {p.retentionHeld ? "保固金（未到期）" : "應收未收"}
                  </span>
                  <span className={`text-[17px] tabular-nums ${p.receivable ? "font-bold text-[#18181B]" : "font-semibold text-[#A1A1AA]"}`}>
                    {fmtMoney(p.receivable)}
                  </span>
                </div>
                {onEdit && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onEdit({ kind: "billed" })}
                      className="h-11 rounded-[12px] bg-white border border-[#E4E4E7] text-[13.5px] font-semibold text-[#18181B] active:bg-[#F4F4F5]"
                    >
                      ＋ 登錄請款
                    </button>
                    <button
                      onClick={() => onEdit({ kind: "collected" })}
                      className="h-11 rounded-[12px] bg-white border border-[#E4E4E7] text-[13.5px] font-semibold text-[#18181B] active:bg-[#F4F4F5]"
                    >
                      ＋ 登錄收款
                    </button>
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div>
            <SectionTitle title="人員與地點" />
            <Card className="overflow-hidden">
              <Field label="工地主任" value={o.manager} onClick={onEdit ? () => onEdit({ kind: "form" }) : undefined} />
              <Field label="業主" value={o.client} onClick={onEdit ? () => onEdit({ kind: "form" }) : undefined} />
              <Field label="工地地址" value={o.site} onClick={onEdit ? () => onEdit({ kind: "form" }) : undefined} />
            </Card>
            {ops.demo && <p className="text-[11.5px] text-[#71717A] px-1 mt-1.5">示範資料不填人名、業主與地址。</p>}
          </div>
        </>
      )}

      {/* 同案場 */}
      {mates.length > 0 && (
        <div>
          <SectionTitle title="同一案場的其他合約" meta={`${p.siteGroup}　·　依名稱判斷`} />
          <Card className="overflow-hidden">
            {mates.map((m, i) => (
              <button
                key={m.code}
                onClick={() => onOpenProject(m.code)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[#F4F4F5] ${
                  i === mates.length - 1 ? "" : "border-b border-[#F4F4F5]"
                }`}
              >
                <span className="w-11 shrink-0 text-[12px] font-semibold text-[#71717A] tabular-nums">{m.code}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-medium text-[#18181B] truncate">{m.name}</span>
                  <span className="block text-[11.5px] text-[#71717A] mt-0.5">
                    {m.company}　·　{m.category}
                  </span>
                </span>
                <HealthBadge health={m.health} compact />
              </button>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

function Meter({ label, value, rate, caption }: { label: string; value?: number; rate?: number; caption?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[13px] text-[#52525B]">{label}</span>
        <span className="text-[13px] tabular-nums">
          <b className="text-[#18181B] font-semibold">{fmtMoney(value)}</b>
          {caption && <span className="text-[#71717A] ml-2">{caption}</span>}
        </span>
      </div>
      <ProgressBar actual={rate !== undefined ? Math.round(rate * 100) : undefined} height={6} />
    </div>
  );
}

function Legend({
  color,
  label,
  faint,
  hatch,
  dashed,
}: {
  color: string;
  label: string;
  faint?: boolean;
  hatch?: boolean;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-4 h-2.5 rounded-[3px]"
        style={{
          background: dashed
            ? "transparent"
            : hatch
            ? `repeating-linear-gradient(135deg, ${color}55 0 3px, ${color}22 3px 6px)`
            : color,
          border: dashed ? `1.5px dashed ${color}` : undefined,
          opacity: faint ? 0.18 : 1,
        }}
      />
      {label}
    </span>
  );
}
