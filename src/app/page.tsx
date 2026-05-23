"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useState } from "react";

export default function EntrancePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [showUI, setShowUI] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setMounted(true), 100);
    const t2 = setTimeout(() => setShowUI(true), 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <main className="flex flex-col relative min-h-[360px] h-screen overflow-hidden">
      <div className="flex-1 flex items-center justify-center w-full px-4 relative z-10">
        <div className="relative flex items-center justify-center w-full max-w-[320px] sm:max-w-[360px] aspect-square shrink-0">
        <div className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${showUI ? "opacity-100" : "opacity-0"}`}>
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
        </div>

        <div className={`relative z-10 flex items-center justify-center select-none transition-all duration-1000 ease-out ${mounted ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}>
          <div className="block transition-transform duration-300">
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

      <div className={`w-full shrink-0 flex flex-col items-center pb-12 sm:pb-16 px-4 sm:px-gutter relative z-20 transition-all duration-1000 ease-out delay-100 ${showUI ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="flex flex-col gap-6 w-full max-w-[480px] px-4 sm:px-8">
          <button
            className="box-border relative w-full bg-primary border-2 border-transparent text-black font-data-mono font-bold hover:brightness-110 transition-all py-4 tracking-widest text-lg"
            onClick={() => router.push("/verify")}
          >
            <span className="flex items-center justify-center gap-3">
              <span className="material-symbols-outlined text-black">shield_person</span>
              狩獵者登入
            </span>
          </button>

          <button
            className="box-border relative w-full bg-transparent border-2 border-primary text-primary font-data-mono font-bold hover:bg-primary/10 transition-all py-4 tracking-widest text-lg"
            onClick={() => router.push("/diversion")}
          >
            <span className="flex items-center justify-center gap-3">
              <span className="material-symbols-outlined text-primary">explore</span>
              訪客進入
            </span>
          </button>
        </div>
      </div>

      <div className="fixed inset-0 z-[-1] bg-black"></div>
    </main>
  );
}