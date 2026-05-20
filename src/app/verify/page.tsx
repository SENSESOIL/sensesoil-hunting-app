"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { signIn } from "next-auth/react";

export default function VerificationPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    await signIn("google", { callbackUrl: "/basic-mission" });
  };

  return (
    <main className="flex flex-col relative min-h-[360px] h-screen overflow-hidden">
      <div className="flex-1 flex items-center justify-center w-full px-4 relative z-10">
        <div className="relative flex items-center justify-center w-full max-w-[320px] sm:max-w-[360px] aspect-square shrink-0">
        <svg
          className="absolute inset-0 w-full h-full animate-[spin_12s_linear_infinite] pointer-events-none"
          viewBox="0 0 360 360"
          style={{ overflow: "visible" }}
        >
          <defs>
            <linearGradient id="outerDualFade" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="5%" stopColor="#F39C12" stopOpacity="0" />
              <stop offset="25%" stopColor="#F39C12" stopOpacity="0.2" />
              <stop offset="50%" stopColor="#F39C12" stopOpacity="1" />
              <stop offset="75%" stopColor="#F39C12" stopOpacity="0.2" />
              <stop offset="95%" stopColor="#F39C12" stopOpacity="0" />
            </linearGradient>
          </defs>
          <circle
            cx="180"
            cy="180"
            r="170"
            fill="none"
            stroke="url(#outerDualFade)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="420 648"
            strokeDashoffset="477"
          />
        </svg>

        <svg
          className="absolute inset-0 w-full h-full animate-[spin_9s_linear_infinite_reverse] pointer-events-none"
          viewBox="0 0 360 360"
          style={{ overflow: "visible" }}
        >
          <defs>
            <linearGradient id="innerDualFade" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="10%" stopColor="#F39C12" stopOpacity="0" />
              <stop offset="30%" stopColor="#F39C12" stopOpacity="0.2" />
              <stop offset="50%" stopColor="#F39C12" stopOpacity="0.5" />
              <stop offset="70%" stopColor="#F39C12" stopOpacity="0.2" />
              <stop offset="90%" stopColor="#F39C12" stopOpacity="0" />
            </linearGradient>
          </defs>
          <circle
            cx="180"
            cy="180"
            r="150"
            fill="none"
            stroke="url(#innerDualFade)"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeDasharray="330 612"
            strokeDashoffset="165"
          />
        </svg>

        <div
          className="relative z-10 flex items-center justify-center select-none cursor-pointer group"
          onClick={() => router.push("/diversion")}
        >
          <div className="block transition-transform duration-300 group-hover:scale-105 group-hover:brightness-110">
            <Image
              alt="SENSESOIL Logo"
              width={200}
              height={60}
              className="h-[60px] w-auto object-contain filter drop-shadow-[0_0_10px_rgba(243,156,18,0.55)]"
              src="/Logo｜Orange.svg"
            />
          </div>
        </div>
      </div>
      </div>

      <div className="w-full shrink-0 flex flex-col items-center pb-12 sm:pb-16 px-4 sm:px-gutter relative z-20">
        <div className="flex flex-col gap-6 w-full max-w-[480px] px-4 sm:px-8">
          <button
            className="box-border relative w-full bg-primary border-2 border-transparent text-black font-data-mono font-bold hover:brightness-110 transition-all py-4 tracking-widest text-lg flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleGoogleLogin}
            disabled={isLoading}
          >
            <span className="material-symbols-outlined text-black">login</span>
            {isLoading ? "驗證中..." : "以 Google 帳號登入"}
          </button>

          {/* 隱形佔位符，用來維持與 Entrance Page 兩個按鈕以及原本兩個輸入框完全一致的高度，避免版面上下跳動 */}
          <div className="box-border relative w-full border-2 border-transparent py-4 text-lg invisible">
            佔位符
          </div>
        </div>
      </div>

      <div className="fixed inset-0 z-[-1] bg-black"></div>
      
      <style jsx global>{`
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 30px black inset !important;
          -webkit-text-fill-color: #F39C12 !important;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
    </main>
  );
}
