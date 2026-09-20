import type { Metadata } from "next";
import { Orbitron } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

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
  // 讓網頁內容延伸到瀏海／狀態列底下，black-translucent 才會生效
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" className="dark">
      <head>
        {/* Next 只輸出標準名稱 mobile-web-app-capable，但 Apple 規定沒有這個前綴版本，
            apple-mobile-web-app-status-bar-style 就會被忽略（狀態列會維持系統預設的白底黑字） */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block" rel="stylesheet" />
        <style>{`
          .material-symbols-outlined {
            font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
          }
        `}</style>
      </head>
      <body className={`${orbitron.variable} ${orbitron.className} bg-black text-on-background overflow-x-hidden overscroll-y-none min-h-[calc(100dvh_-_var(--sat))]`}>
        {/* 狀態列底色：viewport-fit=cover 之後狀態列變透明、文字固定為白色，
            淺色頁面若直接透出去會看不見，所以統一鋪一層深色。
            組織圖覆蓋層 z-[9999] 會蓋過它，用自己的 #18181B 無縫接上。 */}
        <div className="status-bar-backdrop" aria-hidden="true" />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
