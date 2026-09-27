"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ProjectView } from "@/lib/project-ops";
import { Icon, SubScreen } from "./ui";
import { ProjectDossier } from "./ProjectDossier";
import { ProjectFormSheet } from "./ProjectEditor";
import { WorkItemsEditor } from "./WorkItemsEditor";
import { BillingSheet, DailyReportSheet, ItemQuickSheet, StageSheet } from "./QuickSheets";
import type { ProjectOps } from "./useProjectOps";

/** 專案細節裡可以開的編輯抽屜 */
export type EditTarget =
  | { kind: "form" }
  | { kind: "daily" }
  | { kind: "items" }
  | { kind: "stage" }
  | { kind: "billed" }
  | { kind: "collected" }
  | { kind: "item"; itemId: string };

/**
 * 專案細節（兩個主頁共用）：右側滑入的子頁＋底部操作列＋各種編輯抽屜。
 * 關閉時保留最後一個專案的內容，滑出動畫才不會先變成空白。
 */
export function DossierScreen({
  code,
  onOpenProject,
  onClose,
  ops,
  onOpenSetup,
}: {
  code: string | null;
  onOpenProject: (code: string) => void;
  onClose: () => void;
  ops: ProjectOps;
  onOpenSetup: () => void;
}) {
  const p = code ? ops.views.find((v) => v.code === code) : undefined;
  const last = useRef<ProjectView | undefined>(p);
  if (p) last.current = p;
  const shown = p ?? last.current;
  const [edit, setEdit] = useState<EditTarget | null>(null);
  // 抽屜關閉動畫期間仍要知道是哪一個工項
  const lastItem = useRef<string | null>(null);
  if (edit?.kind === "item") lastItem.current = edit.itemId;

  // 換專案或關閉子頁時，收起所有抽屜
  useEffect(() => setEdit(null), [code]);

  const hasOps = !!shown?.ops;
  const close = () => setEdit(null);

  return (
    <>
      <SubScreen
        open={!!p}
        title={shown ? shown.name : ""}
        subtitle={shown ? `${shown.code}　·　${shown.company}${ops.demo ? "　·　示範資料" : ""}` : undefined}
        onClose={onClose}
        scrollKey={code ?? ""}
        headerAction={
          shown ? (
            <button
              onClick={() => setEdit({ kind: "form" })}
              className="h-11 px-3 rounded-full text-[15px] font-semibold text-[#18181B] active:bg-[#F4F4F5]"
            >
              {hasOps ? "編輯" : "建立"}
            </button>
          ) : undefined
        }
        bottomBar={
          shown ? (
            hasOps ? (
              <div className="grid grid-cols-3 gap-2">
                <BarButton primary icon="edit_calendar" label="今日回報" onClick={() => setEdit({ kind: "daily" })} />
                <BarButton icon="view_timeline" label="工項排程" onClick={() => setEdit({ kind: "items" })} />
                <BarButton icon="edit" label="編輯資料" onClick={() => setEdit({ kind: "form" })} />
              </div>
            ) : (
              <BarButton primary wide icon="add" label="建立工程資料" onClick={() => setEdit({ kind: "form" })} />
            )
          ) : undefined
        }
      >
        {shown && (
          <ProjectDossier
            key={shown.code}
            p={shown}
            ops={ops}
            onOpenProject={onOpenProject}
            onOpenSetup={onOpenSetup}
            onEdit={setEdit}
          />
        )}
      </SubScreen>

      {shown && (
        <>
          <ProjectFormSheet p={shown} ops={ops} open={edit?.kind === "form"} onClose={close} />
          <DailyReportSheet p={shown} ops={ops} open={edit?.kind === "daily"} onClose={close} />
          <WorkItemsEditor p={shown} ops={ops} open={edit?.kind === "items"} onClose={close} />
          <StageSheet p={shown} ops={ops} open={edit?.kind === "stage"} onClose={close} />
          <BillingSheet p={shown} ops={ops} mode="billed" open={edit?.kind === "billed"} onClose={close} />
          <BillingSheet p={shown} ops={ops} mode="collected" open={edit?.kind === "collected"} onClose={close} />
          <ItemQuickSheet
            p={shown}
            ops={ops}
            itemId={edit?.kind === "item" ? edit.itemId : lastItem.current}
            open={edit?.kind === "item"}
            onClose={close}
          />
        </>
      )}
    </>
  );
}

function BarButton({
  icon,
  label,
  onClick,
  primary,
  wide,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  primary?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-[52px] rounded-[14px] flex items-center justify-center gap-1.5 text-[14px] font-semibold transition-colors ${
        wide ? "w-full" : ""
      } ${primary ? "bg-[#18181B] text-white active:opacity-85" : "bg-[#F4F4F5] text-[#18181B] active:bg-[#E4E4E7]"}`}
    >
      <Icon name={icon} weight={300} className="text-[20px]" />
      {label}
    </button>
  );
}
