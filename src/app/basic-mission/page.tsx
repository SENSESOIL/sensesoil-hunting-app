"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { PullToRefresh } from "@/components/PullToRefresh";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const SymbolSelect = ({ defaultValue, inputId, allowCrossCircle = false }: { defaultValue: string, inputId: string, allowCrossCircle?: boolean }) => {
  const [value, setValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  
  const baseOptions = [
    { val: "○", icon: "radio_button_unchecked" },
    { val: "△", icon: "change_history" },
    { val: "✕", icon: "close" }
  ];
  if (allowCrossCircle) {
    baseOptions.push({ val: "⊗", icon: "highlight_off" });
  }
  baseOptions.push({ val: "", icon: "-" });
  
  const options = baseOptions;
  const selectedOpt = options.find(o => o.val === value) || options[options.length - 1];

  return (
    <div className="relative w-full">
      <input type="hidden" id={inputId} value={value} />
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-[28px] bg-surface-container-high border border-primary/30 rounded-[4px] px-1 flex items-center justify-center cursor-pointer focus:border-primary"
      >
        <span
          className={selectedOpt.val === "" ? "text-[10px] font-sans text-primary font-bold" : "material-symbols-outlined !text-[10px] text-[#efe0d2] leading-none"}
          style={{ fontVariationSettings: "'FILL' 0" }}
        >
          {selectedOpt.icon}
        </span>
      </div>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-[110]" onClick={() => setIsOpen(false)}></div>
          <div className="absolute top-full left-0 w-full mt-1 bg-surface-container-high border border-primary/30 rounded-[4px] shadow-lg z-[120] overflow-hidden">
            {options.map(opt => (
              <div
                key={opt.val}
                onClick={() => { setValue(opt.val); setIsOpen(false); }}
                className="px-2 py-2 hover:bg-primary/20 cursor-pointer flex justify-center items-center"
              >
                <span
                  className={opt.val === "" ? "text-[10px] font-sans text-primary font-bold" : "material-symbols-outlined !text-[10px] text-[#efe0d2] leading-none"}
                  style={{ fontVariationSettings: "'FILL' 0" }}
                >
                  {opt.icon}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const DayCellEdit = ({ label, defaultSymbol, defaultNote, symbolInputId, noteInputId, placeholder = "輸入備註", options, allowCrossCircle = false }: { label: string, defaultSymbol: string, defaultNote: string, symbolInputId: string, noteInputId: string, placeholder?: string, options?: string[], allowCrossCircle?: boolean }) => {
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState(defaultNote);

  return (
    <div className="space-y-1 relative">
      <label 
        className={`text-[11px] block text-center cursor-pointer transition-colors ${note ? 'text-[#f39c12] font-bold underline decoration-1 underline-offset-2' : 'text-primary/70 hover:text-primary'}`}
        onClick={() => setShowNote(!showNote)}
        title="點擊新增/編輯備註"
      >
        {label}
      </label>
      {options ? (
        <TaskSelect options={options} defaultValue={defaultSymbol} inputId={symbolInputId} />
      ) : (
        <SymbolSelect defaultValue={defaultSymbol} inputId={symbolInputId} allowCrossCircle={allowCrossCircle} />
      )}
      <input type="hidden" id={noteInputId} value={note} />
      
      {showNote && (
        <>
          <div className="fixed inset-0 z-[110]" onClick={() => setShowNote(false)}></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] bg-surface-container-high border border-primary/30 rounded-[4px] shadow-[0_0_20px_rgba(243,156,18,0.3)] z-[120] p-4 flex flex-col gap-3">
            <div className="text-[12px] text-primary/70 uppercase tracking-widest text-center mb-1 font-bold">{label} 備註 (編輯)</div>
            <textarea
              className="w-full h-[140px] bg-primary/10 border border-primary/20 rounded-[4px] text-[13px] text-[#efe0d2] p-3 focus:outline-none focus:border-primary resize-none"
              placeholder={placeholder}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              className="w-full py-2 mt-1 bg-primary/20 text-primary text-[12px] hover:bg-primary/30 rounded-[4px] font-bold tracking-widest"
              onClick={() => setShowNote(false)}
            >
              完成
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const CustomTimePicker = ({ defaultTime, inputId }: { defaultTime: string, inputId: string }) => {
  const [time, setTime] = useState(defaultTime || "");
  const [isOpen, setIsOpen] = useState(false);

  const [h, m] = time && time.includes(":") ? time.split(":") : ["19", "00"];

  return (
    <div className="relative w-full">
      <input type="hidden" id={inputId} value={time} />
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-[28px] bg-surface-container-high border border-primary/30 rounded-[4px] px-1 flex items-center justify-center cursor-pointer focus:border-primary"
      >
        <span className="text-[10px] text-[#efe0d2] font-data-mono">{time || "-"}</span>
      </div>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-[110]" onClick={() => setIsOpen(false)}></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[160px] bg-surface-container-high border border-primary/30 rounded-[4px] shadow-[0_0_20px_rgba(243,156,18,0.3)] z-[120] overflow-hidden flex flex-col">
            <div className="flex bg-primary/10 border-b border-primary/20">
              <div className="flex-1 text-center py-2 text-[10px] text-primary/70 font-bold">時</div>
              <div className="flex-1 text-center py-2 text-[10px] text-primary/70 font-bold">分</div>
            </div>
            <div className="flex h-[180px]">
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                {Array.from({ length: 24 }).map((_, i) => {
                  const val = i.toString().padStart(2, '0');
                  return (
                    <div
                      key={`h-${val}`}
                      onClick={() => setTime(`${val}:${m}`)}
                      className={`text-center py-2.5 text-[10px] cursor-pointer font-data-mono ${h === val ? 'bg-primary/30 text-primary font-bold' : 'text-[#efe0d2] hover:bg-primary/10'}`}
                    >
                      {val}
                    </div>
                  )
                })}
              </div>
              <div className="w-[1px] bg-primary/20"></div>
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                {Array.from({ length: 60 }).map((_, i) => {
                  const val = i.toString().padStart(2, '0');
                  return (
                    <div
                      key={`m-${val}`}
                      onClick={() => setTime(`${h}:${val}`)}
                      className={`text-center py-2.5 text-[10px] cursor-pointer font-data-mono ${m === val ? 'bg-primary/30 text-primary font-bold' : 'text-[#efe0d2] hover:bg-primary/10'}`}
                    >
                      {val}
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="flex border-t border-primary/20">
              <div
                className="flex-1 py-3 text-center bg-primary/10 text-primary/70 text-[10px] cursor-pointer hover:bg-primary/20 tracking-widest"
                onClick={() => { setTime(""); setIsOpen(false); }}
              >
                清除
              </div>
              <div className="w-[1px] bg-primary/20"></div>
              <div
                className="flex-1 py-3 text-center bg-primary/20 text-primary text-[10px] cursor-pointer hover:bg-primary/30 font-bold tracking-widest"
                onClick={() => {
                  if (!time) setTime(`${h}:${m}`); // 若原本是空的，按下確認時套用當前選中的時間
                  setIsOpen(false);
                }}
              >
                確認
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const TaskSelect = ({ options, defaultValue, inputId }: { options: string[], defaultValue: string, inputId: string }) => {
  const [value, setValue] = useState(defaultValue === "X" ? "✕" : defaultValue);
  const [isOpen, setIsOpen] = useState(false);

  const renderValue = (val: string) => {
    if (val === "✕" || val === "X") {
      return (
        <span className="material-symbols-outlined !text-[10px] text-[#efe0d2] leading-none" style={{ fontVariationSettings: "'FILL' 0" }}>
          close
        </span>
      );
    }
    return (
      <span className={`text-[10px] ${val === "" ? "text-primary font-bold" : "text-[#efe0d2]"}`}>
        {val || "-"}
      </span>
    );
  };

  return (
    <div className="relative w-full">
      <input type="hidden" id={inputId} value={value} />
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-[28px] bg-surface-container-high border border-primary/30 rounded-[4px] px-1 flex items-center justify-center cursor-pointer focus:border-primary"
      >
        {renderValue(value)}
      </div>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-[110]" onClick={() => setIsOpen(false)}></div>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 min-w-[40px] w-full max-h-[150px] bg-surface-container-high border border-primary/30 rounded-[4px] shadow-lg z-[120] overflow-y-auto scrollbar-hide">
            {options.map(opt => (
              <div
                key={opt}
                onClick={() => { setValue(opt); setIsOpen(false); }}
                className="px-2 py-2.5 hover:bg-primary/20 cursor-pointer flex justify-center items-center border-b border-primary/10 last:border-b-0"
              >
                {renderValue(opt)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const PersonalIndicatorCard = ({ label, symbol, note, isSymbolText = false }: { label: string, symbol: React.ReactNode, note?: string, isSymbolText?: boolean }) => {
  const [showNote, setShowNote] = useState(false);
  
  return (
    <div className="indicator-card w-full relative">
      <span className={isSymbolText ? "text-[20px] leading-none mt-1 font-bold font-data-mono text-primary tracking-normal" : "symbol"}>
        {symbol}
      </span>
      <span 
        className={`label font-data-mono ${note ? 'underline decoration-1 underline-offset-2 font-bold cursor-pointer transition-colors hover:opacity-80' : ''}`}
        onClick={() => {
          if (note) setShowNote(true);
        }}
      >
        {label}
      </span>
      
      {showNote && note && (
        <>
          <div className="fixed inset-0 z-[110]" onClick={() => setShowNote(false)}></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] bg-surface-container-high border border-primary/30 rounded-[4px] shadow-[0_0_20px_rgba(243,156,18,0.3)] z-[120] p-4 flex flex-col gap-3">
            <div className="text-[12px] text-primary/70 uppercase tracking-widest text-center mb-1 font-bold">{label} 備註</div>
            <div className="w-full min-h-[60px] max-h-[240px] overflow-y-auto bg-primary/10 border border-primary/20 rounded-[4px] text-[13px] text-[#efe0d2] p-3 whitespace-pre-wrap break-words" style={{ wordBreak: 'break-word' }}>
              {note}
            </div>
            <button
              className="w-full py-2 mt-1 bg-primary/20 text-primary text-[12px] hover:bg-primary/30 rounded-[4px] cursor-pointer tracking-widest font-bold"
              onClick={() => setShowNote(false)}
            >
              關閉
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default function BasicMissionPage() {
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
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { data: session, status } = useSession();
  const userRole = (session?.user as any)?.roles?.["basic"] || "viewer";
  const isAdmin = userRole === "admin" || process.env.NODE_ENV === "development";
  const userHunterName = (session?.user as any)?.hunterName || "";

  useEffect(() => {
    if (status === "unauthenticated") {
      alert("權限不足，請以狩獵者身分登入");
      router.replace("/diversion");
    }
  }, [status, router]);

  const { data, error, mutate } = useSWR("/api/sheets/basic-mission", fetcher);

  // 任務要求：僅在控制台印出資料，絕對不渲染到 JSX 中
  if (data) {
    console.log("[Google Sheets API Data]", data);
  }

  const [awardYear, setAwardYear] = useState('2026');
  const [isLeaderboardYearDropdownOpen, setIsLeaderboardYearDropdownOpen] = useState(false);

  // 計算本週狩獵冠軍、蟬聯週數與團隊狀態
  const dashboardData = useMemo(() => {
    if (!data?.rows || data.rows.length < 3) {
      return { name: "計算中...", weeks: "00", completionRate: "0.0", averageScore: "0.0", validDates: [] as string[], recordsByDate: {} as Record<string, Array<{ name: string; score: number }>> };
    }

    const rows = data.rows;
    // 尋找「總分」所在的欄位 index
    const scoreIdx = rows[1].findIndex((h: string) => h.includes('總分') || h.includes('魂') || h.includes('覺醒'));
    const colPIdx = 15; // Col P (誠 / 任務)
    const colQIdx = 16; // Col Q (體 / 體能)
    const colRIdx = 17; // Col R (格 / 格局)
    const nameIdx = 1;
    const dateIdx = 0;

    const parseRankScore = (val: any): number => {
      if (!val) return 0;
      const str = String(val).trim();
      if (str === '高') return 3;
      if (str === '中') return 2;
      if (str === '低') return 1;
      if (str === '無' || str === '×') return 0;
      const num = parseFloat(str);
      return !isNaN(num) ? num : 0;
    };

    if (scoreIdx === -1) {
      return { name: "資料錯誤", weeks: "00", completionRate: "0.0", averageScore: "0.0", validDates: [] as string[], recordsByDate: {} as Record<string, Array<{ name: string; score: number; mission: number; physique: number; mindset: number; awakening: number }>> };
    }

    // 依據日期分組
    const dateMap = new Map<string, { name: string, score: number, colP: number, colQ: number, colR: number }[]>();
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      const date = row[dateIdx];
      const name = row[nameIdx];
      const score = parseFloat(row[scoreIdx]) || 0;
      const colP = parseFloat(row[colPIdx]) || 0;
      const colQ = parseRankScore(row[colQIdx]);
      const colR = parseRankScore(row[colRIdx]);

      if (!date || !name) continue;

      if (!dateMap.has(date)) {
        dateMap.set(date, []);
      }
      dateMap.get(date)!.push({ name, score, colP, colQ, colR });
    }

    // 依據時間先後排序日期
    const sortedDates = Array.from(dateMap.keys()).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    // 遊戲規則：禮拜一才結算上週數據。
    // 過濾出「已經結算」的日期 (上個禮拜天(含)之前)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToSubtract = dayOfWeek === 0 ? 7 : dayOfWeek;
    const maxAllowedDate = new Date(now);
    maxAllowedDate.setDate(now.getDate() - daysToSubtract);
    maxAllowedDate.setHours(23, 59, 59, 999);
    const maxAllowedTime = maxAllowedDate.getTime();

    // 計算每天的冠軍
    const championsByDate = new Map<string, { display: string, first: string }>();
    const validDates: string[] = [];
    const recordsByDate: Record<string, Array<{ name: string; score: number; mission: number; physique: number; mindset: number; awakening: number }>> = {};
    const cumulativeScoresMap = new Map<string, { mission: number; physique: number; mindset: number; awakening: number }>();

    for (const date of sortedDates) {
      if (!date.startsWith(awardYear)) continue; // 過濾所選年度
      if (new Date(date).getTime() > maxAllowedTime) continue; // 忽略尚未結算的未來日期
      const records = dateMap.get(date)!;

      // 累加該年度截至當前日期的各項累積點數/積分
      for (const r of records) {
        const current = cumulativeScoresMap.get(r.name) || { mission: 0, physique: 0, mindset: 0, awakening: 0 };
        cumulativeScoresMap.set(r.name, {
          mission: parseFloat((current.mission + r.colP).toFixed(1)),
          physique: parseFloat((current.physique + r.colQ).toFixed(1)),
          mindset: parseFloat((current.mindset + r.colR).toFixed(1)),
          awakening: parseFloat((current.awakening + r.score).toFixed(1))
        });
      }

      // 快照截至當前日期所有獵人的累積總分
      const cumulativeSnapshot: Array<{ name: string; score: number; mission: number; physique: number; mindset: number; awakening: number }> = [];
      for (const [name, totals] of cumulativeScoresMap.entries()) {
        cumulativeSnapshot.push({
          name,
          score: totals.awakening,
          mission: totals.mission,
          physique: totals.physique,
          mindset: totals.mindset,
          awakening: totals.awakening
        });
      }
      recordsByDate[date] = cumulativeSnapshot;

      const maxScore = Math.max(...records.map(r => r.score));
      if (maxScore > 0) {
        // 尋找最高分的人 (若有同分則全部列出)
        const champs = records.filter(r => r.score === maxScore).map(r => r.name);
        const champStr = champs.join("、");
        championsByDate.set(date, { display: champStr, first: champs[0] || "" });
        validDates.push(date);
      }
    }

    if (validDates.length === 0) {
      return { name: "無數據", firstChamp: "", weeks: "00", completionRate: "0.0", averageScore: "0.0", validDates: [] as string[], recordsByDate: {} as Record<string, Array<{ name: string; score: number }>> };
    }

    // 取得最新一週的有效數據
    const targetDate = validDates[validDates.length - 1];
    const currentChampData = championsByDate.get(targetDate)!;

    // 往前推算蟬聯週數 (以顯示名稱完全一致為蟬聯標準)
    let consecutiveWeeks = 0;
    for (let i = validDates.length - 1; i >= 0; i--) {
      if (championsByDate.get(validDates[i])?.display === currentChampData.display) {
        consecutiveWeeks++;
      } else {
        break;
      }
    }

    // 計算團隊狀態
    const targetRecords = dateMap.get(targetDate)!;
    const count = targetRecords.length;
    const sumP = targetRecords.reduce((sum, r) => sum + r.colP, 0);
    const sumW = targetRecords.reduce((sum, r) => sum + r.score, 0);

    const completionRate = count > 0 ? (sumP / (5 * count)) * 100 : 0;
    const averageScore = count > 0 ? sumW / count : 0;

    return {
      name: currentChampData.display,
      firstChamp: currentChampData.first,
      weeks: consecutiveWeeks.toString().padStart(2, '0'),
      completionRate: completionRate.toFixed(1),
      averageScore: averageScore.toFixed(1),
      validDates,
      recordsByDate
    };
  }, [data, awardYear]);

  const [isRacePlaying, setIsRacePlaying] = useState(false);
  const [raceFrameIndex, setRaceFrameIndex] = useState(0);
  const [leaderboardMetric, setLeaderboardMetric] = useState<'mission' | 'physique' | 'mindset' | 'awakening'>('awakening');
  const raceTimerRef = useRef<any>(null);

  const toggleRace = () => {
    if (isRacePlaying) {
      setIsRacePlaying(false);
      if (raceTimerRef.current) clearInterval(raceTimerRef.current);
    } else {
      setIsRacePlaying(true);
      const validDates = dashboardData.validDates || [];
      if (validDates.length > 0 && raceFrameIndex >= validDates.length - 1) {
        setRaceFrameIndex(0);
      }
    }
  };

  useEffect(() => {
    if (isRacePlaying) {
      raceTimerRef.current = setInterval(() => {
        setRaceFrameIndex(prev => {
          const validDates = dashboardData.validDates || [];
          if (prev >= validDates.length - 1) {
            setIsRacePlaying(false);
            clearInterval(raceTimerRef.current);
            return prev;
          }
          return prev + 1;
        });
      }, 200);
    } else if (raceTimerRef.current) {
      clearInterval(raceTimerRef.current);
    }
    return () => {
      if (raceTimerRef.current) clearInterval(raceTimerRef.current);
    };
  }, [isRacePlaying, dashboardData.validDates]);

  useEffect(() => {
    if (!isRacePlaying && dashboardData.validDates && dashboardData.validDates.length > 0) {
      setRaceFrameIndex(dashboardData.validDates.length - 1);
    }
  }, [dashboardData.validDates, isRacePlaying]);

  useEffect(() => {
    setIsRacePlaying(false);
  }, [awardYear, leaderboardMetric]);

  const displayLeaderboardData = useMemo(() => {
    const validDates = dashboardData.validDates || [];
    const recordsByDate = dashboardData.recordsByDate || {};
    if (validDates.length === 0) return [];

    const targetDate = isRacePlaying || raceFrameIndex < validDates.length
      ? validDates[Math.min(raceFrameIndex, validDates.length - 1)]
      : validDates[validDates.length - 1];

    const records = recordsByDate[targetDate] || [];
    if (records.length === 0) return [];

    const hunterMap = new Map<string, number>();
    for (const r of records) {
      const metricKey = (leaderboardMetric === 'awakening' ? 'awakening' : leaderboardMetric) as keyof typeof r;
      const val = (r[metricKey] as number) || 0;
      const cur = hunterMap.get(r.name) || 0;
      if (val > cur) hunterMap.set(r.name, val);
    }

    const list = Array.from(hunterMap.entries())
      .map(([name, score]) => ({ name, score }))
      .sort((a, b) => b.score - a.score);

    const maxScore = Math.max(...list.map(item => item.score), 1);

    return list.map((item, idx) => {
      const barPct = Math.min(100, Math.max(8, (item.score / maxScore) * 100));
      const displayScore = (leaderboardMetric === 'mission' || leaderboardMetric === 'awakening' || (leaderboardMetric as any) === 'score')
        ? item.score.toFixed(1)
        : item.score.toString();
      return {
        rank: idx + 1,
        name: item.name,
        score: item.score,
        displayScore,
        barPct
      };
    });
  }, [dashboardData, isRacePlaying, raceFrameIndex, leaderboardMetric]);

  const raceCurrentDate = useMemo(() => {
    const validDates = dashboardData.validDates || [];
    if (validDates.length === 0) return "";
    const idx = Math.min(raceFrameIndex, validDates.length - 1);
    return validDates[idx] || "";
  }, [dashboardData.validDates, raceFrameIndex]);

  const [selectedTeamHunter, setSelectedTeamHunter] = useState<string>("");
  const [selectedPersonalHunter, setSelectedPersonalHunter] = useState<string>("");
  const [selectedStartDate, setSelectedStartDate] = useState<string>("");
  const [isHunterDropdownOpen, setIsHunterDropdownOpen] = useState(false);
  const [isPersonalHunterDropdownOpen, setIsPersonalHunterDropdownOpen] = useState(false);
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  const [selectedPersonalDate, setSelectedPersonalDate] = useState<string>("");
  const [isPersonalDateDropdownOpen, setIsPersonalDateDropdownOpen] = useState(false);
  const [showThresholdRules, setShowThresholdRules] = useState(false);

  const hunterRank = useMemo(() => {
    if (!data?.settings || !selectedPersonalHunter) return "S級狩獵者";
    const settings = data.settings;
    for (let i = 0; i < settings.length; i++) {
      const row = settings[i];
      if (row.includes(selectedPersonalHunter)) {
        const rank = row[3];
        if (!rank) return "S級狩獵者";
        return rank.includes("狩獵者") ? rank : `${rank}級狩獵者`;
      }
    }
    return "S級狩獵者";
  }, [data, selectedPersonalHunter]);

  const personalTotalScore = useMemo(() => {
    if (!data?.rows || data.rows.length < 3 || !selectedPersonalHunter) return "0.0";
    
    // cell A1 is data.rows[0][0]
    const startDateStr = data.rows[0][0];
    const startTimestamp = startDateStr ? new Date(startDateStr).getTime() : 0;
    
    let scoreIdx = data.rows[1].findIndex((h: string) => h.includes('總分') || h.includes('魂') || h.includes('覺醒'));
    if (scoreIdx === -1) scoreIdx = 22; // fallback

    let sum = 0;
    for (let i = 2; i < data.rows.length; i++) {
      const row = data.rows[i];
      const dateStr = row[0];
      const hunterName = row[1];
      
      if (!dateStr || hunterName !== selectedPersonalHunter) continue;
      
      const recordTime = new Date(dateStr).getTime();
      if (!isNaN(recordTime) && recordTime >= startTimestamp) {
        sum += parseFloat(row[scoreIdx]) || 0;
      }
    }
    
    return sum.toFixed(1);
  }, [data, selectedPersonalHunter]);

  // 初始化預設選項
  useEffect(() => {
    if (data?.rows && data.rows.length >= 3) {
      if (!selectedStartDate) {
        setSelectedStartDate(data.rows[0][0] || "2026/05/03");
      }
    }
    const isValidDashName = dashboardData?.name && !["計算中...", "無數據", "資料錯誤"].includes(dashboardData.name);
    
    // 如果 session 還在 loading，不要提早設定 default hunter，避免被錯誤值覆蓋
    if (status === "loading") return;

    if (!selectedTeamHunter) {
      setSelectedTeamHunter(userHunterName || (isValidDashName ? (dashboardData.firstChamp || "") : ""));
    }

    if (!selectedPersonalHunter || ["計算中...", "無數據", "資料錯誤"].includes(selectedPersonalHunter)) {
      setSelectedPersonalHunter(userHunterName || (isValidDashName ? (dashboardData.firstChamp || "") : ""));
    }
  }, [data, dashboardData, selectedStartDate, selectedTeamHunter, selectedPersonalHunter, userHunterName, status]);

  // 取得不重複的日期與狩獵者清單
  const options = useMemo(() => {
    if (!data?.rows || data.rows.length < 3) return { dates: [], hunters: [] };
    const dateSet = new Set<string>();
    const hunterSet = new Set<string>();

    for (let i = 2; i < data.rows.length; i++) {
      const date = data.rows[i][0];
      const hunter = data.rows[i][1];
      if (date) dateSet.add(date);
      if (hunter) hunterSet.add(hunter);
    }

    // 日期由近到遠排序
    const sortedDates = Array.from(dateSet).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return { dates: sortedDates, hunters: Array.from(hunterSet) };
  }, [data]);

  useEffect(() => {
    if (options.dates && options.dates.length > 0 && !selectedPersonalDate) {
      const now = new Date();
      // 在 JavaScript 中，getDay() 0 是禮拜天，1 是禮拜一...
      // 每到禮拜一凌晨才會更新：
      // 假設今天是星期二(2)，上個禮拜天是 2 天前
      // 假設今天是星期一(1)，上個禮拜天是 1 天前
      // 假設今天是星期天(0)，則「還未結算」，應該呈現上上禮拜天（7天前）
      const dayOfWeek = now.getDay();
      const daysToSubtract = dayOfWeek === 0 ? 7 : dayOfWeek;
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() - daysToSubtract);
      targetDate.setHours(23, 59, 59, 999);
      
      let defaultDate = options.dates[0];
      for (let i = 0; i < options.dates.length; i++) {
        const dTime = new Date(options.dates[i]).getTime();
        if (dTime <= targetDate.getTime()) {
          defaultDate = options.dates[i];
          break;
        }
      }
      setSelectedPersonalDate(defaultDate);
    }
  }, [options.dates, selectedPersonalDate]);

  // 計算狩獵分析數據
  const analysisData = useMemo(() => {
    if (!data?.rows || data.rows.length < 3 || !selectedTeamHunter || !selectedStartDate) {
      return null;
    }

    const rows = data.rows;
    const scoreIdx = rows[1].findIndex((h: string) => h.includes('總分') || h.includes('魂'));
    const dateIdx = 0;
    const nameIdx = 1;

    const colSIdx = 18; // 日誌
    const colTIdx = 19; // 紀錄
    const colPIdx = 15; // 任務 (時/志)
    const colQIdx = 16; // 健康 (勇/志)
    const colRIdx = 17; // 生活 (底)

    const startTimestamp = new Date(selectedStartDate).getTime();
    const records = [];

    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      const date = row[dateIdx];
      const name = row[nameIdx];

      if (!date || name !== selectedTeamHunter) continue;

      const recordTime = new Date(date).getTime();
      if (recordTime >= startTimestamp) {
        records.push(row);
      }
    }

    if (records.length === 0) return null;

    let sumS = 0, sumT = 0, sumP = 0, sumQ = 0, sumR = 0, sumW = 0;

    const rankToScore = (val: string) => {
      if (val === "高") return 3;
      if (val === "中") return 2;
      if (val === "低") return 1;
      return 0;
    };

    const scoreToRank = (score: number) => {
      if (score >= 2.5) return "高";
      if (score >= 1.5) return "中";
      if (score >= 0.5) return "低";
      return "無";
    };

    records.forEach(r => {
      sumS += parseFloat(r[colSIdx]) || 0;
      sumT += parseFloat(r[colTIdx]) || 0;
      sumP += parseFloat(r[colPIdx]) || 0;
      sumQ += rankToScore(r[colQIdx]);
      sumR += rankToScore(r[colRIdx]);
      sumW += parseFloat(r[scoreIdx]) || 0;
    });

    const count = records.length;

    const percentS = Math.min(100, Math.round((sumS / (count * 7)) * 100));
    const percentT = Math.min(100, Math.round((sumT / (count * 2)) * 100));
    const percentP = Math.min(100, Math.round((sumP / (count * 5)) * 100));
    const percentQNum = Math.min(100, Math.round((sumQ / (count * 3)) * 100));
    const percentRNum = Math.min(100, Math.round((sumR / (count * 3)) * 100));

    const avgQ = sumQ / count;
    const avgR = sumR / count;

    return {
      items: [
        { label: "日誌完整度", percent: `${percentS}%`, width: `${percentS}%` },
        { label: "紀錄穩定度", percent: `${percentT}%`, width: `${percentT}%` },
        { label: "任務完成度", percent: `${percentP}%`, width: `${percentP}%` },
        { label: "體能強化度", percent: scoreToRank(avgQ), width: `${percentQNum}%` },
        { label: "格局進化度", percent: scoreToRank(avgR), width: `${percentRNum}%` }
      ],
      cumulativeAwakening: sumW.toFixed(1)
    };
  }, [data, selectedTeamHunter, selectedStartDate]);


  const tableData = useMemo(() => {
    if (!data?.rows || data.rows.length < 3 || !selectedStartDate) {
      return [];
    }
    const rows = data.rows;
    let scoreIdx = rows[1].findIndex((h: string) => h.includes('總分') || h.includes('覺醒') || h.includes('點數'));
    if (scoreIdx === -1) scoreIdx = 22; // Col W fallback

    const dateMap = new Map<string, number>();
    for (let i = 2; i < rows.length; i++) {
      const d = rows[i][0];
      const s = parseFloat(rows[i][scoreIdx]) || 0;
      if (d) {
        if (!dateMap.has(d)) dateMap.set(d, 0);
        dateMap.set(d, Math.max(dateMap.get(d)!, s));
      }
    }

    const validTimestamps = Array.from(dateMap.keys())
      .map(d => new Date(d).getTime())
      .filter(t => !isNaN(t));

    const maxValidTimestamp = validTimestamps.length > 0 ? Math.max(...validTimestamps) : 0;
    const startTimestamp = new Date(selectedStartDate).getTime();

    const validRecords = [];
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      const dateStr = row[0];
      if (!dateStr || dateStr.trim() === "") continue;

      const recordTime = new Date(dateStr).getTime();
      // Only include records between startTimestamp and the latest settled week
      if (!isNaN(recordTime) && !isNaN(startTimestamp) && recordTime >= startTimestamp && recordTime <= maxValidTimestamp) {
        validRecords.push({ data: row, notes: data.notes?.[i] || [], originalIndex: i + 1 });
      }
    }

    // Ensure all 11 hunters are present for the selected start date
    const MASTER_HUNTERS = [
      "陳政剛", "陳政威", "魏文軍", "戴翠婷", "盧政恒", 
      "彭慶忠", "陳德霖", "劉璋櫻", "盧德洋", "謝建宏", "彭詩渝"
    ];
    
    const presentHunters = new Set(validRecords.map(r => r.data[1]));
    
    // First, try to add missing hunters from options.hunters (dynamic from sheet)
    if (options.hunters && options.hunters.length > 0) {
      options.hunters.forEach(hunter => {
        if (!presentHunters.has(hunter)) {
          const emptyRow = Array(rows[0].length).fill("");
          emptyRow[0] = selectedStartDate;
          emptyRow[1] = hunter;
          validRecords.push({ data: emptyRow, notes: [], originalIndex: -1 });
          presentHunters.add(hunter);
        }
      });
    }

    // Then, guarantee the master 11 hunters are present
    MASTER_HUNTERS.forEach(hunter => {
      if (!presentHunters.has(hunter)) {
        const emptyRow = Array(rows[0].length).fill("");
        emptyRow[0] = selectedStartDate;
        emptyRow[1] = hunter;
        validRecords.push({ data: emptyRow, notes: [], originalIndex: -1 });
        presentHunters.add(hunter);
        // Safe: don't mutate options.hunters directly. It's already in validRecords.
      }
    });

    // Sort first, then cap/pad to exactly 15 rows

    const hunterOrder = new Map(options.hunters.map((h, i) => [h, i]));

    validRecords.sort((a, b) => {
      const timeA = new Date(a.data[0]).getTime();
      const timeB = new Date(b.data[0]).getTime();
      // Handle NaN dates: push them to the end
      if (isNaN(timeA) && isNaN(timeB)) return 0;
      if (isNaN(timeA)) return 1;
      if (isNaN(timeB)) return -1;
      const timeDiff = timeB - timeA;
      if (timeDiff !== 0) return timeDiff;
      return (hunterOrder.get(a.data[1]) ?? 999) - (hunterOrder.get(b.data[1]) ?? 999);
    });

    const mapSymbol = (val: string) => {
      if (!val || val.trim() === "") return "-";
      if (val === "高" || val === "O" || val === "o" || val === "〇" || val === "○") return "○";
      if (val === "中" || val === "△" || val === "^") return "△";
      if (val === "低" || val === "無" || val === "X" || val === "x" || val === "✕" || val === "✖") return "✕";
      if (val === "⊗" || val === "⨂") return "⊗";
      return "-";
    };

    const mapped = validRecords.map((rObj, index) => {
      const r = rObj.data;
      const n = rObj.notes;
      const logs = [r[2], r[3], r[4], r[5], r[6], r[7]];
      const logNotes = [n[2] || "", n[3] || "", n[4] || "", n[5] || "", n[6] || "", n[7] || ""];
      const quality = r[8];
      const quantity = r[9];
      const precisions = [r[10], r[11]];

      let pStr = "-";
      if (r[15] && r[15].trim() !== "") {
        const val = parseFloat(r[15]);
        if (!isNaN(val)) pStr = val.toFixed(1);
      }
      const awardStr = (r[12] || "").trim() || "-";
      const qStr = (r[16] || "").trim() || "-";
      const rStr = (r[17] || "").trim() || "-";

      let taskStr = `${pStr}/${awardStr}/${qStr}/${rStr}`;
      if (taskStr === "-/-/-/-") {
        taskStr = "-";
      }

      const score = parseFloat(r[scoreIdx] || "0").toFixed(1);

      const logStr = logs.map(mapSymbol).join("") + "/" + mapSymbol(quantity);
      const recStr = precisions.map(mapSymbol).join("");

      return {
        id: index,
        name: r[1] || "未知",
        date: r[0],
        logStr,
        recStr,
        taskStr,
        score,
        rawData: r,
        rawNotes: n,
        logNotes,
        originalIndex: rObj.originalIndex
      };
    });

    // Cap to 70 to allow scrolling, then pad if fewer than 15
    const capped = mapped.slice(0, 70);
    while (capped.length < 15) {
      capped.push({
        id: capped.length,
        name: "--",
        date: "--",
        logStr: "-",
        recStr: "-",
        taskStr: "-",
        score: "0.0",
        rawData: [],
        rawNotes: [],
        logNotes: [],
        originalIndex: -1
      });
    }
    return capped;
  }, [data, selectedStartDate]);

  const RenderSymbols = ({ str, alignLeft = false }: { str: string, alignLeft?: boolean }) => {
    return (
      <div className={`flex items-center -space-x-[1px] ${alignLeft ? 'justify-start' : 'justify-center'}`}>
        {str.split('').map((char, i) => {
          if (char === '○' || char === 'O') return <span key={i} className="sym-icon text-[12px] leading-none">radio_button_unchecked</span>;
          if (char === '✕' || char === 'X') return <span key={i} className="sym-icon text-[12px] leading-none">close</span>;
          if (char === '△') return <span key={i} className="sym-icon text-[12px] leading-none">change_history</span>;
          if (char === '⊗' || char === '⨂') return <span key={i} className="sym-icon text-[12px] leading-none">highlight_off</span>;
          if (char === '/') return <span key={i} className="mx-0.5 text-[10px]">/</span>;
          return <span key={i} className="text-[10px]">{char}</span>;
        })}
      </div>
    );
  };

  const personalRecordDataObj = useMemo(() => {
    if (!data?.rows || !selectedPersonalHunter || !selectedPersonalDate) return null;
    for (let i = 2; i < data.rows.length; i++) {
      const row = data.rows[i];
      if (row[0] === selectedPersonalDate && row[1] === selectedPersonalHunter) {
        return { data: row, notes: data.notes?.[i] || [] };
      }
    }
    return null;
  }, [data, selectedPersonalHunter, selectedPersonalDate]);

  const mapSymbolToIcon = (val?: string) => {
    if (!val) return "remove";
    const v = val.trim();
    if (v === "O" || v === "o" || v === "〇" || v === "○" || v === "高") return "radio_button_unchecked";
    if (v === "△" || v === "^" || v === "中") return "change_history";
    if (v === "X" || v === "x" || v === "✕" || v === "✖" || v === "低") return "close";
    if (v === "⊗" || v === "⨂") return "highlight_off";
    return "remove";
  };

  const pRecord = personalRecordDataObj?.data;
  const pNotes = personalRecordDataObj?.notes || [];
  const d1 = pRecord ? mapSymbolToIcon(pRecord[2]) : "remove";
  const d2 = pRecord ? mapSymbolToIcon(pRecord[3]) : "remove";
  const d3 = pRecord ? mapSymbolToIcon(pRecord[4]) : "remove";
  const d4 = pRecord ? mapSymbolToIcon(pRecord[5]) : "remove";
  const d5 = pRecord ? mapSymbolToIcon(pRecord[6]) : "remove";
  const d6 = pRecord ? mapSymbolToIcon(pRecord[7]) : "remove";
  const dQuality = pRecord ? mapSymbolToIcon(pRecord[8]) : "remove";
  const dQuantity = pRecord ? mapSymbolToIcon(pRecord[9]) : "remove";
  
  const recAcc = pRecord ? mapSymbolToIcon(pRecord[10]) : "remove";
  const recPrec = pRecord ? mapSymbolToIcon(pRecord[11]) : "remove";

  let taskCompletion = "-";
  if (pRecord && pRecord[15] && pRecord[15].trim() !== "") {
    const val = parseFloat(pRecord[15]);
    taskCompletion = isNaN(val) ? pRecord[15] : val.toFixed(1);
  }
  const taskAward = pRecord ? mapSymbolToIcon(pRecord[12]) : "remove";
  const taskPhysical = pRecord && pRecord[16] ? pRecord[16] : "-";
  const taskPattern = pRecord && pRecord[17] ? pRecord[17] : "-";

  let pScoreIdx = data?.rows?.[1]?.findIndex((h: string) => h.includes('總分') || h.includes('魂') || h.includes('覺醒'));
  if (pScoreIdx === undefined || pScoreIdx === -1) pScoreIdx = 22;
  const personalScoreValue = pRecord && pRecord[pScoreIdx] ? parseFloat(pRecord[pScoreIdx]).toFixed(1) : "0.0";

  const personalAwardThresholdData = useMemo(() => {
    if (!data?.rows || !selectedPersonalHunter || !selectedPersonalDate || !options?.dates) {
      return { isMet: false, weeks: [], isSufficientWeeks: false };
    }

    // 找到 selectedPersonalDate 前(含)最遠 4 週的日期列表 (由近到遠排序)
    const targetDates = options.dates
      .filter((d: string) => new Date(d).getTime() <= new Date(selectedPersonalDate).getTime())
      .slice(0, 4);

    const isSufficientWeeks = targetDates.length === 4;
    const weeks = targetDates.map((dateStr: string) => {
      let row: string[] | null = null;
      for (let i = 2; i < data.rows.length; i++) {
        if (data.rows[i][0] === dateStr && data.rows[i][1] === selectedPersonalHunter) {
          row = data.rows[i];
          break;
        }
      }

      const dayStr = row ? (row[13] || "") : "";
      const timeStr = row ? (row[14] || "") : "";
      const chengStr = row ? (row[15] || "") : "";
      const awardStr = row ? (row[12] || "") : "";

      // 1. 判斷天與時（發布日）：沒有超過「日的晚上9:00」，在日晚上9:00前都算及格。若超過，或出現「後」、或「 ✕」都算不及格。
      let timePass = false;
      if (row && dayStr.trim() !== "") {
        const d = dayStr.trim();
        if (d === "後" || d === "✕" || d === "×" || d === "X" || d === "x" || d === "-" || d === "--") {
          timePass = false;
        } else if (d === "五" || d === "六" || d === "一" || d === "二" || d === "三" || d === "四") {
          timePass = true;
        } else if (d === "日") {
          if (timeStr && timeStr.trim() && timeStr.trim() !== "-" && timeStr.trim() !== "--") {
            const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
            if (match) {
              const totalMins = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
              timePass = totalMins <= 1260; // 21:00 = 1260 分鐘
            } else {
              timePass = true;
            }
          } else {
            timePass = true; // 選擇日但未輸入時間，預設及格
          }
        } else {
          timePass = true;
        }
      }

      // 2. 判斷「誠」（完成度）：達 3.5 分或以上為單週及格基準
      let chengPass = false;
      if (row && chengStr.trim() !== "") {
        const val = parseFloat(chengStr.trim());
        chengPass = !isNaN(val) && val >= 3.5;
      }

      const tiStr = row ? (row[16] || "") : "";
      const geStr = row ? (row[17] || "") : "";

      // 3. 判斷「體格分」：體能和格局完成度皆「✕」以上，或「獎」為及格符號（○或△）
      let awardPass = false;
      let displayAward = "--";
      if (row) {
        const a = awardStr.trim();
        const ti = tiStr.trim();
        const ge = geStr.trim();
        const tiPass = ti !== "" && ti !== "✕" && ti !== "×" && ti !== "X" && ti !== "x" && ti !== "-" && ti !== "--";
        const gePass = ge !== "" && ge !== "✕" && ge !== "×" && ge !== "X" && ge !== "x" && ge !== "-" && ge !== "--";
        const aPass = a !== "" && a !== "✕" && a !== "×" && a !== "X" && a !== "x" && a !== "-" && a !== "--";

        if (aPass || (tiPass && gePass && a !== "✕" && a !== "×" && a !== "X" && a !== "x")) {
          awardPass = true;
          if (a === "o" || a === "O" || a === "0" || a === "〇" || a === "○" || a === "") {
            displayAward = "○";
          } else {
            displayAward = a;
          }
        } else {
          awardPass = false;
          if (a !== "" && a !== "-" && a !== "--") {
            displayAward = (a === "X" || a === "x" || a === "×") ? "✕" : a;
          } else {
            displayAward = "✕";
          }
        }
        if (displayAward === "✕" || displayAward === "×" || displayAward === "X" || displayAward === "x") {
          awardPass = false;
        }
      }

      const idx = targetDates.indexOf(dateStr);
      const weekPass = !!row && timePass && chengPass && (idx === 0 ? awardPass : true);

      return {
        dateStr,
        hasRow: !!row,
        dayStr: dayStr || "-",
        timeStr: timeStr || "-",
        chengStr: chengStr || "-",
        awardStr: awardStr || "-",
        displayAward,
        timePass,
        chengPass,
        awardPass,
        weekPass
      };
    });

    const avgCheng = weeks.length > 0
      ? weeks.reduce((sum, w) => sum + (parseFloat(w.chengStr) || 0), 0) / weeks.length
      : 0;

    const isMet = isSufficientWeeks && weeks.every(w => w.hasRow && w.timePass) && (weeks.length > 0 && weeks[0].awardPass) && avgCheng >= 3.5;

    return { isMet, weeks, isSufficientWeeks, avgCheng };
  }, [data, selectedPersonalHunter, selectedPersonalDate, options?.dates]);

  return (
    <div className="bg-background text-on-background font-body-lg overflow-x-hidden selection:bg-primary-container selection:text-on-primary-container font-display min-h-screen pb-20">
      <header className="fixed top-0 w-full z-50 flex justify-between items-center shrink-0 h-16 bg-surface/90 backdrop-blur-md border-b border-primary/30 shadow-[0_8px_20px_rgba(243,156,18,0.3)] px-4">
        <div className="flex items-center gap-3 flex-nowrap cursor-pointer" onClick={() => router.push("/diversion")}>
          <Image priority alt="SenseSoil Logo" width={28} height={28} className="h-[28px] w-auto object-contain flex-shrink-0 translate-y-[-2px]" src="/Logo｜Orange.svg" />
          <h1 className="font-headline-md uppercase tracking-widest font-bold text-primary text-[24px] leading-none">基礎任務試煉</h1>
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
        <div className={`flex flex-row justify-between items-start shadow-[inset_0_0_15px_rgba(243,156,18,0.05)] h-[60px] ${view === 'individual' ? 'hidden' : ''}`} style={{ marginTop: 32, marginBottom: 32 }}>
          <div className="flex flex-col border-l-[3px] border-primary pl-3 flex-1 pr-4">
            <p className="font-label-caps text-white font-bold text-[12px] tracking-[0.1em] mb-3 leading-none whitespace-nowrap">狩獵週排行榜</p>
            <div className="h-[30px] flex items-center w-full">
              <h2 className="text-white font-bold tracking-wider uppercase w-full"
                style={{
                  fontSize: dashboardData.name.length <= 4 ? '30px' :
                            dashboardData.name.length <= 10 ? '20px' :
                            dashboardData.name.length <= 20 ? '14px' :
                            '10px',
                  lineHeight: dashboardData.name.length <= 10 ? '30px' :
                              dashboardData.name.length <= 20 ? '15px' :
                              '10px',
                  display: '-webkit-box',
                  WebkitLineClamp: dashboardData.name.length <= 10 ? 1 :
                                   dashboardData.name.length <= 20 ? 2 : 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'break-all'
                }}
              >{dashboardData.name}</h2>
            </div>
          </div>
          <div className="text-right flex flex-col justify-end flex-shrink-0">
            <p className="font-label-caps text-white font-bold text-[12px] tracking-[0.1em] mb-3 uppercase leading-none whitespace-nowrap">蟬聯冠軍週數</p>
            <p className="font-headline-lg text-white text-3xl font-bold tracking-tighter font-display shadow-primary/20 flex items-baseline justify-end gap-1 leading-none">{dashboardData.weeks}</p>
          </div>
        </div>

        <div className={`flex flex-row justify-between items-start shadow-[inset_0_0_15px_rgba(243,156,18,0.05)] h-[60px] ${view === 'team' ? 'hidden' : ''}`} style={{ marginTop: 32, marginBottom: 32 }}>
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
            <p className="font-label-caps text-primary font-bold text-[12px] tracking-[0.1em] mb-3 leading-none">{hunterRank}</p>
            <div className="flex items-center gap-2">
              <h2 
                key={selectedPersonalHunter}
                className={`font-headline-lg text-primary text-3xl font-bold tracking-wider uppercase leading-none transition-opacity animate-text-reveal ${userRole === "admin" ? "cursor-pointer hover:opacity-80" : ""}`}
                onClick={() => { if (userRole === "admin") setIsPersonalHunterDropdownOpen(!isPersonalHunterDropdownOpen); }}
              >
                {selectedPersonalHunter || "載入中..."}
              </h2>
            </div>
            {isPersonalHunterDropdownOpen && userRole === "admin" && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-surface-container-high border border-primary/30 rounded-[4px] shadow-lg z-[120] max-h-48 overflow-y-auto scrollbar-hide">
                {options.hunters.map((hunter) => (
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
          <div className="text-right flex flex-col justify-end">
            <p className="font-label-caps font-bold text-white text-[12px] tracking-[0.1em] mb-3 uppercase leading-none">累積覺醒點數</p>
            <p 
              key={selectedPersonalHunter}
              className="font-headline-lg text-white text-3xl font-bold tracking-tighter font-display shadow-primary/20 flex items-baseline justify-end gap-1 leading-none animate-text-reveal" 
            >
              {personalTotalScore}
              <span className="text-[10px] font-normal lowercase tracking-normal text-white">pts</span>
            </p>
          </div>
        </div>

        {/* Individual Module */}
        <section className={`space-y-[18px] mb-[32px] ${view === 'team' ? 'hidden' : ''}`}>
          <div className="relative border border-primary/30 p-4 bg-surface-container-low/50 backdrop-blur-sm rounded-sm">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-white text-[12px] font-bold tracking-[0.1em] uppercase">狩獵日誌</h2>
              <div className="relative flex items-center gap-2">
                <span 
                  className="text-[12px] font-bold text-primary font-data-mono cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setIsPersonalDateDropdownOpen(!isPersonalDateDropdownOpen)}
                >
                  {selectedPersonalDate || "載入中..."}
                </span>
                <span className="w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(243,156,18,0.8)] flex-shrink-0 cursor-pointer" onClick={() => setIsPersonalDateDropdownOpen(!isPersonalDateDropdownOpen)}></span>
                {isPersonalDateDropdownOpen && (
                  <div className="absolute top-full right-0 mt-2 w-32 bg-surface-container-high border border-primary/30 rounded-[4px] shadow-lg z-[120] max-h-48 overflow-y-auto scrollbar-hide">
                    {options.dates.map((date) => (
                      <div
                        key={date}
                        className="px-4 py-3 hover:bg-primary/20 cursor-pointer text-[#efe0d2] text-sm border-b border-primary/10 last:border-b-0 text-right"
                        onClick={() => { setSelectedPersonalDate(date); setIsPersonalDateDropdownOpen(false); }}
                      >
                        {date}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <div className="grid grid-cols-6 gap-2">
                <PersonalIndicatorCard label="D1" symbol={d1} note={pNotes[2]} />
                <PersonalIndicatorCard label="D2" symbol={d2} note={pNotes[3]} />
                <PersonalIndicatorCard label="D3" symbol={d3} note={pNotes[4]} />
                <PersonalIndicatorCard label="D4" symbol={d4} note={pNotes[5]} />
                <PersonalIndicatorCard label="D5" symbol={d5} note={pNotes[6]} />
                <PersonalIndicatorCard label="D6" symbol={d6} note={pNotes[7]} />
              </div>
              <div className="grid grid-cols-6 gap-2 mt-2">
                <div className="col-span-6"><PersonalIndicatorCard label="量" symbol={dQuantity} note={pNotes[9]} /></div>
              </div>
            </div>
          </div>
          <div className="relative border border-primary/30 p-4 bg-surface-container-low/50 backdrop-blur-sm rounded-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white text-[12px] font-bold tracking-[0.1em] uppercase">狩獵紀錄</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <PersonalIndicatorCard label="精" symbol={recAcc} note={pNotes[10]} />
              <PersonalIndicatorCard label="準" symbol={recPrec} note={pNotes[11]} />
            </div>
          </div>
          <div className="relative border border-primary/30 p-4 bg-surface-container-low/50 backdrop-blur-sm rounded-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white text-[12px] font-bold tracking-[0.1em] uppercase">狩獵任務</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <PersonalIndicatorCard label="任務完成度" symbol={taskCompletion} note={pNotes[15]} isSymbolText />
              <PersonalIndicatorCard label="試煉獎勵" symbol={taskAward} note={pNotes[12]} />
              <PersonalIndicatorCard label="體能強化度" symbol={taskPhysical} note={pNotes[16]} isSymbolText />
              <PersonalIndicatorCard label="格局進化度" symbol={taskPattern} note={pNotes[17]} isSymbolText />
            </div>
          </div>
          <div className="w-full bg-primary text-black p-4 rounded-[4px] flex justify-between items-center shadow-lg">
            <span className="font-headline-md text-lg font-black">覺醒點數</span>
            <div className="flex items-baseline gap-1">
              <span key={`${selectedPersonalDate}-${selectedPersonalHunter}`} className="font-data-mono text-2xl font-black animate-text-reveal">
                {personalScoreValue}
              </span>
              <span className="text-[10px] font-normal lowercase tracking-normal">pts</span>
            </div>
          </div>

          {/* 隱藏與跨越試煉：獎金兌換資格考核門檻面板 */}
          <div className={`relative border p-4 backdrop-blur-md rounded-[4px] transition-all duration-300 shadow-xl ${
            personalAwardThresholdData.isMet 
              ? 'border-primary bg-primary/10 shadow-[0_0_20px_rgba(243,156,18,0.25)]' 
              : 'border-primary/30 bg-surface-container-low/80'
          }`}>
            <div 
              className="flex justify-between items-center mb-3.5 pb-3 border-b border-primary/20 cursor-pointer select-none group"
              onClick={() => setShowThresholdRules(!showThresholdRules)}
              title="點選展開/收合規則說明"
            >
              <div className="flex items-center">
                <h3 className="text-primary text-[13px] font-bold tracking-[0.1em] uppercase group-hover:text-primary/80 transition-colors">
                  獎金兌換資格
                </h3>
              </div>
              <div className="flex items-center shrink-0">
                {personalAwardThresholdData.isMet ? (
                  <span className="inline-flex items-center px-3 py-1 bg-primary text-black font-extrabold font-label-caps text-[11px] tracking-wider rounded-full shadow-[0_0_12px_rgba(243,156,18,0.6)]">
                    門檻解鎖
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 bg-[#121212] border border-primary/40 text-[#efe0d2]/70 font-bold font-label-caps text-[11px] tracking-wider rounded-full">
                    尚未達標
                  </span>
                )}
              </div>
            </div>

            {/* 考核說明與提示（點選標題行展開） */}
            {showThresholdRules && (
              <div className="text-[11px] text-[#efe0d2]/80 space-y-1.5 mb-4 bg-black/40 p-3 rounded border border-white/5 leading-relaxed">
                <div className="flex items-start gap-1.5">
                  <span className="text-primary font-bold shrink-0">① 狩獵任務發布日：</span>
                  <span>連續 4 週任務不中斷，於<strong className="text-white">週日 21:00 前</strong>交付。</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-primary font-bold shrink-0">② 狩獵任務完成度：</span>
                  <span>連續 4 週完成度平均達<strong className="text-white"> 3.5 分或以上</strong>。</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-primary font-bold shrink-0">③ 狩獵任務體格分：</span>
                  <span>當週狩獵任務的體能和格局完成度皆<strong className="text-white">「✕」以上</strong>。</span>
                </div>
              </div>
            )}

            {/* 連續 4 週考核追蹤網格 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
              {personalAwardThresholdData.weeks.map((week, idx) => {
                return (
                  <div 
                    key={week.dateStr} 
                    className={`flex flex-col justify-between p-2.5 rounded border transition-all min-h-[105px] ${
                      (week.weekPass || personalAwardThresholdData.isMet) 
                        ? 'bg-primary/10 border-primary/50 text-white shadow-[0_0_8px_rgba(243,156,18,0.1)]' 
                        : 'bg-[#ff3b30]/10 border-[#ff3b30]/50 text-white'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2 pb-1 border-b border-white/10">
                      <span className={`font-data-mono text-[11px] font-bold tracking-wider ${week.weekPass ? 'text-white' : 'text-[#ff3b30]'}`}>
                        {week.dateStr.substring(5)}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${week.weekPass ? 'bg-primary text-black' : 'bg-[#ff3b30]/20 border border-[#ff3b30]/40 text-[#ff3b30]'}`}>
                        前 {idx + 1} 週
                      </span>
                    </div>

                    <div className="space-y-1.5 text-[11px] flex flex-col justify-between flex-1">
                      {/* 發布日 status */}
                      <div className="flex justify-between items-center">
                        <span className="text-white/60 text-[10px]">發布日</span>
                        <span className={`font-data-mono font-bold ${week.timePass ? 'text-white' : 'text-[#ff3b30]'}`}>
                          {week.dayStr === '-' ? '--' : week.dayStr} {week.timeStr !== '-' && week.timeStr !== '' ? week.timeStr : ''}
                        </span>
                      </div>

                      {/* 完成度 status */}
                      <div className="flex justify-between items-center">
                        <span className="text-white/60 text-[10px]">完成度</span>
                        <span className={`font-data-mono font-bold ${week.chengPass ? 'text-white' : 'text-[#ff3b30]'}`}>
                          {week.chengStr === '-' ? '--' : week.chengStr}
                        </span>
                      </div>

                      {/* 體格分 status (僅第1格計算與顯示，其餘三格維持高度等高) */}
                      {idx === 0 ? (
                        <div className="flex justify-between items-center pt-0.5">
                          <span className="text-white/60 text-[10px]">體格分</span>
                          <span className={`${
                            (week.displayAward === '✕' || week.displayAward === '×' || week.displayAward === 'X' || week.displayAward === 'x' || week.displayAward === '--' || !week.displayAward)
                              ? 'font-data-mono font-bold text-[11px]'
                              : (week.displayAward === '○' || week.displayAward === 'o' || week.displayAward === 'O' || week.displayAward === '0' || week.displayAward === '〇')
                                ? 'font-sans font-medium text-[15px] inline-block leading-none'
                                : 'font-sans text-[18px] font-black inline-block scale-[1.15] leading-none [text-shadow:_0_0_1.5px_currentColor]'
                          } ${(week.awardPass && week.displayAward !== '✕' && week.displayAward !== '×' && week.displayAward !== 'X' && week.displayAward !== 'x') ? 'text-white' : 'text-[#ff3b30]'}`}>
                            {week.displayAward || '--'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center pt-0.5 opacity-0 pointer-events-none select-none">
                          <span className="text-white/60 text-[10px]">佔位</span>
                          <span className="font-data-mono font-bold text-[11px]">--</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 底部總結提示語 */}
            <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px]">
              {personalAwardThresholdData.isMet ? (
                <div className="text-primary font-bold flex items-center gap-1.5 animate-pulse">
                  <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>celebration</span>
                  <span>{selectedPersonalHunter || "您"}已通過考核標準，正式解鎖兌獎資格！繼續堅持不懈，突破自我！</span>
                </div>
              ) : (
                <div className="text-[#efe0d2]/70 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">info</span>
                  <span>堅持每天 1% 的成長，思想決定行動，行動決定未來！</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Team Leaderboard Bar Chart */}
        <section className={`mb-[5px] ${view === 'individual' ? 'hidden' : ''}`}>
          <div className="pt-5 pb-8 px-5 sm:px-6 -mx-4 bg-[#121212] font-display">
            {/* Race date indicator - above title */}
            <div className="h-[16px] mb-1">
              {isRacePlaying && (
                <span className="text-primary/80 text-[11px] font-mono tracking-wider">{raceCurrentDate.replace(/^\d{4}\//, '')}</span>
              )}
            </div>

            <div className="flex justify-between items-center mb-6 relative z-10 h-[32px]">
              <div className="relative">
                <button 
                  onClick={() => setIsLeaderboardYearDropdownOpen(!isLeaderboardYearDropdownOpen)}
                  className="flex items-center gap-1 font-label-caps text-primary font-bold text-[12px] tracking-[0.1em] leading-none uppercase hover:text-[#00E5FF] transition-colors"
                >
                  {awardYear} 排行榜
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

              <div className="flex items-center gap-2">
                {/* Play/Pause Race Button */}
                <button
                  onClick={toggleRace}
                  className="rounded-full bg-primary flex items-center justify-center transition-all hover:brightness-110 active:scale-90 shrink-0"
                  style={{ width: '26px', height: '26px' }}
                  title={isRacePlaying ? '暫停' : '播放排名動畫'}
                >
                  {isRacePlaying ? (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <rect x="1.5" y="1" width="3" height="10" rx="1" fill="#000" />
                      <rect x="7.5" y="1" width="3" height="10" rx="1" fill="#000" />
                    </svg>
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M3.5 1L10.5 6L3.5 11V1Z" fill="#000" />
                    </svg>
                  )}
                </button>

                <div className="flex bg-[#1E1E1E] rounded-full p-1 border border-primary/20">
                  <button
                    onClick={() => setLeaderboardMetric('mission')}
                    className={`px-3 py-1 rounded-full text-[10px] tracking-wider transition-colors ${leaderboardMetric === 'mission' ? 'bg-primary text-black font-bold' : 'text-[#efe0d2]/70 hover:text-white'}`}
                  >
                    任務
                  </button>
                  <button
                    onClick={() => setLeaderboardMetric('physique')}
                    className={`px-3 py-1 rounded-full text-[10px] tracking-wider transition-colors ${leaderboardMetric === 'physique' ? 'bg-primary text-black font-bold' : 'text-[#efe0d2]/70 hover:text-white'}`}
                  >
                    體能
                  </button>
                  <button
                    onClick={() => setLeaderboardMetric('mindset')}
                    className={`px-3 py-1 rounded-full text-[10px] tracking-wider transition-colors ${leaderboardMetric === 'mindset' ? 'bg-primary text-black font-bold' : 'text-[#efe0d2]/70 hover:text-white'}`}
                  >
                    格局
                  </button>
                  <button
                    onClick={() => setLeaderboardMetric('awakening')}
                    className={`px-3 py-1 rounded-full text-[10px] tracking-wider transition-colors ${leaderboardMetric === 'awakening' || (leaderboardMetric as any) === 'score' ? 'bg-primary text-black font-bold' : 'text-[#efe0d2]/70 hover:text-white'}`}
                  >
                    覺醒
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {displayLeaderboardData.length > 0 ? displayLeaderboardData.map((item: any, index: number) => {
                const maxIndex = Math.max(1, displayLeaderboardData.length - 1);
                const barOpacity = 1 - (0.3 * (index / maxIndex));
                return (
                  <div key={item.name} className="flex items-center w-full gap-3" style={{ transition: 'transform 0.35s ease-out, opacity 0.35s ease-out' }}>
                    <span className="text-[#efe0d2]/70 text-[12px] font-display w-4 text-left shrink-0">{item.rank}</span>
                    <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${item.rank <= 3 ? 'bg-primary/20 border-primary text-primary' : 'bg-white/10 border-white/20 text-white/80'} ${item.rank === 1 ? 'shadow-[0_0_8px_rgba(243,156,18,0.8)]' : ''}`}>
                      <span className={`text-[12px] ${item.rank === 1 ? 'font-bold' : 'font-normal'}`}>{item.name.slice(-1)}</span>
                    </div>
                    <div className="flex-1 h-2 bg-primary/10 rounded-r-full overflow-visible flex relative">
                      <div
                        className={`h-full rounded-r-full bg-primary ${item.rank === 1 ? 'shadow-[0_0_8px_rgba(243,156,18,0.8)]' : ''}`}
                        style={{ width: `${item.barPct}%`, opacity: barOpacity, transition: 'width 0.35s ease-out' }}
                      ></div>
                    </div>
                    <div className="w-20 text-right shrink-0">
                      <div className="flex items-baseline justify-end gap-0.5">
                        <span className="text-white text-[13px] font-bold font-mono">{item.displayScore ?? item.score}</span>
                        <span className="text-white/70 text-[10px]">pts</span>
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="text-center text-primary/50 text-xs py-4">本週暫無數據</div>
              )}
            </div>
          </div>
        </section>

        {/* Team Module Content (Weekly Stats) */}
        <section className={`space-y-[18px] mb-[32px] ${view === 'individual' ? 'hidden' : ''}`}>
          <div className="p-4 border border-primary/30 bg-surface-container-low/50 font-display rounded-sm">
            <div className="flex justify-between mb-6 items-baseline relative">
              <div className="relative">
                <h3 
                  className="text-primary font-bold tracking-[0.1em] uppercase mb-1 text-[12px] cursor-pointer hover:opacity-80 transition-opacity inline-block"
                  onClick={() => setIsHunterDropdownOpen(!isHunterDropdownOpen)}
                >
                  狩獵分析
                </h3>
                <div className="flex items-center gap-3">
                  <span
                    className="font-bold text-primary text-3xl cursor-pointer hover:opacity-80 transition-opacity animate-text-reveal"
                    onClick={() => setIsHunterDropdownOpen(!isHunterDropdownOpen)}
                    key={selectedTeamHunter}
                  >
                    {selectedTeamHunter || "載入中..."}
                  </span>
                </div>
                {isHunterDropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 w-32 bg-surface-container-high border border-primary/30 rounded shadow-lg z-10 max-h-48 overflow-y-auto scrollbar-hide">
                    {options.hunters.map((hunter) => (
                      <div
                        key={hunter}
                        className="px-4 py-2 hover:bg-primary/20 cursor-pointer text-[#efe0d2] text-sm"
                        onClick={() => { setSelectedTeamHunter(hunter); setIsHunterDropdownOpen(false); }}
                      >
                        {hunter}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-right flex items-center gap-2 relative">
                <span className="text-[12px] font-normal tracking-tighter flex items-center gap-1">
                  <span className="text-primary">起算自</span>
                  <span
                    className="cursor-pointer font-bold text-primary hover:opacity-80 transition-opacity"
                    onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)}
                  >
                    {selectedStartDate || "載入中..."}
                  </span>
                </span>
                <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(243,156,18,0.8)]"></span>
                {isDateDropdownOpen && (
                  <div className="absolute top-full right-0 mt-2 w-32 bg-surface-container-high border border-primary/30 rounded shadow-lg z-10 max-h-48 overflow-y-auto text-left scrollbar-hide">
                    {options.dates.map((date) => (
                      <div
                        key={date}
                        className="px-4 py-2 hover:bg-primary/20 cursor-pointer text-[#efe0d2] text-sm"
                        onClick={() => { setSelectedStartDate(date); setIsDateDropdownOpen(false); }}
                      >
                        {date}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <style>{`
                @keyframes growX {
                  0% { transform: scaleX(0); }
                  100% { transform: scaleX(1); }
                }
                .animate-grow-x {
                  animation: growX 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  transform-origin: left;
                }
              `}</style>
              {analysisData?.items ? analysisData.items.map((item, idx) => (
                <div key={`${selectedTeamHunter}-${selectedStartDate}-${idx}`} className="space-y-1.5">
                  <div className="flex justify-between text-[12px] uppercase tracking-wider">
                    <span className="text-[#efe0d2]/70">{item.label}</span>
                    <span className="text-white">{item.percent}</span>
                  </div>
                  <div className="h-1.5 w-full bg-primary/10">
                    <div 
                      className="h-full bg-primary shadow-[0_0_8px_rgba(243,156,18,0.8)] animate-grow-x" 
                      style={{ width: item.width }}
                    ></div>
                  </div>
                </div>
              )) : (
                <div className="text-center text-primary/50 text-xs py-4">暫無資料</div>
              )}
            </div>
            <div className="pt-4 border-t border-primary/20 flex justify-between items-baseline">
              <span className="text-[12px] text-[#efe0d2]/70 font-bold uppercase tracking-[0.1em]">區間累積覺醒點數</span>
              <div className="flex items-baseline gap-1">
                <span className="text-white font-bold text-2xl tracking-tighter">
                  {analysisData ? analysisData.cumulativeAwakening : "0.0"}
                </span>
                <span className="text-[10px] font-normal lowercase tracking-normal text-white">pts</span>
              </div>
            </div>
          </div>

          {(userRole === "admin" || userRole === "editor") && (
            <div className="border border-primary/30 bg-transparent overflow-visible rounded-sm flex flex-col">
              <div className="overflow-x-auto overflow-y-auto max-h-[606px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <table className="w-full text-left font-data-mono border-collapse table-fixed text-[10px]">
                <thead className="sticky top-0 z-10 bg-surface-container-high">
                  <tr className="text-[#efe0d2]/70 border-b border-primary/20 h-[30px]">
                    <th className="p-2 font-bold whitespace-nowrap" style={{ width: "23%", padding: 4 }}>狩獵者</th>
                    <th className="p-2 font-bold whitespace-nowrap" style={{ width: "28%", padding: 4, textAlign: "left" }}>日誌</th>
                    <th className="p-2 font-bold text-center whitespace-nowrap" style={{ width: "15%", padding: 4, textAlign: "center" }}>紀錄</th>
                    <th className="p-2 font-bold text-center whitespace-nowrap" style={{ width: "22%", padding: 4, textAlign: "center" }}>任務</th>
                    <th className="p-2 font-bold text-center whitespace-nowrap" style={{ width: "12%", padding: 4, textAlign: "center" }}>點數</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/5">
                  {tableData.length > 0 ? tableData.map((row, idx) => (
                    <tr key={`${row.date}-${row.name}-${idx}`} className={`h-[32px] ${idx % 2 === 1 ? "bg-primary/10" : ""}`}>
                      <td className="p-2 whitespace-nowrap align-middle" style={{ width: "23%", padding: 4 }}>
                        <div className="flex flex-col gap-0.5">
                          <div 
                            className={`font-bold text-primary truncate ${(userRole === "admin" || userRole === "editor" || process.env.NODE_ENV === "development") ? "cursor-pointer hover:opacity-70 transition-opacity" : ""}`}
                            onClick={() => {
                              if (userRole === "admin" || userRole === "editor" || process.env.NODE_ENV === "development") {
                                setEditingRow(row);
                                setIsEditModalOpen(true);
                              }
                            }}
                          >
                            {row.name}
                          </div>
                          <div className="text-[9px] text-white/50">
                            {row.date === "--" || row.date.length < 5 ? "--" : row.date.substring(5)}
                          </div>
                        </div>
                      </td>
                      <td className="p-2 font-data-mono whitespace-nowrap align-middle" style={{ width: "28%", padding: 4, overflow: "hidden", color: "#ffffff", textAlign: "left" }}>
                        <RenderSymbols str={row.logStr} alignLeft={true} />
                      </td>
                      <td className="p-2 text-center whitespace-nowrap align-middle" style={{ width: "15%", padding: 4, color: "#ffffff", textAlign: "center" }}>
                        <RenderSymbols str={row.recStr} />
                      </td>
                      <td className="p-2 text-center whitespace-nowrap align-middle" style={{ width: "22%", padding: 4, color: "#ffffff", textAlign: "center", fontSize: 10 }}>
                        <RenderSymbols str={row.taskStr} />
                      </td>
                      <td className="p-2 text-center whitespace-nowrap align-middle" style={{ width: "12%", padding: 4, color: "#ffffff", textAlign: "center", fontSize: 10 }}>
                        {row.score}
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
        </section>

        </main>
      </PullToRefresh>
        {/* Edit Modal */}
        {/* Edit Modal */}
        {isEditModalOpen && editingRow && (() => {
          const timeVal = editingRow.rawData[14] || "";
          const [hourVal, minVal] = timeVal.includes(":") ? timeVal.split(":") : ["19", "00"];

          const getSym = (val: string) => {
            if (!val || val.trim() === "") return "";
            if (val === "高" || val === "O" || val === "o" || val === "〇" || val === "○") return "○";
            if (val === "中" || val === "△" || val === "^") return "△";
            if (val === "低" || val === "無" || val === "X" || val === "x" || val === "✕" || val === "✖") return "✕";
            if (val === "⊗" || val === "⨂") return "⊗";
            return "";
          };

          return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
              <div className="bg-surface-container border border-primary/40 rounded-[4px] shadow-[0_0_20px_rgba(243,156,18,0.2)] w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]">
                <div className="bg-primary/10 border-b border-primary/20 px-4 py-3 flex justify-between items-center shrink-0">
                  <h3 className="text-primary font-bold text-sm tracking-widest uppercase">{editingRow.name} {editingRow.date}</h3>
                  <button
                    onClick={() => setIsEditModalOpen(false)}
                    className="text-primary/50 hover:text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
                <div className="p-4 overflow-y-auto shrink scrollbar-hide">
                  <div className="space-y-4">
                    {/* 日誌 */}
                    <div className="border border-primary/20 rounded-[4px] p-3 bg-surface-container-low">
                      <h4 className="text-[12px] text-primary mb-2 uppercase tracking-widest">日誌</h4>
                      <div className="grid grid-cols-6 gap-1">
                        {[
                          { label: "D1", idx: 2 }, { label: "D2", idx: 3 }, { label: "D3", idx: 4 }, { label: "D4", idx: 5 },
                          { label: "D5", idx: 6 }, { label: "D6", idx: 7 }
                        ].map((col) => (
                          <DayCellEdit 
                            key={col.label}
                            label={col.label}
                            defaultSymbol={getSym(editingRow.rawData[col.idx])}
                            defaultNote={editingRow.rawNotes?.[col.idx] || ""}
                            symbolInputId={`edit-col-${col.idx}`}
                            noteInputId={`edit-note-${col.idx}`}
                            placeholder="輸入備註 (如: 事假)"
                            allowCrossCircle={true}
                          />
                        ))}
                      </div>
                    </div>

                    {/* 紀錄 */}
                    <div className="border border-primary/20 rounded-[4px] p-3 bg-surface-container-low">
                      <h4 className="text-[12px] text-primary mb-2 uppercase tracking-widest">紀錄</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {[{ label: "精", idx: 10 }, { label: "準", idx: 11 }].map(col => (
                          <DayCellEdit 
                            key={col.label}
                            label={col.label}
                            defaultSymbol={getSym(editingRow.rawData[col.idx])}
                            defaultNote={editingRow.rawNotes?.[col.idx] || ""}
                            symbolInputId={`edit-col-${col.idx}`}
                            noteInputId={`edit-note-${col.idx}`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* 任務 */}
                    <div className="border border-primary/20 rounded-[4px] p-3 bg-surface-container-low">
                      <h4 className="text-[12px] text-primary mb-2 uppercase tracking-widest">任務</h4>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        <div className="space-y-1">
                          <DayCellEdit 
                            label="天"
                            defaultSymbol={editingRow.rawData[13] || ""}
                            defaultNote={editingRow.rawNotes?.[13] || ""}
                            symbolInputId={`edit-col-13`}
                            noteInputId={`edit-note-13`}
                            options={["五", "六", "日", "後", "✕", ""]}
                          />
                        </div>
                        <div className="space-y-1 relative z-50">
                          <label className="text-[11px] text-primary/70 block text-center">時</label>
                          <CustomTimePicker defaultTime={timeVal} inputId="edit-col-14" />
                        </div>
                        <div className="space-y-1">
                          <DayCellEdit 
                            label="誠"
                            defaultSymbol={editingRow.rawData[15] || ""}
                            defaultNote={editingRow.rawNotes?.[15] || ""}
                            symbolInputId={`edit-col-15`}
                            noteInputId={`edit-note-15`}
                            options={["5.0", "4.5", "4.0", "3.5", "3.0", "2.5", "2.0", "1.5", "1.0", "0.5", "0.0", ""]}
                          />
                        </div>
                        <div className="space-y-1">
                          <DayCellEdit 
                            label="獎"
                            defaultSymbol={editingRow.rawData[12] || ""}
                            defaultNote={editingRow.rawNotes?.[12] || ""}
                            symbolInputId={`edit-col-12`}
                            noteInputId={`edit-note-12`}
                          />
                        </div>
                        <div className="space-y-1">
                          <DayCellEdit 
                            label="體"
                            defaultSymbol={editingRow.rawData[16] || ""}
                            defaultNote={editingRow.rawNotes?.[16] || ""}
                            symbolInputId={`edit-col-16`}
                            noteInputId={`edit-note-16`}
                            options={["高", "中", "低", "✕", ""]}
                          />
                        </div>
                        <div className="space-y-1">
                          <DayCellEdit 
                            label="格"
                            defaultSymbol={editingRow.rawData[17] || ""}
                            defaultNote={editingRow.rawNotes?.[17] || ""}
                            symbolInputId={`edit-col-17`}
                            noteInputId={`edit-note-17`}
                            options={["高", "中", "低", "✕", ""]}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-4 border-t border-primary/20 bg-surface-container-low flex justify-end gap-3 shrink-0">
                  <button
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-1.5 rounded border border-primary/30 text-primary text-[10px] hover:bg-primary/10 transition-colors uppercase tracking-wider"
                  >
                    取消
                  </button>
                  <button
                    disabled={isSaving}
                    onClick={async () => {
                      setIsSaving(true);
                      try {
                        const newRow = [...editingRow.rawData];
                        const getVal = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value || "";

                        const updates = [
                          {
                            range: `C${editingRow.originalIndex}:H${editingRow.originalIndex}`,
                            values: [[getVal('edit-col-2'), getVal('edit-col-3'), getVal('edit-col-4'), getVal('edit-col-5'), getVal('edit-col-6'), getVal('edit-col-7')]]
                          },
                          {
                            range: `K${editingRow.originalIndex}:L${editingRow.originalIndex}`,
                            values: [[getVal('edit-col-10'), getVal('edit-col-11')]]
                          },
                          {
                            range: `M${editingRow.originalIndex}:R${editingRow.originalIndex}`,
                            values: [[getVal('edit-col-12'), getVal('edit-col-13'), getVal('edit-col-14'), getVal('edit-col-15'), getVal('edit-col-16'), getVal('edit-col-17')]]
                          }
                        ];

                        const notesUpdates = [
                          2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 15, 16, 17
                        ].map(colIndex => ({
                          rowIndex: editingRow.originalIndex - 1,
                          colIndex: colIndex,
                          note: getVal(`edit-note-${colIndex}`)
                        }));

                        const res = await fetch('/api/sheets/basic-mission', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ updates, notesUpdates, sheetId: data?.sheetId })
                        });

                        if (res.ok) {
                          await mutate();
                          setIsEditModalOpen(false);
                        } else {
                          console.error("Failed to save:", await res.text());
                        }
                      } catch (err) {
                        console.error(err);
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    className="px-4 py-1.5 rounded bg-primary/20 border border-primary text-primary text-[10px] hover:bg-primary/30 transition-colors uppercase tracking-wider shadow-[0_0_10px_rgba(243,156,18,0.2)] disabled:opacity-50"
                  >
                    {isSaving ? "儲存中..." : "確認修改"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Bottom Navigation */}
      <nav className={`fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-20 px-6 bg-surface/95 backdrop-blur-lg border-t border-primary/30 shadow-[0_-8px_20px_rgba(243,156,18,0.3)] transition-transform duration-300 ${showNav ? 'translate-y-0' : 'translate-y-full'}`}>
        <button className="flex flex-col items-center gap-1 text-primary">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>target</span>
          <span className="font-label-caps text-[11px] tracking-[0.1em]">基礎</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-[#efe0d2]" onClick={() => router.push("/hidden-mission")}>
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
        <button className="flex flex-col items-center gap-1 text-[#efe0d2]" onClick={() => router.push("/running-records")}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>directions_run</span>
          <span className="font-label-caps text-[11px] tracking-[0.1em]">跨越</span>
        </button>
      </nav>

      <style jsx global>{`
        .overflow-y-auto::-webkit-scrollbar {
            display: none;
        }
        .chamfered {
            clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
        }
        @keyframes pulse-glow {
            0%, 100% { filter: drop-shadow(0 0 5px rgba(243, 156, 18, 0.4)); transform: scale(1.05); }
            50% { filter: drop-shadow(0 0 12px rgba(243, 156, 18, 0.8)); transform: scale(1.1); }
        }
        .active-pulse {
            animation: pulse-glow 2s infinite ease-in-out;
        }
        * {
            cursor: crosshair !important;
        }
        [contenteditable="true"]:focus, .cursor-text:focus, input {
            cursor: text !important;
        }
        .indicator-card {
            background: transparent;
            border: 1px solid rgba(243, 156, 18, 0.2);
            border-radius: 4px;
            box-shadow: 0 0 10px rgba(243, 156, 18, 0.1);
            transition: all 0.3s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            padding: 8px 0;
            width: 100%;
            height: 72px;
        }
        .indicator-card.active {
            box-shadow: 0 0 15px rgba(243, 156, 18, 0.5), inset 0 0 8px rgba(243, 156, 18, 0.3);
            border-color: #f39c12;
        }
        .indicator-card .symbol {
            font-size: 26px;
            line-height: 1;
            margin-top: 4px;
            color: #f39c12;
            font-family: 'Material Symbols Outlined';
            font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
        }
        .indicator-card .label {
            font-size: 11px;
            color: rgba(239, 224, 210, 0.7);
        }
        .sym-icon {
            font-family: 'Material Symbols Outlined';
            font-variation-settings: 'FILL' 0, 'wght' 300, 'opsz' 20;
            font-size: 11px;
            margin-left: -1px;
            margin-right: -1px;
            vertical-align: middle;
            line-height: 1;
        }
      `}</style>
    </div>
  );
}
