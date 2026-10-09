"use client";

import React, { useMemo, useState } from "react";
import { type Contact, type ContactKind, type TeamMember } from "@/lib/pm/model";
import { Icon } from "@/components/pm/ui";
import { Avatar, Empty, Group, ORANGE, Spinner } from "@/components/pm/kit";
import { Sheet } from "@/components/pm/Sheet";
import { IconCamera, IconChevronRight, IconPhone } from "@tabler/icons-react";
import { PortraitSheet } from "./PortraitSheet";
import { ContactSheet } from "./ContactSheet";
import { useTeam } from "./useTeam";

/* ══════════════════════════════════════════════════════════
   指揮中心 → 團隊
   與「營運」同一套清單語彙：白色卡片、一人一列、灰色組名。
   內部職員：圓形大頭照＋姓名＋職稱，右側直接撥號；點一下看個人卡
   外部職員／協力廠商／聯盟品牌：名片清單
   ══════════════════════════════════════════════════════════ */

const SEGMENTS: { key: "internal" | ContactKind; label: string }[] = [
  { key: "internal", label: "內部職員" },
  { key: "external", label: "外部職員" },
  { key: "vendor", label: "協力廠商" },
  { key: "brand", label: "聯盟品牌" },
];

/** 橫向捲動的觸控不要傳給指揮中心外層的「左右滑換分頁」 */
const stop = {
  onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
  onTouchMove: (e: React.TouchEvent) => e.stopPropagation(),
  onTouchEnd: (e: React.TouchEvent) => e.stopPropagation(),
};

const tel = (p?: string) => p?.replace(/[^\d+]/g, "");

export default function TeamPage() {
  const { data, error, isLoading, mutate } = useTeam();
  const [seg, setSeg] = useState<(typeof SEGMENTS)[number]["key"]>("internal");

  if (!data) {
    return (
      <div className="flex justify-center py-16">
        {error ? <p className="text-[14px] text-[#71717A]">{String(error.message)}</p> : isLoading ? <Spinner size={22} /> : null}
      </div>
    );
  }
  const isManager = data.me.role === "manager";
  const count = (k: (typeof SEGMENTS)[number]["key"]) =>
    k === "internal" ? data.members.length : data.contacts.filter((c) => c.kind === k).length;

  return (
    <div className="flex flex-col gap-5">
      {/* 第二層分類：文字分頁＋橘色底線，和上一層「營運／團隊／財務」的白色膠囊分出層級 */}
      <div role="tablist" aria-label="團隊分類" className="flex gap-6 overflow-x-auto scrollbar-hide px-1 -mb-1" {...stop}>
        {SEGMENTS.map((s) => {
          const on = seg === s.key;
          const n = count(s.key);
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={on}
              onClick={() => setSeg(s.key)}
              className={`relative shrink-0 h-10 flex items-center gap-1 text-[15px] whitespace-nowrap outline-none transition-colors focus-visible:text-[#18181B] ${
                on ? "font-medium text-[#18181B]" : "text-[#A1A1AA] active:text-[#71717A]"
              }`}
            >
              {s.label}
              {n > 0 && <span className={`text-[12px] tabular-nums ${on ? "text-[#71717A]" : "text-[#C4C4C8]"}`}>{n}</span>}
              <span
                className={`absolute left-0 right-0 bottom-0 h-[2px] rounded-full transition-opacity ${on ? "opacity-100" : "opacity-0"}`}
                style={{ background: ORANGE }}
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      {(!data.configured || data.dbError) && (
        <p className="rounded-[14px] px-4 py-3 text-[13px] leading-relaxed bg-[#FFF6E8] text-[#8A5A00]">
          {data.dbError ?? "資料庫尚未設定：照片、職稱與聯絡人要等 Supabase 設定好才能儲存（見 docs/工程管理資料架構.md）。"}
        </p>
      )}

      {seg === "internal" ? (
        <Internal members={data.members} me={data.me.email} isManager={isManager} canSave={data.configured && !data.dbError} onChanged={() => mutate()} />
      ) : (
        <Contacts kind={seg} contacts={data.contacts.filter((c) => c.kind === seg)} isManager={isManager && data.configured && !data.dbError} onChanged={() => mutate()} />
      )}
    </div>
  );
}

/* ── 內部職員：清單＋個人卡 ─────────────────────────────── */

function Internal({
  members,
  me,
  isManager,
  canSave,
  onChanged,
}: {
  members: TeamMember[];
  me: string;
  isManager: boolean;
  canSave: boolean;
  onChanged: () => void;
}) {
  // 順序固定（權限表順序）；上傳照片後不會跳位置
  const list = useMemo(() => [...members].sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999)), [members]);
  const [view, setView] = useState<TeamMember | null>(null);
  const [edit, setEdit] = useState<TeamMember | null>(null);

  if (!list.length) return <Empty icon="groups" title="權限表上還沒有人員" />;
  const mine = list.find((m) => m.email === me);
  const canEdit = (m: TeamMember) => canSave && (m.email === me || isManager);
  const groups = [
    { name: "管理", rows: list.filter((m) => m.manager) },
    { name: "狩獵者", rows: list.filter((m) => !m.manager) },
  ].filter((g) => g.rows.length);

  return (
    <>
      {/* 自己還沒有照片：放在最上面，一列就好，不搶整頁 */}
      {mine && !mine.avatar && canSave && (
        <button
          onClick={() => setEdit(mine)}
          className="w-full bg-white rounded-[18px] shadow-card flex items-center gap-3.5 pl-4 pr-3 py-3.5 text-left outline-none active:bg-[#F4F4F5] focus-visible:bg-[#F4F4F5]"
        >
          <span className="w-11 h-11 rounded-full border-[1.5px] border-dashed border-[#F39C12]/60 flex items-center justify-center shrink-0 text-[#F39C12]">
            <IconCamera size={20} stroke={1.5} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[16px] leading-[22px] font-medium text-[#18181B]">上傳你的大頭照</span>
            <span className="block text-[13px] leading-[18px] text-[#A1A1AA] mt-0.5 truncate">
              任務指派和參與者頭像都會顯示
            </span>
          </span>
          <IconChevronRight size={20} stroke={1.5} className="text-[#D4D4D8] shrink-0" />
        </button>
      )}

      {groups.map((g) => (
        <div key={g.name}>
          <p className="px-4 mb-2 text-[13px] leading-[18px] text-[#A1A1AA] tracking-[0.04em]">
            {g.name}
            <span className="ml-1.5 tabular-nums">{g.rows.length}</span>
          </p>
          <div className="bg-white rounded-[18px] shadow-card overflow-hidden">
            {g.rows.map((m, i) => (
              <div key={m.email} className={`flex items-center ${i === g.rows.length - 1 ? "" : "border-b border-[#F4F4F5]"}`}>
                <button
                  onClick={() => setView(m)}
                  className="flex-1 min-w-0 flex items-center gap-3.5 pl-4 py-3 text-left outline-none active:bg-[#F4F4F5] focus-visible:bg-[#F4F4F5]"
                >
                  <Avatar name={m.name} email={m.email} src={m.avatar} size={44} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[16px] leading-[22px] font-medium text-[#18181B] truncate">
                      {m.name}
                      {m.email === me && <span className="ml-1.5 text-[13px] font-normal text-[#A1A1AA]">你</span>}
                    </span>
                    <span className="block text-[13px] leading-[18px] text-[#A1A1AA] mt-0.5 truncate">
                      {m.title || (m.manager ? "管理" : "狩獵者")}
                    </span>
                  </span>
                </button>
                {m.phone ? (
                  <a
                    href={`tel:${tel(m.phone)}`}
                    className="w-11 h-11 mr-2 rounded-full flex items-center justify-center text-[#F39C12] active:bg-[#FFF4E5] outline-none focus-visible:bg-[#FFF4E5]"
                    aria-label={`撥電話給 ${m.name}`}
                  >
                    <IconPhone size={20} stroke={1.5} />
                  </a>
                ) : (
                  <span className="w-11 mr-2" aria-hidden />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <MemberSheet
        member={view}
        isMe={view?.email === me}
        canEdit={!!view && canEdit(view)}
        onClose={() => setView(null)}
        onEdit={() => {
          const m = view;
          setView(null);
          if (m) setEdit(m);
        }}
      />
      <PortraitSheet member={edit} open={!!edit} onClose={() => setEdit(null)} onSaved={onChanged} />
    </>
  );
}

/** 個人卡：圓形大頭照＋聯絡方式 */
function MemberSheet({
  member,
  isMe,
  canEdit,
  onClose,
  onEdit,
}: {
  member: TeamMember | null;
  isMe: boolean;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const m = member;
  return (
    <Sheet open={!!m} title={m?.name ?? ""} subtitle={m ? m.title || (m.manager ? "管理" : "狩獵者") : undefined} onClose={onClose}>
      {m && (
        <div className="flex flex-col items-center pb-2">
          <div className="py-4">
            <Avatar name={m.name} email={m.email} src={m.avatar} size={120} />
          </div>
          {m.bio && <p className="mt-5 max-w-[34ch] text-center text-[15px] leading-[24px] text-[#3F3F46]">{m.bio}</p>}
          <div className="mt-6 w-full flex flex-col gap-2.5">
            {m.phone && (
              <a
                href={`tel:${tel(m.phone)}`}
                className="h-12 rounded-full bg-[#F39C12] text-white text-[16px] font-medium inline-flex items-center justify-center gap-2 active:opacity-85"
              >
                <IconPhone size={20} stroke={1.75} />
                <span className="tabular-nums">{m.phone}</span>
              </a>
            )}
            {canEdit && (
              <button
                onClick={onEdit}
                className="h-12 rounded-full bg-[#F4F4F5] text-[#18181B] text-[16px] font-medium inline-flex items-center justify-center gap-2 active:bg-[#E4E4E7]"
              >
                <IconCamera size={20} stroke={1.5} />
                {m.avatar ? "更換大頭照" : isMe ? "上傳我的大頭照" : "上傳大頭照"}
              </button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* ── 外部職員／協力廠商／聯盟品牌 ────────────────────────── */

const KIND_META: Record<ContactKind, { empty: string; hint: string; titleLabel: string; icon: string }> = {
  external: { empty: "還沒有外部職員", hint: "臨時工、外聘設計師、顧問…", titleLabel: "職稱", icon: "badge" },
  vendor: { empty: "還沒有協力廠商", hint: "廠商CRM 的資料會自動列在這裡", titleLabel: "工項", icon: "handyman" },
  brand: { empty: "還沒有聯盟品牌", hint: "合作的品牌、設計公司、通路", titleLabel: "類型", icon: "handshake" },
};

function Contacts({ kind, contacts, isManager, onChanged }: { kind: ContactKind; contacts: Contact[]; isManager: boolean; onChanged: () => void }) {
  const [q, setQ] = useState("");
  const [trade, setTrade] = useState<string | null>(null);
  const [edit, setEdit] = useState<Contact | "new" | null>(null);
  const meta = KIND_META[kind];

  const trades = useMemo(() => {
    const m = new Map<string, number>();
    contacts.forEach((c) => c.title && m.set(c.title, (m.get(c.title) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [contacts]);

  const list = contacts.filter((c) => {
    if (trade && c.title !== trade) return false;
    const k = q.trim().toLowerCase();
    return !k || `${c.name} ${c.company ?? ""} ${c.title ?? ""} ${c.note ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(k);
  });

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[#A1A1AA]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋名稱、工項、電話"
            className="w-full h-11 rounded-[12px] bg-white border border-[#E4E4E7] pl-9 pr-3 text-[16px] text-[#18181B] outline-none focus:border-[#F39C12]"
          />
        </div>
        {isManager && (
          <button onClick={() => setEdit("new")} className="h-11 w-11 rounded-full text-white flex items-center justify-center shrink-0 active:opacity-85" style={{ background: ORANGE }} aria-label="新增">
            <Icon name="add" weight={500} className="text-[22px]" />
          </button>
        )}
      </div>

      {kind === "vendor" && trades.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-6 px-6 lg:-mx-10 lg:px-10" {...stop}>
          {[null, ...trades].map((t) => (
            <button
              key={t ?? "all"}
              onClick={() => setTrade(t)}
              className={`h-9 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0 ${
                trade === t ? "bg-[#18181B] text-white" : "bg-white border border-[#E4E4E7] text-[#3F3F46]"
              }`}
            >
              {t ?? "全部"}
            </button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <Group>
          <Empty icon={meta.icon} title={q || trade ? "沒有符合的資料" : meta.empty} hint={isManager ? `${meta.hint}。按右上「＋」新增。` : meta.hint} />
        </Group>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {list.map((c) => (
            <ContactCard key={c.id} c={c} onEdit={isManager && !c.fromCrm ? () => setEdit(c) : undefined} />
          ))}
        </div>
      )}
      {kind === "vendor" && contacts.some((c) => c.fromCrm) && (
        <p className="text-[12px] text-[#A1A1AA] px-1">標示「CRM」的廠商來自拾壤CRM 的「廠商CRM」分頁，請在試算表修改。匯款帳號等資料不會顯示在 APP。</p>
      )}

      <ContactSheet kind={kind} contact={edit === "new" ? null : edit} open={!!edit} onClose={() => setEdit(null)} onSaved={onChanged} />
    </>
  );
}

function ContactCard({ c, onEdit }: { c: Contact; onEdit?: () => void }) {
  return (
    <div className="bg-white rounded-[18px] shadow-card p-4 flex items-start gap-3.5">
      <Avatar name={c.name} email={c.id} src={c.avatar} size={48} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[15.5px] font-semibold text-[#18181B] truncate">{c.name}</p>
          {c.fromCrm && <span className="shrink-0 h-[18px] px-1.5 rounded-[5px] bg-[#F2F2F4] text-[10.5px] font-semibold text-[#8E8E93] leading-[18px]">CRM</span>}
        </div>
        <p className="text-[12.5px] text-[#8E8E93] truncate">{[c.title, c.company].filter(Boolean).join("・") || "—"}</p>
        {(c.note || c.contact2) && (
          <p className="text-[12.5px] text-[#52525B] truncate mt-0.5">{[c.note, c.contact2].filter(Boolean).join("、")}</p>
        )}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {c.phone && (
            <a href={`tel:${tel(c.phone)}`} className="h-8 px-3 rounded-full bg-[#F4F4F5] text-[12.5px] text-[#18181B] inline-flex items-center gap-1 active:bg-[#E4E4E7]">
              <Icon name="call" weight={400} className="text-[15px]" />
              {c.phone}
            </a>
          )}
          {c.phone2 && (
            <a href={`tel:${tel(c.phone2)}`} className="h-8 px-3 rounded-full bg-[#F4F4F5] text-[12.5px] text-[#18181B] inline-flex items-center gap-1 active:bg-[#E4E4E7]">
              <Icon name="call" weight={400} className="text-[15px]" />
              {c.phone2}
            </a>
          )}
          {c.website && (
            <a href={/^https?:/.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-full bg-[#F4F4F5] text-[12.5px] text-[#18181B] inline-flex items-center gap-1">
              <Icon name="language" weight={400} className="text-[15px]" />
              網站
            </a>
          )}
        </div>
      </div>
      {onEdit && (
        <button onClick={onEdit} className="w-9 h-9 -mr-1 -mt-1 rounded-full flex items-center justify-center text-[#A1A1AA] active:bg-[#F4F4F5]" aria-label={`編輯 ${c.name}`}>
          <Icon name="edit" className="text-[18px]" />
        </button>
      )}
    </div>
  );
}
