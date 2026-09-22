"use client";

import React, { useState, useMemo, useRef, useCallback } from "react";
import useSWR from "swr";
import ReceiptForm, { ReceiptFormRef } from "@/components/ReceiptForm";
import {
  getPolicies,
  getSops,
  FORMS,
  HandbookDoc,
} from "@/lib/handbook-config";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export const COMMAND_TABS_BASE = ["定位定崗", "營運"] as const;
export const COMMAND_TAB_FINANCE = "財務";

/** 依權限算出實際的分頁清單。page.tsx 的分頁列與這裡的面板都用同一份。 */
export function getCommandTabs(canSeeFinance: boolean): string[] {
  return canSeeFinance
    ? [...COMMAND_TABS_BASE, COMMAND_TAB_FINANCE]
    : [...COMMAND_TABS_BASE];
}

interface MyProfile {
  hunterName: string;
  fields: { label: string; value: string }[];
  note?: string;
}

interface CommandCenterProps {
  /** 開啟組織架構圖滿版覆蓋層（覆蓋層本身仍由頁面持有） */
  onOpenOrgChart: () => void;
  hunterName: string;
  /** 是否看得到財務分頁（管理層） */
  canSeeFinance: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

/* ══════════════════════════════════════════════════════════
   子頁殼層：與組織圖一致的右側滑入，維持整個 APP 的操作語彙
   ══════════════════════════════════════════════════════════ */
function SubScreen({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // 這裡原本會在開啟時把 theme-color 切成白色，但 iOS 套用 theme-color 有明顯延遲，
  // 子頁開開關關的節奏根本等不到，使用者看到的一直是切換前的灰色。
  // 現在預設 theme-color 就是白色（見 layout.tsx），標題列也是白色，不需要切換。
  return (
    <div
      className={`fixed inset-0 z-[120] bg-[#FFFFFF] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        open ? "translate-x-0" : "translate-x-full pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      <header className="relative shrink-0 h-[60px] bg-[#FFFFFF] z-10 flex items-center justify-between px-2 border-b border-[#E4E4E7]/60">
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
      </header>
      {/* 標題列維持純白（與狀態列無色差），內容區回到淺灰 ——
          否則白底配白卡片就完全沒有層次了 */}
      <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-hide bg-[#FAFAFA]">
        {children}
      </div>
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



/* 清單列：項目多的內容用列表，比方格 icon 好掃讀 */
function ListRow({
  icon,
  title,
  desc,
  meta,
  onClick,
  last,
}: {
  icon: string;
  title: string;
  desc?: string;
  meta?: string;
  onClick?: () => void;
  last?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`group w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition-colors outline-none active:bg-[#F4F4F5] ${
        last ? "" : "border-b border-[#F4F4F5]"
      }`}
    >
      <div className="w-8 flex items-center justify-center shrink-0 text-[#A1A1AA]">
        <span
          className="material-symbols-outlined text-[24px] group-active:text-[#F39C12] transition-colors"
          style={{ fontVariationSettings: "'wght' 200" }}
        >
          {icon}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-[#18181B]">{title}</p>
        {desc && <p className="text-[12px] text-[#A1A1AA] mt-0.5 truncate">{desc}</p>}
      </div>
      {meta && <span className="text-[12px] text-[#A1A1AA] tabular-nums shrink-0">{meta}</span>}
      <span
        className="material-symbols-outlined text-[20px] text-[#D4D4D8] shrink-0"
        style={{ fontVariationSettings: "'wght' 200" }}
      >
        chevron_right
      </span>
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#FFFFFF] rounded-[18px] border border-[#E4E4E7]/60 shadow-[0_2px_10px_rgba(0,0,0,0.03)] overflow-hidden">
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */

export default function CommandCenter({
  onOpenOrgChart,
  hunterName,
  canSeeFinance,
  activeTab,
  onTabChange,
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
  const receiptFormRef = useRef<ReceiptFormRef>(null);

  const { data: profile } = useSWR<MyProfile>("/api/me", fetcher, {
    revalidateOnFocus: false,
  });
  const { data: crm } = useSWR<{ projects: string[] }>("/api/crm-data", fetcher, {
    revalidateOnFocus: false,
  });

  const policies = useMemo(() => getPolicies(), []);
  const sops = useMemo(() => getSops(), []);
  const projects = crm?.projects ?? [];

  const tabs = useMemo(() => getCommandTabs(canSeeFinance), [canSeeFinance]);
  const activeIdx = Math.max(0, tabs.indexOf(activeTab));

  const displayName = profile?.hunterName || hunterName || "";
  const roleLine = useMemo(() => {
    const f = profile?.fields ?? [];
    const pick = (...keys: string[]) =>
      f.find((x) => keys.some((k) => x.label.includes(k)))?.value;
    return [pick("部門", "事業部"), pick("職稱", "職務", "科別")]
      .filter(Boolean)
      .join(" · ");
  }, [profile]);

  /* ── 左右滑動切換分頁 ──────────────────────────────────── */
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const swipeLocked = useRef<boolean>(false);
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  // 位移一律用實際量到的 px。用百分比會有兩個問題：
  // (1) translateX(calc(-33.333% + Npx)) 這種混合單位無法在過場動畫中插值，
  //     transform 會整個不生效；
  // (2) 寫死 -33.333%／-66.666% 只在「剛好三個分頁」時正確，
  //     沒有財務權限的人只有兩個分頁，位移量就錯了。
  const [panelW, setPanelW] = useState(0);
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setPanelW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    swipeLocked.current = false;
  }, []);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (startX.current == null || startY.current == null) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;

      if (!swiping && !swipeLocked.current) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
          swipeLocked.current = true;
          return;
        }
        if (Math.abs(dx) > 10) {
          setSwiping(true);
        }
        return;
      }

      if (swipeLocked.current) return;

      let clampedOffset = dx;
      if (activeIdx === 0 && dx > 0) clampedOffset = dx * 0.3;
      if (activeIdx === tabs.length - 1 && dx < 0) clampedOffset = dx * 0.3;
      setOffset(clampedOffset);
    },
    [activeIdx, tabs.length, swiping]
  );

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (startX.current === null) {
      setOffset(0);
      setSwiping(false);
      return;
    }

    const diff = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    startY.current = null;

    if (Math.abs(diff) > 60 && swiping) {
      if (diff > 0 && activeIdx > 0) {
        onTabChange(tabs[activeIdx - 1]);
      } else if (diff < 0 && activeIdx < tabs.length - 1) {
        onTabChange(tabs[activeIdx + 1]);
      }
    }
    
    setOffset(0);
    setSwiping(false);
  }, [swiping, activeIdx, tabs, onTabChange]);

  return (
    <>
      <div
        ref={viewportRef}
        className="w-full overflow-hidden"
        style={{ touchAction: "pan-y" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          className="flex items-start h-full md:!transform-none"
          style={{
            width: panelW ? panelW * tabs.length : `${tabs.length * 100}%`,
            transform: `translateX(${-activeIdx * panelW + offset}px)`,
            transition: swiping
              ? "none"
              : "transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)",
          }}
        >
          {/* ── 分頁 1：定位定崗 ───────────────────────────── */}
          <section
            className="shrink-0 px-6 lg:px-10 pt-0 pb-28 md:w-full"
            style={{ width: panelW || `${100 / tabs.length}%` }}
          >
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={onOpenOrgChart}
                className="group bg-[#FFFFFF] rounded-[18px] border border-[#E4E4E7]/60 shadow-[0_2px_10px_rgba(0,0,0,0.03)] p-4 h-[116px] flex flex-col justify-between text-left active:scale-[0.98] transition-transform outline-none"
              >
                <div className="text-[#A1A1AA]">
                  <span
                    className="material-symbols-outlined text-[28px] group-active:text-[#F39C12] transition-colors"
                    style={{ fontVariationSettings: "'wght' 200" }}
                  >
                    account_tree
                  </span>
                </div>
                <div>
                  <p className="text-[15px] font-bold text-[#18181B]">組織圖</p>
                  <p className="text-[11px] text-[#A1A1AA] mt-0.5">全公司架構</p>
                </div>
              </button>

              <button
                onClick={() => setScreen("profile")}
                className="group bg-[#FFFFFF] rounded-[18px] border border-[#E4E4E7]/60 shadow-[0_2px_10px_rgba(0,0,0,0.03)] p-4 h-[116px] flex flex-col justify-between text-left active:scale-[0.98] transition-transform outline-none"
              >
                <div className="text-[#A1A1AA]">
                  <span
                    className="material-symbols-outlined text-[28px] group-active:text-[#F39C12] transition-colors"
                    style={{ fontVariationSettings: "'wght' 200" }}
                  >
                    badge
                  </span>
                </div>
                <div>
                  <p className="text-[15px] font-bold text-[#18181B]">職務說明</p>
                  <p className="text-[11px] text-[#A1A1AA] mt-0.5">我的職責與資料</p>
                </div>
              </button>
            </div>
          </section>

          {/* ── 分頁 2：營運 ───────────────────────────────── */}
          <section
            className="shrink-0 px-6 lg:px-10 pt-0 pb-28 md:w-full"
            style={{ width: panelW || `${100 / tabs.length}%` }}
          >
            
            <Card>
              <ListRow
                icon="gavel"
                title="公司制度"
                desc="薪酬福利、績效考核等規章"
                meta={policies.length ? `${policies.length} 項` : "待建立"}
                onClick={() => setScreen("policies")}
              />
              <ListRow
                icon="lan"
                title="SOP"
                desc="各項作業標準流程"
                meta={sops.length ? `${sops.length} 項` : "待建立"}
                onClick={() => setScreen("sops")}
              />
              <ListRow
                icon="description"
                title="表單"
                desc="領款簽收單等可填寫表單"
                meta={`${FORMS.length} 項`}
                onClick={() => setScreen("forms")}
                last
              />
            </Card>
          </section>

          {/* ── 分頁 3：財務（管理層）───────────────────────── */}
          {canSeeFinance && (
            <section
              className="shrink-0 px-6 lg:px-10 pt-0 pb-28 md:w-full"
            style={{ width: panelW || `${100 / tabs.length}%` }}
            >
              
              <Card>
                <ListRow
                  icon="receipt_long"
                  title="收支記錄"
                  desc="記錄每一筆收入與支出"
                  meta="記帳"
                  onClick={() => setScreen("finance-ledger")}
                />
                <ListRow
                  icon="folder_open"
                  title="專案財務"
                  desc="各專案的收支與結餘"
                  meta={projects.length ? `${projects.length} 案` : "—"}
                  onClick={() => setScreen("finance-projects")}
                />
                <ListRow
                  icon="monitoring"
                  title="公司財務狀態"
                  desc="現金水位與整體趨勢"
                  onClick={() => setScreen("finance-company")}
                  last
                />
              </Card>
            </section>
          )}
        </div>
      </div>

      {/* ══ 子頁 ═══════════════════════════════════════════ */}

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
            <Card>
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
            </Card>
          ) : (
            <EmptyState
              icon="badge"
              title={profile ? "員工CRM 中找不到你的資料" : "載入中…"}
              hint={profile?.note}
            />
          )}
        </div>
      </SubScreen>

      <SubScreen
        open={screen === "policies"}
        title="公司制度"
        onClose={() => setScreen(null)}
      >
        <DocList docs={policies} onOpen={setOpenDoc} emptyIcon="gavel" />
      </SubScreen>

      <SubScreen open={screen === "sops"} title="SOP" onClose={() => setScreen(null)}>
        <DocList docs={sops} onOpen={setOpenDoc} emptyIcon="lan" />
      </SubScreen>

      <SubScreen open={screen === "forms"} title="表單" onClose={() => setScreen(null)}>
        <div className="px-5 py-5 max-w-3xl mx-auto">
          <Card>
            {FORMS.map((f, i) => (
              <button
                key={f.id}
                onClick={() => setOpenForm(f.component)}
                className={`group w-full flex items-center gap-3.5 px-4 py-4 text-left active:bg-[#F4F4F5] transition-colors outline-none ${
                  i === FORMS.length - 1 ? "" : "border-b border-[#F4F4F5]"
                }`}
              >
                <div className="w-8 flex items-center justify-center shrink-0 text-[#A1A1AA]">
                  <span
                    className="material-symbols-outlined text-[24px] group-active:text-[#F39C12] transition-colors"
                    style={{ fontVariationSettings: "'wght' 200" }}
                  >
                    edit_document
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-[#18181B]">{f.title}</p>
                  {f.summary && (
                    <p className="text-[12px] text-[#A1A1AA] mt-0.5 truncate">{f.summary}</p>
                  )}
                </div>
                <span
                  className="material-symbols-outlined text-[20px] text-[#D4D4D8]"
                  style={{ fontVariationSettings: "'wght' 200" }}
                >
                  chevron_right
                </span>
              </button>
            ))}
          </Card>
        </div>
      </SubScreen>

      <SubScreen
        open={openForm === "receipt"}
        title="領款簽收單"
        onClose={() => setOpenForm(null)}
      >
        <ReceiptForm ref={receiptFormRef} />
      </SubScreen>

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
              <Card>
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
              </Card>
            </>
          ) : (
            <EmptyState icon="folder_open" title="讀不到專案清單" />
          )}
        </div>
      </SubScreen>

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
    </>
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
            
            <Card>
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
                  <span
                    className="material-symbols-outlined text-[20px] text-[#D4D4D8]"
                    style={{ fontVariationSettings: "'wght' 200" }}
                  >
                    {d.url ? "open_in_new" : "chevron_right"}
                  </span>
                </button>
              ))}
            </Card>
          </div>
        ))
      )}
    </div>
  );
}
