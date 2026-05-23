"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { hasAuthLoaded } from "../layout";

export default function VerificationPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [showUI, setShowUI] = useState(hasAuthLoaded);

  useEffect(() => {
    if (!showUI) {
      const delay = hasAuthLoaded ? 100 : 1100;
      const t = setTimeout(() => setShowUI(true), delay);
      return () => clearTimeout(t);
    }
  }, [showUI]);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    await signIn("google", { callbackUrl: "/basic-mission" });
  };

  return (
    <div className={`w-full shrink-0 flex flex-col items-center pb-12 sm:pb-16 px-4 sm:px-gutter relative z-20 transition-opacity duration-1000 ease-out ${showUI ? "opacity-100" : "opacity-0"}`}>
      <div className="flex flex-col gap-6 w-full max-w-[480px] px-4 sm:px-8 h-[160px]">
        <button
          className="box-border relative w-full bg-primary border-2 border-transparent text-black font-data-mono font-bold hover:brightness-110 transition-all py-4 tracking-widest text-lg flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleGoogleLogin}
          disabled={isLoading}
        >
          <span className="material-symbols-outlined text-black">login</span>
          {isLoading ? "驗證中..." : "以 Google 帳號登入"}
        </button>
      </div>
    </div>
  );
}
