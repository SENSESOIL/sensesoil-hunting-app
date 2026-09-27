"use client";

import React from "react";
import { Icon } from "./ui";
import { ORANGE, RED } from "./kit";
import { PushCard } from "./Notifications";
import type { Pm } from "./usePm";

/**
 * 資料庫還沒設定／讀取失敗時的說明（管理者看得到步驟，其他人只看到「尚未開放」）。
 * 設定好之後，這裡只剩「開啟手機通知」的提示（沒開的裝置才出現）。
 */
export function SetupNotice({ pm }: { pm: Pm }) {
  const d = pm.data;
  if (!d) return null;
  if (d.configured && !d.dbError) return <PushCard compact />;

  if (!pm.isManager) {
    return (
      <div className="rounded-[14px] bg-white border border-[#EBEBED] px-4 py-4 flex gap-3">
        <Icon name="construction" weight={300} className="text-[24px] text-[#A1A1AA] shrink-0" />
        <div>
          <p className="text-[15px] font-semibold text-[#18181B]">任務功能準備中</p>
          <p className="text-[13px] text-[#71717A] mt-0.5">管理者完成設定後，指派給你的任務會出現在這裡。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[14px] bg-white border px-4 py-4" style={{ borderColor: d.dbError ? `${RED}55` : `${ORANGE}66` }}>
      <div className="flex gap-3">
        <Icon name={d.dbError ? "error" : "database"} weight={400} className="text-[24px] shrink-0" style={{ color: d.dbError ? RED : ORANGE }} />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-[#18181B]">{d.dbError ? "資料庫連線有問題" : "還差一步：接上 Supabase 資料庫"}</p>
          {d.dbError && <p className="text-[13px] mt-0.5" style={{ color: RED }}>{d.dbError}</p>}
          <ol className="text-[13px] text-[#52525B] mt-2 leading-relaxed list-decimal pl-4 flex flex-col gap-1">
            <li>
              Supabase（APP 自己的專案，裡面有 hunting_tasks）→ SQL Editor → 貼上
              <code className="mx-1 px-1 rounded bg-[#F4F4F5] text-[12px]">supabase/migrations/20260928000000_pm_schema.sql</code>→ Run
            </li>
            <li>Project Settings → API Keys → 建一把 Secret key（sb_secret_ 開頭）</li>
            <li>
              Vercel → Settings → Environment Variables 加上 <code className="px-1 rounded bg-[#F4F4F5] text-[12px]">SUPABASE_SECRET_KEY</code>，再 Redeploy
            </li>
          </ol>
          <p className="text-[12px] text-[#A1A1AA] mt-2">完整說明：docs/工程管理資料架構.md</p>
        </div>
      </div>
    </div>
  );
}
