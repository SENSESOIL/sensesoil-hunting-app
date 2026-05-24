"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const getWeekRange = (dateObj: Date) => {
  const d = new Date(dateObj);
  const day = d.getDay();
  const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diffToMon));
  mon.setHours(0,0,0,0);
  
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23,59,59,999);
  
  return { start: mon.getTime(), end: sun.getTime() };
};

const calculatePace = (timeMins: number, distanceKm: number) => {
  if (!distanceKm || !timeMins) return '--:-- /km';
  const paceDec = timeMins / distanceKm;
  const mins = Math.floor(paceDec);
  const secs = Math.floor((paceDec - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')} /km`;
};

const formatTime = (timeMins: number) => {
  if (!timeMins) return '0m';
  const h = Math.floor(timeMins / 60);
  const m = Math.floor(timeMins % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const SmoothLineChart = ({ data }: { data: { label: string, value: number }[] }) => {
  if (!data || data.length === 0) return <div className="h-40 flex items-center justify-center text-primary/50">暫無資料</div>;

  const width = 400;
  const height = 160;
  const paddingY = 20;
  
  const maxVal = Math.max(...data.map(d => d.value));
  const minVal = Math.min(...data.map(d => d.value));
  const range = maxVal - minVal || 1;
  
  const getX = (i: number) => (i / (data.length - 1 || 1)) * width;
  const getY = (val: number) => height - paddingY - ((val - minVal) / range) * (height - 2 * paddingY);

  const points = data.map((d, i) => ({ x: getX(i), y: getY(d.value), val: d.value, label: d.label }));

  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cp1x = p0.x + (p1.x - p0.x) / 2;
    const cp2x = p1.x - (p1.x - p0.x) / 2;
    pathD += ` C ${cp1x} ${p0.y}, ${cp2x} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  const fillD = `${pathD} L ${width} ${height} L 0 ${height} Z`;
  const lastPoint = points[points.length - 1];
  const lastPctY = (lastPoint.y / height) * 100;

  return (
    <div className="relative w-full h-[160px]">
      <div className="absolute -top-6 right-0 flex gap-3 text-[10px] font-data-mono">
        <div className="text-primary/70">MAX <span className="text-primary font-bold">{maxVal.toFixed(2)}</span></div>
        <div className="text-primary/70">MIN <span className="text-primary font-bold">{minVal.toFixed(2)}</span></div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f39c12" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#f39c12" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={fillD} fill="url(#areaGradient)" />
        <path d={pathD} fill="none" stroke="#f39c12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {/* HTML dot to avoid SVG stretch */}
      <div 
        className="absolute w-3 h-3 rounded-full bg-surface border-2 border-primary z-10 shadow-[0_0_8px_rgba(243,156,18,0.8)]"
        style={{ right: '-6px', top: `calc(${lastPctY}% - 6px)` }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>
    </div>
  );
};

export default function RunningRecordsPage() {
  const router = useRouter();
  const [view, setView] = useState<"individual" | "team">("individual");
  const { data: session, status } = useSession();
  const userHunterName = (session?.user as any)?.hunterName || "";

  useEffect(() => {
    if (status === "unauthenticated") {
      alert("權限不足，請以狩獵者身分登入");
      router.replace("/diversion");
    }
  }, [status, router]);

  const { data: basicData } = useSWR("/api/sheets/basic-mission", fetcher);
  const { data: runningRes } = useSWR("/api/sheets/running-records", fetcher);
  const runningData = runningRes?.data || [];

  const [selectedPersonalHunter, setSelectedPersonalHunter] = useState<string>("");
  const [isPersonalHunterDropdownOpen, setIsPersonalHunterDropdownOpen] = useState(false);

  // Extract dashboardData (First champ, weeks) exactly like basic-mission
  const dashboardData = useMemo(() => {
    if (!basicData?.rows || basicData.rows.length < 3) {
      return { name: "計算中...", weeks: "00" };
    }
    const rows = basicData.rows;
    const scoreIdx = rows[1].findIndex((h: string) => h.includes('總分') || h.includes('魂'));
    const nameIdx = 1;
    const dateIdx = 0;

    if (scoreIdx === -1) return { name: "資料錯誤", weeks: "00" };

    const dateMap = new Map<string, { name: string, score: number }[]>();
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      const date = row[dateIdx];
      const name = row[nameIdx];
      const score = parseFloat(row[scoreIdx]) || 0;
      if (!date || !name) continue;
      if (!dateMap.has(date)) dateMap.set(date, []);
      dateMap.get(date)!.push({ name, score });
    }

    const sortedDates = Array.from(dateMap.keys()).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToSubtract = dayOfWeek === 0 ? 7 : dayOfWeek;
    const maxAllowedDate = new Date(now);
    maxAllowedDate.setDate(now.getDate() - daysToSubtract);
    maxAllowedDate.setHours(23, 59, 59, 999);
    const maxAllowedTime = maxAllowedDate.getTime();

    const championsByDate = new Map<string, { display: string, first: string }>();
    const validDates: string[] = [];

    for (const date of sortedDates) {
      if (new Date(date).getTime() > maxAllowedTime) continue;
      const records = dateMap.get(date)!;
      const maxScore = Math.max(...records.map(r => r.score));
      if (maxScore > 0) {
        const champs = records.filter(r => r.score === maxScore).map(r => r.name);
        championsByDate.set(date, { display: champs.join("、"), first: champs[0] || "" });
        validDates.push(date);
      }
    }

    if (validDates.length === 0) return { name: "無數據", firstChamp: "", weeks: "00" };

    const targetDate = validDates[validDates.length - 1];
    const currentChampData = championsByDate.get(targetDate)!;

    let consecutiveWeeks = 0;
    for (let i = validDates.length - 1; i >= 0; i--) {
      if (championsByDate.get(validDates[i])?.display === currentChampData.display) {
        consecutiveWeeks++;
      } else {
        break;
      }
    }

    return {
      name: currentChampData.display,
      firstChamp: currentChampData.first,
      weeks: consecutiveWeeks.toString().padStart(2, '0')
    };
  }, [basicData]);

  // Extract hunters list
  const huntersList = useMemo(() => {
    if (!basicData?.rows || basicData.rows.length < 3) return [];
    const hunterSet = new Set<string>();
    for (let i = 2; i < basicData.rows.length; i++) {
      if (basicData.rows[i][1]) hunterSet.add(basicData.rows[i][1]);
    }
    return Array.from(hunterSet);
  }, [basicData]);

  useEffect(() => {
    if (!selectedPersonalHunter && huntersList.length > 0) {
      const isValidDashName = dashboardData?.name && !["計算中...", "無數據", "資料錯誤"].includes(dashboardData.name);
      setSelectedPersonalHunter(userHunterName || (isValidDashName ? dashboardData.firstChamp : huntersList[0]));
    }
  }, [selectedPersonalHunter, huntersList, userHunterName, dashboardData]);

  const hunterRank = useMemo(() => {
    if (!basicData?.settings || !selectedPersonalHunter) return "S級狩獵者";
    for (let i = 0; i < basicData.settings.length; i++) {
      if (basicData.settings[i].includes(selectedPersonalHunter)) {
        const rank = basicData.settings[i][3];
        if (!rank) return "S級狩獵者";
        return rank.includes("狩獵者") ? rank : `${rank}級狩獵者`;
      }
    }
    return "S級狩獵者";
  }, [basicData, selectedPersonalHunter]);

  // Calculate Running Stats
  const personalRecords = useMemo(() => {
    const normalizeName = (name: string) => name ? name.replace(/\./g, '') : '';
    const normalizedSelected = normalizeName(selectedPersonalHunter);
    return runningData.filter((r: any) => normalizeName(r.name) === normalizedSelected);
  }, [runningData, selectedPersonalHunter]);

  const { thisWeekStats, past12WeeksData } = useMemo(() => {
    const now = new Date();
    const { start: twStart, end: twEnd } = getWeekRange(now);

    const thisWeekRecords = personalRecords.filter((r: any) => {
      const t = new Date(r.date).getTime();
      return t >= twStart && t <= twEnd;
    });

    const twDist = thisWeekRecords.reduce((sum: number, r: any) => sum + r.distance, 0);
    const twTime = thisWeekRecords.reduce((sum: number, r: any) => sum + parseFloat(r.timeStr || "0"), 0);
    const twElev = thisWeekRecords.reduce((sum: number, r: any) => sum + r.elevation, 0);

    const past12 = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i * 7);
      const { start, end } = getWeekRange(d);
      
      const weekRecords = personalRecords.filter((r: any) => {
        const t = new Date(r.date).getTime();
        return t >= start && t <= end;
      });
      
      const dist = weekRecords.reduce((sum: number, r: any) => sum + r.distance, 0);
      past12.push({
        label: `${d.getMonth()+1}/${d.getDate()}`,
        value: dist,
      });
    }

    return {
      thisWeekStats: {
        distance: twDist.toFixed(2),
        timeFormatted: formatTime(twTime),
        pace: calculatePace(twTime, twDist),
        elevation: twElev.toFixed(0)
      },
      past12WeeksData: past12
    };
  }, [personalRecords]);

  return (
    <div className="bg-background text-on-background font-body-lg overflow-x-hidden selection:bg-primary-container selection:text-on-primary-container font-display min-h-screen pb-20">
      <header className="fixed top-0 w-full z-50 flex justify-between items-center h-16 bg-surface/90 backdrop-blur-md border-b border-primary/30 shadow-[0_4px_12px_rgba(243,156,18,0.15)] px-4">
        <div className="flex items-center gap-3 flex-nowrap cursor-pointer" onClick={() => router.push("/diversion")}>
          <Image alt="SenseSoil Logo" width={28} height={28} className="h-[28px] w-auto object-contain flex-shrink-0 translate-y-[-2px]" src="/Logo｜Orange.svg" />
          <h1 className="font-headline-md uppercase tracking-widest font-bold text-primary text-[24px] leading-none">自我覺醒試煉</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center justify-center p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
            onClick={() => setView(view === 'individual' ? 'team' : 'individual')}
          >
            <span className="material-symbols-outlined text-[24px]">
              {view === 'individual' ? 'groups' : 'person'}
            </span>
          </button>
        </div>
      </header>

      <main className="relative pt-16 px-4">
        {/* Top Header - Team View */}
        <div className={`flex flex-row justify-between items-start shadow-[inset_0_0_15px_rgba(243,156,18,0.05)] ${view === 'individual' ? 'hidden' : ''}`} style={{ marginTop: 32, marginBottom: 32 }}>
          <div className="flex flex-col border-l-[3px] border-primary pl-3">
            <p className="font-label-caps text-primary text-[12px] tracking-[0.2em] mb-3 leading-none">狩獵覺醒排行榜</p>
            <h2 className={`font-headline-lg text-primary font-bold tracking-wider uppercase leading-none ${dashboardData.name.length > 4 ? 'text-xl mt-1' : 'text-3xl'}`}>{dashboardData.name}</h2>
          </div>
          <div className="text-right flex flex-col justify-end">
            <p className="font-label-caps text-primary text-[12px] tracking-[0.2em] mb-3 uppercase leading-none">蟬聯冠軍週數</p>
            <p className="font-headline-lg text-primary text-3xl font-bold tracking-tighter font-display shadow-primary/20 flex items-baseline justify-end gap-1 leading-none">{dashboardData.weeks}<span className="text-[10px] font-normal lowercase tracking-normal">weeks</span></p>
          </div>
        </div>

        {/* Top Header - Individual View */}
        <div className={`flex flex-row justify-between items-start shadow-[inset_0_0_15px_rgba(243,156,18,0.05)] ${view === 'team' ? 'hidden' : ''}`} style={{ marginTop: 32, marginBottom: 32 }}>
          <div className="flex flex-col border-l-[3px] border-primary pl-3 relative">
            <style>{`
              @keyframes textReveal {
                0% { opacity: 0; filter: blur(3px); transform: translateX(-4px); }
                100% { opacity: 1; filter: blur(0); transform: translateX(0); }
              }
              .animate-text-reveal {
                animation: textReveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
              }
            `}</style>
            <p className="font-label-caps text-primary text-[12px] tracking-[0.2em] mb-3 leading-none">{hunterRank}</p>
            <div className="flex items-center gap-2">
              <h2 
                key={selectedPersonalHunter}
                className="font-headline-lg text-3xl font-bold tracking-wider uppercase leading-none transition-opacity cursor-pointer hover:opacity-80 animate-text-reveal"
                style={{ color: "#efe0d2" }}
                onClick={() => setIsPersonalHunterDropdownOpen(!isPersonalHunterDropdownOpen)}
              >
                {selectedPersonalHunter || "載入中..."}
              </h2>
            </div>
            {isPersonalHunterDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-surface-container-high border border-primary/30 rounded-[4px] shadow-lg z-[120] max-h-48 overflow-y-auto">
                {huntersList.map((hunter) => (
                  <div
                    key={hunter}
                    className="px-4 py-3 hover:bg-primary/20 cursor-pointer text-[#efe0d2] text-sm border-b border-primary/10 last:border-b-0"
                    onClick={() => { setSelectedPersonalHunter(hunter); setIsPersonalHunterDropdownOpen(false); }}
                  >
                    {hunter}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Individual Module */}
        <section className={`space-y-[18px] mb-[32px] ${view === 'team' ? 'hidden' : ''}`}>
          <div className="p-4 border border-primary/30 bg-surface-container-low/50 font-display rounded-[4px] shadow-[0_0_15px_rgba(243,156,18,0.05)]">
            <h3 className="text-primary text-[22px] font-bold mb-6 font-headline-md tracking-wider">當週紀錄</h3>
            <div className="grid grid-cols-2 gap-y-6 gap-x-4">
              <div>
                <p className="text-[12px] text-[#efe0d2]/70 uppercase tracking-wider mb-1">Distance</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-[#efe0d2] tracking-tighter">{thisWeekStats.distance}</span>
                  <span className="text-[14px] text-[#efe0d2] font-bold">km</span>
                </div>
              </div>
              <div>
                <p className="text-[12px] text-[#efe0d2]/70 uppercase tracking-wider mb-1">Time</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-[#efe0d2] tracking-tighter">{thisWeekStats.timeFormatted}</span>
                </div>
              </div>
              <div>
                <p className="text-[12px] text-[#efe0d2]/70 uppercase tracking-wider mb-1">Pace</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-[#efe0d2] tracking-tighter">{thisWeekStats.pace}</span>
                </div>
              </div>
              <div>
                <p className="text-[12px] text-[#efe0d2]/70 uppercase tracking-wider mb-1">Elev Gain</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-[#efe0d2] tracking-tighter">{thisWeekStats.elevation}</span>
                  <span className="text-[14px] text-[#efe0d2] font-bold">m</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-4 pt-6 border border-primary/30 bg-surface-container-low/50 font-display rounded-[4px] shadow-[0_0_15px_rgba(243,156,18,0.05)]">
            <h3 className="text-primary text-sm font-bold tracking-widest uppercase mb-6">過去 12 週趨勢</h3>
            <SmoothLineChart data={past12WeeksData} />
            <div className="flex justify-between mt-2 px-2">
               <span className="text-[10px] text-[#efe0d2]/50 font-data-mono">{past12WeeksData[0]?.label}</span>
               <span className="text-[10px] text-[#efe0d2]/50 font-data-mono">{past12WeeksData[5]?.label}</span>
               <span className="text-[10px] text-[#efe0d2]/50 font-data-mono">{past12WeeksData[11]?.label}</span>
            </div>
          </div>
        </section>

        {/* Team Module Placeholder */}
        <section className={`space-y-[18px] mb-[32px] ${view === 'individual' ? 'hidden' : ''}`}>
           <div className="p-4 border border-primary/30 bg-surface-container-low/50 font-display rounded-[4px]">
             <h3 className="text-primary text-sm font-bold tracking-[0.3em] uppercase mb-4 text-center">團隊狀態建置中</h3>
           </div>
        </section>

      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-20 px-6 bg-surface/95 backdrop-blur-lg border-t border-primary/30 shadow-[0_-8px_20px_rgba(243,156,18,0.3)]">
        <button className="flex flex-col items-center gap-1 text-primary/50" onClick={() => router.push("/basic-mission")}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>target</span>
          <span className="font-label-caps text-[8px]">基礎</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-primary/50">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>diamond</span>
          <span className="font-label-caps text-[8px]">隱藏</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-primary/50">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>trending_up</span>
          <span className="font-label-caps text-[8px]">轉職</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-primary/50">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>pie_chart</span>
          <span className="font-label-caps text-[8px]">結算</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-primary active-pulse">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
          <span className="font-label-caps text-[8px]">覺醒</span>
        </button>
      </nav>
    </div>
  );
}
