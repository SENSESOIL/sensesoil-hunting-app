"use client";

import React, { useState } from "react";
import { deriveProject, type Health, type OpsRecord, type ProjectView, type WorkItem } from "@/lib/project-ops";
import { toast } from "./Sheet";
import { HealthBadge, Icon } from "./ui";
import type { ProjectOps } from "./useProjectOps";

/**
 * 所有編輯的共用儲存流程：
 *   1. 存檔前先記下原狀（專案欄位＋工項）
 *   2. 存檔（本機試編或雲端）
 *   3. 提示訊息＋「復原」：一步回到原狀（連工項一起）
 * 用詞刻意區分：本機試編說「已存到本機」，雲端才說「已儲存」。
 */
export function useCommit(ops: ProjectOps) {
  const [saving, setSaving] = useState(false);

  const commit = async (
    code: string,
    rec: OpsRecord | undefined,
    items: WorkItem[] | undefined,
    what: string,
    extra?: string
  ): Promise<boolean> => {
    const before = ops.snapshot(code);
    const wasDrafted = ops.isDrafted(code);
    setSaving(true);
    const res = await ops.saveProject(code, rec, items);
    setSaving(false);
    if (!res.ok) {
      toast(res.conflict ? "別人剛改過這筆資料，已重新載入，請再改一次" : res.error || "儲存失敗", { tone: "error" });
      if (res.conflict) ops.refresh();
      return false;
    }
    const where = ops.saveMode === "sandbox" ? "已存到本機" : "已儲存";
    toast(`${what}${where}${extra ? `　·　${extra}` : ""}`, {
      action: {
        label: "復原",
        run: async () => {
          let ok = true;
          if (ops.saveMode === "sandbox" && !wasDrafted) {
            // 原本沒有試編紀錄：直接丟掉，回到底稿
            ops.resetProject(code);
          } else if (before.rec || before.items.length) {
            ok = (await ops.saveProject(code, before.rec, before.items)).ok;
          }
          toast(ok ? "已復原" : "復原失敗", { tone: ok ? "ok" : "error" });
        },
      },
    });
    return true;
  };

  return { saving, commit };
}

/** 用畫面同一套推導函式，算出「存檔後」的健康度 */
export function previewHealth(
  p: ProjectView,
  rec: OpsRecord | undefined,
  items: WorkItem[],
  today: string
): { health: Health; reason?: string } {
  const v = deriveProject(
    { code: p.code, seq: p.seq, company: p.company, name: p.name },
    rec,
    items,
    today,
    new Map(),
    new Map()
  );
  return { health: v.health, reason: v.reason };
}

/** 存檔後的結果：健康度有變化時才顯示 */
export function Consequence({ before, after }: { before: Health; after: { health: Health; reason?: string } }) {
  if (before === after.health) return null;
  return (
    <div className="mx-4 mt-4 rounded-[14px] bg-white border border-[#E4E4E7]/70 px-4 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12.5px] font-semibold text-[#52525B]">儲存後</span>
        <HealthBadge health={before} compact />
        <Icon name="arrow_forward" className="text-[16px] text-[#A1A1AA]" />
        <HealthBadge health={after.health} compact />
      </div>
      {after.reason && <p className="text-[12px] text-[#71717A] mt-1.5 leading-snug">{after.reason}</p>}
    </div>
  );
}
