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

const YearlyBarChart = ({ data }: { data: {label: string, value: number}[] }) => {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="w-full h-[220px] flex items-end justify-between px-2 pt-12 pb-12 relative mt-4">
      {data.map((d, i) => {
        const heightPct = (d.value / maxVal) * 100;
        const isActive = i === data.length - 1; 
        return (
          <div key={i} className="flex flex-col items-center flex-1 h-full relative">
            <div className="w-full h-full flex flex-col justify-end items-center relative">
              {d.value > 0 && (
                <div 
                  className={`w-[2px] relative ${isActive ? 'bg-primary' : 'bg-white'}`}
                  style={{ height: `${heightPct}%` }}
                >
                  {isActive && (
                    <div className="absolute -top-1 -left-[4px] w-2.5 h-2.5 bg-primary rounded-full" />
                  )}
                  {isActive && (
                     <div className="absolute -top-4 left-1/2 -translate-x-1/2 rotate-[-90deg] origin-bottom text-[10px] text-white whitespace-nowrap tracking-widest font-mono" style={{ bottom: '100%', marginBottom: '8px' }}>
                       {Math.round(d.value)} HRS
                     </div>
                  )}
                </div>
              )}
            </div>
            {/* Month Label */}
            <div className="absolute -bottom-8 text-[10px] tracking-widest font-mono rotate-[-90deg] origin-center" style={{ color: isActive ? '#f39c12' : 'white', marginTop: '16px' }}>
              {d.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default function RunningRecordsPage() {
  const router = useRouter();
  const [view, setView] = useState<"individual" | "team">("team");
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
  const [selectedDayRecord, setSelectedDayRecord] = useState<any | null>(null);
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
    
    for (let i = 11; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      
      const monthRecords = personalRecords.filter((r: any) => {
        const t = new Date(r.date);
        return !isNaN(t.getTime()) && t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth();
      });
      
      const totalMinutes = monthRecords.reduce((sum: number, r: any) => sum + parseFloat(r.timeStr || "0"), 0);
      const totalHours = totalMinutes / 60;
      
      months.push({
        label: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
        value: totalHours,
      });
    }
    return months;
  }, [personalRecords]);

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
    const recordIndices = new Map<any, number>();
    currentYearRecords.forEach((r: any, idx: number) => recordIndices.set(r, idx + 1));

    for (let i = 1; i <= lastDay.getDate(); i++) {
      const activityRecord = currentYearRecords.find((r: any) => {
        const rDate = new Date(r.date);
        return rDate.getMonth() === currentMonth && rDate.getDate() === i;
      });
      calendarDays.push({ 
        day: i, 
        active: !!activityRecord, 
        isCurrentMonth: true, 
        id: `curr-${i}`,
        record: activityRecord ? { ...activityRecord, nthRun: recordIndices.get(activityRecord) } : null
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

    return {
      monthLabel: `${currentYear} ${monthNames[currentMonth]}`,
      yearlyActivities,
      maxStreakWeeks,
      currentMonthStreak,
      calendarDays,
      totalRows,
      currentRowIndex
    };
  }, [personalRecords, selectedCalendarDate]);

  const [selectedChartIndex, setSelectedChartIndex] = useState<number>(11);

  useEffect(() => {
    setSelectedChartIndex(11);
  }, [selectedPersonalHunter]);

  const selectedWeek = past12WeeksData[selectedChartIndex] || past12WeeksData[11];

  return (
    <div className="bg-background text-on-background font-body-lg overflow-x-hidden selection:bg-primary-container selection:text-on-primary-container font-display min-h-screen pb-20">
      <header className="fixed top-0 w-full z-50 flex justify-between items-center h-16 bg-surface/90 backdrop-blur-md border-b border-primary/30 shadow-[0_8px_20px_rgba(243,156,18,0.3)] px-4">
        <div className="flex items-center gap-3 flex-nowrap cursor-pointer" onClick={() => router.push("/diversion")}>
          <Image priority alt="SenseSoil Logo" width={28} height={28} className="h-[28px] w-auto object-contain flex-shrink-0 translate-y-[-2px]" src="/Logo｜Orange.svg" />
          <h1 className="font-headline-md uppercase tracking-widest font-bold text-primary text-[24px] leading-none">自我覺醒試煉</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center justify-center p-2 text-[#efe0d2] hover:bg-[#efe0d2]/10 rounded-lg transition-colors"
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
          <div className="flex flex-col border-l-[3px] border-primary pl-3 flex-1 pr-4">
            <p className="font-label-caps text-primary text-[12px] tracking-[0.1em] mb-3 leading-none whitespace-nowrap">狩獵覺醒排行榜</p>
            <h2 className={`font-headline-lg text-primary font-bold tracking-wider uppercase leading-none ${dashboardData.name.length > 4 ? 'text-xl mt-1' : 'text-3xl'}`}>{dashboardData.name}</h2>
          </div>
          <div className="text-right flex flex-col justify-end flex-shrink-0">
            <p className="font-label-caps text-primary text-[12px] tracking-[0.1em] mb-3 uppercase leading-none whitespace-nowrap">蟬聯冠軍週數</p>
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

        {/* Team Module Content (Weekly Stats) */}
        <section className={`mb-[5px] ${view === 'individual' ? 'hidden' : ''}`}>
          <div className="pt-5 pb-6 px-5 sm:px-6 -mx-4 bg-[#121212] font-display">
            <div className="mb-8">
            <div className="flex justify-between items-end mb-8 font-display">
              <div className="flex flex-col relative">
                <p className="font-label-caps text-primary text-[12px] tracking-[0.1em] mb-3 leading-none">狩獵分析</p>
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
              <div className="flex items-center gap-2 mb-1">
                <span className="text-primary text-[10px] sm:text-[12px] tracking-widest font-bold">週紀錄 {selectedWeek?.endLabel || "載入中..."}</span>
                <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_10px_rgba(243,156,18,1)]" />
              </div>
            </div>
            <div className="flex justify-between w-full items-start">
              <div className="flex flex-col whitespace-nowrap">
                <p className="text-[12px] text-[#efe0d2]/70 tracking-[0.1em] font-bold mb-1">距離</p>
                <div className="flex items-baseline">
                  <span className="text-[22px] sm:text-3xl font-bold text-[#efe0d2] tracking-tighter">{selectedWeek?.distance || "0.00"}</span>
                  <span className="text-[12px] text-[#efe0d2] font-bold ml-0.5">km</span>
                </div>
              </div>
              <div className="flex flex-col whitespace-nowrap">
                <p className="text-[12px] text-[#efe0d2]/70 tracking-[0.1em] font-bold mb-1">時間</p>
                <div className="flex items-baseline">
                  <span className="text-[22px] sm:text-3xl font-bold text-[#efe0d2] tracking-tighter">{selectedWeek?.timeFormatted || "0m"}</span>
                </div>
              </div>
              <div className="flex flex-col whitespace-nowrap">
                <p className="text-[12px] text-[#efe0d2]/70 tracking-[0.1em] font-bold mb-1">配速</p>
                <div className="flex items-baseline">
                  <span className="text-[22px] sm:text-3xl font-bold text-[#efe0d2] tracking-tighter">{selectedWeek?.pace || "--:--"}</span>
                </div>
              </div>
              <div className="flex flex-col whitespace-nowrap text-right items-end">
                <div className="text-left">
                  <p className="text-[12px] text-[#efe0d2]/70 tracking-[0.1em] font-bold mb-1">爬升</p>
                  <div className="flex items-baseline">
                    <span className="text-[22px] sm:text-3xl font-bold text-[#efe0d2] tracking-tighter">{selectedWeek?.elevation || "0"}</span>
                    <span className="text-[12px] text-[#efe0d2] font-bold ml-0.5">m</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="font-display mt-[20px]">
            <SmoothLineChart 
              key={selectedPersonalHunter}
              data={past12WeeksData} 
              selectedIndex={selectedChartIndex} 
              onSelect={setSelectedChartIndex} 
            />
            <div className="flex justify-between mt-3 px-2">
               <span className="text-[12px] text-[#efe0d2]/70 font-data-mono font-bold tracking-[0.1em]">{past12WeeksData[0]?.label}</span>
               <span className="text-[12px] text-[#efe0d2]/70 font-data-mono font-bold tracking-[0.1em]">{past12WeeksData[5]?.label}</span>
               <span className="text-[12px] text-[#efe0d2]/70 font-data-mono font-bold tracking-[0.1em]">{past12WeeksData[11]?.label}</span>
            </div>
            
            <div className="mt-8 border-t border-primary/20 pt-8">
              <YearlyBarChart data={past12MonthsData} />
            </div>
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
            
            <div className="flex gap-8 mb-5">
              <div className="flex flex-col">
                <span className="text-[#efe0d2]/70 text-[12px] tracking-[0.1em] mb-1">連續紀錄</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-white text-[22px] font-bold tracking-tighter">{monthlyCalendarData.maxStreakWeeks}</span>
                  <span className="text-white text-sm font-bold">週</span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[#efe0d2]/70 text-[12px] tracking-[0.1em] mb-1">今年累計次數</span>
                <div className="flex items-baseline">
                  <span className="text-white text-[22px] font-bold tracking-tighter">{monthlyCalendarData.yearlyActivities}</span>
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
                                 className={`w-full h-full bg-white rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(255,255,255,0.2)] cursor-pointer ${isToday ? 'ring-2 ring-white ring-offset-2 ring-offset-[#121212]' : ''}`}
                                 onClick={() => setSelectedDayRecord(d.record)}
                               >
                                 <span className="material-symbols-outlined text-black text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>directions_run</span>
                               </div>
                             ) : (
                               <div className={`w-full h-full rounded-full flex items-center justify-center border ${isToday ? 'border-white text-white shadow-[0_0_8px_rgba(255,255,255,0.4)]' : d.isCurrentMonth ? 'border-[#efe0d2]/30 text-white' : 'border-transparent text-white/20'}`}>
                                 <span className="text-[13px]">{d.day}</span>
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

          </div>
        </section>

      </main>

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

      {/* Record Modal */}
      {selectedDayRecord && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedDayRecord(null)}>
          <div className="bg-[#121212] border border-primary/30 p-6 rounded-2xl w-full max-w-sm shadow-[0_0_30px_rgba(243,156,18,0.2)]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-primary font-label-caps text-[10px] tracking-widest mb-1">
                  今年的第 {selectedDayRecord.nthRun} 次試煉
                </p>
                <h3 className="text-white text-xl font-bold font-display">{selectedDayRecord.activity || "自我覺醒試煉"}</h3>
              </div>
              <button className="text-white/50 hover:text-white" onClick={() => setSelectedDayRecord(null)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col border-l-2 border-primary/30 pl-3">
                <span className="text-[#efe0d2]/50 text-[10px] font-label-caps tracking-widest mb-1">距離</span>
                <span className="text-white font-display text-xl font-bold">{selectedDayRecord.distance} <span className="text-[12px] font-normal">km</span></span>
              </div>
              <div className="flex flex-col border-l-2 border-primary/30 pl-3">
                <span className="text-[#efe0d2]/50 text-[10px] font-label-caps tracking-widest mb-1">時間</span>
                <span className="text-white font-display text-xl font-bold">{selectedDayRecord.timeStr} <span className="text-[12px] font-normal">m</span></span>
              </div>
              <div className="flex flex-col border-l-2 border-primary/30 pl-3">
                <span className="text-[#efe0d2]/50 text-[10px] font-label-caps tracking-widest mb-1">配速</span>
                <span className="text-white font-display text-xl font-bold">{calculatePace(parseFloat(selectedDayRecord.timeStr), selectedDayRecord.distance)}</span>
              </div>
              <div className="flex flex-col border-l-2 border-primary/30 pl-3">
                <span className="text-[#efe0d2]/50 text-[10px] font-label-caps tracking-widest mb-1">爬升</span>
                <span className="text-white font-display text-xl font-bold">{selectedDayRecord.elevation} <span className="text-[12px] font-normal">m</span></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-20 px-6 bg-surface/95 backdrop-blur-lg border-t border-primary/30 shadow-[0_-8px_20px_rgba(243,156,18,0.3)]">
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
