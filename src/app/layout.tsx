import type { Metadata } from "next";
import { Orbitron } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import VersionGuard from "@/components/VersionGuard";

const orbitron = Orbitron({ 
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-orbitron" 
});

export const metadata: Metadata = {
  title: "SENSESOIL Portal Gateway",
  description: "Military HUD Portal",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sensesoil",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" className="dark scrollbar-hide">
      <head>
        {/* 狀態列底色。iOS 對「動態新建的 meta」反應很慢（實機要 2～4 秒或轉一次螢幕
            才變色），但對既有 meta 的 content 變更會立刻重畫 —— 所以這裡固定輸出一個，
            需要切換的頁面只改它的值。
            預設 #FAFAFA 與主頁標題列同色；子頁會自行切成白色。 */}
        <meta name="theme-color" content="#FAFAFA" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block" rel="stylesheet" />
        <style>{`
          .material-symbols-outlined {
            font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
          }
        `}</style>
      </head>
      <body className={`scrollbar-hide ${orbitron.variable} ${orbitron.className} bg-black text-on-background overflow-x-hidden overscroll-y-none min-h-[100dvh]`}>
        {/* iOS PWA 被記憶體壓力殺掉重啟時可能載入快取裡的舊版文件，
            這個守衛會比對建置版本，不一致就自動重載到新版 */}
        <VersionGuard />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
