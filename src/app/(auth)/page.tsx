"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { hasAuthLoaded } from "./layout";

export default function EntrancePage() {
  const router = useRouter();
  const [showUI, setShowUI] = useState(hasAuthLoaded);

  useEffect(() => {
    if (!showUI) {
      const delay = hasAuthLoaded ? 100 : 1000;
      const t = setTimeout(() => setShowUI(true), delay);
      return () => clearTimeout(t);
    }
  }, [showUI]);

  return (
    <div className={`w-full shrink-0 flex flex-col items-center pb-12 sm:pb-16 px-4 sm:px-gutter relative z-20 transition-opacity duration-1000 ease-out ${showUI ? "opacity-100" : "opacity-0"}`}>
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
  );
}