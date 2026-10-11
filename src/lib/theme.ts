"use client";

import { useSyncExternalStore } from "react";
import { ACCENT_STORAGE_KEY } from "./theme-boot";

/* ══════════════════════════════════════════════════════════
   主題色（頭像 → 設定 → 外觀）
   全狩獵管理的強調色都讀 CSS 變數 --accent，衍生三個色調：
     --accent-soft   淺底（選中的方塊、提示條）
     --accent-strong 深一階（淺底上的圖示、數字）
     --accent-ink    淺底上的文字
   選擇存在這支裝置（localStorage），開頁前由 layout 的內嵌腳本先套用，不會閃一下橘色。
   ══════════════════════════════════════════════════════════ */

export interface AccentOption {
  key: string;
  label: string;
  color: string;
}

export const ACCENTS: AccentOption[] = [
  { key: "orange", label: "拾壤橘", color: "#F39C12" },
  { key: "coral", label: "珊瑚", color: "#F2674A" },
  { key: "rose", label: "玫瑰", color: "#E0457B" },
  { key: "violet", label: "紫羅蘭", color: "#7C5CE0" },
  { key: "blue", label: "海藍", color: "#2F7FD8" },
  { key: "teal", label: "青綠", color: "#13A08A" },
  { key: "green", label: "森林", color: "#3A9A4F" },
  { key: "graphite", label: "石墨", color: "#4B5563" },
];

const listeners = new Set<() => void>();

function current(): string {
  if (typeof document === "undefined") return ACCENTS[0].color;
  return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || ACCENTS[0].color;
}

export function setAccent(color: string) {
  document.documentElement.style.setProperty("--accent", color);
  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, color);
  } catch {
    /* 私密瀏覽：這次有效，下次回到預設 */
  }
  listeners.forEach((f) => f());
}

export function useAccent(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    () => ACCENTS[0].color
  );
}
