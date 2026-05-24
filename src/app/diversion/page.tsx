"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function DiversionPage() {
  const router = useRouter();
  const { data: session } = useSession();

  const handleEnterMission = () => {
    if (!session) {
      alert("權限不足，請以狩獵者身分登入");
      return;
    }
    router.push("/basic-mission");
  };

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-gutter relative min-h-screen">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-5xl px-margin">
        {/* Card 1: Hunting Management */}
        <div className="group relative bg-surface-container-low border p-12 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 hover:bg-primary/5 hover:border-primary hover:shadow-[0_0_30px_rgba(243,156,18,0.2)] rounded-[4px] border-primary">
          <div className="mb-8">
            <span
              className="material-symbols-outlined text-primary bg-transparent drop-shadow-[0_0_10px_rgba(243,156,18,0.8)] transition-transform group-hover:scale-110 duration-500"
              style={{ fontSize: "100px", fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}
            >
              shield
            </span>
          </div>
          <h3 className="font-headline-md text-headline-md text-primary mb-2 tracking-widest">
            狩獵管理
          </h3>
        </div>

        {/* Card 2: Hunting Awakening */}
        <div
          className="group relative bg-surface-container-low border p-12 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 hover:bg-primary/5 hover:border-primary hover:shadow-[0_0_30px_rgba(243,156,18,0.2)] rounded-[4px] border-primary"
          onClick={handleEnterMission}
        >
          <div className="mb-8">
            <span
              className="material-symbols-outlined text-primary bg-transparent drop-shadow-[0_0_10px_rgba(243,156,18,0.8)] transition-transform group-hover:scale-110 duration-500"
              style={{ fontSize: "100px", fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}
            >
              local_fire_department
            </span>
          </div>
          <h3 className="font-headline-md text-headline-md text-primary mb-2 tracking-widest">
            狩獵覺醒
          </h3>
        </div>
      </div>
      
      <style jsx global>{`
        .scanline-overlay {
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.02), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.02));
          background-size: 100% 2px, 3px 100%;
          pointer-events: none;
        }
        .hud-bracket {
          position: absolute;
          width: 15px;
          height: 15px;
          border-color: #f39c12;
        }
        .hud-bracket-tl { top: -2px; left: -2px; border-top: 2px solid; border-left: 2px solid; }
        .hud-bracket-tr { top: -2px; right: -2px; border-top: 2px solid; border-right: 2px solid; }
        .hud-bracket-bl { bottom: -2px; left: -2px; border-bottom: 2px solid; border-left: 2px solid; }
        .hud-bracket-br { bottom: -2px; right: -2px; border-bottom: 2px solid; border-right: 2px solid; }
        
        .chamfered-button {
          clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
        }
      `}</style>
    </main>
  );
}
