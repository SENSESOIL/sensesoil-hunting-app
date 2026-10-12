"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import type { FlowRole } from "@/lib/flow-role";

/* ══════════════════════════════════════════════════════════
   指揮中心 → 營運 →「流程」
   每一張流程圖一排（與「制度」同樣的清單樣式）（專案管理流程，之後新增的也自動列在這裡）；點開是滿版的流程圖頁（iframe）。
   流程圖本身在獨立網站 https://sensesoil-workflow-chart.vercel.app（Claude Design 產出），
   APP 只負責：列出有哪些流程、把使用者角色交給它、代它存檔。
   規格：Sensesoil_Workflow_chart/Workflow-Chart_APP串接規格.md
   ══════════════════════════════════════════════════════════ */

export const FLOW_ORIGIN = "https://sensesoil-workflow-chart.vercel.app";

interface FlowEntry {
  id: string;
  title: string;
  en?: string;
}

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : { flows: [] }));

/** 流程圖目錄（營運 →「流程」的項目數與清單共用同一份快取） */
export function useFlows(enabled = true): FlowEntry[] {
  const { data } = useSWR<{ flows: FlowEntry[] }>(enabled ? "/api/workflow-chart/list" : null, fetcher, { revalidateOnFocus: true });
  return data?.flows ?? [];
}

export default function WorkflowCharts({ flowRole }: { flowRole: FlowRole }) {
  const { data, isLoading } = useSWR<{ flows: FlowEntry[] }>("/api/workflow-chart/list", fetcher, {
    revalidateOnFocus: true,
  });
  const flows = data?.flows ?? [];
  const [open, setOpen] = useState<FlowEntry | null>(null);

  return (
    <>
      <div className="flex flex-col gap-5">
        {flows.map((f) => (
          <button
            key={f.id}
            onClick={() => setOpen(f)}
            className="bg-[#FFFFFF] rounded-[18px] shadow-card overflow-hidden w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-[#F4F4F5] transition-colors outline-none"
          >
            <p className="flex-1 min-w-0 text-[15px] font-medium text-[#18181B] truncate">
              {f.title}
              {f.en && <span className="ml-2 text-[12px] font-normal text-[#A1A1AA] tracking-wide">{f.en.toUpperCase()}</span>}
            </p>
            <span className="material-symbols-outlined text-[20px] text-[#D4D4D8]" style={{ fontVariationSettings: "'wght' 200" }}>
              chevron_right
            </span>
          </button>
        ))}
        {isLoading && !flows.length && <div className="h-[52px] rounded-[18px] bg-[#FFFFFF] border border-[#E4E4E7]/60 animate-pulse" />}
      </div>

      <OverviewPreview />

      <FlowViewer flow={open} flowRole={flowRole} onClose={() => setOpen(null)} />
    </>
  );
}

/* ── 流程總覽（Archify 產生的靜態圖，測試中） ─────────────────
   專案管理流程 47 步濃縮成 5 個階段 × 6 個關鍵步驟，決策關卡與退回路徑保留。
   檔案在 public/flows/pm-overview.html（Archify 產生、自含，不連外部資源）。
   清單裡的「專案管理流程」仍是可編輯的完整版；這張是給人一眼看懂的總覽。 */

const OVERVIEW_SRC = "/flows/pm-overview.html";

function OverviewPreview() {
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [full]);

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between px-1 pb-2">
        <h3 className="text-[14px] font-semibold text-[#52525B] flex items-center gap-2">
          專案管理流程總覽
          <span className="h-5 px-2 rounded-full text-[11px] leading-5 font-medium bg-[var(--accent-soft)] text-[var(--accent-ink)]">測試</span>
        </h3>
        <button
          type="button"
          onClick={() => setFull(true)}
          className="h-8 px-3 rounded-full text-[13px] font-medium text-[#52525B] bg-white shadow-card inline-flex items-center gap-1 active:bg-[#F4F4F5]"
        >
          <span className="material-symbols-outlined text-[16px]">open_in_full</span>
          全螢幕
        </button>
      </div>
      <div className="rounded-[18px] overflow-hidden shadow-card bg-[#0B0F17]">
        <iframe src={OVERVIEW_SRC} title="專案管理流程總覽" loading="lazy" className="block w-full h-[440px] md:h-[620px] border-none" />
      </div>

      {full &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-[#0B0F17] flex flex-col" role="dialog" aria-label="專案管理流程總覽">
            <iframe src={OVERVIEW_SRC} title="專案管理流程總覽（全螢幕）" className="flex-1 w-full border-none" />
            <button
              type="button"
              onClick={() => setFull(false)}
              aria-label="關閉總覽"
              className="group absolute z-10 bottom-3 left-3 w-11 h-11 flex items-center justify-center bg-transparent border-none p-0 outline-none"
              style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
            >
              <span className="absolute w-9 h-9 rounded-full bg-[rgba(22,24,29,0.95)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-colors group-active:bg-[#27272A]" />
              <svg viewBox="0 0 24 24" className="relative w-3.5 h-3.5" fill="none" stroke="#B9BEC9" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
          </div>,
          document.body
        )}
    </section>
  );
}

/* ── 滿版流程圖（跨網域 iframe）＋ postMessage 橋接 ───────────── */

function FlowViewer({ flow, flowRole, onClose }: { flow: FlowEntry | null; flowRole: FlowRole; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [mounted, setMounted] = useState(false); // iframe 是否掛載（滑入後才掛，滑出後卸載）
  const [loaded, setLoaded] = useState(false);
  const [shown, setShown] = useState<FlowEntry | null>(null);
  const isOpen = !!flow;

  useEffect(() => {
    if (flow) setShown(flow);
  }, [flow]);

  // 開啟：鎖住底層捲動、狀態列變深色；滑入動畫結束才掛 iframe
  useEffect(() => {
    if (!isOpen) {
      const t = window.setTimeout(() => {
        setMounted(false);
        setLoaded(false);
      }, 320);
      return () => window.clearTimeout(t);
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    const originalTheme = meta?.getAttribute("content") ?? null;
    meta?.setAttribute("content", "#141519");
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    const t = window.setTimeout(() => setMounted(true), 300);
    return () => {
      window.clearTimeout(t);
      Object.assign(body.style, prev);
      window.scrollTo(0, scrollY);
      if (meta && originalTheme) meta.setAttribute("content", originalTheme);
    };
  }, [isOpen]);

  // Esc 關閉
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // 身分與存檔：流程圖頁先送 ssf-auth-request，APP 回 ssf-auth；存檔走 /api/workflow-chart/save（伺服器端寫入）
  useEffect(() => {
    if (!mounted) return;
    const post = (msg: Record<string, unknown>) => frame.current?.contentWindow?.postMessage(msg, FLOW_ORIGIN);
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== FLOW_ORIGIN) return; // 只信任流程圖那個來源
      const m = e.data as { type?: string; requestId?: string; id?: string; payload?: unknown };
      if (!m || typeof m.type !== "string") return;
      if (m.type === "ssf-auth-request") {
        post({ type: "ssf-auth", flowRole });
        return;
      }
      if (m.type === "ssf-save") {
        try {
          const res = await fetch("/api/workflow-chart/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: m.id, payload: m.payload }),
          });
          const body = await res.json().catch(() => ({}));
          post({ type: "ssf-save-result", requestId: m.requestId, status: res.status, ...body, ok: res.ok && body?.ok === true });
        } catch {
          post({ type: "ssf-save-result", requestId: m.requestId, ok: false, error: "網路錯誤" });
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [mounted, flowRole]);

  if (typeof document === "undefined") return null;
  // role 也放進網址當備援：流程圖頁若沒認出自己嵌在 APP 裡，會改用網址參數（預設是 editor）。
  // 這只影響畫面上能不能按；真正能不能寫入由 /api/workflow-chart/save 依權限表把關。
  const src = shown ? `${FLOW_ORIGIN}/?flow=${encodeURIComponent(shown.id)}&role=${flowRole}` : "";

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] bg-[#141519] flex flex-col overflow-hidden overscroll-none transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
      }`}
      aria-hidden={!isOpen}
      role="dialog"
      aria-label={shown?.title ?? "流程圖"}
    >
      <div className="relative flex-1 min-h-0">
        {mounted && shown && (
          <iframe
            ref={frame}
            key={shown.id}
            src={src}
            title={shown.title}
            className="absolute inset-0 w-full h-full border-none bg-[#141519]"
            onLoad={() => window.setTimeout(() => setLoaded(true), 500)}
            allowFullScreen
          />
        )}
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#141519] transition-opacity duration-500 ${
            loaded ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <span className="material-symbols-outlined text-[28px] text-[var(--accent)] animate-spin">progress_activity</span>
          <span className="text-[13px] text-[#A1A1AA]">流程圖載入中…</span>
        </div>

        {/* 懸浮返回鍵：與組織架構圖（hunting-mgmt 的「返回指揮中心」）同尺寸、同位置 ——
            觸控區 44px，可見圓形 36px，落在距左上 16px 的基準線 */}
        <button
          onClick={onClose}
          aria-label="關閉流程圖"
          className="group absolute z-30 top-3 left-3 w-11 h-11 flex items-center justify-center bg-transparent border-none p-0 outline-none"
        >
          <span className="absolute w-9 h-9 rounded-full bg-[rgba(22,24,29,0.95)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-colors group-active:bg-[#27272A]" />
          <svg viewBox="0 0 24 24" className="relative w-3.5 h-3.5" fill="none" stroke="#B9BEC9" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      </div>
    </div>,
    document.body
  );
}
