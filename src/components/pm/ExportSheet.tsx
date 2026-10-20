"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as htmlToImage from "html-to-image";
import { tourEmit } from "./tour/bus";
import type { Task } from "@/lib/pm/model";
import { Sheet, toast } from "./Sheet";
import { FieldGroup } from "./fields";
import { Icon } from "./ui";
import { Spinner } from "./kit";
import type { Pm } from "./usePm";
import { buildOutline, deliver, fileName, listText, toCsv, toIcs, toMspXml, type ExportView } from "./export";
import { drawBoard, drawList, loadLogo, resolveColor, toPng } from "./export-image";
import { LOGO, TaskGantt } from "./TaskGantt";

/* ══════════════════════════════════════════════════════════
   匯出抽屜：依目前的檢視給適合的格式
   - 清單：圖片、文字（分組、一行一項資料）、試算表
   - 看板：圖片、試算表
   - 甘特圖：圖片、Microsoft Project、試算表、行事曆；可選要不要包含「預定工期」
   圖片都是同一套外框：專案名稱＋右上拾壤 logo、白色圓角卡片、右下匯出日期
   - 甘特圖：把畫面上同一個甘特圖在看不到的地方整張攤開（不捲動）再拍成圖片，和螢幕上長得一樣
   - 清單、看板：用 canvas 畫
   打開時先把圖片做好（預覽＋按下去立刻能分享，iPhone 的分享要在點擊當下叫出來）
   ══════════════════════════════════════════════════════════ */

const VIEW_LABEL: Record<ExportView, string> = { list: "清單", board: "看板", gantt: "甘特圖" };

export function ExportSheet({
  pm,
  code,
  view,
  tasks,
  color,
  showDone,
  open,
  onClose,
}: {
  pm: Pm;
  code: string;
  view: ExportView;
  /** 這個專案的任務（含已完成，要不要放進去由「包含已完成」決定） */
  tasks: Task[];
  color: string;
  showDone: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const [withDone, setWithDone] = useState(showDone);
  // 甘特圖：要不要畫最上面的「預定工期」列（和預計完工的虛線）
  const [withProject, setWithProject] = useState(true);
  const offscreen = useRef<HTMLDivElement>(null);
  // 打開那一刻的資料：匯出中背景自動更新不會一直重畫圖片
  const [snap, setSnap] = useState<{ pm: Pm; tasks: Task[] } | null>(null);
  useEffect(() => {
    if (!open) return setSnap(null);
    // 看板本來就有「完成」欄：預設包含已完成；清單、甘特圖跟著畫面上的「顯示已完成」
    setWithDone(view === "board" || showDone);
    setSnap({ pm, tasks });
    tourEmit("export-open", view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const outline = useMemo(
    () => (snap ? buildOutline(snap.pm, code, withDone ? snap.tasks : snap.tasks.filter((t) => t.status !== "done")) : null),
    [snap, code, withDone]
  );
  const text = useMemo(() => (outline && view === "list" ? listText(outline) : ""), [outline, view]);
  const exportTasks = useMemo(() => (snap ? (withDone ? snap.tasks : snap.tasks.filter((t) => t.status !== "done")) : []), [snap, withDone]);

  // 圖片：打開或內容變了就重畫
  const [img, setImg] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!outline) return;
    let gone = false;
    let url = "";
    setImg(null);
    const t = setTimeout(async () => {
      try {
        let blob: Blob | null;
        if (view === "gantt") {
          // 甘特圖量完寬度會再畫一次：等它穩定再拍；iPhone 第一次常常拍到空白，拍兩次
          const node = offscreen.current?.firstElementChild as HTMLElement | null;
          if (!node) throw new Error("no node");
          const opt = { pixelRatio: 2, backgroundColor: "#FAFAFA", skipFonts: true, cacheBust: true };
          await htmlToImage.toBlob(node, opt);
          blob = await htmlToImage.toBlob(node, opt);
          if (!blob) throw new Error("empty");
        } else {
          const c = resolveColor(color);
          const logo = await loadLogo(LOGO);
          blob = await toPng(view === "board" ? drawBoard(outline, c, logo) : drawList(outline, c, logo));
        }
        if (gone) return;
        url = URL.createObjectURL(blob);
        setImg({ blob, url });
      } catch {
        if (!gone) toast("圖片產生失敗", { tone: "error" });
      }
    }, view === "gantt" ? 500 : 60);
    return () => {
      gone = true;
      clearTimeout(t);
      if (url) URL.revokeObjectURL(url);
    };
  }, [outline, view, color, withProject]);

  if (!outline) return <Sheet open={false} title="匯出" onClose={onClose}>{null}</Sheet>;
  const o = outline;
  const kind = view === "gantt" ? "甘特圖" : view === "board" ? "看板" : "任務清單";

  const save = async (blob: Blob, name: string) => {
    const r = await deliver(blob, name);
    if (r === "downloaded") toast(`已下載 ${name}`);
  };
  // 按下去才產生檔案（不在每次重繪時算）
  const file = (make: () => string, type: string, ext: string, label: string) => () => save(new Blob([make()], { type }), fileName(o, label, ext));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast("已複製文字，可以貼到 LINE 或 Email");
    } catch {
      toast("沒辦法複製，請改用「分享文字」", { tone: "error" });
    }
  };
  const shareText = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    copy();
  };

  const files: { icon: string; title: string; desc: string; run: () => void }[] =
    view === "gantt"
      ? [
          {
            icon: "account_tree",
            title: "Microsoft Project（.xml）",
            desc: "MS Project、ProjectLibre、GanttProject 都能開，含分組、子任務、前後任務與負責人",
            run: file(() => toMspXml(o), "application/xml", "xml", "排程"),
          },
          { icon: "table_view", title: "試算表（.csv）", desc: "Excel、Google 試算表、Smartsheet、Asana 匯入", run: file(() => toCsv(o), "text/csv", "csv", "排程") },
          { icon: "event", title: "行事曆（.ics）", desc: "有日期的任務加入 Google／Apple 行事曆", run: file(() => toIcs(o), "text/calendar", "ics", "行事曆") },
        ]
      : [{ icon: "table_view", title: "試算表（.csv）", desc: "Excel、Google 試算表打開，每個任務一列", run: file(() => toCsv(o), "text/csv", "csv", kind) }];

  return (
    <Sheet open={open} title="匯出" subtitle={`${o.name}・${VIEW_LABEL[view]}`} onClose={onClose}>
      <div className="pb-8">
        {/* 圖片 */}
        <FieldGroup title="圖片">
          <div className="p-3">
            <div className="rounded-[12px] bg-[#F4F4F5] overflow-hidden flex items-center justify-center min-h-[140px] max-h-[300px]">
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.url} alt={`${kind}預覽`} className="max-h-[300px] w-full object-contain object-top" />
              ) : (
                <Spinner size={20} />
              )}
            </div>
            <button
              type="button"
              disabled={!img}
              onClick={() => img && save(img.blob, fileName(o, kind, "png"))}
              className="mt-3 w-full h-12 rounded-[14px] bg-[#18181B] text-white text-[16px] font-semibold inline-flex items-center justify-center gap-2 active:opacity-85 disabled:opacity-40"
            >
              <Icon name="image" weight={300} className="text-[20px]" />
              存成圖片
            </button>
            <p className="mt-2 text-[12px] text-[#A1A1AA] text-center">
              {view === "gantt" ? "和畫面上的甘特圖一樣，整段日期都畫進去" : view === "board" ? "待辦、進行中、完成三欄" : "整份清單，含分組與子任務"}
            </p>
          </div>
        </FieldGroup>

        {/* 文字：只有清單（看板、甘特圖看圖片就好） */}
        {view === "list" && (
        <FieldGroup title="文字" hint="貼到 LINE、Email 也排得整齊：分組、日期、負責人、標籤一行一行分開。">
          <div className="p-3">
            <pre className="max-h-[220px] overflow-auto overscroll-contain rounded-[12px] bg-[#F7F7F8] px-3.5 py-3 text-[13px] leading-[1.6] text-[#3F3F46] whitespace-pre-wrap break-words font-sans">{text}</pre>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={copy} className="h-11 rounded-[12px] bg-[#F2F2F4] text-[15px] font-semibold text-[#18181B] inline-flex items-center justify-center gap-1.5 active:bg-[#E4E4E7]">
                <Icon name="content_copy" weight={300} className="text-[18px]" />
                複製文字
              </button>
              <button type="button" onClick={shareText} className="h-11 rounded-[12px] bg-[#F2F2F4] text-[15px] font-semibold text-[#18181B] inline-flex items-center justify-center gap-1.5 active:bg-[#E4E4E7]">
                <Icon name="ios_share" weight={300} className="text-[18px]" />
                分享文字
              </button>
            </div>
          </div>
        </FieldGroup>
        )}

        {/* 檔案 */}
        <FieldGroup title={view === "gantt" ? "排程軟體" : "檔案"}>
          {files.map((f) => (
            <button key={f.title} type="button" onClick={f.run} className="w-full px-4 py-3 flex items-center gap-3 text-left active:bg-[#F7F7F8]">
              <span className="w-9 h-9 rounded-[10px] bg-[#F2F2F4] flex items-center justify-center shrink-0 text-[#52525B]">
                <Icon name={f.icon} weight={300} className="text-[20px]" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-[#18181B]">{f.title}</span>
                <span className="block text-[12.5px] leading-snug text-[#8E8E93]">{f.desc}</span>
              </span>
              <Icon name="download" weight={300} className="text-[20px] text-[#A1A1AA]" />
            </button>
          ))}
        </FieldGroup>

        {/* 範圍 */}
        <FieldGroup>
          {view === "gantt" && <Switch on={withProject} onChange={setWithProject} label="包含預定工期" />}
          <Switch on={withDone} onChange={setWithDone} label="包含已完成的任務" />
        </FieldGroup>
      </div>
      {/* 甘特圖匯出：在畫面外整張攤開，拍成圖片 */}
      {view === "gantt" &&
        createPortal(
          <div ref={offscreen} aria-hidden style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none" }}>
            <TaskGantt pm={snap!.pm} tasks={exportTasks} onOpen={() => {}} project={code} exportFrame={{ title: o.name, color: resolveColor(color), includeProject: withProject }} />
          </div>,
          document.body
        )}
    </Sheet>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="w-full px-4 h-12 flex items-center gap-3 text-left">
      <span className="flex-1 text-[15px] text-[#18181B]">{label}</span>
      <span className={`w-[46px] h-[28px] rounded-full p-[2px] transition-colors ${on ? "bg-[#30A46C]" : "bg-[#E4E4E7]"}`}>
        <span className={`block w-6 h-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : ""}`} />
      </span>
    </button>
  );
}
