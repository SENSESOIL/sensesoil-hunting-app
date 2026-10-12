/* 白天／夜晚模式的開頁腳本（伺服器元件 layout 要用，所以不能放在 "use client" 的 theme.ts 裡） */

export const THEME_STORAGE_KEY = "app:theme";

/** 狀態列底色（白天、夜晚） */
export const BAR_LIGHT = ["#FAFAFA", "#FFFFFF"];
export const BAR_DARK = "#111113";

/**
 * layout 的 <head> 內嵌這段：開頁前先套用使用者選的模式，不會先閃一下白色。
 * 強調色固定是品牌橘；之前試做的「換主題色」存過的值一併清掉。
 */
export const THEME_BOOT_SCRIPT = `try{localStorage.removeItem("app:accent");var m=localStorage.getItem("${THEME_STORAGE_KEY}");document.documentElement.dataset.theme=m==="dark"?"dark":"light"}catch(e){}`;
