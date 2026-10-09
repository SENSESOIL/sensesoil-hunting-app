"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Contact, ContactKind, TeamMember } from "@/lib/pm/model";
import { Avatar, Empty, Spinner } from "@/components/pm/kit";
import { Sheet } from "@/components/pm/Sheet";
import {
  IconCamera,
  IconHeartHandshake,
  IconMail,
  IconPencil,
  IconPhone,
  IconPlus,
  IconSearch,
  IconTool,
  IconUsers,
  IconUserShare,
  IconWorld,
  IconX,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { PortraitSheet } from "./PortraitSheet";
import { ContactSheet } from "./ContactSheet";
import { StaffSheet } from "./StaffSheet";
import { useTeam } from "./useTeam";

/* ══════════════════════════════════════════════════════════
   指揮中心 → 團隊
   四個分類用「圖示方塊」切換（不是第二排文字分頁，避免和上方「營運／團隊／財務」打架）。
   四個分類共用同一套：
     一列 = 頭像＋名稱＋說明，右側電話鍵 → 跳出「撥打／取消」
     點一列 → 個人卡（聯絡方式、編輯）
     名字右側的鉛筆 → 編輯（內部職員寫回拾壤CRM「員工CRM」）
     新增 → 清單最後一列「＋ 新增…」
     權限：權限表「團隊」欄 Admin 可新增、編輯、刪除；Editor 可新增、編輯；其他人唯讀
     搜尋 → 頂部分享鍵左邊的放大鏡，一次搜四個分類
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
  badge?: string;
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
    sub: [c.title, c.company].filter(Boolean).join("、"),
    avatar: c.avatar,
    avatarKey: c.id,
    phones: [
      ...(c.phone ? [{ label: c.contact2 ? c.name : undefined, number: c.phone }] : []),
      ...(c.phone2 ? [{ label: c.contact2, number: c.phone2 }] : []),
    ],
    badge: c.fromCrm ? "CRM" : undefined,
    contact: c,
  };
}

export default function TeamPage({ searchOpen = false, onSearchClose }: { searchOpen?: boolean; onSearchClose?: () => void }) {
  const { data, error, isLoading, mutate } = useTeam();
  const [cat, setCat] = useState<Cat>("internal");
  const [q, setQ] = useState("");
  const [trade, setTrade] = useState<string | null>(null);
  const [view, setView] = useState<Entry | null>(null);
  const [call, setCall] = useState<Entry | null>(null);
  const [portrait, setPortrait] = useState<TeamMember | null>(null);
  const [editContact, setEditContact] = useState<{ kind: ContactKind; contact: Contact | null } | null>(null);
  // undefined = 關閉；null = 新增
  const [editStaff, setEditStaff] = useState<TeamMember | null | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) requestAnimationFrame(() => input.current?.focus());
    else setQ("");
  }, [searchOpen]);
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
  const editable = (e: Entry) => (e.member ? canManageStaff && !!e.member.staff : !!e.contact && canManageContacts && !e.contact.fromCrm);
  const openEdit = (e: Entry) => {
    if (e.member) setEditStaff(e.member);
    else if (e.contact) setEditContact({ kind: e.contact.kind, contact: e.contact });
  };
  const count = (k: Cat) => entries.filter((e) => e.cat === k).length;
  const meta = CATS.find((c) => c.key === cat)!;

  const keyword = q.trim().toLowerCase();
  const searching = searchOpen && !!keyword;
  const matches = (e: Entry) =>
    `${e.name} ${e.sub} ${e.phones.map((p) => p.number).join(" ")} ${e.contact?.note ?? ""} ${e.contact?.contact2 ?? ""} ${e.member?.bio ?? ""}`
      .toLowerCase()
      .includes(keyword);

  const inCat = entries.filter((e) => e.cat === cat);
  const trades =
    cat === "vendor"
      ? [...inCat.reduce((m, e) => (e.contact?.title ? m.set(e.contact.title, (m.get(e.contact.title) ?? 0) + 1) : m), new Map<string, number>())]
          .sort((a, b) => b[1] - a[1])
          .map(([t]) => t)
      : [];
  const shown = trade ? inCat.filter((e) => e.contact?.title === trade) : inCat;

  return (
    <div className="flex flex-col gap-5">
      {/* 搜尋列：由頂部的放大鏡打開，一次搜四個分類 */}
      {searchOpen && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <IconSearch size={18} stroke={1.5} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A1A1AA] pointer-events-none" />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜尋姓名、工項、電話"
              enterKeyHint="search"
              className="w-full h-11 rounded-full bg-white shadow-card pl-10 pr-9 text-[16px] text-[#18181B] outline-none placeholder:text-[#A1A1AA] focus:ring-2 focus:ring-[#F39C12]/40"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                aria-label="清除"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-[#A1A1AA] active:bg-[#F4F4F5]"
              >
                <IconX size={16} stroke={1.75} />
              </button>
            )}
          </div>
          <button onClick={onSearchClose} className="h-11 px-1 text-[15px] text-[#71717A] active:text-[#18181B] shrink-0">
            取消
          </button>
        </div>
      )}

      {searching ? (
        <SearchResults entries={entries.filter(matches)} keyword={q.trim()} onOpen={setView} onCall={setCall} />
      ) : (
        <>
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
                  className={`h-[84px] rounded-[16px] flex flex-col items-center justify-center gap-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#F39C12]/50 ${
                    on ? "bg-[#FFF4E5] ring-1 ring-[#F39C12]/35" : "bg-white shadow-card active:bg-[#F4F4F5]"
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
                    trade === t ? "bg-[#18181B] text-white" : "bg-white shadow-card text-[#52525B] active:bg-[#F4F4F5]"
                  }`}
                >
                  {t ?? "全部"}
                </button>
              ))}
            </div>
          )}

          {(() => {
            const canAdd = cat === "internal" ? canManageStaff : canManageContacts;
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
                  onClick={() => (cat === "internal" ? setEditStaff(null) : setEditContact({ kind: cat as ContactKind, contact: null }))}
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

          {cat === "internal" && canManageStaff && <p className="px-4 -mt-2 text-[13px] leading-[20px] text-[#A1A1AA]">{meta.hint}，在這裡改的會同步回試算表</p>}
          {cat === "vendor" && inCat.some((e) => e.contact?.fromCrm) && (
            <p className="px-4 -mt-2 text-[13px] leading-[20px] text-[#A1A1AA]">標示 CRM 的廠商來自拾壤CRM，請在試算表修改；匯款帳號等資料不會顯示在 APP。</p>
          )}
        </>
      )}

      <ProfileSheet
        e={view}
        onClose={() => setView(null)}
        onCall={(e) => {
          setView(null);
          setCall(e);
        }}
        canEditPhoto={!!view?.member && canSave && view.member.email === data.me.email && !(view && editable(view))}
        canEditContact={!!view && editable(view)}
        onEditPhoto={() => {
          const m = view?.member;
          setView(null);
          if (m) setPortrait(m);
        }}
        onEditContact={() => {
          const e = view;
          setView(null);
          if (e) openEdit(e);
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
    <div className="relative flex items-center">
      {/* 整列可點（看個人卡）；鉛筆疊在名字右側，是獨立的按鈕 */}
      <button
        onClick={() => onOpen(e)}
        className="flex-1 min-w-0 flex items-center gap-3.5 pl-4 py-3 text-left outline-none active:bg-[#F4F4F5] focus-visible:bg-[#F4F4F5]"
      >
        <Avatar name={e.name} email={e.avatarKey} src={e.avatar} size={44} />
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-[16px] leading-[22px] font-medium text-[#18181B] truncate">{e.name}</span>
            {/* 鉛筆的位置（實際按鈕疊在上面） */}
            {onEdit && <span data-pin-slot className="w-7 h-[22px] shrink-0 -ml-0.5" aria-hidden />}
            {e.me && <span className="text-[13px] text-[#A1A1AA] shrink-0">你</span>}
            {e.badge && (
              <span className="shrink-0 h-[18px] px-1.5 rounded-[5px] bg-[#F4F4F5] text-[11px] font-medium text-[#A1A1AA] leading-[18px]">{e.badge}</span>
            )}
          </span>
          {e.sub && <span className="block text-[13px] leading-[18px] text-[#A1A1AA] mt-0.5 truncate">{e.sub}</span>}
        </span>
      </button>
      {onEdit && <EditPin e={e} onEdit={onEdit} />}
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

/** 名字右側的鉛筆：疊在預留的位置上（列本身是按鈕，按鈕不能包按鈕） */
function EditPin({ e, onEdit }: { e: Entry; onEdit: (e: Entry) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const btn = ref.current;
    const row = btn?.parentElement;
    const slot = row?.querySelector<HTMLElement>("[data-pin-slot]");
    if (!btn || !row || !slot) return;
    const place = () => {
      const r = row.getBoundingClientRect();
      const n = slot.getBoundingClientRect();
      setLeft(n.left - r.left + (n.width - 32) / 2);
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(row);
    return () => ro.disconnect();
  }, [e.name]);
  return (
    <button
      ref={ref}
      onClick={() => onEdit(e)}
      className="absolute top-[7px] w-8 h-8 rounded-full flex items-center justify-center text-[#A1A1AA] active:bg-[#F4F4F5] active:text-[#18181B] outline-none focus-visible:bg-[#F4F4F5]"
      style={{ left: left ?? -9999 }}
      aria-label={`編輯 ${e.name}`}
    >
      <IconPencil size={17} stroke={1.5} />
    </button>
  );
}

function SearchResults({
  entries,
  keyword,
  onOpen,
  onCall,
}: {
  entries: Entry[];
  keyword: string;
  onOpen: (e: Entry) => void;
  onCall: (e: Entry) => void;
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
                <Row key={e.key} e={e} onOpen={onOpen} onCall={onCall} />
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

/** 個人卡：四個分類共用 */
function ProfileSheet({
  e,
  onClose,
  onCall,
  canEditPhoto,
  canEditContact,
  onEditPhoto,
  onEditContact,
}: {
  e: Entry | null;
  onClose: () => void;
  onCall: (e: Entry) => void;
  canEditPhoto: boolean;
  canEditContact: boolean;
  onEditPhoto: () => void;
  onEditContact: () => void;
}) {
  const c = e?.contact;
  const lines = e ? [e.member?.bio, c?.note, c?.contact2 && !c.phone2 ? `聯絡人：${c.contact2}` : undefined].filter((x): x is string => !!x) : [];
  return (
    <Sheet open={!!e} title={e?.name ?? ""} subtitle={e?.sub || undefined} onClose={onClose}>
      {e && (
        <div className="flex flex-col items-center px-4 pb-4">
          <div className="py-4">
            <Avatar name={e.name} email={e.avatarKey} src={e.avatar} size={120} />
          </div>
          {lines.map((l) => (
            <p key={l} className="max-w-[34ch] text-center text-[15px] leading-[24px] text-[#3F3F46]">
              {l}
            </p>
          ))}

          {(c?.email || c?.website) && (
            <div className="mt-4 w-full bg-white rounded-[18px] shadow-card overflow-hidden [&>*+*]:border-t [&>*+*]:border-[#F4F4F5]">
              {c?.email && (
                <a href={`mailto:${c.email}`} className="flex items-center gap-3 px-4 h-[52px] active:bg-[#F4F4F5]">
                  <IconMail size={20} stroke={1.5} className="text-[#A1A1AA]" />
                  <span className="flex-1 min-w-0 text-[15px] text-[#18181B] truncate">{c.email}</span>
                </a>
              )}
              {c?.website && (
                <a
                  href={/^https?:/.test(c.website) ? c.website : `https://${c.website}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 px-4 h-[52px] active:bg-[#F4F4F5]"
                >
                  <IconWorld size={20} stroke={1.5} className="text-[#A1A1AA]" />
                  <span className="flex-1 min-w-0 text-[15px] text-[#18181B] truncate">{c.website.replace(/^https?:\/\//, "")}</span>
                </a>
              )}
            </div>
          )}

          <div className="mt-5 w-full flex flex-col gap-2.5">
            {e.phones.length > 0 && (
              <button
                onClick={() => onCall(e)}
                className="h-12 rounded-full bg-[#F39C12] text-white text-[16px] font-medium inline-flex items-center justify-center gap-2 active:opacity-85"
              >
                <IconPhone size={20} stroke={1.75} />
                打電話
              </button>
            )}
            {canEditPhoto && (
              <button
                onClick={onEditPhoto}
                className="h-12 rounded-full bg-[#F4F4F5] text-[#18181B] text-[16px] font-medium inline-flex items-center justify-center gap-2 active:bg-[#E4E4E7]"
              >
                <IconCamera size={20} stroke={1.5} />
                {e.avatar ? "更換大頭照" : e.me ? "上傳我的大頭照" : "上傳大頭照"}
              </button>
            )}
            {canEditContact && (
              <button
                onClick={onEditContact}
                className="h-12 rounded-full bg-[#F4F4F5] text-[#18181B] text-[16px] font-medium inline-flex items-center justify-center gap-2 active:bg-[#E4E4E7]"
              >
                <IconPencil size={20} stroke={1.5} />
                編輯
              </button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
