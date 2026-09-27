"use client";

/* ══════════════════════════════════════════════════════════
   手機推播（瀏覽器端）
   - Android／桌機 Chrome：直接開
   - iPhone：iOS 16.4 以上，而且要從「加入主畫面」的 APP 開（Safari 分頁不支援）
   ══════════════════════════════════════════════════════════ */

import { pmPost } from "./usePm";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function supported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function pushState(): Promise<PushState> {
  if (!KEY) return "unsupported";
  if (isIOS() && !isStandalone()) return "needs-install";
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  const reg = await navigator.serviceWorker.getRegistration("/sw.js").catch(() => undefined);
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  return sub ? "on" : "off";
}

function keyBytes(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function subscribe(): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) as BufferSource });
}

/** 使用者按「開啟通知」：一定要在點擊事件裡呼叫（iOS 規定） */
export async function enablePush(): Promise<PushState | "error"> {
  const s = await pushState();
  if (s === "unsupported" || s === "needs-install" || s === "denied") return s;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return perm === "denied" ? "denied" : "off";
    const sub = await subscribe();
    const r = await pmPost({ op: "push.subscribe", subscription: sub.toJSON() });
    if (!r.ok) return "error";
    await pmPost({ op: "push.test" });
    return "on";
  } catch (e) {
    console.error("[push] 開啟失敗", e);
    return "error";
  }
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js").catch(() => undefined);
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  if (sub) {
    await pmPost({ op: "push.unsubscribe", endpoint: sub.endpoint });
    await sub.unsubscribe().catch(() => {});
  }
}

/**
 * 每次打開 APP：已經允許通知的裝置，把訂閱重新綁到「目前登入的人」
 * （同一支手機換人登入時，通知才不會送錯人）
 */
export async function refreshPush(): Promise<void> {
  if (!KEY || !supported() || Notification.permission !== "granted") return;
  if (isIOS() && !isStandalone()) return;
  try {
    const sub = await subscribe();
    await pmPost({ op: "push.subscribe", subscription: sub.toJSON() });
  } catch {
    /* 背景更新失敗不打擾使用者 */
  }
}
