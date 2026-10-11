/* 主題色的開頁腳本（伺服器元件 layout 要用，所以不能放在 "use client" 的 theme.ts 裡） */

export const ACCENT_STORAGE_KEY = "app:accent";

/** layout 的 <head> 內嵌這段：開頁前先套用使用者選的主題色 */
export const ACCENT_BOOT_SCRIPT = `try{var a=localStorage.getItem("${ACCENT_STORAGE_KEY}");if(a&&/^#[0-9a-fA-F]{6}$/.test(a))document.documentElement.style.setProperty("--accent",a)}catch(e){}`;
