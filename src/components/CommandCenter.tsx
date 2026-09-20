"use client";

import React, { useState, useMemo } from "react";
import useSWR from "swr";
import ReceiptForm, { ReceiptFormRef } from "@/components/ReceiptForm";
import {
  getPolicies,
  getSops,
  FORMS,
  HandbookDoc,
} from "@/lib/handbook-config";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface MyProfile {
  hunterName: string;
  fields: { label: string; value: string }[];
  note?: string;
}

interface CommandCenterProps {
  /** 開啟組織架構圖滿版覆蓋層（覆蓋層本身仍由頁面持有） */
  onOpenOrgChart: () => void;
  hunterName: string;
  /** 是否看得到財務區（管理層） */
  canSeeFinance: boolean;
}

/* ══════════════════════════════════════════════════════════
   子頁殼層：與組織圖一致的右側滑入，維持整個 APP 的操作語彙
   ══════════════════════════════════════════════════════════ */
function SubScreen({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className={`fixed inset-0 z-[120] bg-[#FAFAFA] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        open ? "translate-x-0" : "translate-x-full pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      <div className="shrink-0 h-[60px] flex items-center justify-between px-2 bg-[#FFFFFF]/90 backdrop-blur-md border-b border-[#E4E4E7]/60">
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full text-[#18181B] active:bg-[#F4F4F5] transition-colors"
          aria-label="返回"
        >
          <span
            className="material-symbols-outlined text-[14px]"
            style={{ fontVariationSettings: "'wght' 300" }}
          >
            arrow_back_ios_new
          </span>
        </button>
        <h2 className="text-[17px] font-bold text-[#18181B] absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
          {title}
        </h2>
        <div className="w-10 h-10" />
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {footer && (
        <div className="shrink-0 border-t border-[#E4E4E7]/60 bg-[#FFFFFF] px-5 py-3 pb-[calc(12px_+_env(safe-area-inset-bottom))]">
          {footer}
        </div>
      )}
    </div>
  );
}

/* 共用的空狀態：誠實說明「還沒有內容」，不放假資料 */
function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      <span
        className="material-symbols-outlined text-[44px] text-[#D4D4D8] mb-3"
        style={{ fontVariationSettings: "'wght' 200" }}
      >
        {icon}
      </span>
      <p className="text-[14px] font-medium text-[#71717A]">{title}</p>
      {hint && <p className="text-[12px] text-[#A1A1AA] mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

/* 區塊標題 */
function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-2.5">
      <h2 className="text-[13px] font-bold text-[#71717A] tracking-[0.08em]">{children}</h2>
      {note && <span className="text-[11px] text-[#A1A1AA]">{note}</span>}
    </div>
  );
}

/* 清單列：項目多的內容用列表，比方格 icon 好掃讀 */
function ListRow({
  icon,
  iconBg,
  iconColor,
  title,
  meta,
  onClick,
  disabled,
  last,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  meta?: string;
  onClick?: () => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition-colors outline-none ${
        disabled ? "opacity-45 cursor-not-allowed" : "active:bg-[#F4F4F5]"
      } ${last ? "" : "border-b border-[#F4F4F5]"}`}
    >
      <div
        className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
        style={{ background: iconBg, color: iconColor }}
      >
        <span className="material-symbols-outlined text-[19px]">{icon}</span>
      </div>
      <span className="flex-1 text-[15px] font-medium text-[#18181B]">{title}</span>
      {meta && <span className="text-[12px] text-[#A1A1AA] tabular-nums">{meta}</span>}
      {!disabled && (
        <span className="material-symbols-outlined text-[16px] text-[#D4D4D8]">
          chevron_right
        </span>
      )}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════ */

export default function CommandCenter({
  onOpenOrgChart,
  hunterName,
  canSeeFinance,
}: CommandCenterProps) {
  type ScreenId =
    | null
    | "profile"
    | "policies"
    | "sops"
    | "forms"
    | "finance-ledger"
    | "finance-projects"
    | "finance-company";
  const [screen, setScreen] = useState<ScreenId>(null);
  const [openDoc, setOpenDoc] = useState<HandbookDoc | null>(null);
  const [openForm, setOpenForm] = useState<string | null>(null);
  const receiptFormRef = React.useRef<ReceiptFormRef>(null);

  const { data: profile } = useSWR<MyProfile>("/api/me", fetcher, {
    revalidateOnFocus: false,
  });
  const { data: crm } = useSWR<{ projects: string[] }>("/api/crm-data", fetcher, {
    revalidateOnFocus: false,
  });

  const policies = useMemo(() => getPolicies(), []);
  const sops = useMemo(() => getSops(), []);
  const projects = crm?.projects ?? [];

  const displayName = profile?.hunterName || hunterName || "";
  // 從員工CRM 的欄位裡挑出最能代表身分的兩個來當副標
  const roleLine = useMemo(() => {
    const f = profile?.fields ?? [];
    const pick = (...keys: string[]) =>
      f.find((x) => keys.some((k) => x.label.includes(k)))?.value;
    return [pick("部門", "事業部"), pick("職稱", "職務", "科別")]
      .filter(Boolean)
      .join(" · ");
  }, [profile]);

  return (
    <div className="px-5 lg:px-10 pt-2 pb-28 flex flex-col gap-7 w-full max-w-3xl mx-auto">
      {/* ── 我的 ───────────────────────────────────────── */}
      <button
        onClick={() => setScreen("profile")}
        className="w-full text-left bg-[#18181B] rounded-[20px] p-5 flex items-center gap-4 active:scale-[0.99] transition-transform outline-none shadow-[0_6px_24px_rgba(24,24,27,0.14)]"
      >
        <div className="w-12 h-12 rounded-full bg-[#F39C12] flex items-center justify-center shrink-0">
          <span className="text-[18px] font-bold text-[#18181B]">
            {displayName ? displayName.slice(0, 1) : "—"}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[17px] font-bold text-white truncate">
            {displayName || "載入中…"}
          </p>
          <p className="text-[12px] text-[#A1A1AA] truncate mt-0.5">
            {roleLine || "查看我的職務說明"}
          </p>
        </div>
        <span className="material-symbols-outlined text-[18px] text-[#71717A]">
          chevron_right
        </span>
      </button>

      {/* ── 組織與職務 ──────────────────────────────────── */}
      <div>
        <SectionTitle>組織與職務</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onOpenOrgChart}
            className="relative overflow-hidden bg-[#FFFFFF] rounded-[18px] border border-[#E4E4E7]/60 shadow-[0_2px_10px_rgba(0,0,0,0.03)] p-4 h-[116px] flex flex-col justify-between text-left active:scale-[0.98] transition-transform outline-none"
          >
            <div className="w-10 h-10 rounded-full bg-[#18181B] flex items-center justify-center text-[#F39C12]">
              <span className="material-symbols-outlined text-[20px]">account_tree</span>
            </div>
            <div>
              <p className="text-[15px] font-bold text-[#18181B]">組織圖</p>
              <p className="text-[11px] text-[#A1A1AA] mt-0.5">全公司架構</p>
            </div>
          </button>

          <button
            onClick={() => setScreen("profile")}
            className="bg-[#FFFFFF] rounded-[18px] border border-[#E4E4E7]/60 shadow-[0_2px_10px_rgba(0,0,0,0.03)] p-4 h-[116px] flex flex-col justify-between text-left active:scale-[0.98] transition-transform outline-none"
          >
            <div className="w-10 h-10 rounded-full bg-[#FEF3E2] flex items-center justify-center text-[#F39C12]">
              <span className="material-symbols-outlined text-[20px]">badge</span>
            </div>
            <div>
              <p className="text-[15px] font-bold text-[#18181B]">職務說明</p>
              <p className="text-[11px] text-[#A1A1AA] mt-0.5">我的職責與資料</p>
            </div>
          </button>
        </div>
      </div>

      {/* ── 制度與流程 ──────────────────────────────────── */}
      <div>
        <SectionTitle>制度與流程</SectionTitle>
        <div className="bg-[#FFFFFF] rounded-[18px] border border-[#E4E4E7]/60 shadow-[0_2px_10px_rgba(0,0,0,0.03)] overflow-hidden">
          <ListRow
            icon="gavel"
            iconBg="#EEF2FF"
            iconColor="#4F46E5"
            title="公司制度"
            meta={policies.length ? `${policies.length} 項` : "待建立"}
            onClick={() => setScreen("policies")}
          />
          <ListRow
            icon="lan"
            iconBg="#ECFDF5"
            iconColor="#059669"
            title="SOP"
            meta={sops.length ? `${sops.length} 項` : "待建立"}
            onClick={() => setScreen("sops")}
          />
          <ListRow
            icon="description"
            iconBg="#FEF3E2"
            iconColor="#F39C12"
            title="表單"
            meta={`${FORMS.length} 項`}
            onClick={() => setScreen("forms")}
            last
          />
        </div>
      </div>

      {/* ── 財務（管理層）────────────────────────────────── */}
      {canSeeFinance && (
        <div>
          <SectionTitle note="管理層">財務</SectionTitle>
          <div className="bg-[#FFFFFF] rounded-[18px] border border-[#E4E4E7]/60 shadow-[0_2px_10px_rgba(0,0,0,0.03)] overflow-hidden">
            <ListRow
              icon="receipt_long"
              iconBg="#F4F4F5"
              iconColor="#18181B"
              title="收支記錄"
              meta="記帳"
              onClick={() => setScreen("finance-ledger")}
            />
            <ListRow
              icon="folder_open"
              iconBg="#F4F4F5"
              iconColor="#18181B"
              title="專案財務"
              meta={projects.length ? `${projects.length} 案` : "—"}
              onClick={() => setScreen("finance-projects")}
            />
            <ListRow
              icon="monitoring"
              iconBg="#F4F4F5"
              iconColor="#18181B"
              title="公司財務狀態"
              onClick={() => setScreen("finance-company")}
              last
            />
          </div>
        </div>
      )}

      {/* ══ 子頁 ═══════════════════════════════════════════ */}

      {/* 職務說明 */}
      <SubScreen
        open={screen === "profile"}
        title="職務說明"
        onClose={() => setScreen(null)}
      >
        <div className="px-5 py-5 max-w-3xl mx-auto">
          <div className="bg-[#18181B] rounded-[18px] p-5 mb-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#F39C12] flex items-center justify-center shrink-0">
              <span className="text-[20px] font-bold text-[#18181B]">
                {displayName ? displayName.slice(0, 1) : "—"}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-[19px] font-bold text-white truncate">
                {displayName || "—"}
              </p>
              {roleLine && (
                <p className="text-[12px] text-[#A1A1AA] truncate mt-1">{roleLine}</p>
              )}
            </div>
          </div>

          {profile?.fields?.length ? (
            <div className="bg-[#FFFFFF] rounded-[18px] border border-[#E4E4E7]/60 overflow-hidden">
              {profile.fields.map((f, i) => (
                <div
                  key={f.label}
                  className={`px-4 py-3.5 flex gap-4 ${
                    i === profile.fields.length - 1 ? "" : "border-b border-[#F4F4F5]"
                  }`}
                >
                  <span className="text-[13px] text-[#A1A1AA] w-24 shrink-0">
                    {f.label}
                  </span>
                  <span className="text-[14px] text-[#18181B] flex-1 whitespace-pre-wrap break-words">
                    {f.value}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="badge"
              title={profile ? "員工CRM 中找不到你的資料" : "載入中…"}
              hint={profile?.note}
            />
          )}
        </div>
      </SubScreen>

      {/* 公司制度 */}
      <SubScreen
        open={screen === "policies"}
        title="公司制度"
        onClose={() => setScreen(null)}
      >
        <DocList docs={policies} onOpen={setOpenDoc} emptyIcon="gavel" />
      </SubScreen>

      {/* SOP */}
      <SubScreen open={screen === "sops"} title="SOP" onClose={() => setScreen(null)}>
        <DocList docs={sops} onOpen={setOpenDoc} emptyIcon="lan" />
      </SubScreen>

      {/* 表單 */}
      <SubScreen open={screen === "forms"} title="表單" onClose={() => setScreen(null)}>
        <div className="px-5 py-5 max-w-3xl mx-auto">
          <div className="bg-[#FFFFFF] rounded-[18px] border border-[#E4E4E7]/60 overflow-hidden">
            {FORMS.map((f, i) => (
              <button
                key={f.id}
                onClick={() => setOpenForm(f.component)}
                className={`w-full flex items-center gap-3.5 px-4 py-4 text-left active:bg-[#F4F4F5] transition-colors outline-none ${
                  i === FORMS.length - 1 ? "" : "border-b border-[#F4F4F5]"
                }`}
              >
                <div className="w-9 h-9 rounded-[10px] bg-[#FEF3E2] text-[#F39C12] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[19px]">edit_document</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-[#18181B]">{f.title}</p>
                  {f.summary && (
                    <p className="text-[12px] text-[#A1A1AA] mt-0.5 truncate">{f.summary}</p>
                  )}
                </div>
                <span className="material-symbols-outlined text-[16px] text-[#D4D4D8]">
                  chevron_right
                </span>
              </button>
            ))}
          </div>
        </div>
      </SubScreen>

      {/* 表單內容：領款簽收單 */}
      <SubScreen
        open={openForm === "receipt"}
        title="領款簽收單"
        onClose={() => setOpenForm(null)}
      >
        <ReceiptForm ref={receiptFormRef} />
      </SubScreen>

      {/* 文件內文 */}
      <SubScreen
        open={!!openDoc}
        title={openDoc?.title ?? ""}
        onClose={() => setOpenDoc(null)}
      >
        <div className="px-5 py-5 max-w-3xl mx-auto">
          {openDoc?.body ? (
            <article className="bg-[#FFFFFF] rounded-[18px] border border-[#E4E4E7]/60 p-5 text-[15px] leading-[1.9] text-[#18181B] whitespace-pre-wrap">
              {openDoc.body}
            </article>
          ) : (
            <EmptyState
              icon="draft"
              title="內容待建立"
              hint={`「${openDoc?.title ?? ""}」尚未填入內文。可在 src/lib/handbook-config.ts 補上，或改接 Google Sheet。`}
            />
          )}
        </div>
      </SubScreen>

      {/* 收支記錄 */}
      <SubScreen
        open={screen === "finance-ledger"}
        title="收支記錄"
        onClose={() => setScreen(null)}
      >
        <EmptyState
          icon="receipt_long"
          title="尚未串接收支資料"
          hint="需要先決定記帳資料要存在哪裡（Google Sheet 或 Supabase），再接上新增與列表。"
        />
      </SubScreen>

      {/* 專案財務 */}
      <SubScreen
        open={screen === "finance-projects"}
        title="專案財務"
        onClose={() => setScreen(null)}
      >
        <div className="px-5 py-5 max-w-3xl mx-auto">
          {projects.length ? (
            <>
              <p className="text-[12px] text-[#A1A1AA] mb-3 px-1 leading-relaxed">
                專案清單來自專案CRM。金額欄位尚未串接，接上收支資料後會顯示各案的收入、支出與結餘。
              </p>
              <div className="bg-[#FFFFFF] rounded-[18px] border border-[#E4E4E7]/60 overflow-hidden">
                {projects.map((p, i) => (
                  <div
                    key={p}
                    className={`px-4 py-3.5 flex items-center justify-between gap-3 ${
                      i === projects.length - 1 ? "" : "border-b border-[#F4F4F5]"
                    }`}
                  >
                    <span className="text-[14px] font-medium text-[#18181B] truncate">
                      {p}
                    </span>
                    <span className="text-[12px] text-[#D4D4D8] shrink-0">—</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon="folder_open" title="讀不到專案清單" />
          )}
        </div>
      </SubScreen>

      {/* 公司財務狀態 */}
      <SubScreen
        open={screen === "finance-company"}
        title="公司財務狀態"
        onClose={() => setScreen(null)}
      >
        <EmptyState
          icon="monitoring"
          title="尚未串接財務資料"
          hint="收支資料接上之後，這裡會顯示現金水位、當月收支與趨勢。"
        />
      </SubScreen>
    </div>
  );
}

/* 制度／SOP 共用的清單，含分類分組與搜尋 */
function DocList({
  docs,
  onOpen,
  emptyIcon,
}: {
  docs: HandbookDoc[];
  onOpen: (d: HandbookDoc) => void;
  emptyIcon: string;
}) {
  const [q, setQ] = useState("");

  const grouped = useMemo(() => {
    const kw = q.trim();
    const filtered = kw
      ? docs.filter(
          (d) => d.title.includes(kw) || d.category.includes(kw) || d.summary?.includes(kw)
        )
      : docs;
    const map = new Map<string, HandbookDoc[]>();
    filtered.forEach((d) => {
      if (!map.has(d.category)) map.set(d.category, []);
      map.get(d.category)!.push(d);
    });
    return [...map.entries()];
  }, [docs, q]);

  if (!docs.length) {
    return (
      <EmptyState
        icon={emptyIcon}
        title="尚未建立任何項目"
        hint="可在 src/lib/handbook-config.ts 新增，或改接 Google Sheet。"
      />
    );
  }

  return (
    <div className="px-5 py-4 max-w-3xl mx-auto">
      {docs.length > 6 && (
        <div className="relative mb-4">
          <span className="material-symbols-outlined text-[18px] text-[#A1A1AA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            search
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋"
            className="w-full bg-[#FFFFFF] border border-[#E4E4E7] focus:border-[#F39C12] text-[#18181B] text-[14px] rounded-full pl-11 pr-4 h-11 outline-none transition-colors placeholder:text-[#A1A1AA]"
          />
        </div>
      )}

      {grouped.length === 0 ? (
        <EmptyState icon="search_off" title="找不到符合的項目" />
      ) : (
        grouped.map(([category, items]) => (
          <div key={category} className="mb-5">
            <SectionTitle>{category}</SectionTitle>
            <div className="bg-[#FFFFFF] rounded-[18px] border border-[#E4E4E7]/60 overflow-hidden">
              {items.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => (d.url ? window.open(d.url, "_blank") : onOpen(d))}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-[#F4F4F5] transition-colors outline-none ${
                    i === items.length - 1 ? "" : "border-b border-[#F4F4F5]"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-[#18181B]">{d.title}</p>
                    {d.summary && (
                      <p className="text-[12px] text-[#A1A1AA] mt-0.5 truncate">
                        {d.summary}
                      </p>
                    )}
                  </div>
                  {!d.body && !d.url && (
                    <span className="text-[11px] text-[#D4D4D8] shrink-0">待建立</span>
                  )}
                  <span className="material-symbols-outlined text-[16px] text-[#D4D4D8]">
                    {d.url ? "open_in_new" : "chevron_right"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
