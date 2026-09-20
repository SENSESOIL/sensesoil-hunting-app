/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    // 建置時把 commit sha 內嵌進前端包，供 VersionGuard 比對。
    // 本機沒有這個變數時是 "dev"，VersionGuard 會自動跳過檢查。
    NEXT_PUBLIC_BUILD_SHA:
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev",
  },
  async headers() {
    return [
      {
        // 只針對「沒有副檔名的路徑」＝ HTML 頁面本身，禁止進快取。
        // iOS PWA 被系統殺掉重啟時會直接吃 WebView 快取而不走網路，
        // 這是畫面退回舊版建置的主因。
        // _next/ 與 api/ 排除在外：前者是帶 hash 的不可變資產，必須維持長快取。
        source: "/((?!_next/|api/|.*\\.[^/]+$).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, max-age=0",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
