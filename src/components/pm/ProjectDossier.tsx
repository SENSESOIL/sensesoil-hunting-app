"use client";

import React, { useMemo, useState } from "react";
import {
  addDays,
  fmtDate,
  fmtMoney,
  OPS_COLUMNS,
  OPS_TAB,
  WORK_COLUMNS,
  WORK_TAB,
  type ProjectView,
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
  StagePill,
  STATUS,
  INK_2,
} from "./ui";
import type { ProjectOps } from "./useProjectOps";

/* ══════════════════════════════════════════════════════════
   資料來源提示：示範中／尚未連接／已連接
   ══════════════════════════════════════════════════════════ */

export function DataNotice({
  ops,
  onOpenSetup,
}: {
  ops: ProjectOps;
  onOpenSetup: () => void;
}) {
  const total = ops.views.length;

  if (ops.demo) {
    return (
      <div className="rounded-[14px] border border-[#fab219]/50 bg-[#FFF9EB] px-4 py-3 flex items-center gap-3">
        <Icon name="science" weight={300} className="text-[22px] text-[#B7791F] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-[#18181B]">示範資料</p>
          <p className="text-[12px] text-[#71717A] leading-snug">
            專案名稱是真的；階段、日期、進度與金額都是模擬數字，只用來預覽版面。
          </p>
        </div>
        <button
          onClick={() => ops.setDemo(false)}
          className="shrink-0 h-8 px-3 rounded-full bg-white border border-[#E4E4E7] text-[12px] font-semibold text-[#18181B] active:bg-[#F4F4F5]"
        >
          關閉示範
        </button>
      </div>
    );
  }

  if (!ops.connected || ops.realRecordCount === 0) {
    const connected = ops.connected;
    return (
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
                : "階段、日期、進度與請款需要一張「狩獵管理」試算表，連接後這兩頁就會用真實資料運作。"}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {ops.demoAvailable && (
                <button
                  onClick={() => ops.setDemo(true)}
                  className="h-9 px-4 rounded-full bg-[#18181B] text-white text-[12.5px] font-semibold active:opacity-80"
                >
                  預覽示範資料
                </button>
              )}
              {connected && ops.source?.ops.sheetUrl ? (
                <a
                  href={ops.source.ops.sheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="h-9 px-4 rounded-full bg-white border border-[#E4E4E7] text-[12.5px] font-semibold text-[#18181B] inline-flex items-center gap-1 active:bg-[#F4F4F5]"
                >
                  開啟試算表
                  <Icon name="open_in_new" className="text-[15px]" />
                </a>
              ) : (
                <button
                  onClick={onOpenSetup}
                  className="h-9 px-4 rounded-full bg-white border border-[#E4E4E7] text-[12.5px] font-semibold text-[#18181B] active:bg-[#F4F4F5]"
                >
                  如何連接
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const time = ops.fetchedAt ? new Date(ops.fetchedAt) : null;
  return (
    <div className="flex items-center justify-between gap-3 px-1 text-[12px] text-[#A1A1AA]">
      <span className="truncate">
        已建檔 <b className="text-[#52525B] tabular-nums">{ops.realRecordCount}</b> / {total} 件
        {ops.source?.ops.state === "partial" && "　·　有分頁讀取失敗"}
        {time && `　·　更新於 ${time.getHours()}:${String(time.getMinutes()).padStart(2, "0")}`}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        {ops.source?.ops.sheetUrl && (
          <a
            href={ops.source.ops.sheetUrl}
            target="_blank"
            rel="noreferrer"
            className="h-8 px-2.5 rounded-full hover:bg-[#F4F4F5] inline-flex items-center gap-1 text-[#71717A]"
          >
            <Icon name="table_view" className="text-[16px]" />
            試算表
          </a>
        )}
        <button
          onClick={ops.refresh}
          className="w-8 h-8 rounded-full hover:bg-[#F4F4F5] flex items-center justify-center text-[#71717A]"
          aria-label="重新整理"
        >
          <Icon name="refresh" className="text-[18px]" />
        </button>
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
          也可以直接匯入下載資料夾裡的範本 <b>狩獵管理_範本.xlsx</b>，114 個專案代碼已經列好。
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
              className="mt-2 w-full flex items-center gap-2 rounded-xl bg-[#F4F4F5] px-3 py-2.5 text-left active:bg-[#E4E4E7]"
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
          <span className="font-mono text-[11.5px] bg-[#F4F4F5] rounded px-1.5 py-0.5 mx-1">SHEET_ID_HUNTING_MGMT</span>
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

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="px-4 py-3 flex gap-4 border-b border-[#F4F4F5] last:border-b-0">
      <span className="text-[13px] text-[#A1A1AA] w-[72px] shrink-0">{label}</span>
      <span className="text-[14px] text-[#18181B] flex-1 min-w-0 break-words">{value || <span className="text-[#D4D4D8]">—</span>}</span>
    </div>
  );
}

/** 單一專案的工項甘特圖 */
export function WorkGantt({ p, today }: { p: ProjectView; today: string }) {
  const items = p.items.filter((i) => i.start && i.end);
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
      fit={{ min: 5, max: 22 }}
      anchor={0.75}
      today={today}
      from={range.from}
      to={range.to}
      dayWidth={12}
      labelWidth={104}
      rows={items.map((it, k) => ({
        id: `${k}`,
        label: it.trade,
        sublabel: it.crew,
        // 只標還沒完成的；已完成的每列都寫 100% 只是雜訊
        trailing:
          it.status === "延遲" ? `${it.progress ?? 0}% · 延遲` : it.status === "完成" ? undefined : `${it.progress ?? 0}%`,
        bars: [
          {
            start: it.start!,
            end: it.end!,
            progress: it.progress,
            fill: it.status === "完成" ? "#A1A1AA" : it.status === "延遲" ? STATUS.critical : INK_2,
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

export function ProjectDossier({
  p,
  ops,
  onOpenProject,
  onOpenSetup,
}: {
  p: ProjectView;
  ops: ProjectOps;
  onOpenProject: (code: string) => void;
  onOpenSetup: () => void;
}) {
  const today = ops.today;
  const o = p.ops;
  const mates = p.siteMates
    .map((c) => ops.views.find((v) => v.code === c))
    .filter((v): v is ProjectView => !!v);
  const done = p.health === "完工";
  const actual = done ? 100 : o?.progress;

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

  return (
    <div className="px-5 py-5 max-w-3xl mx-auto flex flex-col gap-5 pb-16">
      {/* 標頭 */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-[#A1A1AA] tracking-wide tabular-nums">
              {p.code}　·　{p.company}
            </p>
            <h2 className="text-[21px] font-bold text-[#18181B] leading-snug mt-1 text-balance">{p.name}</h2>
          </div>
          <HealthBadge health={p.health} />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <StagePill stage={o?.stage} />
          <CategoryTag category={p.category} inferred={p.categoryInferred} />
        </div>
        {p.reason && (
          <p className="mt-3 text-[13px] text-[#52525B] leading-relaxed flex gap-1.5">
            <Icon name="subdirectory_arrow_right" className="text-[16px] text-[#A1A1AA] mt-[1px]" />
            {p.reason}
          </p>
        )}
      </Card>

      {!o ? (
        <Card>
          <EmptyState
            icon="edit_note"
            title="這個專案還沒有工程資料"
            hint={
              <>
                在狩獵管理試算表的「{OPS_TAB}」分頁新增代碼 <b className="text-[#52525B]">{p.code}</b> 的一列，
                填上階段、日期與金額後，這裡會顯示進度、請款與工項排程。
              </>
            }
            action={
              !ops.connected ? (
                <button
                  onClick={onOpenSetup}
                  className="h-9 px-4 rounded-full bg-white border border-[#E4E4E7] text-[12.5px] font-semibold text-[#18181B] active:bg-[#F4F4F5]"
                >
                  如何連接
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          {/* 進度 */}
          <div>
            <SectionTitle title="進度" meta={daysText} />
            <Card className="p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[12px] text-[#A1A1AA]">實際進度</p>
                  <p className="text-[40px] font-semibold text-[#18181B] leading-none mt-1.5">
                    {actual ?? "—"}
                    {actual !== undefined && <span className="text-[20px] font-medium text-[#A1A1AA] ml-0.5">%</span>}
                  </p>
                </div>
                {p.plannedPct !== undefined && !done && (
                  <div className="text-right">
                    <p className="text-[12px] text-[#A1A1AA]">依工期應達</p>
                    <p className="text-[17px] font-semibold text-[#52525B] mt-1 tabular-nums">{p.plannedPct}%</p>
                    {p.variance !== undefined && (
                      <p className="text-[12px] font-semibold mt-0.5 text-[#52525B] flex items-center justify-end gap-0.5">
                        <Icon
                          name={p.variance >= 0 ? "arrow_upward" : "arrow_downward"}
                          weight={500}
                          className="text-[14px]"
                          style={{ color: p.variance >= 0 ? STATUS.good : p.variance <= -15 ? STATUS.serious : STATUS.warning }}
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
                  <p className="text-[11px] text-[#A1A1AA] mt-2 flex items-center gap-1.5">
                    <span className="inline-block w-[2px] h-3 bg-[#18181B] rounded-full" />
                    直線是依開工到預計完工的天數算出的應有進度
                  </p>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2 mt-5 pt-4 border-t border-[#F4F4F5]">
                {[
                  ["簽約", o.signedAt],
                  ["開工", o.startAt],
                  ["預計完工", o.dueAt],
                  ["實際完工", o.doneAt],
                ].map(([l, d]) => (
                  <div key={l} className="min-w-0">
                    <p className="text-[11px] text-[#A1A1AA]">{l}</p>
                    <p className={`text-[13.5px] font-semibold mt-0.5 tabular-nums ${d ? "text-[#18181B]" : "text-[#D4D4D8]"}`}>
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
            />
            <Card className="overflow-hidden">
              {p.items.some((i) => i.start && i.end) ? (
                <>
                  <WorkGantt p={p} today={today} />
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 border-t border-[#F4F4F5] text-[11px] text-[#71717A]">
                    <Legend color={INK_2} label="已完成比例" />
                    <Legend color={INK_2} faint label="排定期間" />
                    <Legend color={STATUS.critical} label="延遲" hatch />
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-[1.5px] h-3 bg-[#F39C12]" />
                      今天
                    </span>
                  </div>
                </>
              ) : (
                <EmptyState
                  icon="view_timeline"
                  title="尚未排定工項"
                  hint={<>在「{WORK_TAB}」分頁用代碼 {p.code} 新增工項與起訖日。</>}
                />
              )}
            </Card>
          </div>

          {/* 財務 */}
          <div>
            <SectionTitle title="合約與請款" />
            <Card className="overflow-hidden">
              <div className="grid grid-cols-3 divide-x divide-[#F4F4F5] border-b border-[#F4F4F5]">
                {[
                  ["合約", o.contract],
                  ["追加減", o.variation],
                  ["合計", p.contractTotal],
                ].map(([l, v], i) => (
                  <div key={l as string} className="px-4 py-3.5">
                    <p className="text-[11px] text-[#A1A1AA]">{l}</p>
                    <p className={`mt-0.5 tabular-nums ${i === 2 ? "text-[17px] font-bold text-[#18181B]" : "text-[15px] font-semibold text-[#3F3F46]"}`}>
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
                <div className="flex items-center justify-between rounded-xl bg-[#FAFAFA] px-3.5 py-3">
                  <span className="text-[13px] text-[#52525B] flex items-center gap-1.5">
                    <Icon name="account_balance_wallet" className="text-[18px] text-[#A1A1AA]" />
                    應收未收
                  </span>
                  <span className={`text-[17px] tabular-nums ${p.receivable ? "font-bold text-[#18181B]" : "font-semibold text-[#A1A1AA]"}`}>
                    {fmtMoney(p.receivable)}
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* 近況與基本資料 */}
          <div>
            <SectionTitle title="近況" meta={o.updatedAt ? `更新於 ${fmtDate(o.updatedAt, today)}` : undefined} />
            <Card className="px-4 py-3.5">
              <p className={`text-[14px] leading-relaxed ${o.note ? "text-[#18181B]" : "text-[#D4D4D8]"}`}>{o.note || "—"}</p>
            </Card>
          </div>
          <div>
            <SectionTitle title="基本資料" meta={ops.demo ? "示範資料不填人名、業主與地址" : undefined} />
            <Card>
              <Field label="工地主任" value={o.manager} />
              <Field label="業主" value={o.client} />
              <Field label="工地地址" value={o.site} />
            </Card>
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
                <span className="w-11 shrink-0 text-[12px] font-semibold text-[#A1A1AA] tabular-nums">{m.code}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-medium text-[#18181B] truncate">{m.name}</span>
                  <span className="block text-[11.5px] text-[#A1A1AA] mt-0.5">
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
          {caption && <span className="text-[#A1A1AA] ml-2">{caption}</span>}
        </span>
      </div>
      <ProgressBar actual={rate !== undefined ? Math.round(rate * 100) : undefined} height={6} />
    </div>
  );
}

function Legend({ color, label, faint, hatch }: { color: string; label: string; faint?: boolean; hatch?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-4 h-2.5 rounded-[3px]"
        style={{
          background: hatch
            ? `repeating-linear-gradient(135deg, ${color}55 0 3px, ${color}22 3px 6px)`
            : color,
          opacity: faint ? 0.18 : 1,
        }}
      />
      {label}
    </span>
  );
}
