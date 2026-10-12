"use client";

import { useSyncExternalStore } from "react";
import { BAR_DARK, BAR_LIGHT, THEME_STORAGE_KEY } from "./theme-boot";

/* ══════════════════════════════════════════════════════════
   白天／夜晚模式（頭像 → 設定 → 外觀）
   <html data-theme="light|dark">；夜晚的配色在 src/app/dark-mode.css，
   只作用在狩獵管理（<html data-app="mgmt">），狩獵覺醒等頁面不受影響。
   強調色固定是品牌橘（CSS 變數 --accent）。
   選擇存在這支裝置（localStorage），開頁前由 layout 的內嵌腳本先套用。
   ══════════════════════════════════════════════════════════ */

export type ThemeMode = "light" | "dark";

const listeners = new Set<() => void>();

function current(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setThemeMode(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* 私密瀏覽：這次有效，下次回到白天 */
  }
  syncStatusBar();
  listeners.forEach((f) => f());
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    () => "light"
  );
}

/**
 * 狀態列底色：各頁面會把 <meta name="theme-color"> 設成白天的 #FAFAFA／#FFFFFF；
 * 夜晚模式時把它們換成深色（深色的覆蓋層，例如組織圖、流程圖，本來就是深色，不動）。
 */
function syncStatusBar() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const v = (meta.getAttribute("content") ?? "").toUpperCase();
  if (current() === "dark" && BAR_LIGHT.includes(v)) meta.setAttribute("content", BAR_DARK);
  if (current() === "light" && v === BAR_DARK) meta.setAttribute("content", BAR_LIGHT[0]);
}

let watching = false;
/** 狩獵管理掛載時呼叫：標記作用範圍，並盯著狀態列底色 */
export function enableAppTheme(): () => void {
  const root = document.documentElement;
  root.dataset.app = "mgmt";
  syncStatusBar();
  let obs: MutationObserver | null = null;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && !watching) {
    watching = true;
    obs = new MutationObserver(syncStatusBar);
    obs.observe(meta, { attributes: true, attributeFilter: ["content"] });
  }
  return () => {
    delete root.dataset.app;
    obs?.disconnect();
    watching = false;
  };
}
