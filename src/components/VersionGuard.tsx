"use client";

import { useEffect } from "react";

/**
 * 版本守衛。
 *
 * iOS 的 PWA 被系統以記憶體壓力殺掉後重新開啟時，常常直接拿 WebView 快取裡的
 * 文件來用、不走網路，結果畫面會退回很舊的一版建置。
 *
 * 這裡的作法：建置時把 commit sha 內嵌進前端包，執行時去問伺服器目前部署的是哪一版，
 * 不一致就代表現在跑的是舊文件 —— 直接重載一次，把使用者換到新版。
 *
 * 進入前景時也會再檢查一次（PWA 被喚醒的主要時機）。
 */

const BUILD = process.env.NEXT_PUBLIC_BUILD_SHA || "dev";
// 同一次重載後短時間內不再重載，避免伺服器異常時陷入無限循環
const RELOAD_GUARD_KEY = "ss-version-reloaded-at";
const RELOAD_COOLDOWN_MS = 60_000;

export function VersionGuard() {
  useEffect(() => {
    // 本機開發不做這件事（沒有 VERCEL_GIT_COMMIT_SHA，兩邊都是 "dev"）
    if (BUILD === "dev") return;

    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const { build } = (await res.json()) as { build?: string };
        if (!build || build === "dev" || build === BUILD) return;

        // 版本不一致 —— 目前這份前端是舊的
        let last = 0;
        try {
          last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
        } catch {
          // 私密模式等情況讀不到，當作沒重載過
        }
        if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
        try {
          sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
        } catch {
          // 寫不進去也照樣重載，最多就是少了一層保險
        }
        window.location.reload();
      } catch {
        // 離線或伺服器暫時有問題：什麼都不做，維持現狀比強制重載好
      }
    };

    check();

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}

export default VersionGuard;
