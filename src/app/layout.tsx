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

import { PullToRefresh } from "@/components/PullToRefresh";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" className="dark">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
        <style>{`
          .material-symbols-outlined {
            font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
          }
        `}</style>
      </head>
      <body className={`${orbitron.variable} ${orbitron.className} bg-black text-on-background overflow-x-hidden min-h-[100dvh]`}>
        <Providers>
          <PullToRefresh>
            {children}
          </PullToRefresh>
        </Providers>
      </body>
    </html>
  );
}
