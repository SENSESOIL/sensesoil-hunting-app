"use client";

import React, { useMemo, useState } from "react";
import { useTeam } from "@/components/team/useTeam";
import { Spinner } from "./kit";
import { Icon } from "./ui";

/* ══════════════════════════════════════════════════════════
   廠商（協力廠商）：從拾壤CRM「廠商CRM」挑一家，存在任務的 meta.vendor（簡稱）
   名單和「指揮中心 → 團隊 → 協力廠商」同一份（/api/pm/team）
   工種和任務一樣的廠商排在前面
   ══════════════════════════════════════════════════════════ */

export interface VendorOption {
  name: string;
  full?: string;
  trade?: string;
  contact?: string;
  phone?: string;
}

export function useVendors(enabled = true): { vendors: VendorOption[]; loading: boolean; error?: string } {
  const { data, error, isLoading } = useTeam(enabled);
  const vendors = useMemo(
    () =>
      (data?.contacts ?? [])
        .filter((c) => c.kind === "vendor")
        .map((c) => ({ name: c.name, full: c.company, trade: c.title, contact: c.note, phone: c.phone })),
    [data?.contacts]
  );
  return { vendors, loading: isLoading && !data, error: error ? String(error.message ?? error) : undefined };
}

/** 一張可以搜尋的廠商清單；value＝目前的廠商簡稱 */
export function VendorList({
  value,
  trade,
  onPick,
  variant = "sheet",
}: {
  value?: string;
  /** 任務的工種：同工種的排前面 */
  trade?: string;
  onPick: (name: string | undefined) => void;
  /** sheet＝任務細節裡（白底卡片）；menu＝長按選單裡 */
  variant?: "sheet" | "menu";
}) {
  const { vendors, loading, error } = useVendors();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return vendors
      .filter((v) => !k || [v.name, v.full, v.trade, v.contact].some((x) => x?.toLowerCase().includes(k)))
      .sort((a, b) => Number(!!trade && b.trade?.includes(trade)) - Number(!!trade && a.trade?.includes(trade)) || (a.trade ?? "").localeCompare(b.trade ?? "") || a.name.localeCompare(b.name));
  }, [vendors, q, trade]);
  const menu = variant === "menu";
  const row = `w-full flex items-center gap-3 px-4 h-12 text-left ${menu ? "active:bg-[#EDEDF0]" : "active:bg-[#F2F2F4]"}`;

  return (
    <div className={menu ? "" : "bg-[#FAFAFA] px-3 py-2.5"}>
      <div className={`relative ${menu ? "px-3 py-2" : "mb-2"}`}>
        <Icon name="search" className={`absolute top-1/2 -translate-y-1/2 text-[18px] text-[#A1A1AA] ${menu ? "left-6" : "left-3"}`} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋廠商、工項、聯絡人"
          className="w-full h-10 rounded-[10px] bg-white border border-[#E4E4E7] pl-9 pr-3 text-[16px] text-[#18181B] outline-none focus:border-[var(--accent)]"
        />
      </div>
      <div className={menu ? "" : "max-h-[300px] overflow-y-auto overscroll-contain rounded-[10px] bg-white border border-[#EBEBED] divide-y divide-[#F2F2F4]"}>
        {value && (
          <button type="button" onClick={() => onPick(undefined)} className={row}>
            <Icon name="block" className="text-[20px] text-[#A1A1AA]" />
            <span className="flex-1 text-[16px] text-[#71717A]">不指定廠商</span>
          </button>
        )}
        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner size={18} />
          </div>
        ) : error ? (
          <p className="px-4 py-4 text-[13px] text-[#71717A]">讀不到協力廠商名單：{error}</p>
        ) : (
          list.map((v) => (
            <button key={v.name + (v.full ?? "")} type="button" onClick={() => onPick(v.name)} className={row}>
              <span className="flex-1 min-w-0">
                <span className="block text-[16px] text-[#18181B] truncate">{v.name}</span>
                {(v.trade || v.contact) && <span className="block text-[12px] text-[#8E8E93] truncate">{[v.trade, v.contact].filter(Boolean).join("・")}</span>}
              </span>
              {value === v.name && <Icon name="check" weight={600} className="text-[18px] text-[var(--accent)]" />}
            </button>
          ))
        )}
        {!loading && !error && !list.length && <p className="px-4 py-4 text-[13px] text-[#A1A1AA]">{q ? `找不到「${q}」` : "協力廠商名單是空的"}</p>}
      </div>
    </div>
  );
}
