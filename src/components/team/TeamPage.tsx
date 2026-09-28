"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cardBg, type Contact, type ContactKind, type TeamMember } from "@/lib/pm/model";
import { Icon } from "@/components/pm/ui";
import { Avatar, Empty, Group, ORANGE, Spinner } from "@/components/pm/kit";
import { MemberCard } from "./MemberCard";
import { PortraitSheet } from "./PortraitSheet";
import { ContactSheet } from "./ContactSheet";
import { cardUrl, useTeam } from "./useTeam";

/* ══════════════════════════════════════════════════════════
   指揮中心 → 團隊
   內部職員：員工卡牌橫向滑動（中間放大、兩側縮小變暗），每個人都穿公司制服
   外部職員／協力廠商／聯盟品牌：名片清單
   ══════════════════════════════════════════════════════════ */

const SEGMENTS: { key: "internal" | ContactKind; label: string }[] = [
  { key: "internal", label: "內部職員" },
  { key: "external", label: "外部職員" },
  { key: "vendor", label: "協力廠商" },
  { key: "brand", label: "聯盟品牌" },
];

/** 卡牌的觸控不要傳給指揮中心外層的「左右滑換分頁」 */
const stop = {
  onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
  onTouchMove: (e: React.TouchEvent) => e.stopPropagation(),
  onTouchEnd: (e: React.TouchEvent) => e.stopPropagation(),
};

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

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="團隊分類" className="grid grid-cols-4 p-[3px] rounded-[12px] bg-[#EEEEF0]">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={seg === s.key}
            onClick={() => setSeg(s.key)}
            className={`h-9 rounded-[9px] text-[13.5px] font-semibold whitespace-nowrap transition-all ${
              seg === s.key ? "bg-white text-[#18181B] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[#71717A]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {(!data.configured || data.dbError) && (
        <p className="rounded-[12px] px-3.5 py-3 text-[13px] leading-relaxed bg-[#FFF6E8] text-[#8A5A00]">
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

/* ── 內部職員：卡牌輪播 ─────────────────────────────────── */

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
  // 順序固定（權限表順序，管理者在前）；上傳照片後卡片不會跳位置
  const list = useMemo(() => [...members].sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999)), [members]);
  const scroller = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const [focus, setFocus] = useState(0);
  const [edit, setEdit] = useState<TeamMember | null>(null);
  const raf = useRef(0);

  // 依卡片離中心的距離：縮放、變暗、模糊（直接改 style，不經過 React 重繪）
  const paint = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestD = Infinity;
    cards.current.forEach((c, i) => {
      if (!c) return;
      const center = c.offsetLeft + c.offsetWidth / 2;
      const d = (center - mid) / c.offsetWidth; // 以卡寬為單位
      const t = Math.min(1, Math.abs(d));
      c.style.transform = `scale(${1 - 0.16 * t})`;
      c.style.opacity = String(1 - 0.5 * t);
      c.style.filter = t > 0.02 ? `blur(${(t * 2.2).toFixed(2)}px) brightness(${1 - 0.25 * t})` : "none";
      c.style.zIndex = String(100 - Math.round(t * 50));
      if (Math.abs(d) < bestD) {
        bestD = Math.abs(d);
        best = i;
      }
    });
    setFocus((f) => (f === best ? f : best));
  }, []);

  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(paint);
  };
  useLayoutEffect(() => {
    paint();
    const ro = new ResizeObserver(paint);
    if (scroller.current) ro.observe(scroller.current);
    return () => ro.disconnect();
    // 名單內容更新（例如剛換了照片）也要重算一次，否則「目前這一位」會停在舊的
  }, [paint, list]);

  // 一進來先停在自己的卡片
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current || !list.length) return;
    didInit.current = true;
    const i = list.findIndex((m) => m.email === me);
    if (i > 0) requestAnimationFrame(() => goTo(i, "auto"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  const goTo = (i: number, behavior: ScrollBehavior = "smooth") => {
    const el = scroller.current;
    const c = cards.current[i];
    if (!el || !c) return;
    const left = c.offsetLeft + c.offsetWidth / 2 - el.clientWidth / 2;
    el.scrollTo({ left, behavior });
    // 有些瀏覽器（省電模式、背景分頁）不跑平滑捲動：沒動就直接跳過去
    setTimeout(() => {
      if (Math.abs(el.scrollLeft - Math.max(0, Math.min(left, el.scrollWidth - el.clientWidth))) > 4) el.scrollLeft = left;
    }, 450);
  };

  if (!list.length) return <Empty icon="groups" title="權限表上還沒有人員" />;
  const cur = list[Math.min(focus, list.length - 1)];
  const [a, b] = cardBg(cur.cardBg, cur.email);
  const canEdit = canSave && (cur.email === me || isManager);
  const mine = list.find((m) => m.email === me);

  return (
    <>
      {mine && !mine.hasCard && canSave && (
        <button
          onClick={() => setEdit(mine)}
          className="rounded-[16px] px-4 py-3 flex items-center gap-3 text-left active:opacity-80"
          style={{ background: "#FFF6E8" }}
        >
          <Icon name="add_a_photo" weight={400} className="text-[24px] shrink-0" style={{ color: ORANGE }} />
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] font-semibold text-[#18181B]">上傳你的大頭照</span>
            <span className="block text-[12.5px] text-[#71717A]">自動去背、穿上公司制服；任務指派也會顯示你的照片</span>
          </span>
          <Icon name="chevron_right" className="text-[20px] text-[#C7C7CC]" />
        </button>
      )}

      <section className="relative rounded-[26px] bg-[#0E0E11] overflow-hidden pt-6 pb-5">
        {/* 背景光暈跟著目前的卡片換色 */}
        <div
          className="absolute inset-0 opacity-45 blur-3xl transition-[background] duration-500 pointer-events-none"
          style={{ background: `radial-gradient(40% 55% at 50% 42%, ${a}, transparent 70%), radial-gradient(30% 40% at 62% 55%, ${b}, transparent 70%)` }}
          aria-hidden
        />
        <div
          ref={scroller}
          onScroll={onScroll}
          {...stop}
          className="relative flex overflow-x-auto scrollbar-hide snap-x snap-mandatory py-4"
          style={{ paddingInline: "calc(50% - min(29vw, 115px))", scrollPaddingInline: "calc(50% - min(29vw, 115px))" }}
          aria-roledescription="輪播"
          aria-label="內部職員卡牌"
        >
          {list.map((m, i) => (
            <div
              key={m.email}
              ref={(el) => {
                cards.current[i] = el;
              }}
              className="snap-center shrink-0 w-[min(58vw,230px)] -mx-[3%] transition-[transform,opacity,filter] duration-150 ease-out will-change-transform"
              style={{ transformOrigin: "50% 60%" }}
            >
              <MemberCard member={m} src={cardUrl(m)} active={i === focus} onClick={() => (i === focus ? canSave && (m.email === me || isManager) && setEdit(m) : goTo(i))} />
            </div>
          ))}
        </div>

        {/* 目前這一位 */}
        <div className="relative px-5 text-center">
          {cur.bio && <p className="text-[13px] text-white/70 mt-1 line-clamp-2">{cur.bio}</p>}
          <div className="flex items-center justify-center gap-2 mt-3">
            {cur.phone && (
              <a href={`tel:${cur.phone.replace(/[^\d+]/g, "")}`} className="h-10 px-4 rounded-full bg-white/10 text-white text-[14px] font-medium inline-flex items-center gap-1.5 active:bg-white/20" {...stop}>
                <Icon name="call" weight={400} className="text-[18px]" />
                {cur.phone}
              </a>
            )}
            {canEdit && (
              <button onClick={() => setEdit(cur)} className="h-10 px-4 rounded-full bg-white text-[#18181B] text-[14px] font-semibold inline-flex items-center gap-1.5 active:opacity-85">
                <Icon name="photo_camera" weight={400} className="text-[18px]" />
                {cur.hasCard ? "更換照片" : "上傳照片"}
              </button>
            )}
          </div>
          {/* 位置點 */}
          <div className="flex justify-center gap-1.5 mt-4" aria-hidden>
            {list.map((m, i) => (
              <span key={m.email} className="h-1.5 rounded-full transition-all duration-300" style={{ width: i === focus ? 18 : 6, background: i === focus ? "#fff" : "rgba(255,255,255,0.28)" }} />
            ))}
          </div>
        </div>
      </section>

      {/* 全部成員：點頭像跳到那張卡 */}
      <Group className="p-3">
        <div className="grid grid-cols-5 sm:grid-cols-8 gap-y-3">
          {list.map((m, i) => (
            <button key={m.email} onClick={() => goTo(i)} className="flex flex-col items-center gap-1 min-w-0 active:scale-95 transition-transform">
              <span className="rounded-full p-[2px]" style={{ background: i === focus ? ORANGE : "transparent" }}>
                <span className="block rounded-full ring-2 ring-white">
                  <Avatar name={m.name} email={m.email} size={44} />
                </span>
              </span>
              <span className={`text-[12px] truncate max-w-full ${i === focus ? "font-bold text-[#18181B]" : "text-[#52525B]"}`}>{m.name}</span>
            </button>
          ))}
        </div>
      </Group>

      <PortraitSheet member={edit} open={!!edit} onClose={() => setEdit(null)} onSaved={onChanged} />
    </>
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
  const tel = (p?: string) => p?.replace(/[^\d+]/g, "");
  return (
    <div className="bg-white rounded-[16px] border border-[#EBEBED] p-3.5 flex items-start gap-3">
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
