"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tradeColor, type Contact, type ContactKind, type TeamMember, type VendorInfo } from "@/lib/pm/model";
import { Avatar, Empty, Spinner } from "@/components/pm/kit";
import { Sheet } from "@/components/pm/Sheet";
import {
  IconCamera,
  IconHeartHandshake,
  IconPencil,
  IconPhone,
  IconPlus,
  IconSearch,
  IconTool,
  IconUsers,
  IconUserShare,
  IconX,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { PortraitSheet } from "./PortraitSheet";
import { ContactSheet } from "./ContactSheet";
import { StaffSheet } from "./StaffSheet";
import { VendorSheet } from "./VendorSheet";
import { useTeam } from "./useTeam";

/* ══════════════════════════════════════════════════════════
   指揮中心 → 團隊
   四個分類用「圖示方塊」切換（不是第二排文字分頁，避免和上方「營運／團隊／財務」打架）。
   四個分類共用同一套：
     一列 = 頭像＋名稱＋說明，右側電話鍵 → 跳出「撥打／取消」
     點一列 → 個人卡（聯絡方式、編輯）
     電話左側的鉛筆 → 編輯（內部職員、協力廠商寫回拾壤CRM「員工CRM」「廠商CRM」）
     新增 → 清單最後一列「＋ 新增…」
     權限：權限表「團隊」欄 Admin 可新增、編輯、刪除；Editor 可新增、編輯；其他人唯讀
     搜尋 → 頂部的放大鏡，一次搜四個分類：電腦在標題列直接展開輸入；手機跳出輸入欄，背景模糊
   ══════════════════════════════════════════════════════════ */

type Cat = "internal" | ContactKind;

const CATS: { key: Cat; label: string; icon: TablerIcon; add?: string; empty: string; hint: string }[] = [
  { key: "internal", label: "內部職員", icon: IconUsers, add: "新增內部職員", empty: "員工CRM 還沒有在職人員", hint: "名單來自拾壤CRM 的員工CRM" },
  { key: "external", label: "外部職員", icon: IconUserShare, add: "新增外部職員", empty: "還沒有外部職員", hint: "臨時工、外聘設計師、顧問" },
  { key: "vendor", label: "協力廠商", icon: IconTool, add: "新增協力廠商", empty: "還沒有協力廠商", hint: "廠商CRM 的資料會自動列在這裡" },
  { key: "brand", label: "聯盟品牌", icon: IconHeartHandshake, add: "新增聯盟品牌", empty: "還沒有聯盟品牌", hint: "合作的品牌、設計公司、通路" },
];

/** 觸控不要傳給指揮中心外層的「左右滑換分頁」 */
const stop = {
  onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
  onTouchMove: (e: React.TouchEvent) => e.stopPropagation(),
  onTouchEnd: (e: React.TouchEvent) => e.stopPropagation(),
};

const tel = (p: string) => p.replace(/[^\d+]/g, "");

/** 公司共用帳號（拾壤）：在權限表上有一列，但不是人，不列在內部職員 */
const COMPANY_ACCOUNTS = new Set(["sensesoil.tw@gmail.com"]);

/** 清單與個人卡共用的「一個人／一家廠商」 */
interface Entry {
  key: string;
  cat: Cat;
  name: string;
  sub: string;
  avatar?: string;
  avatarKey: string;
  phones: { label?: string; number: string }[];
  /** 名字右側的分類標籤（協力廠商的工項） */
  tag?: string;
  /** 頭像底色與標籤顏色（協力廠商依工項） */
  color?: string;
  me?: boolean;
  member?: TeamMember;
  contact?: Contact;
}

function fromMember(m: TeamMember, me: string): Entry {
  return {
    key: m.email,
    cat: "internal",
    name: m.name,
    sub: m.title || (m.manager ? "管理" : "狩獵者"),
    avatar: m.avatar,
    avatarKey: m.email,
    phones: m.phone ? [{ number: m.phone }] : [],
    me: m.email === me,
    member: m,
  };
}

function fromContact(c: Contact): Entry {
  return {
    key: c.id,
    cat: c.kind,
    name: c.name,
    // 協力廠商：工項放標籤，名字下方只放公司全名
    sub: c.kind === "vendor" ? c.company ?? "" : [c.title, c.company].filter(Boolean).join("、"),
    avatar: c.avatar,
    avatarKey: c.id,
    phones: [
      ...(c.phone ? [{ label: c.contact2 ? c.name : undefined, number: c.phone }] : []),
      ...(c.phone2 ? [{ label: c.contact2, number: c.phone2 }] : []),
    ],
    tag: c.kind === "vendor" ? c.title : undefined,
    color: c.kind === "vendor" ? tradeColor(c.title) : undefined,
    contact: c,
  };
}

export default function TeamPage({
  query = "",
  onQuery,
  searchOpen = false,
  onSearchClose,
}: {
  /** 搜尋字（電腦在標題列輸入；手機在跳出的輸入欄） */
  query?: string;
  onQuery?: (q: string) => void;
  /** 手機：跳出搜尋輸入欄 */
  searchOpen?: boolean;
  onSearchClose?: () => void;
}) {
  const { data, error, isLoading, mutate } = useTeam();
  const [cat, setCat] = useState<Cat>("internal");
  const [trade, setTrade] = useState<string | null>(null);
  const [view, setView] = useState<Entry | null>(null);
  const [call, setCall] = useState<Entry | null>(null);
  const [portrait, setPortrait] = useState<TeamMember | null>(null);
  const [editContact, setEditContact] = useState<{ kind: ContactKind; contact: Contact | null } | null>(null);
  // undefined = 關閉；null = 新增
  const [editStaff, setEditStaff] = useState<TeamMember | null | undefined>(undefined);
  const [editVendor, setEditVendor] = useState<VendorInfo | null | undefined>(undefined);
  useEffect(() => setTrade(null), [cat]);

  const entries = useMemo(() => {
    if (!data) return [] as Entry[];
    const members = data.members
      .filter((m) => !COMPANY_ACCOUNTS.has(m.email.toLowerCase()))
      .sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999))
      .map((m) => fromMember(m, data.me.email));
    return [...members, ...data.contacts.map(fromContact)];
  }, [data]);

  if (!data) {
    return (
      <div className="flex justify-center py-16">
        {error ? <p className="text-[14px] text-[#71717A]">{String(error.message)}</p> : isLoading ? <Spinner size={22} /> : null}
      </div>
    );
  }

  const teamRole = data.me.teamRole;
  const canEdit = teamRole === "admin" || teamRole === "editor";
  const canDelete = teamRole === "admin";
  const canSave = data.configured && !data.dbError;
  const canManageContacts = canEdit && canSave;
  // 內部職員寫在員工CRM（試算表），不需要資料庫；讀不到員工CRM 時不能編輯
  const canManageStaff = canEdit && !data.staffError;
  // 協力廠商寫在廠商CRM（試算表），也不需要資料庫
  const canManageVendors = canEdit;
  const editable = (e: Entry) =>
    e.member
      ? canManageStaff && !!e.member.staff
      : e.contact?.vendor
        ? canManageVendors
        : !!e.contact && canManageContacts && !e.contact.fromCrm;
  const openEdit = (e: Entry) => {
    if (e.member) setEditStaff(e.member);
    else if (e.contact?.vendor) setEditVendor(e.contact.vendor);
    else if (e.contact) setEditContact({ kind: e.contact.kind, contact: e.contact });
  };
  const count = (k: Cat) => entries.filter((e) => e.cat === k).length;
  const meta = CATS.find((c) => c.key === cat)!;

  const keyword = query.trim().toLowerCase();
  const matches = (e: Entry) =>
    `${e.name} ${e.sub} ${e.tag ?? ""} ${e.phones.map((p) => p.number).join(" ")} ${e.contact?.note ?? ""} ${e.contact?.contact2 ?? ""} ${e.member?.bio ?? ""}`
      .toLowerCase()
      .includes(keyword);
  const results = keyword ? entries.filter(matches) : [];
  const vendorEntries = entries.filter((e) => e.contact?.vendor);
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

  const inCat = entries.filter((e) => e.cat === cat);
  const trades =
    cat === "vendor"
      ? [...inCat.reduce((m, e) => (e.contact?.title ? m.set(e.contact.title, (m.get(e.contact.title) ?? 0) + 1) : m), new Map<string, number>())]
          .sort((a, b) => b[1] - a[1])
          .map(([t]) => t)
      : [];
  const shown = trade ? inCat.filter((e) => e.contact?.title === trade) : inCat;

  return (
    <div className="flex flex-col gap-5 pt-1">
      {/* 手機：點頂部放大鏡跳出輸入欄，背景模糊；結果直接列在輸入欄下方 */}
      <SearchOverlay open={searchOpen} query={query} onQuery={(v) => onQuery?.(v)} onClose={() => onSearchClose?.()}>
        {keyword ? <SearchResults entries={results} keyword={query.trim()} onOpen={setView} onCall={setCall} onEdit={(e) => (editable(e) ? openEdit : undefined)} /> : null}
      </SearchOverlay>

      {/* 電腦：標題列輸入，結果直接取代清單 */}
      {keyword && (
        <div className="hidden md:flex flex-col gap-5">
          <SearchResults entries={results} keyword={query.trim()} onOpen={setView} onCall={setCall} onEdit={(e) => (editable(e) ? openEdit : undefined)} />
        </div>
      )}
      {(
        <div className={`flex flex-col gap-5 ${keyword ? "md:hidden" : ""}`}>
          {/* 分類：四個圖示方塊（篩選器），和上方的文字分頁在形狀上就分得開 */}
          <div role="tablist" aria-label="團隊分類" className="grid grid-cols-4 gap-2" {...stop}>
            {CATS.map((c) => {
              const on = cat === c.key;
              const Ico = c.icon;
              return (
                <button
                  key={c.key}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setCat(c.key)}
                  // 外框用真的 border（不用 ring）：ring 和卡片陰影共用 box-shadow，切換時會互相蓋掉；
                  // 每個方塊都有 1px 邊框，選中才變橘色，大小不會因選取而跳動
                  className={`h-[84px] rounded-[16px] border flex flex-col items-center justify-center gap-1.5 outline-none transition-[background-color] focus-visible:border-[#F39C12] ${
                    on ? "bg-[#FFF4E5] border-[#F39C12]/45" : "bg-white border-transparent shadow-card active:bg-[#F4F4F5]"
                  }`}
                >
                  <Ico size={22} stroke={1.4} className={on ? "text-[#E08A00]" : "text-[#A1A1AA]"} />
                  <span className={`text-[13px] leading-[16px] whitespace-nowrap ${on ? "font-medium text-[#18181B]" : "text-[#71717A]"}`}>{c.label}</span>
                  <span className={`text-[12px] leading-[14px] tabular-nums ${on ? "text-[#B86E00]" : "text-[#C4C4C8]"}`}>{count(c.key)}</span>
                </button>
              );
            })}
          </div>

          {cat === "internal" && data.staffError && (
            <p className="rounded-[14px] px-4 py-3 text-[13px] leading-relaxed bg-[#FFF6E8] text-[#8A5A00]">{data.staffError}</p>
          )}

          {cat !== "internal" && !canSave && (
            <p className="rounded-[14px] px-4 py-3 text-[13px] leading-relaxed bg-[#FFF6E8] text-[#8A5A00]">
              {data.dbError ?? "資料庫尚未設定：大頭照、職稱與聯絡人要等 Supabase 設定好才能儲存。"}
            </p>
          )}

          {/* 協力廠商：依工項篩選 */}
          {trades.length > 1 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-6 px-6 lg:-mx-10 lg:px-10 py-1" {...stop}>
              {[null, ...trades].map((t) => (
                <button
                  key={t ?? "all"}
                  onClick={() => setTrade(t)}
                  className={`h-8 px-3.5 rounded-full text-[13px] whitespace-nowrap shrink-0 transition-colors ${
                    trade === t ? "bg-[#F39C12] text-white" : "bg-white shadow-card text-[#52525B] active:bg-[#F4F4F5]"
                  }`}
                >
                  {t ?? "全部"}
                </button>
              ))}
            </div>
          )}

          {(() => {
            const canAdd = cat === "internal" ? canManageStaff : cat === "vendor" ? canManageVendors : canManageContacts;
            return (
            <ListCard>
              {shown.length === 0 && !canAdd ? (
                <Empty icon="group" title={trade ? "這個工項沒有廠商" : meta.empty} hint={meta.hint} />
              ) : (
                shown.map((e) => <Row key={e.key} e={e} onOpen={setView} onCall={setCall} onEdit={editable(e) ? openEdit : undefined} />)
              )}
              {/* 新增：四個分類同一個位置、同一個樣子 */}
              {canAdd && meta.add && (
                <button
                  onClick={() =>
                    cat === "internal" ? setEditStaff(null) : cat === "vendor" ? setEditVendor(null) : setEditContact({ kind: cat as ContactKind, contact: null })
                  }
                  className="w-full flex items-center gap-3.5 pl-4 pr-3 py-3 text-left outline-none active:bg-[#F4F4F5] focus-visible:bg-[#F4F4F5]"
                >
                  <span className="w-11 h-11 rounded-full border-[1.5px] border-dashed border-[#D4D4D8] flex items-center justify-center shrink-0 text-[#A1A1AA]">
                    <IconPlus size={20} stroke={1.5} />
                  </span>
                  <span className="text-[16px] text-[#71717A]">{meta.add}</span>
                </button>
              )}
            </ListCard>
            );
          })()}

        </div>
      )}

      <ProfileSheet
        e={view}
        full={canEdit}
        canEditPhoto={!!view?.member && canSave && view.member.email === data.me.email}
        onClose={() => setView(null)}
        onEditPhoto={() => {
          const m = view?.member;
          setView(null);
          if (m) setPortrait(m);
        }}
      />
      <CallSheet e={call} onClose={() => setCall(null)} />
      <PortraitSheet member={portrait} open={!!portrait} onClose={() => setPortrait(null)} onSaved={() => mutate()} />
      <ContactSheet
        kind={editContact?.kind ?? "external"}
        contact={editContact?.contact ?? null}
        open={!!editContact}
        onClose={() => setEditContact(null)}
        onSaved={() => mutate()}
        canDelete={canDelete}
      />
      <VendorSheet
        vendor={editVendor ?? null}
        open={editVendor !== undefined}
        canDelete={canDelete}
        trades={uniq(vendorEntries.map((e) => e.contact?.vendor?.trade ?? ""))}
        levels={uniq(vendorEntries.map((e) => e.contact?.vendor?.level ?? ""))}
        onClose={() => setEditVendor(undefined)}
        onSaved={() => mutate()}
      />
      <StaffSheet
        member={editStaff ?? null}
        open={editStaff !== undefined}
        canDelete={canDelete}
        onClose={() => setEditStaff(undefined)}
        onSaved={() => mutate()}
        onEditPhoto={(m) => setPortrait(m)}
      />
    </div>
  );
}

/* ── 共用零件 ─────────────────────────────────────────────── */

function GroupLabel({ name, n }: { name: string; n: number }) {
  return (
    <p className="px-4 mb-2 text-[13px] leading-[18px] text-[#A1A1AA] tracking-[0.04em]">
      {name}
      <span className="ml-1.5 tabular-nums">{n}</span>
    </p>
  );
}

function ListCard({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-[18px] shadow-card overflow-hidden [&>*+*]:border-t [&>*+*]:border-[#F4F4F5]">{children}</div>;
}

/** 一列：頭像＋名稱＋說明，右側電話鍵（四個分類都一樣） */
function Row({ e, onOpen, onCall, onEdit }: { e: Entry; onOpen: (e: Entry) => void; onCall: (e: Entry) => void; onEdit?: (e: Entry) => void }) {
  return (
    <div className="flex items-center">
      <button
        onClick={() => onOpen(e)}
        className="flex-1 min-w-0 flex items-center gap-3.5 pl-4 py-3 text-left outline-none active:bg-[#F4F4F5] focus-visible:bg-[#F4F4F5]"
      >
        <Avatar name={e.name} email={e.avatarKey} src={e.avatar} size={44} color={e.color} />
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-[16px] leading-[22px] font-medium text-[#18181B] truncate">{e.name}</span>
            {e.me && <span className="text-[13px] text-[#A1A1AA] shrink-0">你</span>}
            {e.tag && (
              <span
                className="shrink-0 h-[20px] px-2 rounded-full text-[12px] leading-[20px]"
                style={e.color ? { color: e.color, background: `${e.color}14` } : { color: "#71717A", background: "#F4F4F5" }}
              >
                {e.tag}
              </span>
            )}
          </span>
          {e.sub && <span className="block text-[13px] leading-[18px] text-[#A1A1AA] mt-0.5 truncate">{e.sub}</span>}
        </span>
      </button>
      {onEdit && (
        <button
          onClick={() => onEdit(e)}
          className="w-11 h-11 rounded-full flex items-center justify-center text-[#A1A1AA] active:bg-[#F4F4F5] active:text-[#18181B] outline-none focus-visible:bg-[#F4F4F5] shrink-0"
          aria-label={`編輯 ${e.name}`}
        >
          <IconPencil size={19} stroke={1.5} />
        </button>
      )}
      {e.phones.length ? (
        <button
          onClick={() => onCall(e)}
          className="w-11 h-11 mr-2 rounded-full flex items-center justify-center text-[#F39C12] active:bg-[#FFF4E5] outline-none focus-visible:bg-[#FFF4E5] shrink-0"
          aria-label={`打電話給 ${e.name}`}
        >
          <IconPhone size={20} stroke={1.5} />
        </button>
      ) : (
        <span className="w-11 mr-2 shrink-0" aria-hidden />
      )}
    </div>
  );
}

/** 手機搜尋：頂部輸入欄＋模糊背景，結果列在下方；電腦版不用（標題列直接輸入） */
function SearchOverlay({
  open,
  query,
  onQuery,
  onClose,
  children,
}: {
  open: boolean;
  query: string;
  onQuery: (q: string) => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // 只在打開那一刻聚焦（之後每打一個字都會重繪，不要重複搶焦點）
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="md:hidden fixed inset-0 z-[140] flex flex-col bg-[#FAFAFA]/70 backdrop-blur-xl" role="dialog" aria-label="搜尋團隊">
      <div className="shrink-0 px-4 pb-3 flex items-center gap-2" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
        <div className="relative flex-1 min-w-0">
          <IconSearch size={18} stroke={1.5} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A1A1AA] pointer-events-none" />
          <input
            ref={input}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="搜尋姓名、工項、電話"
            enterKeyHint="search"
            className="w-full h-11 rounded-full bg-white shadow-card pl-10 pr-9 text-[16px] text-[#18181B] outline-none placeholder:text-[#A1A1AA] focus:ring-2 focus:ring-[#F39C12]/40"
          />
          {query && (
            <button
              onClick={() => {
                onQuery("");
                input.current?.focus();
              }}
              aria-label="清除"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-[#A1A1AA] active:bg-[#F4F4F5]"
            >
              <IconX size={16} stroke={1.75} />
            </button>
          )}
        </div>
        <button onClick={onClose} className="h-11 px-1 text-[15px] text-[#3F3F46] active:text-[#18181B] shrink-0">
          取消
        </button>
      </div>
      {/* 點空白處關閉；有結果時可捲動 */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-10" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="flex flex-col gap-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}

function SearchResults({
  entries,
  keyword,
  onOpen,
  onCall,
  onEdit,
}: {
  entries: Entry[];
  keyword: string;
  onOpen: (e: Entry) => void;
  onCall: (e: Entry) => void;
  /** 這一筆可以編輯就回傳編輯函式 */
  onEdit?: (e: Entry) => ((e: Entry) => void) | undefined;
}) {
  if (!entries.length) return <Empty icon="search_off" title={`找不到「${keyword}」`} hint="試試姓名、工項或電話的一部分" />;
  return (
    <>
      {CATS.map((c) => {
        const rows = entries.filter((e) => e.cat === c.key);
        if (!rows.length) return null;
        return (
          <section key={c.key}>
            <GroupLabel name={c.label} n={rows.length} />
            <ListCard>
              {rows.map((e) => (
                <Row key={e.key} e={e} onOpen={onOpen} onCall={onCall} onEdit={onEdit?.(e)} />
              ))}
            </ListCard>
          </section>
        );
      })}
    </>
  );
}

/** 撥號確認：撥打／取消。兩支電話就各一顆 */
function CallSheet({ e, onClose }: { e: Entry | null; onClose: () => void }) {
  return (
    <Sheet open={!!e} title={e ? `打電話給 ${e.name}` : ""} subtitle={e?.sub || undefined} onClose={onClose}>
      {e && (
        <div className="px-4 pt-2 pb-4 flex flex-col gap-2.5">
          {e.phones.map((p) => (
            <a
              key={p.number}
              href={`tel:${tel(p.number)}`}
              onClick={() => setTimeout(onClose, 300)}
              className="h-14 rounded-full bg-[#F39C12] text-white flex items-center justify-center gap-2.5 active:opacity-85"
            >
              <IconPhone size={20} stroke={1.75} />
              <span className="text-[17px] font-medium tabular-nums">{p.number}</span>
              {p.label && <span className="text-[13px] text-white/80">{p.label}</span>}
            </a>
          ))}
          <button onClick={onClose} className="h-14 rounded-full bg-[#F4F4F5] text-[#18181B] text-[17px] active:bg-[#E4E4E7]">
            取消
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** 詳情：點名單跳出來看資料。打電話、編輯在列的右側，這裡不重複。
 *  Admin／Editor 看全部；其他人只看基本資料（電話、Email、生日）。
 *  個資本來就只有 Admin／Editor 會從伺服器拿到，這裡再依權限決定顯示哪些列。 */
function ProfileSheet({
  e,
  full,
  canEditPhoto,
  onClose,
  onEditPhoto,
}: {
  e: Entry | null;
  full: boolean;
  /** 自己的大頭照：點頭像換照片 */
  canEditPhoto: boolean;
  onClose: () => void;
  onEditPhoto: () => void;
}) {
  const rows: { label: string; value?: string }[] = [];
  if (e?.member) {
    const s = e.member.staff;
    rows.push({ label: "電話", value: e.member.phone }, { label: "Email", value: s?.gmail ?? (e.member.email.includes("@") ? e.member.email : undefined) }, { label: "生日", value: s?.birthday });
    if (full)
      rows.push(
        { label: "等級", value: s?.level },
        { label: "登入參戰日", value: s?.joined },
        { label: "身分證字號", value: s?.idNo },
        { label: "地址", value: s?.address },
        { label: "富邦匯款帳號", value: s?.bank }
      );
  } else if (e?.contact) {
    const c = e.contact;
    const v = c.vendor;
    if (v) {
      rows.push(
        { label: v.contact1 ? `聯絡人　${v.contact1}` : "電話", value: v.phone1 },
        ...(v.contact2 || v.phone2 ? [{ label: v.contact2 ? `聯絡人　${v.contact2}` : "電話 2", value: v.phone2 }] : [])
      );
      if (full)
        rows.push(
          { label: "工項", value: v.trade },
          { label: "等級", value: v.level },
          { label: "統編", value: v.taxId },
          { label: "銀行分行", value: [v.bankBranch, v.branch].filter(Boolean).join(" ") },
          { label: "匯款帳號", value: v.account },
          { label: "備註", value: v.note }
        );
    } else {
      rows.push({ label: "電話", value: c.phone }, ...(c.phone2 ? [{ label: c.contact2 ? `電話（${c.contact2}）` : "電話 2", value: c.phone2 }] : []), { label: "Email", value: c.email });
      if (full) rows.push({ label: "網站", value: c.website }, { label: "備註", value: c.note });
    }
  }
  if (full && e?.member?.bio) rows.push({ label: "專長", value: e.member.bio });
  const shown = rows.filter((r) => r.value);

  return (
    <Sheet open={!!e} title={e?.name ?? ""} subtitle={e?.sub || undefined} onClose={onClose}>
      {e && (
        <div className="flex flex-col items-center px-4 pb-6">
          <div className="py-4">
            {canEditPhoto ? (
              <button type="button" onClick={onEditPhoto} className="relative rounded-full active:opacity-80" aria-label="更換我的大頭照">
                <Avatar name={e.name} email={e.avatarKey} src={e.avatar} size={96} color={e.color} />
                <span className="absolute right-0 bottom-0 w-8 h-8 rounded-full bg-[#18181B] border-2 border-white flex items-center justify-center text-white">
                  <IconCamera size={16} stroke={1.75} />
                </span>
              </button>
            ) : (
              <Avatar name={e.name} email={e.avatarKey} src={e.avatar} size={96} color={e.color} />
            )}
          </div>

          {shown.length ? (
            <dl className="w-full bg-white rounded-[18px] shadow-card overflow-hidden [&>*+*]:border-t [&>*+*]:border-[#F4F4F5]">
              {shown.map((r) => (
                <div key={r.label} className="flex items-start gap-4 px-4 py-3.5">
                  <dt className="w-[92px] shrink-0 text-[14px] leading-[22px] text-[#A1A1AA]">{r.label}</dt>
                  <dd className="flex-1 min-w-0 text-[15px] leading-[22px] text-[#18181B] break-words tabular-nums select-text">{r.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-[14px] text-[#A1A1AA]">還沒有聯絡資料</p>
          )}
        </div>
      )}
    </Sheet>
  );
}
