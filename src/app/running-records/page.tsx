"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PullToRefresh } from "@/components/PullToRefresh";
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
  if (!distanceKm || !timeMins) return '--:--';
  const paceDec = timeMins / distanceKm;
  const mins = Math.floor(paceDec);
  const secs = Math.floor((paceDec - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatTime = (timeMins: number) => {
  if (!timeMins) return '0m';
  const h = Math.floor(timeMins / 60);
  const m = Math.floor(timeMins % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const SmoothLineChart = ({ data, selectedIndex, onSelect }: { data: any[], selectedIndex: number, onSelect: (idx: number) => void }) => {
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

  const [isInteracting, setIsInteracting] = useState(false);

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let clientX = 0;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
    } else {
      clientX = (e as React.MouseEvent).clientX;
    }
    const x = clientX - rect.left;
    const pct = x / rect.width;
    let idx = Math.round(pct * (data.length - 1));
    idx = Math.max(0, Math.min(data.length - 1, idx));
    if (idx !== selectedIndex) {
      onSelect(idx);
    }
  };

  const handlePointerLeave = () => {
    setIsInteracting(false);
    onSelect(11); // Reset to latest week when pointer leaves
  };

  const selectedPoint = points[selectedIndex] || points[points.length - 1];

  return (
    <div 
      className="relative w-full h-[160px] touch-none cursor-crosshair"
      onMouseEnter={() => setIsInteracting(true)}
      onMouseLeave={handlePointerLeave}
      onTouchStart={(e) => { setIsInteracting(true); handlePointerMove(e); }}
      onTouchEnd={handlePointerLeave}
      onMouseMove={isInteracting ? handlePointerMove : undefined}
      onTouchMove={isInteracting ? handlePointerMove : undefined}
    >
      <style>{`
        @keyframes drawLine {
          to { stroke-dashoffset: 0; }
        }
        @keyframes fadeIn {
          to { opacity: 1; }
        }
        .animate-draw-line {
          stroke-dasharray: 2000;
          stroke-dashoffset: 2000;
          animation: drawLine 1.5s ease-in-out forwards;
        }
        .animate-fade-in {
          opacity: 0;
          animation: fadeIn 0.5s ease-out 1.2s forwards;
        }
        .animate-fill-in {
          opacity: 0;
          animation: fadeIn 1s ease-out 0.5s forwards;
        }
      `}</style>
      <div className="absolute -top-6 right-0 flex gap-3 text-[10px] font-data-mono pointer-events-none">
        <div className="text-primary/70">MAX <span className="text-primary font-bold">{maxVal.toFixed(2)}</span></div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible pointer-events-none" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f39c12" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#f39c12" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path className="animate-fill-in" d={fillD} fill="url(#areaGradient)" />
        <path className="animate-draw-line" d={pathD} fill="none" stroke="#f39c12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {/* Interactive Selected Dot */}
      <div 
        className={`absolute w-3 h-3 rounded-full bg-surface border-2 border-[#efe0d2] z-10 shadow-[0_0_8px_rgba(243,156,18,0.8)] transition-opacity duration-200 pointer-events-none ${isInteracting ? 'opacity-100' : 'opacity-0'}`}
        style={{ left: `calc(${(selectedPoint.x / width) * 100}% - 6px)`, top: `calc(${(selectedPoint.y / height) * 100}% - 6px)` }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-[#f39c12] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>
    </div>
  );
};

const YearlyBarChart = ({ data, onSelect }: { data: {label: string, value: number, isActive?: boolean, date: Date}[], onSelect: (d: Date) => void }) => {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="w-full h-[220px] flex items-end justify-between px-2 pt-12 pb-12 relative mt-4">
      {data.map((d, i) => {
        const heightPct = (d.value / maxVal) * 100;
        const isActive = d.isActive; 
        return (
          <div 
            key={i} 
            className="flex flex-col items-center flex-1 h-full relative cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => onSelect(d.date)}
          >
            <div className="w-full h-full flex flex-col justify-end items-center relative">
              {d.value > 0 && (
                <div 
                  className={`w-[2px] relative ${isActive ? 'bg-primary' : 'bg-white'}`}
                  style={{ height: `${heightPct}%` }}
                >
                  {isActive && (
                    <div className="absolute -top-[3px] -left-[3px] w-2 h-2 bg-primary rounded-full" />
                  )}
                  {isActive && (
                     <div className="absolute left-1/2 -translate-x-1/2 rotate-[-90deg] origin-center text-[11px] text-white whitespace-nowrap tracking-widest font-mono" style={{ bottom: 'calc(100% + 36px)' }}>
                       {d.value.toFixed(1)} hrs
                     </div>
                  )}
                </div>
              )}
            </div>
            {/* Month Label */}
            <div className="absolute -bottom-[38px] text-[11px] tracking-widest font-mono flex flex-col items-center gap-[2px]" style={{ color: isActive ? '#f39c12' : 'white', marginTop: '16px' }}>
              {d.label.split('').map((char: string, idx: number) => (
                <span key={idx} className="leading-none">{char}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default function RunningRecordsPage() {
  const router = useRouter();
  const [showNav, setShowNav] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > lastScrollY.current && window.scrollY > 50) {
        setShowNav(false);
      } else {
        setShowNav(true);
      }
      lastScrollY.current = window.scrollY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const [view, setView] = useState<"individual" | "team">("team");
  const { data: session, status } = useSession();
  const userHunterName = (session?.user as any)?.hunterName || "";
  const roles = (session?.user as any)?.roles || {};
  const userRole = roles["running"] || "viewer";
  const canEdit = userRole === "admin" || userRole === "editor" || process.env.NODE_ENV === "development";
  const isAdmin = userRole === "admin" || process.env.NODE_ENV === "development";

  useEffect(() => {
    if (status === "unauthenticated") {
      alert("權限不足，請以狩獵者身分登入");
      router.replace("/diversion");
    }
  }, [status, router]);

  const { data: basicData } = useSWR("/api/sheets/basic-mission", fetcher);
  const { data: runningRes, mutate: mutateRunning } = useSWR("/api/sheets/running-records", fetcher);
  const runningData = runningRes?.data || [];

  const [awardYear, setAwardYear] = useState('2026');
  const [isAwardYearDropdownOpen, setIsAwardYearDropdownOpen] = useState(false);
  const [isLeaderboardYearDropdownOpen, setIsLeaderboardYearDropdownOpen] = useState(false);

  const { data: awardsRes, isLoading: isAwardsLoading } = useSWR(`/api/sheets/running-awards?year=${awardYear}`, fetcher);
  const awardsData = awardsRes?.data || [];

  const [selectedPersonalHunter, setSelectedPersonalHunter] = useState<string>("");
  const [isPersonalHunterDropdownOpen, setIsPersonalHunterDropdownOpen] = useState(false);
  const [selectedDayRecords, setSelectedDayRecords] = useState<any[] | null>(null);
  const [expandedAwardLevel, setExpandedAwardLevel] = useState<string | null>(null);

  const [isRecordEditModalOpen, setIsRecordEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [isSavingRecord, setIsSavingRecord] = useState(false);

  const handleSaveRecord = async () => {
    if (!editingRecord) return;
    setIsSavingRecord(true);
    try {
      const res = await fetch("/api/sheets/running-records", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowIndex: editingRecord.rowIndex,
          values: [[
            editingRecord.date,
            editingRecord.name,
            editingRecord.activity,
            editingRecord.distance.toString(),
            editingRecord.elevation.toString(),
            editingRecord.timeStr
          ]]
        })
      });
      if (!res.ok) {
        throw new Error("Failed to save");
      }
      await mutateRunning();
      setIsRecordEditModalOpen(false);
    } catch (err) {
      console.error(err);
      alert("儲存失敗");
    } finally {
      setIsSavingRecord(false);
    }
  };

  const toggleAwardLevel = (level: string) => {
    setExpandedAwardLevel(prev => prev === level ? null : level);
  };

  const personalAward = useMemo(() => {
    if (!selectedPersonalHunter || !awardsData.length) return null;
    const normalize = (n: string) => {
      let r = n.replace(/[\.\s]/g, '').toUpperCase();
      if (r === 'WWENJUN' || r === 'WEIWENJUN') return '魏文軍';
      if (r === '盧政恆') return '盧政恒';
      return r;
    };
    const target = normalize(selectedPersonalHunter);
    return awardsData.find((a: any) => normalize(a.name) === target) || null;
  }, [awardsData, selectedPersonalHunter]);

  const getItemInfo = useCallback((rewardStr: string) => {
    if (!rewardStr) return null;
    if (rewardStr.includes('筋膜槍')) return { name: '筋膜槍小米mini 2', value: 1400 };
    if (rewardStr.includes('體脂計')) return { name: '體脂計小米S400', value: 600 };
    if (rewardStr.includes('運動手錶') || rewardStr.includes('運動手環') || rewardStr.includes('Garmin')) return { name: '運動手錶Garmin165', value: 7000 };
    return null;
  }, []);

  const renderRewardSubText = useCallback((valStr: string, threshold: number, rewardStr: string, dateStr: string) => {
    const isUnlocked = parseInt(valStr) >= threshold;
    if (!isUnlocked) return null;

    const info = getItemInfo(rewardStr);
    
    if (info) {
      if (dateStr) {
        return <span className="text-[#00E5FF]/50 text-[11px] mt-0.5">+${info.value.toLocaleString()} 價值 | 已兌換 {dateStr}</span>;
      }
      return <span className="text-[#00E5FF]/50 text-[11px] mt-0.5">+${info.value.toLocaleString()} 價值</span>;
    }
    
    return <span className="text-[#00E5FF]/50 text-[11px] mt-0.5">未兌換獎勵</span>;
  }, [getItemInfo]);

  const calculatedAwardTotal = useMemo(() => {
    if (!personalAward) return 0;
    let t = personalAward.totals.total || 0;
    if (personalAward.L1?.reward) {
      const info = getItemInfo(personalAward.L1.reward);
      if (info) t += info.value;
    }
    if (personalAward.L2?.reward) {
      const info = getItemInfo(personalAward.L2.reward);
      if (info) t += info.value;
    }
    if (personalAward.L3?.reward) {
      const info = getItemInfo(personalAward.L3.reward);
      if (info) t += info.value;
    }
    return t;
  }, [personalAward, getItemInfo]);

  const unredeemedBalanceL4 = useMemo(() => {
    if (!personalAward || !personalAward.L4 || !personalAward.L4.months) return 0;
    return personalAward.L4.months.reduce((sum: number, m: any) => {
      if (m.reward && m.reward !== '-' && m.reward !== '0' && !m.date) {
        const val = parseInt(m.reward.toString().replace(/,/g, ''), 10);
        if (!isNaN(val)) return sum + val;
      }
      return sum;
    }, 0);
  }, [personalAward]);

  const displayAward = personalAward || {
    name: selectedPersonalHunter,
    L1: { runs: '0', reward: '', date: '' },
    L2: { prs: '0', reward: '', date: '' },
    L3: { prs: '0', reward: '', date: '' },
    L4: { months: [], totalB: 0 },
    L5: { distance: '0', reward: '', date: '', totalC: 0 },
    totals: { A: 0, B: 0, C: 0, total: 0 }
  };

  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date>(new Date());
  const [isMonthSelectorOpen, setIsMonthSelectorOpen] = useState(false);

  const dashboardData = useMemo(() => {
    if (!runningData || runningData.length === 0) {
      return { name: "計算中...", weeks: "00" };
    }

    const normalizeName = (name: string) => {
      if (!name) return '';
      let n = name.replace(/[\.\s]/g, '').toUpperCase();
      if (n === 'WWENJUN' || n === 'WEIWENJUN') return '魏文軍';
      if (n === '盧政恆') return '盧政恒';
      return n;
    };

    const weeklyTotals: Record<number, Record<string, number>> = {};
    const validHunters = new Set<string>();

    runningData.forEach((r: any) => {
      const name = normalizeName(r.name);
      if (!name || name === 'SENSESOIL' || name.includes('COMPANY')) return;
      
      const d = new Date(r.date);
      if (isNaN(d.getTime())) return;
      
      const { start } = getWeekRange(d);
      if (!weeklyTotals[start]) weeklyTotals[start] = {};
      if (!weeklyTotals[start][name]) weeklyTotals[start][name] = 0;
      
      weeklyTotals[start][name] += (r.distance || 0);
      validHunters.add(name);
    });

    const sortedWeeks = Object.keys(weeklyTotals).map(Number).sort((a, b) => b - a);
    if (sortedWeeks.length === 0) return { name: "無資料", weeks: "00" };

    const weeklyWinners: Record<number, string | null> = {};
    sortedWeeks.forEach(weekStart => {
      let maxDist = 0;
      let winner = null;
      for (const [name, dist] of Object.entries(weeklyTotals[weekStart])) {
        if (dist > maxDist) {
          maxDist = dist;
          winner = name;
        }
      }
      weeklyWinners[weekStart] = winner;
    });

    const latestWeek = sortedWeeks[0];
    const champion = weeklyWinners[latestWeek] || "尚無冠軍";
    
    let streak = 0;
    if (champion !== "尚無冠軍") {
      for (const weekStart of sortedWeeks) {
        if (weeklyWinners[weekStart] === champion) {
          streak++;
        } else {
          break;
        }
      }
    }

    return { 
      name: champion, 
      weeks: streak.toString().padStart(2, '0') 
    };
  }, [runningData]);

  // Set default hunter to the current champion when data loads
  useEffect(() => {
    if (!selectedPersonalHunter && dashboardData.name && !["計算中...", "無資料", "尚無冠軍"].includes(dashboardData.name)) {
      setSelectedPersonalHunter(dashboardData.name);
    }
  }, [dashboardData.name, selectedPersonalHunter]);

  // Extract hunters list and sort by current week's running distance
  const huntersList = useMemo(() => {
    if (!basicData?.rows || basicData.rows.length < 3) return [];
    
    const hunterSet = new Set<string>();
    for (let i = 2; i < basicData.rows.length; i++) {
      if (basicData.rows[i][1]) hunterSet.add(basicData.rows[i][1]);
    }
    const allHunters = Array.from(hunterSet);

    const normalizeName = (name: string) => {
      if (!name) return '';
      let n = name.replace(/[\.\s]/g, '').toUpperCase();
      if (n === 'WWENJUN' || n === 'WEIWENJUN') return '魏文軍';
      if (n === '盧政恆') return '盧政恒';
      return n;
    };

    const currentWeekDistance = new Map<string, number>();
    
    if (runningData && runningData.length > 0) {
      let latestWeekStart = 0;
      runningData.forEach((r: any) => {
        const d = new Date(r.date);
        if (isNaN(d.getTime())) return;
        const { start } = getWeekRange(d);
        if (start > latestWeekStart) latestWeekStart = start;
      });

      runningData.forEach((r: any) => {
        const d = new Date(r.date);
        if (isNaN(d.getTime())) return;
        const { start } = getWeekRange(d);
        if (start === latestWeekStart) {
          const name = normalizeName(r.name);
          currentWeekDistance.set(name, (currentWeekDistance.get(name) || 0) + (r.distance || 0));
        }
      });
    }

    return allHunters.sort((a, b) => {
      const distA = currentWeekDistance.get(normalizeName(a)) || 0;
      const distB = currentWeekDistance.get(normalizeName(b)) || 0;
      return distB - distA; // Descending
    });
  }, [basicData, runningData]);



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
    const normalizeName = (name: string) => {
      if (!name) return '';
      let n = name.replace(/[\.\s]/g, '').toUpperCase();
      if (n === 'WWENJUN' || n === 'WEIWENJUN') return '魏文軍';
      if (n === '盧政恆') return '盧政恒';
      return n;
    };
    const normalizedSelected = normalizeName(selectedPersonalHunter);
    return runningData.filter((r: any) => normalizeName(r.name) === normalizedSelected);
  }, [runningData, selectedPersonalHunter]);

  const availableMonths = useMemo(() => {
    const months = [];
    const now = new Date();
    
    let earliestDate = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
    if (personalRecords && personalRecords.length > 0) {
      const dates = personalRecords.map((r: any) => new Date(r.date).getTime()).filter((t: number) => !isNaN(t));
      if (dates.length > 0) {
        const minTime = Math.min(...dates);
        const minDate = new Date(minTime);
        const recordEarliest = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        if (recordEarliest < earliestDate) {
          earliestDate = recordEarliest;
        }
      }
    }
    
    let curr = new Date(now.getFullYear(), now.getMonth(), 1);
    while (curr >= earliestDate) {
      months.push(new Date(curr.getTime()));
      curr.setMonth(curr.getMonth() - 1);
    }
    
    return months;
  }, [personalRecords]);

  const past12WeeksData = useMemo(() => {
    const now = new Date();
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
      const time = weekRecords.reduce((sum: number, r: any) => sum + parseFloat(r.timeStr || "0"), 0);
      const elev = weekRecords.reduce((sum: number, r: any) => sum + r.elevation, 0);

      const startD = new Date(start);
      const endD = new Date(end);
      const endLabel = `${endD.getFullYear()}/${(endD.getMonth()+1).toString().padStart(2, '0')}/${endD.getDate().toString().padStart(2, '0')}`;
      
      past12.push({
        label: `${d.getMonth()+1}/${d.getDate()}`,
        value: dist,
        distance: dist.toFixed(2),
        timeFormatted: formatTime(time),
        pace: calculatePace(time, dist),
        elevation: elev.toFixed(0),
        endLabel: endLabel
      });
    }

    return past12;
  }, [personalRecords]);

  const past12MonthsData = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const months = [];
    
    const selectedYear = selectedCalendarDate?.getFullYear() || currentYear;
    const selectedMonth = selectedCalendarDate?.getMonth() || currentMonth;
    
    for (let i = 11; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      
      const monthRecords = personalRecords.filter((r: any) => {
        const t = new Date(r.date);
        return !isNaN(t.getTime()) && t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth();
      });
      
      const totalMinutes = monthRecords.reduce((sum: number, r: any) => sum + parseFloat(r.timeStr || "0"), 0);
      const totalHours = totalMinutes / 60;
      
      const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
      months.push({
        label: monthNames[d.getMonth()],
        value: totalHours,
        isActive: d.getFullYear() === selectedYear && d.getMonth() === selectedMonth,
        date: d,
      });
    }
    return months;
  }, [personalRecords, selectedCalendarDate]);

  const monthlyCalendarData = useMemo(() => {
    const realNow = new Date();
    const targetDate = selectedCalendarDate || realNow;
    const currentYear = targetDate.getFullYear();
    const currentMonth = targetDate.getMonth();
    
    // 1. Calculate yearly activities
    let yearlyActivities = 0;
    personalRecords.forEach((r: any) => {
      const d = new Date(r.date);
      if (!isNaN(d.getTime()) && d.getFullYear() === currentYear && r.distance > 0) {
        yearlyActivities++;
      }
    });

    // 2. Calculate MAX streak for Top Left
    const weeklyActivity = new Set<number>();
    personalRecords.forEach((r: any) => {
      if (r.distance > 0) {
        const d = new Date(r.date);
        if (!isNaN(d.getTime())) {
          const { start } = getWeekRange(d);
          weeklyActivity.add(start);
        }
      }
    });

    const sortedWeeks = Array.from(weeklyActivity).sort((a, b) => a - b);
    let maxStreakWeeks = 0;
    let tempStreak = 0;
    let previousWeek: number | null = null;
    
    for (const week of sortedWeeks) {
       if (previousWeek === null) {
           tempStreak = 1;
       } else {
           if (week - previousWeek === 7 * 24 * 60 * 60 * 1000) {
               tempStreak++;
           } else {
               tempStreak = 1;
           }
       }
       if (new Date(week).getFullYear() === currentYear) {
           if (tempStreak > maxStreakWeeks) {
               maxStreakWeeks = tempStreak;
           }
       }
       previousWeek = week;
    }

    // 3. Calendar for current month
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    
    let startDayOfWeek = firstDay.getDay() === 0 ? 7 : firstDay.getDay();
    
    const calendarDays = [];
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i > 0; i--) {
      calendarDays.push({ day: prevMonthLastDay - i + 1, active: false, isCurrentMonth: false, id: `prev-${i}` });
    }
    
    const currentYearRecords = personalRecords
      .filter((r: any) => {
        const d = new Date(r.date);
        return !isNaN(d.getTime()) && d.getFullYear() === currentYear && r.distance > 0;
      })
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let dayCount = 0;
    let lastDateStr = "";
    const recordIndices = new Map<any, number>();
    currentYearRecords.forEach((r: any) => {
       const dateStr = new Date(r.date).toDateString();
       if (dateStr !== lastDateStr) {
           dayCount++;
           lastDateStr = dateStr;
       }
       recordIndices.set(r, dayCount);
    });

    for (let i = 1; i <= lastDay.getDate(); i++) {
      const dayRecords = currentYearRecords.filter((r: any) => {
        const rDate = new Date(r.date);
        return rDate.getMonth() === currentMonth && rDate.getDate() === i;
      });
      const hasActivity = dayRecords.length > 0;
      calendarDays.push({ 
        day: i, 
        active: hasActivity, 
        isCurrentMonth: true, 
        id: `curr-${i}`,
        records: hasActivity ? dayRecords.map((r: any) => ({ ...r, nthRun: recordIndices.get(r) })) : null
      });
    }
    
    let nextMonthDay = 1;
    while (calendarDays.length % 7 !== 0) {
      calendarDays.push({ day: nextMonthDay++, active: false, isCurrentMonth: false, id: `next-${nextMonthDay}` });
    }

    const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
    
    const totalRows = calendarDays.length / 7;
    const isCurrentMonthReal = currentYear === realNow.getFullYear() && currentMonth === realNow.getMonth();
    
    let currentRowIndex = -1;
    if (isCurrentMonthReal) {
       const currentDayIndex = calendarDays.findIndex(d => d.isCurrentMonth && d.day === realNow.getDate());
       currentRowIndex = currentDayIndex !== -1 ? Math.floor(currentDayIndex / 7) : (totalRows - 1);
    } else if (currentYear < realNow.getFullYear() || (currentYear === realNow.getFullYear() && currentMonth < realNow.getMonth())) {
       // Past month: find the last active day
       for (let i = calendarDays.length - 1; i >= 0; i--) {
          if (calendarDays[i].isCurrentMonth && calendarDays[i].active) {
             currentRowIndex = Math.floor(i / 7);
             break;
          }
       }
    }

    let currentMonthStreak = 0;
    if (currentRowIndex >= 0) {
       const rowStartDay = calendarDays[currentRowIndex * 7];
       let rowDate;
       if (rowStartDay.id.startsWith('prev-')) rowDate = new Date(currentYear, currentMonth - 1, rowStartDay.day);
       else if (rowStartDay.id.startsWith('curr-')) rowDate = new Date(currentYear, currentMonth, rowStartDay.day);
       else rowDate = new Date(currentYear, currentMonth + 1, rowStartDay.day);
       
       const { start: targetStreakWeekStart } = getWeekRange(rowDate);
       const lastWeekStart = targetStreakWeekStart - 7 * 24 * 60 * 60 * 1000;
       
       let checkWeek = targetStreakWeekStart;
       if (!weeklyActivity.has(targetStreakWeekStart) && weeklyActivity.has(lastWeekStart)) {
         checkWeek = lastWeekStart;
       }
       while (weeklyActivity.has(checkWeek)) {
         currentMonthStreak++;
         checkWeek -= 7 * 24 * 60 * 60 * 1000;
       }
    }

    let monthlyDistance = 0;
    let monthlyTime = 0;
    personalRecords.forEach((r: any) => {
      const d = new Date(r.date);
      if (!isNaN(d.getTime()) && d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
        monthlyDistance += (r.distance || 0);
        monthlyTime += parseFloat(r.timeStr || "0");
      }
    });
    
    let monthlyAveragePace = "--:--";
    if (monthlyDistance > 0 && monthlyTime > 0) {
      monthlyAveragePace = calculatePace(monthlyTime, monthlyDistance);
    }

    return {
      monthLabel: `${currentYear} ${monthNames[currentMonth]}`,
      yearlyActivities,
      maxStreakWeeks,
      currentMonthStreak,
      calendarDays,
      totalRows,
      currentRowIndex,
      monthlyDistance: monthlyDistance.toFixed(0),
      monthlyAveragePace
    };
  }, [personalRecords, selectedCalendarDate]);

  const [selectedChartIndex, setSelectedChartIndex] = useState<number>(11);

  useEffect(() => {
    setSelectedChartIndex(11);
  }, [selectedPersonalHunter]);

  const selectedWeek = past12WeeksData[selectedChartIndex] || past12WeeksData[11];

  const [leaderboardMetric, setLeaderboardMetric] = useState<"distance" | "pace" | "elevation">("distance");

  const guildLeaderboardData = useMemo(() => {
    if (!runningData || runningData.length === 0) return [];

    const normalizeName = (name: string) => {
      if (!name) return '';
      let n = name.replace(/[\.\s]/g, '').toUpperCase();
      if (n === 'WWENJUN' || n === 'WEIWENJUN') return '魏文軍';
      if (n === '盧政恆') return '盧政恒';
      return n;
    };

    // 提醒：計算當年度資料，明年會自動重新計算下一年度
    const targetYear = new Date().getFullYear();
    const start = new Date(targetYear, 0, 1).getTime();
    const end = new Date(targetYear, 11, 31, 23, 59, 59, 999).getTime();

    const statsByHunter: Record<string, { distance: number, time: number, elevation: number }> = {};

    runningData.forEach((r: any) => {
      const name = normalizeName(r.name);
      if (!name || name === 'SENSESOIL' || name.includes('COMPANY')) return;
      
      const rt = new Date(r.date).getTime();
      if (rt >= start && rt <= end) {
        if (!statsByHunter[name]) {
          statsByHunter[name] = { distance: 0, time: 0, elevation: 0 };
        }
        statsByHunter[name].distance += (r.distance || 0);
        statsByHunter[name].time += parseFloat(r.timeStr || "0");
        statsByHunter[name].elevation += (r.elevation || 0);
      }
    });

    let result = Object.entries(statsByHunter).map(([name, stats]) => {
      let paceVal = stats.distance > 0 ? (stats.time / stats.distance) : 0;
      return {
        name,
        distance: stats.distance,
        time: stats.time,
        elevation: stats.elevation,
        paceRaw: paceVal,
        paceFormatted: calculatePace(stats.time, stats.distance)
      };
    }).filter(r => r.distance > 0);

    if (leaderboardMetric === 'distance') {
      result.sort((a, b) => b.distance - a.distance);
    } else if (leaderboardMetric === 'elevation') {
      result.sort((a, b) => b.elevation - a.elevation);
    } else if (leaderboardMetric === 'pace') {
      result.sort((a, b) => a.paceRaw - b.paceRaw);
    }

    const maxVal = result.length > 0 ? (
      leaderboardMetric === 'distance' ? result[0].distance :
      leaderboardMetric === 'elevation' ? result[0].elevation :
      result[result.length - 1].paceRaw
    ) : 1;

    return result.map((item, idx) => ({
      ...item,
      rank: idx + 1,
      barPct: maxVal > 0 ? (leaderboardMetric === 'distance' ? (item.distance / maxVal) * 100 :
              leaderboardMetric === 'elevation' ? (item.elevation / maxVal) * 100 :
              (result[0].paceRaw / item.paceRaw) * 100) : 0 
    }));
  }, [runningData, selectedCalendarDate, leaderboardMetric]);

  return (
    <div className="bg-background text-on-background font-body-lg overflow-x-hidden selection:bg-primary-container selection:text-on-primary-container font-display min-h-screen pb-20">
      <header className="fixed top-0 w-full z-50 flex justify-between items-center h-16 bg-surface/90 backdrop-blur-md border-b border-primary/30 shadow-[0_8px_20px_rgba(243,156,18,0.3)] px-4">
        <div className="flex items-center gap-3 flex-nowrap cursor-pointer" onClick={() => router.push("/diversion")}>
          <Image priority alt="SenseSoil Logo" width={28} height={28} className="h-[28px] w-auto object-contain flex-shrink-0 translate-y-[-2px]" src="/Logo｜Orange.svg" />
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

      <PullToRefresh>
        <main className="relative pt-16 px-4">
          {/* Top Header - Team View */}
        <div className={`flex flex-row justify-between items-start shadow-[inset_0_0_15px_rgba(243,156,18,0.05)] ${view === 'individual' ? 'hidden' : ''}`} style={{ marginTop: 32, marginBottom: 32 }}>
          <div className="flex flex-col border-l-[3px] border-primary pl-3 flex-1 pr-4">
            <p className="font-label-caps text-white font-bold text-[12px] tracking-[0.1em] mb-3 leading-none whitespace-nowrap">狩獵週排行榜</p>
            <h2 className={`font-headline-lg text-white font-bold tracking-wider uppercase leading-none ${dashboardData.name.length > 4 ? 'text-xl mt-1' : 'text-3xl'}`}>{dashboardData.name}</h2>
          </div>
          <div className="text-right flex flex-col justify-end flex-shrink-0">
            <p className="font-label-caps text-white font-bold text-[12px] tracking-[0.1em] mb-3 uppercase leading-none whitespace-nowrap">蟬聯冠軍週數</p>
            <p className="font-headline-lg text-white text-3xl font-bold tracking-tighter font-display shadow-primary/20 flex items-baseline justify-end gap-1 leading-none">{dashboardData.weeks}</p>
          </div>
        </div>

        {/* Top Header - Individual View */}
        <div className={`flex flex-row justify-between items-start shadow-[inset_0_0_15px_rgba(243,156,18,0.05)] ${view === 'team' ? 'hidden' : ''}`} style={{ marginTop: 32, marginBottom: 32 }}>
          <div className="flex flex-col border-l-[3px] border-primary pl-3 relative flex-1 pr-4">
            <style>{`
              @keyframes textReveal {
                0% { opacity: 0; filter: blur(3px); transform: translateX(-4px); }
                100% { opacity: 1; filter: blur(0); transform: translateX(0); }
              }
              .animate-text-reveal {
                animation: textReveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
              }
            `}</style>
            <p 
              className={`font-label-caps text-primary font-bold text-[12px] tracking-[0.2em] mb-3 leading-none ${isAdmin ? "cursor-pointer" : ""}`}
              onClick={() => { if(isAdmin) setIsPersonalHunterDropdownOpen(!isPersonalHunterDropdownOpen) }}
            >
              {hunterRank}
            </p>
              <h2 
                key={selectedPersonalHunter}
                className={`font-headline-lg text-primary text-3xl font-bold tracking-wider uppercase leading-none transition-opacity ${isAdmin ? "cursor-pointer hover:opacity-80" : ""} animate-text-reveal`}
                onClick={() => { if(isAdmin) setIsPersonalHunterDropdownOpen(!isPersonalHunterDropdownOpen) }}
              >
                {selectedPersonalHunter || "載入中..."}
              </h2>
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
          <div className="text-right flex flex-col justify-end flex-shrink-0">
            <p className="font-label-caps text-white font-bold text-[12px] tracking-[0.1em] mb-3 uppercase leading-none whitespace-nowrap">總累積獎金餘額</p>
            <div className="font-headline-lg text-[#00E5FF] text-3xl font-bold tracking-tighter font-display flex items-baseline justify-end gap-1 leading-none">
              <span className="text-xl">$</span>{calculatedAwardTotal.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Personal Dashboard (Individual View) */}
        <section className={`mb-[5px] ${view === 'team' ? 'hidden' : ''}`}>
          <div className="pt-5 pb-8 px-5 sm:px-6 -mx-4 bg-[#121212] font-display">

            {/* Assets List */}
            <div className="flex justify-between items-center mb-6 relative z-10 h-[32px]">
              <button 
                onClick={() => setIsAwardYearDropdownOpen(!isAwardYearDropdownOpen)}
                className="flex items-center gap-1 font-label-caps text-primary font-bold text-[12px] tracking-[0.1em] leading-none uppercase hover:text-[#00E5FF] transition-colors"
              >
                {awardYear} 年度資產庫
              </button>
              
              {isAwardYearDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsAwardYearDropdownOpen(false)} />
                  <div className="absolute top-full left-0 mt-2 bg-[#1A1A1A] border border-primary/30 rounded-lg shadow-xl z-50 min-w-[180px] overflow-hidden">
                    {['2026', '2027', '2028', '2029'].map(year => (
                      <button
                        key={year}
                        className={`w-full text-left px-4 py-3 font-display font-bold text-[16px] transition-colors ${awardYear === year ? 'text-black bg-primary' : 'text-[#efe0d2] hover:bg-white/10'}`}
                        onClick={() => {
                          setAwardYear(year);
                          setIsAwardYearDropdownOpen(false);
                        }}
                      >
                        {year}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            
            <div className={`flex flex-col gap-3 pb-8 transition-opacity duration-300 ${isAwardsLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              {/* L1 Asset */}
              <div 
                className="flex flex-col p-4 rounded-lg bg-surface-container-low/50 border border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => toggleAwardLevel('L1')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-primary text-[12px] font-bold tracking-widest mb-1">
                      L1 基礎紀律
                    </span>
                    <span className="text-white font-bold text-sm">團跑連續 {displayAward.L1.runs}/4 次</span>
                  </div>
                  <div className="text-right flex flex-col justify-end">
                    <span className={`text-[12px] font-bold ${(parseInt(displayAward.L1.runs) >= 4) ? 'text-[#00E5FF]' : 'text-white/30'}`}>
                      {(parseInt(displayAward.L1.runs) >= 4) ? (getItemInfo(displayAward.L1.reward)?.name || displayAward.L1.reward || "已解鎖") : "未解鎖"}
                    </span>
                    {renderRewardSubText(displayAward.L1.runs, 4, displayAward.L1.reward, displayAward.L1.date)}
                  </div>
                </div>
                {expandedAwardLevel === 'L1' && (
                  <div className="mt-3 pt-3 border-t border-white/10 text-[12px] text-white/60 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200">
                    參與公司團跑，連續出席4次以建立穩定的基礎紀律。解鎖後可獲得恢復裝備。連續出席再多2次解鎖兌換獎金。
                  </div>
                )}
              </div>

              {/* L2 Asset */}
              <div 
                className="flex flex-col p-4 rounded-lg bg-surface-container-low/50 border border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => toggleAwardLevel('L2')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-primary text-[12px] font-bold tracking-widest mb-1">
                      L2 突破極限
                    </span>
                    <span className="text-white font-bold text-sm">紀錄突破 {displayAward.L2.prs}/8 次</span>
                  </div>
                  <div className="text-right flex flex-col justify-end">
                    <span className={`text-[12px] font-bold ${(parseInt(displayAward.L2.prs) >= 8) ? 'text-[#00E5FF]' : 'text-white/30'}`}>
                      {(parseInt(displayAward.L2.prs) >= 8) ? (getItemInfo(displayAward.L2.reward)?.name || displayAward.L2.reward || "已解鎖") : "未解鎖"}
                    </span>
                    {renderRewardSubText(displayAward.L2.prs, 8, displayAward.L2.reward, displayAward.L2.date)}
                  </div>
                </div>
                {expandedAwardLevel === 'L2' && (
                  <div className="mt-3 pt-3 border-t border-white/10 text-[12px] text-white/60 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200">
                    突破極限，挑戰個人最佳跑量里程紀錄，累積突破 8 次解鎖監測裝備。累積突破再多2次解鎖兌換獎金。
                  </div>
                )}
              </div>

              {/* L3 Asset */}
              <div 
                className="flex flex-col p-4 rounded-lg bg-surface-container-low/50 border border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => toggleAwardLevel('L3')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-primary text-[12px] font-bold tracking-widest mb-1">
                      L3 毅力試煉
                    </span>
                    <span className="text-white font-bold text-sm">紀錄突破 {displayAward.L3.prs}/18 次</span>
                  </div>
                  <div className="text-right flex flex-col justify-end">
                    <span className={`text-[12px] font-bold ${(parseInt(displayAward.L3.prs) >= 18) ? 'text-[#00E5FF]' : 'text-white/30'}`}>
                      {(parseInt(displayAward.L3.prs) >= 18) ? (getItemInfo(displayAward.L3.reward)?.name || displayAward.L3.reward || "已解鎖") : "未解鎖"}
                    </span>
                    {renderRewardSubText(displayAward.L3.prs, 18, displayAward.L3.reward, displayAward.L3.date)}
                  </div>
                </div>
                {expandedAwardLevel === 'L3' && (
                  <div className="mt-3 pt-3 border-t border-white/10 text-[12px] text-white/60 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200">
                    展現無比毅力超越自我，挑戰個人最佳距離紀錄，累積突破18次解鎖進階監測裝備。累積突破再多2次解鎖兌換獎金。
                  </div>
                )}
              </div>

              {/* L4 Asset (Detailed Months) */}
              <div className="flex flex-col p-4 rounded-lg bg-surface-container-low/50 border border-white/5">
                <div 
                  className="flex items-center justify-between mb-3 pb-3 border-b border-white/10 cursor-pointer"
                  onClick={() => toggleAwardLevel('L4')}
                >
                  <div className="flex flex-col">
                    <span className="text-primary text-[12px] font-bold tracking-widest mb-1">
                      L4 月度挑戰
                    </span>
                    <span className="text-white font-bold text-sm">已達成 {displayAward.L4.months.filter(m => m && m.reward && m.reward !== '0' && m.reward !== '-').length}/12 個月</span>
                  </div>
                  <div className="text-right flex flex-col justify-end">
                    <span className={`text-[16px] font-mono font-bold ${displayAward.L4.totalB > 0 ? 'text-[#00E5FF]' : 'text-white/30'}`}>
                      {displayAward.L4.totalB > 0 ? `+$${displayAward.L4.totalB.toLocaleString()}` : "$0"}
                    </span>
                    {displayAward.L4.totalB > 0 && (
                      <span className="text-[#00E5FF]/50 text-[11px] mt-0.5">
                        {unredeemedBalanceL4 > 0 ? `未兌換餘額 ${unredeemedBalanceL4.toLocaleString()}` : '已全數兌換'}
                      </span>
                    )}
                  </div>
                </div>
                {expandedAwardLevel === 'L4' && (
                  <div className="mb-4 text-[12px] text-white/60 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200">
                    完成每月專屬指標5K或10K，即可獲得對應的高額獎勵金。
                  </div>
                )}
                {/* Monthly Details Grid */}
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {Array.from({ length: 12 }).map((_, i) => {
                    const monthData = displayAward.L4.months.find(m => m.month === i + 1);
                    const achieved = monthData && monthData.reward && monthData.reward !== '0' && monthData.reward !== '-';
                    return (
                      <div key={i} className={`flex justify-between items-center px-3 py-2 rounded ${achieved ? 'bg-[#00E5FF]/10 border border-[#00E5FF]/30' : 'bg-white/5 border border-transparent'}`}>
                        <span className={`text-[12px] font-bold ${achieved ? 'text-white' : 'text-white/30'}`}>{i + 1}月</span>
                        <div className="text-right">
                          <span className={`text-[11px] font-bold block ${achieved ? 'text-[#00E5FF]' : 'text-white/30'}`}>
                            {monthData ? monthData.reward || "達成" : "-"}
                          </span>
                          {achieved && monthData.date && (
                            <span className="text-[#00E5FF]/50 text-[10px] block mt-0.5">已兌換 {monthData.date}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* L5 Asset */}
              <div 
                className="flex flex-col p-4 rounded-lg bg-surface-container-low/50 border border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => toggleAwardLevel('L5')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-primary text-[12px] font-bold tracking-widest mb-1">
                      L5 年度遠征
                    </span>
                    <span className="text-white font-bold text-sm">總跑量 {displayAward.L5.distance}/85.5K</span>
                    {displayAward.L5.date && <span className="text-white/40 text-[11px] mt-0.5">達成 {displayAward.L5.date}</span>}
                  </div>
                  <div className="text-right flex flex-col justify-end">
                    <span className={`font-bold ${displayAward.L5.totalC > 0 ? 'text-[16px] font-mono text-[#00E5FF]' : 'text-[12px] text-white/30'}`}>
                      {displayAward.L5.totalC > 0 ? `+$${displayAward.L5.totalC.toLocaleString()}` : "未解鎖"}
                    </span>
                    {displayAward.L5.totalC > 0 && (
                      displayAward.L5.date ? (
                        <span className="text-[#00E5FF]/50 text-[11px] mt-0.5">已兌換 {displayAward.L5.date}</span>
                      ) : displayAward.L5.reward ? (
                        <span className="text-[#00E5FF]/50 text-[11px] mt-0.5">未兌換餘額 {displayAward.L5.reward}</span>
                      ) : null
                    )}
                  </div>
                </div>
                {expandedAwardLevel === 'L5' && (
                  <div className="mt-3 pt-3 border-t border-white/10 text-[12px] text-white/60 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200">
                    達年度累積總跑量里程解鎖高額獎金，85.5K為基本門檻。這是對全年不懈努力的自己最高致敬，持之以恆，用累積創造奇蹟！
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Guild Leaderboard */}
        <section className={`mb-[5px] ${view === 'individual' ? 'hidden' : ''}`}>
          <div className="pt-5 pb-8 px-5 sm:px-6 -mx-4 bg-[#121212] font-display">
            <div>
              <div className="flex justify-between items-center mb-6 relative z-10 h-[32px]">
                <div className="relative">
                  <button 
                    onClick={() => setIsLeaderboardYearDropdownOpen(!isLeaderboardYearDropdownOpen)}
                    className="flex items-center gap-1 font-label-caps text-primary font-bold text-[12px] tracking-[0.1em] leading-none uppercase hover:text-[#00E5FF] transition-colors"
                  >
                    {awardYear} 年度排行榜
                  </button>
                  
                  {isLeaderboardYearDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsLeaderboardYearDropdownOpen(false)} />
                      <div className="absolute top-full left-0 mt-2 bg-[#1A1A1A] border border-primary/30 rounded-lg shadow-xl z-50 min-w-[120px] overflow-hidden">
                        {['2026', '2027', '2028', '2029'].map(year => (
                          <button
                            key={year}
                            className={`w-full text-left px-4 py-3 font-display font-bold text-[16px] transition-colors ${awardYear === year ? 'text-black bg-primary' : 'text-[#efe0d2] hover:bg-white/10'}`}
                            onClick={() => {
                              setAwardYear(year);
                              setIsLeaderboardYearDropdownOpen(false);
                            }}
                          >
                            {year}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                
                <div className="flex bg-[#1E1E1E] rounded-full p-1 border border-primary/20">
                  <button 
                    onClick={() => setLeaderboardMetric('distance')}
                    className={`px-3 py-1 rounded-full text-[10px] tracking-wider transition-colors ${leaderboardMetric === 'distance' ? 'bg-primary text-black font-bold' : 'text-white/60 hover:text-white font-normal'}`}
                  >距離</button>
                  <button 
                    onClick={() => setLeaderboardMetric('pace')}
                    className={`px-3 py-1 rounded-full text-[10px] tracking-wider transition-colors ${leaderboardMetric === 'pace' ? 'bg-primary text-black font-bold' : 'text-white/60 hover:text-white font-normal'}`}
                  >配速</button>
                  <button 
                    onClick={() => setLeaderboardMetric('elevation')}
                    className={`px-3 py-1 rounded-full text-[10px] tracking-wider transition-colors ${leaderboardMetric === 'elevation' ? 'bg-primary text-black font-bold' : 'text-white/60 hover:text-white font-normal'}`}
                  >爬升</button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {guildLeaderboardData.length > 0 ? guildLeaderboardData.map((item, index) => {
                  const maxIndex = Math.max(1, guildLeaderboardData.length - 1);
                  const barOpacity = 1 - (0.3 * (index / maxIndex));
                  return (
                  <div key={item.name} className="flex items-center w-full gap-3">
                    <span className="text-[#efe0d2]/70 text-[12px] font-display w-4 text-left shrink-0">{item.rank}</span>
                    <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${item.rank <= 3 ? 'bg-primary/20 border-primary text-primary' : 'bg-white/10 border-white/20 text-white/80'} ${item.rank === 1 ? 'shadow-[0_0_8px_rgba(243,156,18,0.8)]' : ''}`}>
                      <span className={`text-[12px] ${item.rank === 1 ? 'font-bold' : 'font-normal'}`}>{item.name.slice(-1)}</span>
                    </div>
                    <div className="flex-1 h-2 bg-primary/10 rounded-r-sm overflow-visible flex relative">
                      <div 
                        className={`h-full bg-primary transition-all duration-700 ease-out ${item.rank === 1 ? 'shadow-[0_0_8px_rgba(243,156,18,0.8)]' : ''}`} 
                        style={{ width: `${item.barPct}%`, opacity: barOpacity }}
                      ></div>
                    </div>
                    <div className="w-16 text-right shrink-0">
                      {leaderboardMetric === 'distance' && (
                        <div className="flex items-baseline justify-end gap-0.5">
                          <span className="text-white text-[13px] font-bold font-mono">{item.distance.toFixed(1)}</span>
                          <span className="text-white/70 text-[10px]">km</span>
                        </div>
                      )}
                      {leaderboardMetric === 'pace' && (
                        <div className="flex items-baseline justify-end gap-0.5">
                          <span className="text-white text-[13px] font-bold font-mono">{item.paceFormatted}</span>
                          <span className="text-white/70 text-[10px]">/km</span>
                        </div>
                      )}
                      {leaderboardMetric === 'elevation' && (
                        <div className="flex items-baseline justify-end gap-0.5">
                          <span className="text-white text-[13px] font-bold font-mono">{item.elevation.toFixed(0)}</span>
                          <span className="text-white/70 text-[10px]">m</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}) : (
                  <div className="text-center text-primary/50 text-xs py-4">本年度暫無團隊數據</div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Team Module Content (Weekly Stats) */}
        <section className={`mb-[5px] ${view === 'individual' ? 'hidden' : ''}`}>
          <div className="pt-5 pb-6 px-5 sm:px-6 -mx-4 font-display">
            <div className="flex justify-between items-start mb-8 font-display">
              <div className="flex flex-col relative">
                <p 
                  className={`font-label-caps text-primary font-bold text-[12px] tracking-[0.1em] mb-3 leading-none inline-block ${isAdmin ? "transition-opacity cursor-pointer hover:opacity-80" : ""}`}
                  onClick={() => { if(isAdmin) setIsPersonalHunterDropdownOpen(!isPersonalHunterDropdownOpen) }}
                >
                  狩獵分析
                </p>
                <div className="flex items-center gap-2">
                  <h2 
                    key={selectedPersonalHunter}
                    className={`font-headline-lg text-primary text-3xl font-bold tracking-wider uppercase leading-none transition-opacity ${isAdmin ? "cursor-pointer hover:opacity-80" : ""} animate-text-reveal`}
                    onClick={() => { if(isAdmin) setIsPersonalHunterDropdownOpen(!isPersonalHunterDropdownOpen) }}
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
              <div className="flex items-center gap-2">
                <span className="text-white text-[12px] tracking-widest flex items-center gap-1">
                  <span className="font-normal">週紀錄</span>
                  <span className="font-bold">{selectedWeek?.endLabel || "載入中..."}</span>
                </span>
                <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_10px_rgba(243,156,18,1)]" />
              </div>
            </div>
            <div className="flex justify-between w-full items-start">
              <div className="flex flex-col whitespace-nowrap">
                <p className="text-[12px] text-[#efe0d2]/70 tracking-[0.1em] mb-1">距離</p>
                <div className="flex items-baseline">
                  <span className="text-[22px] sm:text-3xl text-white tracking-tighter">{selectedWeek?.distance || "0.00"}</span>
                  <span className="text-[12px] text-white ml-0.5">km</span>
                </div>
              </div>
              <div className="flex flex-col whitespace-nowrap">
                <p className="text-[12px] text-[#efe0d2]/70 tracking-[0.1em] mb-1">時間</p>
                <div className="flex items-baseline">
                  <span className="text-[22px] sm:text-3xl text-white tracking-tighter">
                    {(() => {
                      const str = selectedWeek?.timeFormatted || "0m";
                      const parts = str.match(/(\d+)([hm])/g);
                      if (!parts) return str;
                      return parts.map((part, i) => {
                        const match = part.match(/(\d+)([hm])/);
                        if (!match) return part;
                        return (
                          <span key={i} className="inline-flex items-baseline">
                            {match[1]}
                            <span className="text-[12px] text-white ml-0.5 mr-1">{match[2]}</span>
                          </span>
                        );
                      });
                    })()}
                  </span>
                </div>
              </div>
              <div className="flex flex-col whitespace-nowrap">
                <p className="text-[12px] text-[#efe0d2]/70 tracking-[0.1em] mb-1">配速</p>
                <div className="flex items-baseline">
                  <span className="text-[22px] sm:text-3xl text-white tracking-tighter">{selectedWeek?.pace || "--:--"}</span>
                </div>
              </div>
              <div className="flex flex-col whitespace-nowrap text-right items-end">
                <div className="text-left">
                  <p className="text-[12px] text-[#efe0d2]/70 tracking-[0.1em] mb-1">爬升</p>
                  <div className="flex items-baseline">
                    <span className="text-[22px] sm:text-3xl text-white tracking-tighter">{selectedWeek?.elevation || "0"}</span>
                    <span className="text-[12px] text-white ml-0.5">m</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="font-display mt-[40px] pb-5">
            <SmoothLineChart 
              key={selectedPersonalHunter}
              data={past12WeeksData} 
              selectedIndex={selectedChartIndex} 
              onSelect={setSelectedChartIndex} 
            />
            <div className="flex justify-between mt-3 px-2">
               <span className="text-[12px] text-[#efe0d2]/70 font-data-mono font-normal tracking-[0.1em]">{past12WeeksData[0]?.label}</span>
               <span className="text-[12px] text-[#efe0d2]/70 font-data-mono font-normal tracking-[0.1em]">{past12WeeksData[5]?.label}</span>
               <span className="text-[12px] text-[#efe0d2]/70 font-data-mono font-normal tracking-[0.1em]">{past12WeeksData[11]?.label}</span>
            </div>
          </div>
        </section>

        {/* Individual Module Content (Monthly Record) - Now in Team View */}
        <section className={`mb-[32px] ${view === 'individual' ? 'hidden' : ''}`}>
          <div className="pt-6 pb-8 px-5 sm:px-6 -mx-4 bg-[#121212] font-display">
            

            <div 
              className="flex items-center mb-4 cursor-pointer hover:opacity-80 transition-opacity w-max"
              onClick={() => setIsMonthSelectorOpen(true)}
            >
              <h3 className="text-primary text-[22px] font-bold tracking-wide">{monthlyCalendarData.monthLabel}</h3>
            </div>
            
            <div className="flex justify-between w-full gap-2 mb-5">
              <div className="flex flex-col">
                <span className="text-[#efe0d2]/70 text-[12px] tracking-[0.1em] mb-1">連續紀錄</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-white text-[22px] font-bold tracking-tighter">{monthlyCalendarData.maxStreakWeeks}</span>
                  <span className="text-white text-sm font-bold">週</span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[#efe0d2]/70 text-[12px] tracking-[0.1em] mb-1">今年累計次數</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-white text-[22px] font-bold tracking-tighter">{monthlyCalendarData.yearlyActivities}</span>
                  <span className="text-white text-[12px] font-bold">次</span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[#efe0d2]/70 text-[12px] tracking-[0.1em] mb-1">月跑量</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-white text-[22px] font-bold tracking-tighter">{monthlyCalendarData.monthlyDistance}</span>
                  <span className="text-white text-sm font-bold">km</span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[#efe0d2]/70 text-[12px] tracking-[0.1em] mb-1">月均速</span>
                <div className="flex items-baseline">
                  <span className="text-white text-[22px] font-bold tracking-tighter">{monthlyCalendarData.monthlyAveragePace}</span>
                </div>
              </div>
            </div>
            
            {/* Calendar & Streak Flex Layout */}
            <div className="flex flex-col gap-y-3 w-full mt-2">
              {/* Header Row */}
              <div className="flex justify-between w-full">
                {/* Left Calendar Headers */}
                <div className="flex justify-between flex-1 mr-6 sm:mr-10 md:mr-16">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                    <div key={i} className="w-7 sm:w-8 text-center text-[#efe0d2]/60 text-xs font-bold flex items-center justify-center">
                      {day}
                    </div>
                  ))}
                </div>
                {/* Right Streak Header Space */}
                <div className="w-7 sm:w-8 flex items-center justify-center relative shrink-0"></div>
              </div>

              {/* Day Rows */}
              {Array.from({ length: monthlyCalendarData.totalRows }).map((_, rowIndex) => {
                const rowDays = monthlyCalendarData.calendarDays.slice(rowIndex * 7, rowIndex * 7 + 7);
                const isFirstRow = rowIndex === 0;
                const isCurrentRow = rowIndex === monthlyCalendarData.currentRowIndex;
                const isCovered = rowIndex < monthlyCalendarData.currentRowIndex;

                const steps = monthlyCalendarData.currentRowIndex + 1;
                // Fade from top (0.2) to bottom (1.0)
                const startOp = 0.2 + (0.8 * (rowIndex / steps));
                const endOp = 0.2 + (0.8 * ((rowIndex + 1) / steps));

                return (
                  <div key={`row-${rowIndex}`} className="flex justify-between w-full relative">
                    {/* Left Calendar Days */}
                    <div className="flex justify-between flex-1 mr-6 sm:mr-10 md:mr-16">
                      {rowDays.map((d) => {
                         const realNow = new Date();
                         const isToday = d.isCurrentMonth && d.day === realNow.getDate() && selectedCalendarDate.getMonth() === realNow.getMonth() && selectedCalendarDate.getFullYear() === realNow.getFullYear();
                         return (
                           <div key={d.id} className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center">
                             {d.active ? (
                               <div 
                                 className={`w-full h-full bg-primary rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(243,156,18,0.4)] cursor-pointer ${isToday ? 'ring-2 ring-primary ring-offset-2 ring-offset-[#121212]' : ''}`}
                                 onClick={() => setSelectedDayRecords(d.records)}
                               >
                                 <span className="material-symbols-outlined text-black text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>directions_run</span>
                               </div>
                             ) : (
                               <div className={`w-full h-full rounded-full flex items-center justify-center border ${isToday ? 'border-white text-white shadow-[0_0_8px_rgba(255,255,255,0.4)]' : d.isCurrentMonth ? 'border-[#efe0d2]/30 text-white' : 'border-transparent text-white/20'}`}>
                                 <span className="text-[11px]">{d.day}</span>
                               </div>
                             )}
                           </div>
                         );
                      })}
                    </div>

                    {/* Right Streak Cell */}
                    <div className="w-7 sm:w-8 flex justify-center relative shrink-0">
                       {/* Bar segment */}
                       {monthlyCalendarData.currentMonthStreak > 0 && (isCovered || isCurrentRow) && (
                         <div 
                           className={`absolute left-1/2 -translate-x-1/2 w-full ${isFirstRow ? 'rounded-t-full' : ''} z-10`}
                           style={{
                             top: isFirstRow ? '-28px' : '0px',
                             bottom: isCurrentRow ? '50%' : '-12px',
                             background: `linear-gradient(to bottom, rgba(243,156,18,${startOp}), rgba(243,156,18,${endOp}))`
                           }}
                         />
                       )}

                       {/* Circle */}
                       {monthlyCalendarData.currentMonthStreak > 0 && isCurrentRow ? (
                         <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#f39c12] relative z-20 flex items-center justify-center shadow-[0_0_10px_rgba(243,156,18,0.5)]">
                           <span className="text-black font-extrabold text-[12px] sm:text-[13px] leading-none pt-0.5">
                             {monthlyCalendarData.currentMonthStreak}
                           </span>
                         </div>
                       ) : (monthlyCalendarData.currentMonthStreak > 0 && isCovered) ? (
                         null
                       ) : (
                         <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-white/10 relative z-20"></div>
                       )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-12 pb-6">
              <YearlyBarChart 
                data={past12MonthsData} 
                onSelect={(d) => setSelectedCalendarDate(d)} 
              />
            </div>
          </div>

          <div className="pt-6 pb-8 px-5 sm:px-6 -mx-4 font-display bg-black">
            {/* Team Recent Records Table */}
            {userRole !== "viewer" && (
            <div className="border border-primary/30 bg-transparent rounded-sm overflow-hidden flex flex-col">
              <div className="overflow-x-auto overflow-y-auto max-h-[414px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <table className="w-full text-left font-data-mono border-collapse table-fixed text-[10px]">
                  <thead className="sticky top-0 z-10 bg-surface-container-high">
                    <tr className="text-[#efe0d2]/70 border-b border-primary/20 h-[30px]">
                      <th className="p-2 font-bold whitespace-nowrap" style={{ width: "23%", padding: 4 }}>狩獵者</th>
                      <th className="p-2 font-bold whitespace-nowrap" style={{ width: "35%", padding: 4, textAlign: "left" }}>活動名稱</th>
                      <th className="p-2 font-bold text-center whitespace-nowrap" style={{ width: "14%", padding: 4, textAlign: "center" }}>距離</th>
                      <th className="p-2 font-bold text-center whitespace-nowrap" style={{ width: "14%", padding: 4, textAlign: "center" }}>配速</th>
                      <th className="p-2 font-bold text-center whitespace-nowrap" style={{ width: "14%", padding: 4, textAlign: "center" }}>爬升</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary/5">
                    {runningData.length > 0 ? runningData.slice().reverse().slice(0, 50).map((row, idx) => (
                      <tr key={`${row.date}-${row.name}-${idx}`} className={`h-[32px] ${idx % 2 === 1 ? "bg-primary/5" : ""}`}>
                        <td className="p-2 whitespace-nowrap align-middle" style={{ width: "23%", padding: 4 }}>
                          <div className="flex flex-col gap-0.5">
                            <div 
                              className={`font-bold ${canEdit ? "cursor-pointer hover:opacity-70 transition-opacity" : ""} text-primary truncate`}
                              onClick={() => {
                                if (canEdit) {
                                  setEditingRecord(row);
                                  setIsRecordEditModalOpen(true);
                                }
                              }}
                            >
                              {row.name}
                            </div>
                            <div className="text-[9px] text-white/50">{row.date.substring(5)}</div>
                          </div>
                        </td>
                        <td className="p-2 font-data-mono align-middle" style={{ width: "35%", padding: 4, color: "#ffffff", textAlign: "left" }}>
                          <div className="line-clamp-2 leading-tight">
                            {row.activity || "自我覺醒試煉"}
                          </div>
                        </td>
                        <td className="p-2 text-center whitespace-nowrap align-middle" style={{ width: "14%", padding: 4, color: "#ffffff", textAlign: "center" }}>
                          {row.distance.toFixed(1)} <span className="text-[8px] text-white/50">km</span>
                        </td>
                        <td className="p-2 text-center whitespace-nowrap align-middle" style={{ width: "14%", padding: 4, color: "#ffffff", textAlign: "center", fontSize: 10 }}>
                          {calculatePace(parseFloat(row.timeStr), row.distance)}
                        </td>
                        <td className="p-2 text-center whitespace-nowrap align-middle" style={{ width: "14%", padding: 4, color: "#ffffff", textAlign: "center", fontSize: 10 }}>
                          {row.elevation.toFixed(0)} <span className="text-[8px] text-white/50">m</span>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-primary/50">載入中或無資料...</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </div>
        </section>

      </main>
      </PullToRefresh>

      {/* Month Selector Modal */}
      {isMonthSelectorOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsMonthSelectorOpen(false)}>
          <div className="bg-[#121212] border border-primary/30 p-6 rounded-2xl w-full max-w-xs shadow-[0_0_30px_rgba(243,156,18,0.2)]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-white text-lg font-bold font-display tracking-widest">選擇月份</h3>
              <button className="text-white/50 hover:text-white" onClick={() => setIsMonthSelectorOpen(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 max-h-[350px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pr-1">
              {availableMonths.map((d, i) => (
                <button
                  key={i}
                  className={`py-3 px-1 rounded-xl text-center font-bold text-[13px] leading-tight transition-colors ${d.getMonth() === selectedCalendarDate.getMonth() && d.getFullYear() === selectedCalendarDate.getFullYear() ? 'bg-primary text-black shadow-[0_0_15px_rgba(243,156,18,0.3)]' : 'bg-white/5 text-[#efe0d2]/70 hover:bg-white/10 hover:text-white border border-white/5'}`}
                  onClick={() => {
                    setSelectedCalendarDate(d);
                    setIsMonthSelectorOpen(false);
                  }}
                >
                  {d.getFullYear()}<br/><span className="text-[15px]">{d.getMonth() + 1}月</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Record Edit Modal */}
      {isRecordEditModalOpen && editingRecord && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4" onClick={() => setIsRecordEditModalOpen(false)}>
          <div className="bg-surface-container border border-primary/40 rounded-[4px] shadow-[0_0_20px_rgba(243,156,18,0.2)] w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-primary/10 border-b border-primary/20 px-4 py-3 flex justify-between items-center">
              <h3 className="text-primary font-bold text-sm tracking-widest uppercase">{editingRecord.name}</h3>
              <button
                onClick={() => setIsRecordEditModalOpen(false)}
                className="text-primary/50 hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-primary/70 uppercase tracking-widest">日期</label>
                <input 
                  type="date"
                  className="bg-black/50 border border-primary/30 rounded px-2 py-1.5 text-white text-xs focus:border-primary focus:outline-none"
                  style={{ colorScheme: 'dark' }}
                  value={editingRecord.date.replace(/\//g, '-')}
                  onChange={e => setEditingRecord({...editingRecord, date: e.target.value.replace(/-/g, '/')})}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-primary/70 uppercase tracking-widest">活動名稱</label>
                <input 
                  className="bg-black/50 border border-primary/30 rounded px-2 py-1.5 text-white text-xs focus:border-primary focus:outline-none"
                  value={editingRecord.activity}
                  onChange={e => setEditingRecord({...editingRecord, activity: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-primary/70 uppercase tracking-widest">距離 (Km)</label>
                  <input 
                    type="number"
                    className="bg-black/50 border border-primary/30/50 rounded px-2 py-1.5 text-white/50 text-xs cursor-not-allowed"
                    value={editingRecord.distance}
                    disabled
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-primary/70 uppercase tracking-widest">時間 (Min)</label>
                  <input 
                    type="text"
                    className="bg-black/50 border border-primary/30/50 rounded px-2 py-1.5 text-white/50 text-xs cursor-not-allowed"
                    value={editingRecord.timeStr}
                    disabled
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-primary/70 uppercase tracking-widest">爬升 (m)</label>
                  <input 
                    type="number"
                    className="bg-black/50 border border-primary/30/50 rounded px-2 py-1.5 text-white/50 text-xs cursor-not-allowed"
                    value={editingRecord.elevation}
                    disabled
                  />
                </div>
              </div>
              <div className="flex justify-end mt-2">
                <button 
                  className="bg-primary text-black font-bold text-xs px-4 py-2 rounded shadow-[0_0_10px_rgba(243,156,18,0.3)] hover:opacity-80 transition-opacity disabled:opacity-50"
                  onClick={handleSaveRecord}
                  disabled={isSavingRecord}
                >
                  {isSavingRecord ? "儲存中..." : "儲存變更"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record Modal */}
      {selectedDayRecords && selectedDayRecords.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedDayRecords(null)}>
          <div className="bg-[#121212] border border-primary/30 p-6 rounded-2xl w-full max-w-sm shadow-[0_0_30px_rgba(243,156,18,0.2)] flex flex-col gap-6 max-h-[80vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-primary font-label-caps text-[10px] tracking-widest mb-1">
                  今年的第 {selectedDayRecords[0].nthRun} 次試煉
                </p>
                <h3 className="text-white text-xl font-bold font-display">{selectedDayRecords[0].activity || "自我覺醒試煉"}</h3>
              </div>
              <button className="text-white/50 hover:text-white" onClick={() => setSelectedDayRecords(null)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {selectedDayRecords.map((record, idx) => (
              <div key={idx} className="flex flex-col gap-4">
                {idx > 0 && <div className="h-px bg-white/10 w-full" />}
                {idx > 0 && <h3 className="text-white/80 text-lg font-bold font-display">{record.activity || "自我覺醒試煉"}</h3>}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col border-l-2 border-primary/30 pl-3">
                    <span className="text-[#efe0d2]/50 text-[10px] font-label-caps tracking-widest mb-1">距離</span>
                    <span className="text-white font-display text-xl font-bold">{record.distance} <span className="text-[12px] font-normal">km</span></span>
                  </div>
                  <div className="flex flex-col border-l-2 border-primary/30 pl-3">
                    <span className="text-[#efe0d2]/50 text-[10px] font-label-caps tracking-widest mb-1">時間</span>
                    <span className="text-white font-display text-xl font-bold">{record.timeStr} <span className="text-[12px] font-normal">m</span></span>
                  </div>
                  <div className="flex flex-col border-l-2 border-primary/30 pl-3">
                    <span className="text-[#efe0d2]/50 text-[10px] font-label-caps tracking-widest mb-1">配速</span>
                    <span className="text-white font-display text-xl font-bold">{calculatePace(parseFloat(record.timeStr), record.distance)}</span>
                  </div>
                  <div className="flex flex-col border-l-2 border-primary/30 pl-3">
                    <span className="text-[#efe0d2]/50 text-[10px] font-label-caps tracking-widest mb-1">爬升</span>
                    <span className="text-white font-display text-xl font-bold">{record.elevation} <span className="text-[12px] font-normal">m</span></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className={`fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-20 px-6 bg-surface/95 backdrop-blur-lg border-t border-primary/30 shadow-[0_-8px_20px_rgba(243,156,18,0.3)] transition-transform duration-300 ${showNav ? 'translate-y-0' : 'translate-y-full'}`}>
        <button className="flex flex-col items-center gap-1 text-[#efe0d2]" onClick={() => router.push("/basic-mission")}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>target</span>
          <span className="font-label-caps text-[11px] tracking-[0.1em]">基礎</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-[#efe0d2]">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>diamond</span>
          <span className="font-label-caps text-[11px] tracking-[0.1em]">隱藏</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-[#efe0d2]">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>trending_up</span>
          <span className="font-label-caps text-[11px] tracking-[0.1em]">轉職</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-[#efe0d2]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M 13.5 11.5 L 13.5 2.5 A 9 9 0 0 1 22.5 11.5 Z" />
            <path d="M 11.5 13.5 L 20.5 13.5 A 9 9 0 1 1 11.5 4.5 Z" />
          </svg>
          <span className="font-label-caps text-[11px] tracking-[0.1em]">結算</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-primary">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>directions_run</span>
          <span className="font-label-caps text-[11px] tracking-[0.1em]">覺醒</span>
        </button>
      </nav>
    </div>
  );
}
