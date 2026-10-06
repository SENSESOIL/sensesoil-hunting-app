"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import type { FlowRole } from "@/lib/flow-role";

/* ══════════════════════════════════════════════════════════
   指揮中心 →「流程」分頁
   每一張流程圖一張卡片（像定位定崗的組織圖、職務說明）；點開是滿版的流程圖頁（iframe）。
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

/** 依流程名稱挑一個圖示，之後新增的流程也有合適的圖 */
function iconFor(title: string): string {
  if (/專案|工程|施工/.test(title)) return "account_tree";
  if (/請款|財務|報帳|收款/.test(title)) return "payments";
  if (/採購|廠商|材料/.test(title)) return "inventory_2";
  if (/招募|人事|入職|離職/.test(title)) return "badge";
  if (/行銷|業務|客戶/.test(title)) return "campaign";
  return "schema";
}

export default function WorkflowCharts({ flowRole }: { flowRole: FlowRole }) {
  const { data, isLoading } = useSWR<{ flows: FlowEntry[] }>("/api/workflow-chart/list", fetcher, {
    revalidateOnFocus: true,
  });
  const flows = data?.flows ?? [];
  const [open, setOpen] = useState<FlowEntry | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {flows.map((f) => (
          <button
            key={f.id}
            onClick={() => setOpen(f)}
            className="group bg-[#FFFFFF] rounded-[18px] border border-[#E4E4E7]/60 shadow-[0_2px_10px_rgba(0,0,0,0.03)] p-4 h-[116px] flex flex-col justify-between text-left active:scale-[0.98] transition-transform outline-none"
          >
            <div className="text-[#A1A1AA]">
              <span
                className="material-symbols-outlined text-[28px] group-active:text-[#F39C12] transition-colors"
                style={{ fontVariationSettings: "'wght' 200" }}
              >
                {iconFor(f.title)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-[#18181B] truncate">{f.title}</p>
              <p className="text-[11px] text-[#A1A1AA] mt-0.5 truncate">{f.en ? f.en.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "流程圖"}</p>
            </div>
          </button>
        ))}
        {isLoading && !flows.length && (
          <div className="bg-[#FFFFFF] rounded-[18px] border border-[#E4E4E7]/60 h-[116px] animate-pulse" />
        )}
      </div>

      <FlowViewer flow={open} flowRole={flowRole} onClose={() => setOpen(null)} />
    </>
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
  const src = shown ? `${FLOW_ORIGIN}/?flow=${encodeURIComponent(shown.id)}` : "";

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] bg-[#141519] flex flex-col overflow-hidden overscroll-none transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
      }`}
      aria-hidden={!isOpen}
      role="dialog"
      aria-label={shown?.title ?? "流程圖"}
    >
      {/* 細標題列：返回＋流程名稱（流程圖頁左上是自己的 logo，返回鍵不疊在上面） */}
      <div className="shrink-0 flex items-center gap-1 px-2 bg-[#141519] border-b border-white/10" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <button onClick={onClose} aria-label="關閉流程圖，返回指揮中心" className="w-11 h-11 flex items-center justify-center rounded-full active:bg-white/10">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="#D4D4D8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <p className="flex-1 min-w-0 text-[15px] font-semibold text-[#F4F4F5] truncate">{shown?.title ?? ""}</p>
        <div className="w-11" />
      </div>

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
          <span className="material-symbols-outlined text-[28px] text-[#F39C12] animate-spin">progress_activity</span>
          <span className="text-[13px] text-[#A1A1AA]">流程圖載入中…</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
