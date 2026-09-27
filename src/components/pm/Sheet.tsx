"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./ui";

/* ══════════════════════════════════════════════════════════
   底部抽屜：手機從下方滑出，桌機是置中的對話框。
   - 有未儲存的變更時，點背景／按關閉／Esc 都不會直接丟掉，先在抽屜內確認
   - 底部按鈕列固定、加上安全區域，拇指搆得到，也不會被 Home 指示條擋住
   - 疊在專案細節（z-120）之上
   ══════════════════════════════════════════════════════════ */

export function Sheet({
  open,
  title,
  subtitle,
  onClose,
  dirty = false,
  footer,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** 有未儲存的變更：關閉前要確認 */
  dirty?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** 桌機時用較寬的版面（工項清單） */
  wide?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  // iOS 鍵盤彈出時不會縮小版面，固定在底部的抽屜會被蓋住：
  // 依 visualViewport 算出鍵盤高度，把抽屜往上推、高度也縮到可視範圍內
  const [kb, setKb] = useState({ inset: 0, height: 0 });

  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKb((cur) =>
        Math.abs(cur.inset - inset) < 1 && Math.abs(cur.height - vv.height) < 1 ? cur : { inset, height: vv.height }
      );
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open]);

  // 有未儲存的修改時告訴版本守衛先別重新載入（見 VersionGuard）。
  // 用計數而不是布林：抽屜可能疊兩層，內層關閉不該清掉外層的狀態。
  useEffect(() => {
    if (!open || !dirty) return;
    const w = window as { __ssUnsavedEdits?: number };
    w.__ssUnsavedEdits = (w.__ssUnsavedEdits ?? 0) + 1;
    return () => {
      w.__ssUnsavedEdits = Math.max(0, (w.__ssUnsavedEdits ?? 1) - 1);
    };
  }, [open, dirty]);

  // 輸入框取得焦點時捲到可視範圍中間（鍵盤動畫結束後）
  useEffect(() => {
    if (!open) return;
    const el = panel.current;
    if (!el) return;
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (!t.matches("input, textarea, select")) return;
      setTimeout(() => t.scrollIntoView({ block: "center", behavior: "smooth" }), 280);
    };
    el.addEventListener("focusin", onFocus);
    return () => el.removeEventListener("focusin", onFocus);
  }, [open, mounted]);

  // 進場／退場動畫：先掛載再滑入；滑出結束再卸載
  useEffect(() => {
    if (open) {
      setMounted(true);
      setConfirming(false);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 280);
    return () => clearTimeout(t);
  }, [open]);

  const tryClose = useCallback(() => {
    if (dirty) setConfirming(true);
    else onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        tryClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, tryClose]);

  // 開啟時把焦點移進抽屜（鍵盤與螢幕報讀器使用者）
  useEffect(() => {
    if (shown) panel.current?.focus({ preventScroll: true });
  }, [shown]);

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end md:items-center justify-center font-sans"
      role="presentation"
      style={kb.inset > 0 ? { bottom: kb.inset, top: "auto", height: kb.height } : undefined}
    >
      <div
        className={`absolute inset-0 bg-black/35 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`}
        onClick={tryClose}
        aria-hidden
      />
      <div
        ref={panel}
        tabIndex={-1}
        data-pm-sheet="open"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${wide ? "md:max-w-[680px]" : "md:max-w-[520px]"} bg-[#FAFAFA] text-[#18181B] [color-scheme:light] rounded-t-[22px] md:rounded-[22px] shadow-[0_-8px_40px_rgba(0,0,0,0.18)] flex flex-col outline-none transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          shown ? "translate-y-0" : "translate-y-full md:translate-y-8 md:opacity-0"
        }`}
        style={{
          maxHeight:
            kb.inset > 0
              ? `${Math.max(240, kb.height - 12)}px`
              : "calc(100dvh - max(env(safe-area-inset-top, 0px), 24px) - 12px)",
        }}
      >
        {/* 標題列 */}
        <div className="shrink-0 bg-white rounded-t-[22px] border-b border-[#E4E4E7]/70 px-4 pt-2 pb-3">
          <div className="w-9 h-1 rounded-full bg-[#E4E4E7] mx-auto mb-2 md:hidden" aria-hidden />
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-[17px] font-bold text-[#18181B] truncate">{title}</h2>
              {subtitle && <p className="text-[12px] text-[#A1A1AA] truncate mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={tryClose}
              className="w-10 h-10 -mr-1 rounded-full flex items-center justify-center text-[#71717A] active:bg-[#F4F4F5] shrink-0"
              aria-label="關閉"
            >
              <Icon name="close" className="text-[22px]" />
            </button>
          </div>
        </div>

        {/* 內容 */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>

        {/* 未儲存確認：放在抽屜內，不用系統對話框 */}
        {confirming ? (
          <div
            className="shrink-0 bg-white border-t border-[#E4E4E7] px-4 pt-3"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}
          >
            <p className="text-[13.5px] font-semibold text-[#18181B]">放棄這次的修改？</p>
            <p className="text-[12px] text-[#71717A] mt-0.5">還沒儲存的內容會消失。</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 h-12 rounded-[14px] bg-[#F4F4F5] text-[15px] font-semibold text-[#18181B] active:bg-[#E4E4E7]"
              >
                繼續編輯
              </button>
              <button
                onClick={() => {
                  setConfirming(false);
                  onClose();
                }}
                className="flex-1 h-12 rounded-[14px] bg-white border border-[#E4E4E7] text-[15px] font-semibold text-[#d03b3b] active:bg-[#FEF2F2]"
              >
                放棄修改
              </button>
            </div>
          </div>
        ) : (
          footer && (
            <div
              className="shrink-0 bg-white border-t border-[#E4E4E7]/70 px-4 pt-3"
              style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}
            >
              {footer}
            </div>
          )
        )}
      </div>
    </div>
  );
}

/** 抽屜底部的主要／次要按鈕 */
export function SheetActions({
  onCancel,
  onSave,
  saveLabel = "儲存",
  saving,
  disabled,
  extra,
}: {
  onCancel?: () => void;
  onSave: () => void;
  saveLabel?: string;
  saving?: boolean;
  disabled?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      {extra}
      {onCancel && (
        <button
          onClick={onCancel}
          className="h-12 px-5 rounded-[14px] bg-[#F4F4F5] text-[15px] font-semibold text-[#3F3F46] active:bg-[#E4E4E7]"
        >
          取消
        </button>
      )}
      <button
        onClick={onSave}
        disabled={disabled || saving}
        className="flex-1 h-12 rounded-[14px] bg-[#18181B] text-white text-[15px] font-semibold active:opacity-85 disabled:opacity-35 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
      >
        {saving && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
        {saving ? "儲存中…" : saveLabel}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   提示訊息（可復原）
   ══════════════════════════════════════════════════════════ */

type ToastMsg = { id: number; text: string; tone?: "ok" | "error"; action?: { label: string; run: () => void } };

const TOAST_EVENT = "ss-pm-toast";
let seq = 0;

export function toast(text: string, opts: { tone?: "ok" | "error"; action?: { label: string; run: () => void } } = {}) {
  window.dispatchEvent(new CustomEvent<ToastMsg>(TOAST_EVENT, { detail: { id: ++seq, text, ...opts } }));
}

export function ToastHost() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      const m = (e as CustomEvent<ToastMsg>).detail;
      setMsg(m);
      clearTimeout(t);
      t = setTimeout(() => setMsg((cur) => (cur?.id === m.id ? null : cur)), m.action ? 6000 : 2600);
    };
    window.addEventListener(TOAST_EVENT, on);
    return () => {
      window.removeEventListener(TOAST_EVENT, on);
      clearTimeout(t);
    };
  }, []);
  if (!msg) return null;
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[170] w-[min(92vw,420px)] pointer-events-none"
      style={{ bottom: "calc(max(env(safe-area-inset-bottom, 0px), 12px) + 96px)" }}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-[#18181B] text-white pl-4 pr-2 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.25)]">
        <Icon
          name={msg.tone === "error" ? "error" : "check_circle"}
          weight={400}
          fill={1}
          className="text-[18px] shrink-0"
          style={{ color: msg.tone === "error" ? "#ff8a80" : "#6ee7a0" }}
        />
        <span className="flex-1 text-[13.5px] leading-snug">{msg.text}</span>
        {msg.action && (
          <button
            onClick={() => {
              msg.action!.run();
              setMsg(null);
            }}
            className="h-9 px-3 rounded-[10px] text-[13.5px] font-semibold text-[#F39C12] active:bg-white/10 shrink-0"
          >
            {msg.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
