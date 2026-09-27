/* 拾壤 APP 的 Service Worker：只處理「推播通知」，不快取任何頁面或資料
   （快取交給 Next.js 與 VersionGuard，這裡刻意不加 fetch 處理，避免拿到舊版畫面） */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { title: "拾壤", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || "拾壤", {
      body: d.body || "",
      tag: d.tag || undefined,
      renotify: !!d.tag,
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      data: { url: d.url || "/hunting-mgmt" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/hunting-mgmt", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of wins) {
        if (c.url.startsWith(self.location.origin)) {
          await c.focus();
          c.postMessage({ type: "pm-open", url });
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
