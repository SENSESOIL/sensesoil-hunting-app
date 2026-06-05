"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { signIn, useSession, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export let hasAuthLoaded = false;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(hasAuthLoaded);
  const [showUI, setShowUI] = useState(hasAuthLoaded);
  const [isLoading, setIsLoading] = useState(false);
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!hasAuthLoaded) {
      const t1 = setTimeout(() => setMounted(true), 100);
      const t2 = setTimeout(() => {
        setShowUI(true);
        hasAuthLoaded = true;
      }, 1100);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, []);

  return (
    <main className="flex flex-col relative min-h-[360px] h-screen overflow-hidden">
      <div className="flex-1 flex items-center justify-center w-full px-4 relative z-10 -translate-y-16 sm:-translate-y-20">
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

          <div
            className={`relative z-10 flex items-center justify-center select-none transition-all duration-1000 ease-out ${mounted ? "opacity-100 scale-100" : "opacity-0 scale-95"} cursor-pointer group ${isLoading ? "opacity-50 pointer-events-none" : ""}`}
            onClick={async () => {
              if (isLoading) return;
              setIsLoading(true);
              const currentSession = await getSession();
              if (currentSession) {
                router.push("/diversion");
              } else {
                const res = await signIn("google", { redirect: false, callbackUrl: "/diversion" });
                if (res?.url) {
                  window.location.href = res.url;
                }
              }
            }}
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
      {children}
    </main>
  );
}
