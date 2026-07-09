"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PullToRefresh } from "@/components/PullToRefresh";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function HiddenMissionPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [showNav, setShowNav] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  // View toggle: individual vs team
  const [view, setView] = useState<'individual' | 'team'>('team');

  // Active table tab for Team View: 'Tracker' (投資) vs 'Reward' (請領)
  const [activeTab, setActiveTab] = useState<'Tracker' | 'Reward'>('Tracker');

  // Selected hunter for Individual View
  const [selectedHunter, setSelectedHunter] = useState<string>("");
  const [isHunterDropdownOpen, setIsHunterDropdownOpen] = useState(false);
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);
  const toggleLevel = (lvl: string) => setExpandedLevel(prev => prev === lvl ? null : lvl);

  // Year selection states
  const [awardYear, setAwardYear] = useState<string>('2026');
  const [isLeaderboardYearDropdownOpen, setIsLeaderboardYearDropdownOpen] = useState(false);
  const [isAwardYearDropdownOpen, setIsAwardYearDropdownOpen] = useState(false);
  const [teamLeaderboardMetric, setTeamLeaderboardMetric] = useState<'holding' | 'streak' | 'performance'>('holding');

  // Race playback states for Team Leaderboard
  const [isRacePlaying, setIsRacePlaying] = useState(false);
  const [raceFrameIndex, setRaceFrameIndex] = useState(0);
  const raceTimerRef = useRef<any>(null);

  // Modal states for editing / adding Tracker or Reward
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch API data
  const { data: res, isLoading, mutate } = useSWR("/api/sheets/hidden-mission", fetcher, {
    refreshInterval: 30000,
  });

  const rawData = res?.data || {
    scoreboard: [],
    tracker: [],
    reward: [],
    leadgeA: [],
    leadgeB: [],
    leadgeC: [],
  };

  const data = useMemo(() => {
    const sortedScoreboard = [...(rawData.scoreboard || [])].sort((a: any, b: any) => (b.totalReward || 0) - (a.totalReward || 0));
    return {
      ...rawData,
      scoreboard: sortedScoreboard,
    };
  }, [rawData]);

  // Check user role & hunter name
  const loggedInHunterName = (session?.user as any)?.hunterName || session?.user?.name || "";
  const roles = (session?.user as any)?.roles || {};
  const userRole = roles["hidden"] || "viewer";
  const isAdmin = userRole === "admin";
  const canEdit = userRole === "admin" || userRole === "editor" || process.env.NODE_ENV === "development";

  // Enforce permission-based hunter selection in Personal Module
  useEffect(() => {
    if (data.scoreboard.length > 0) {
      if (!isAdmin) {
        // Non-admin (editor / general): strictly only allowed to see themselves
        if (loggedInHunterName && selectedHunter !== loggedInHunterName) {
          setSelectedHunter(loggedInHunterName);
        } else if (!loggedInHunterName && !selectedHunter) {
          setSelectedHunter(data.scoreboard[0].hunter);
        }
      } else {
        // Admin: can see any hunter. If empty or on load, default to logged in hunter or match in scoreboard
        if (!selectedHunter) {
          const match = data.scoreboard.find((item: any) => item.hunter === loggedInHunterName);
          setSelectedHunter(match ? match.hunter : (loggedInHunterName || data.scoreboard[0].hunter));
        }
      }
    }
  }, [data.scoreboard, isAdmin, loggedInHunterName, selectedHunter, view]);

  // Handle scroll to hide/show navbar
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 80) {
        setShowNav(false);
      } else {
        setShowNav(true);
      }
      setLastScrollY(currentScrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  const teamLeaderboardData = useMemo(() => {
    if (!data.scoreboard || data.scoreboard.length === 0) return [];

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const targetYear = parseInt(awardYear, 10) || currentYear;
    const nowTime = now.getTime();
    const maxMonthToCheck = targetYear === currentYear ? currentMonth : (targetYear < currentYear ? 12 : 0);

    const result = data.scoreboard.map((sItem: any) => {
      const hunter = sItem.hunter;

      // 1. Holding (持有 - 天): max holding days in awardYear from data.leadgeA
      let maxD = 0;
      if (data.leadgeA) {
        const hunterRows = data.leadgeA.filter((item: any) => item.hunter === hunter);
        for (const item of hunterRows) {
          if (item.buyDate) {
            const buy = new Date(item.buyDate);
            if (!isNaN(buy.getTime()) && buy.getTime() <= nowTime) {
              const parts = item.buyDate.split(/[/.-]/);
              if (parts.length >= 1 && parts[0].trim() === awardYear) {
                const diffMs = nowTime - buy.getTime();
                const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                if (days > maxD) maxD = days;
              }
            }
          }
        }
      }

      // 2. Streak (連續 - 月): consecutive months in awardYear from data.leadgeA
      let maxStreak = 0;
      if (data.leadgeA) {
        const buyMonths = new Set<number>();
        const hunterRows = data.leadgeA.filter((item: any) => item.hunter === hunter);
        for (const item of hunterRows) {
          if (!item.buyDate) continue;
          const buy = new Date(item.buyDate);
          if (isNaN(buy.getTime()) || buy.getTime() > nowTime) continue;
          const parts = item.buyDate.split(/[/.-]/);
          if (parts.length >= 2) {
            const y = parts[0].trim();
            const m = parseInt(parts[1], 10);
            if (y === awardYear && m >= 1 && m <= 12) {
              if (targetYear === currentYear && m > currentMonth) continue;
              if (targetYear > currentYear) continue;
              buyMonths.add(m);
            }
          }
        }
        let streak = 0;
        for (let m = 1; m <= maxMonthToCheck; m++) {
          if (buyMonths.has(m)) {
            streak++;
            if (streak > maxStreak) maxStreak = streak;
          } else {
            streak = 0;
          }
        }
        if (maxStreak > 1) {
          maxStreak = maxStreak - 1;
        } else if (maxStreak === 1) {
          maxStreak = 1;
        } else {
          maxStreak = 0;
        }
      }

      // 3. Performance (績效 - %): returnRate in awardYear from data.leadgeC
      let rateNum = 0;
      let rateStr = "0.00%";
      if (data.leadgeC) {
        const matches = data.leadgeC.filter((item: any) => {
          if (item.hunter !== hunter || !(item.date || '').includes(awardYear)) return false;
          if (item.date) {
            const d = new Date(item.date);
            if (!isNaN(d.getTime()) && d.getTime() > nowTime) return false;
          }
          return true;
        });
        let target = null;
        if (matches.length > 0) {
          target = matches[matches.length - 1];
        } else if (awardYear === '2026') {
          target = data.leadgeC.find((item: any) => item.hunter === hunter);
        }
        if (target && target.returnRate && target.returnRate.trim()) {
          const rawRate = target.returnRate.trim();
          rateStr = rawRate.endsWith('%') ? rawRate : `${rawRate}%`;
          rateNum = parseFloat(rawRate.replace(/[^0-9.-]+/g, '')) || 0;
        }
      }

      return {
        ...sItem,
        holdingDays: maxD,
        consecutiveMonths: maxStreak,
        returnRateNum: rateNum,
        returnRateStr: rateStr,
      };
    });

    // Sort by currently selected metric
    result.sort((a: any, b: any) => {
      if (teamLeaderboardMetric === 'holding') {
        return (b.holdingDays || 0) - (a.holdingDays || 0);
      }
      if (teamLeaderboardMetric === 'streak') {
        return (b.consecutiveMonths || 0) - (a.consecutiveMonths || 0);
      }
      return (b.returnRateNum || 0) - (a.returnRateNum || 0);
    });

    return result;
  }, [data.scoreboard, data.leadgeA, data.leadgeC, awardYear, teamLeaderboardMetric]);

  const teamLeaderboardFrames = useMemo(() => {
    if (!data.scoreboard || data.scoreboard.length === 0) return [];

    const now = new Date();
    const currentYear = now.getFullYear();
    const targetYear = parseInt(awardYear, 10) || currentYear;
    const nowTime = now.getTime();

    // Collect all relevant dates in awardYear up to now
    const dateSet = new Set<string>();
    
    // Add month starts & midpoints for targetYear up to now
    const maxM = targetYear === currentYear ? (now.getMonth() + 1) : (targetYear < currentYear ? 12 : 0);
    for (let m = 1; m <= maxM; m++) {
      const mStr = m.toString().padStart(2, '0');
      dateSet.add(`${targetYear}/${mStr}/01`);
      if (targetYear < currentYear || m < maxM || now.getDate() >= 15) {
        dateSet.add(`${targetYear}/${mStr}/15`);
      }
    }
    // If targetYear === currentYear, add today's date
    if (targetYear === currentYear) {
      const todayStr = `${targetYear}/${(now.getMonth()+1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}`;
      dateSet.add(todayStr);
    }

    // Add buyDate from leadgeA
    if (data.leadgeA) {
      for (const item of data.leadgeA) {
        if (!item.buyDate) continue;
        const d = new Date(item.buyDate);
        if (!isNaN(d.getTime()) && d.getTime() <= nowTime && d.getFullYear() === targetYear) {
          const mStr = (d.getMonth() + 1).toString().padStart(2, '0');
          const dStr = d.getDate().toString().padStart(2, '0');
          dateSet.add(`${targetYear}/${mStr}/${dStr}`);
        }
      }
    }

    // Add dates from leadgeC
    if (data.leadgeC) {
      for (const item of data.leadgeC) {
        if (!item.date) continue;
        const d = new Date(item.date);
        if (!isNaN(d.getTime()) && d.getTime() <= nowTime && d.getFullYear() === targetYear) {
          const mStr = (d.getMonth() + 1).toString().padStart(2, '0');
          const dStr = d.getDate().toString().padStart(2, '0');
          dateSet.add(`${targetYear}/${mStr}/${dStr}`);
        }
      }
    }

    // Sort dates chronologically
    const sortedDates = Array.from(dateSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const frames = sortedDates.map(dateStr => {
      const frameDate = new Date(dateStr);
      const frameTime = new Date(frameDate.getFullYear(), frameDate.getMonth(), frameDate.getDate(), 23, 59, 59, 999).getTime();
      const frameMonth = frameDate.getMonth() + 1;

      const result = data.scoreboard.map((sItem: any) => {
        const hunter = sItem.hunter;

        // 1. Holding (持有 - 天) as of frameTime
        let maxD = 0;
        if (data.leadgeA) {
          const hunterRows = data.leadgeA.filter((item: any) => item.hunter === hunter);
          for (const item of hunterRows) {
            if (item.buyDate) {
              const buy = new Date(item.buyDate);
              if (!isNaN(buy.getTime()) && buy.getTime() <= frameTime) {
                const parts = item.buyDate.split(/[/.-]/);
                if (parts.length >= 1 && parts[0].trim() === awardYear) {
                  const diffMs = frameTime - buy.getTime();
                  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                  if (days > maxD) maxD = days;
                }
              }
            }
          }
        }

        // 2. Streak (連續 - 月) as of frameMonth
        let maxStreak = 0;
        if (data.leadgeA) {
          const buyMonths = new Set<number>();
          const hunterRows = data.leadgeA.filter((item: any) => item.hunter === hunter);
          for (const item of hunterRows) {
            if (!item.buyDate) continue;
            const buy = new Date(item.buyDate);
            if (isNaN(buy.getTime()) || buy.getTime() > frameTime) continue;
            const parts = item.buyDate.split(/[/.-]/);
            if (parts.length >= 2) {
              const y = parts[0].trim();
              const m = parseInt(parts[1], 10);
              if (y === awardYear && m >= 1 && m <= 12 && m <= frameMonth) {
                buyMonths.add(m);
              }
            }
          }
          let streak = 0;
          for (let m = 1; m <= frameMonth; m++) {
            if (buyMonths.has(m)) {
              streak++;
              if (streak > maxStreak) maxStreak = streak;
            } else {
              streak = 0;
            }
          }
          if (maxStreak > 1) {
            maxStreak = maxStreak - 1;
          } else if (maxStreak === 1) {
            maxStreak = 1;
          } else {
            maxStreak = 0;
          }
        }

        // 3. Performance (績效 - %) as of frameTime
        let rateNum = 0;
        let rateStr = "0.00%";
        if (data.leadgeC) {
          const matches = data.leadgeC.filter((item: any) => {
            if (item.hunter !== hunter || !(item.date || '').includes(awardYear)) return false;
            if (item.date) {
              const d = new Date(item.date);
              if (!isNaN(d.getTime()) && d.getTime() > frameTime) return false;
            }
            return true;
          });
          let target = null;
          if (matches.length > 0) {
            target = matches[matches.length - 1];
          } else if (awardYear === '2026' && sortedDates.indexOf(dateStr) >= sortedDates.length - 1) {
            target = data.leadgeC.find((item: any) => item.hunter === hunter);
          }
          if (target && target.returnRate && target.returnRate.trim()) {
            const rawRate = target.returnRate.trim();
            rateStr = rawRate.endsWith('%') ? rawRate : `${rawRate}%`;
            rateNum = parseFloat(rawRate.replace(/[^0-9.-]+/g, '')) || 0;
          }
        }

        return {
          ...sItem,
          holdingDays: maxD,
          consecutiveMonths: maxStreak,
          returnRateNum: rateNum,
          returnRateStr: rateStr,
        };
      });

      // Sort by currently selected metric
      result.sort((a: any, b: any) => {
        if (teamLeaderboardMetric === 'holding') {
          return (b.holdingDays || 0) - (a.holdingDays || 0);
        }
        if (teamLeaderboardMetric === 'streak') {
          return (b.consecutiveMonths || 0) - (a.consecutiveMonths || 0);
        }
        return (b.returnRateNum || 0) - (a.returnRateNum || 0);
      });

      return { dateLabel: dateStr, data: result };
    });

    return frames;
  }, [data.scoreboard, data.leadgeA, data.leadgeC, awardYear, teamLeaderboardMetric]);

  // Stop race when metric or year changes
  useEffect(() => {
    if (raceTimerRef.current) { clearInterval(raceTimerRef.current); raceTimerRef.current = null; }
    setIsRacePlaying(false);
    setRaceFrameIndex(0);
  }, [teamLeaderboardMetric, awardYear]);

  const toggleRace = useCallback(() => {
    if (isRacePlaying) {
      if (raceTimerRef.current) { clearInterval(raceTimerRef.current); raceTimerRef.current = null; }
      setIsRacePlaying(false);
    } else {
      if (teamLeaderboardFrames.length === 0) return;
      let startIdx = raceFrameIndex >= teamLeaderboardFrames.length - 1 ? 0 : raceFrameIndex;
      setRaceFrameIndex(startIdx);
      setIsRacePlaying(true);
      raceTimerRef.current = setInterval(() => {
        setRaceFrameIndex(prev => {
          if (prev >= teamLeaderboardFrames.length - 1) {
            if (raceTimerRef.current) { clearInterval(raceTimerRef.current); raceTimerRef.current = null; }
            setIsRacePlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 200);
    }
  }, [isRacePlaying, raceFrameIndex, teamLeaderboardFrames.length]);

  useEffect(() => {
    return () => { if (raceTimerRef.current) clearInterval(raceTimerRef.current); };
  }, []);

  const isRaceActive = isRacePlaying || (raceFrameIndex > 0 && raceFrameIndex < teamLeaderboardFrames.length - 1);
  const displayTeamLeaderboardData = isRaceActive ? (teamLeaderboardFrames[raceFrameIndex]?.data || []) : teamLeaderboardData;
  const raceCurrentDate = teamLeaderboardFrames[raceFrameIndex]?.dateLabel || '';

  // Current hunter's data
  const personalScoreboard = useMemo(() => {
    if (awardYear !== '2026') return null;
    return data.scoreboard.find((item: any) => item.hunter === selectedHunter) || null;
  }, [data.scoreboard, selectedHunter, awardYear]);

  const personalLeadgeA_maxDays = useMemo(() => {
    if (!selectedHunter || !data.leadgeA) return 0;
    const hunterRows = data.leadgeA.filter((item: any) => item.hunter === selectedHunter);
    let maxD = 0;
    const nowTime = Date.now();
    for (const item of hunterRows) {
      if (item.buyDate) {
        const buy = new Date(item.buyDate);
        // GATEKEEPER CHECK: future dates cannot be counted!
        if (!isNaN(buy.getTime()) && buy.getTime() <= nowTime) {
          const parts = item.buyDate.split(/[/.-]/);
          if (parts.length >= 1 && parts[0].trim() === awardYear) {
            const diffMs = nowTime - buy.getTime();
            const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
            if (days > maxD) maxD = days;
          }
        }
      }
    }
    return maxD;
  }, [data.leadgeA, selectedHunter, awardYear]);

  const personalLeadgeA_monthsData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      hasData: false,
      totalReward: 0,
      holdingDays: 0
    }));
    if (!selectedHunter || !data.leadgeA) return months;
    
    const cleanNum = (val: any) => {
      if (!val || typeof val !== 'string') return 0;
      const n = parseFloat(val.replace(/[^0-9.-]+/g, ''));
      return isNaN(n) ? 0 : n;
    };

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const targetYear = parseInt(awardYear, 10) || currentYear;
    const nowTime = now.getTime();

    const hunterRows = data.leadgeA.filter((item: any) => item.hunter === selectedHunter);
    for (const item of hunterRows) {
      if (!item.buyDate) continue;
      const buy = new Date(item.buyDate);
      // GATEKEEPER CHECK: skip future dates
      if (isNaN(buy.getTime()) || buy.getTime() > nowTime) continue;

      const parts = item.buyDate.split(/[/.-]/);
      if (parts.length >= 2) {
        const y = parts[0].trim();
        const m = parseInt(parts[1], 10);
        if (y === awardYear && m >= 1 && m <= 12) {
          // GATEKEEPER CHECK: do not allow months beyond currentMonth in the current year
          if (targetYear === currentYear && m > currentMonth) continue;
          if (targetYear > currentYear) continue;

          const idx = m - 1;
          months[idx].hasData = true;
          
          const rowReward = cleanNum(item.q1Reward) + cleanNum(item.q2Reward) + cleanNum(item.q3Reward) + cleanNum(item.q4Reward) + cleanNum(item.y2Reward);
          months[idx].totalReward += rowReward;

          const diffMs = nowTime - buy.getTime();
          const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
          if (days > months[idx].holdingDays) {
            months[idx].holdingDays = days;
          }
        }
      }
    }
    return months;
  }, [data.leadgeA, selectedHunter, awardYear]);

  const personalLeadgeB_maxMonths = useMemo(() => {
    if (!selectedHunter || !data.leadgeA) return 0;
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const targetYear = parseInt(awardYear, 10) || currentYear;
    const nowTime = now.getTime();

    const buyMonths = new Set<number>();
    const hunterRows = data.leadgeA.filter((item: any) => item.hunter === selectedHunter);
    for (const item of hunterRows) {
      if (!item.buyDate) continue;
      const buy = new Date(item.buyDate);
      // GATEKEEPER CHECK: skip future dates
      if (isNaN(buy.getTime()) || buy.getTime() > nowTime) continue;
      const parts = item.buyDate.split(/[/.-]/);
      if (parts.length >= 2) {
        const y = parts[0].trim();
        const m = parseInt(parts[1], 10);
        if (y === awardYear && m >= 1 && m <= 12) {
          if (targetYear === currentYear && m > currentMonth) continue;
          if (targetYear > currentYear) continue;
          buyMonths.add(m);
        }
      }
    }

    const maxMonthToCheck = targetYear === currentYear ? currentMonth : (targetYear < currentYear ? 12 : 0);
    let streak = 0;
    let maxStreak = 0;
    for (let m = 1; m <= maxMonthToCheck; m++) {
      if (buyMonths.has(m)) {
        streak++;
        if (streak > maxStreak) maxStreak = streak;
      } else {
        streak = 0;
      }
    }

    if (maxStreak === 0) return 0;
    return maxStreak > 1 ? maxStreak - 1 : 1;
  }, [data.leadgeA, selectedHunter, awardYear]);

  const personalLeadgeB_monthsData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      status: 'future' as 'invested' | 'interrupted' | 'future'
    }));
    if (!selectedHunter || !data.leadgeA) return months;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const targetYear = parseInt(awardYear, 10) || currentYear;
    const nowTime = now.getTime();

    const buyMonths = new Set<number>();
    const hunterRows = data.leadgeA.filter((item: any) => item.hunter === selectedHunter);
    for (const item of hunterRows) {
      if (!item.buyDate) continue;
      const buy = new Date(item.buyDate);
      // GATEKEEPER CHECK: skip future dates
      if (isNaN(buy.getTime()) || buy.getTime() > nowTime) continue;

      const parts = item.buyDate.split(/[/.-]/);
      if (parts.length >= 2) {
        const y = parts[0].trim();
        const m = parseInt(parts[1], 10);
        if (y === awardYear && m >= 1 && m <= 12) {
          if (targetYear === currentYear && m > currentMonth) continue;
          if (targetYear > currentYear) continue;
          buyMonths.add(m);
        }
      }
    }

    for (let i = 0; i < 12; i++) {
      const m = i + 1;
      let isReached = false;
      if (targetYear < currentYear) {
        isReached = true;
      } else if (targetYear === currentYear) {
        isReached = m <= currentMonth;
      } else {
        isReached = false;
      }

      if (!isReached) {
        months[i].status = 'future';
      } else if (buyMonths.has(m)) {
        months[i].status = 'invested';
      } else {
        months[i].status = 'interrupted';
      }
    }
    return months;
  }, [data.leadgeA, selectedHunter, awardYear]);

  const personalLeadgeC_info = useMemo(() => {
    const defaultRes = { rate: "0.00%", label: "年度績效" };
    if (!selectedHunter || !data.leadgeC || data.leadgeC.length === 0) return defaultRes;
    
    const nowTime = Date.now();
    const matches = data.leadgeC.filter((item: any) => {
      if (item.hunter !== selectedHunter || !(item.date || '').includes(awardYear)) return false;
      if (item.date) {
        const d = new Date(item.date);
        if (!isNaN(d.getTime()) && d.getTime() > nowTime) return false;
      }
      return true;
    });
    
    let target = null;
    if (matches.length > 0) {
      target = matches[matches.length - 1];
    } else if (awardYear === '2026') {
      target = data.leadgeC.find((item: any) => item.hunter === selectedHunter);
    }
    
    if (!target) return defaultRes;

    const rawRate = target.returnRate && target.returnRate.trim() ? target.returnRate.trim() : "0.00%";
    const rate = rawRate.endsWith('%') ? rawRate : `${rawRate}%`;

    const dateStr = (target.date || '').trim();
    let label = "年度績效";
    if (dateStr.includes("6/30") || dateStr.includes("06/30") || dateStr.includes("06-30") || dateStr.includes("6-30") || dateStr.includes("年中")) {
      label = "年中績效";
    } else if (dateStr.includes("12/31") || dateStr.includes("12-31") || dateStr.includes("年度")) {
      label = "年度績效";
    }

    return { rate, label };
  }, [data.leadgeC, selectedHunter, awardYear]);

  const personalLeadgeC_returnRate = personalLeadgeC_info.rate;
  const personalLeadgeC_label = personalLeadgeC_info.label;

  // Handle Save / Add
  const handleSave = async () => {
    if (!editingItem) return;
    setIsSaving(true);
    try {
      const url = "/api/sheets/hidden-mission";
      let payload: any = {};

      const cleanSharesForSheet = (val: any) => {
        if (!val) return '';
        const numStr = String(val).replace(/[^\d.-]/g, '');
        const num = parseFloat(numStr);
        if (isNaN(num)) return String(val);
        return Math.round(num).toString();
      };

      const formatAmountForSheet = (val: any) => {
        if (!val) return '';
        const numStr = String(val).replace(/[^\d.-]/g, '');
        const num = parseFloat(numStr);
        if (isNaN(num)) return String(val);
        return '$' + Math.round(num).toLocaleString('en-US');
      };

      if (modalMode === 'add') {
        let values: string[][] = [];
        if (activeTab === 'Tracker') {
          values = [[
            editingItem.date || '',
            editingItem.hunter || '',
            editingItem.target || '',
            cleanSharesForSheet(editingItem.shares),
            formatAmountForSheet(editingItem.amount),
            editingItem.type || '買'
          ]];
        } else {
          values = [[
            editingItem.date || '',
            editingItem.hunter || '',
            editingItem.category || 'A耐性',
            formatAmountForSheet(editingItem.amount)
          ]];
        }
        payload = { action: 'append', tab: activeTab, values };
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error('新增失敗');
      } else {
        let values: string[][] = [];
        if (activeTab === 'Tracker') {
          values = [[
            editingItem.date || '',
            editingItem.hunter || '',
            editingItem.target || '',
            cleanSharesForSheet(editingItem.shares),
            formatAmountForSheet(editingItem.amount),
            editingItem.type || '買'
          ]];
        } else {
          values = [[
            editingItem.date || '',
            editingItem.hunter || '',
            editingItem.category || 'A耐性',
            formatAmountForSheet(editingItem.amount)
          ]];
        }
        payload = { action: 'update', tab: activeTab, rowIndex: editingItem.rowIndex, values };
        const resp = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error('儲存失敗');
      }

      await mutate();
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.message || '操作失敗');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Delete
  const handleDelete = async () => {
    if (!editingItem || !editingItem.rowIndex) return;
    if (!confirm('確定要刪除這筆紀錄嗎？')) return;
    setIsSaving(true);
    try {
      const resp = await fetch("/api/sheets/hidden-mission", {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', tab: activeTab, rowIndex: editingItem.rowIndex })
      });
      if (!resp.ok) throw new Error('刪除失敗');
      await mutate();
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.message || '刪除失敗');
    } finally {
      setIsSaving(false);
    }
  };

  const hunterOptions = useMemo(() => {
    if (!data.scoreboard) return [];
    const names = data.scoreboard
      .map((item: any) => item.hunter)
      .filter((name: string) => name && name !== 'Total' && name !== '加總');
    return Array.from(new Set(names)) as string[];
  }, [data.scoreboard]);

  const openAddModal = () => {
    setModalMode('add');
    const defaultHunter = !canEdit && loggedInHunterName ? loggedInHunterName : '';
    if (activeTab === 'Tracker') {
      setEditingItem({
        date: '',
        hunter: defaultHunter,
        target: '',
        shares: '',
        amount: '',
        type: '買'
      });
    } else {
      setEditingItem({
        date: '',
        hunter: defaultHunter,
        amount: '',
        category: 'A耐性'
      });
    }
    setIsModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setModalMode('edit');
    const cleanAmount = (item.amount || '').toString().replace(/[^\d.-]/g, '');
    const cleanShares = (item.shares || '').toString().replace(/[^\d.-]/g, '');
    setEditingItem({ 
      ...item, 
      amount: cleanAmount,
      shares: cleanShares
    });
    setIsModalOpen(true);
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0);
  };

  return (
    <div className="bg-background text-on-background font-body-lg overflow-x-hidden selection:bg-primary-container selection:text-on-primary-container font-display min-h-screen pb-20">
      {/* Fixed Header */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center h-16 bg-surface/90 backdrop-blur-md border-b border-primary/30 shadow-[0_8px_20px_rgba(243,156,18,0.3)] px-4">
        <div className="flex items-center gap-3 flex-nowrap cursor-pointer" onClick={() => router.push("/diversion")}>
          <Image priority alt="SenseSoil Logo" width={28} height={28} className="h-[28px] w-auto object-contain flex-shrink-0 translate-y-[-2px]" src="/Logo｜Orange.svg" />
          <h1 className="font-headline-md uppercase tracking-widest font-bold text-primary text-[24px] leading-none">隱藏任務試煉</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center justify-center p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
            onClick={() => {
              const nextView = view === 'individual' ? 'team' : 'individual';
              setView(nextView);
              if (nextView === 'individual' && loggedInHunterName) {
                const match = data.scoreboard.find((item: any) => item.hunter === loggedInHunterName);
                setSelectedHunter(match ? match.hunter : loggedInHunterName);
              }
            }}
            title={view === 'individual' ? "切換至團隊視角" : "切換至個人視角"}
          >
            <span className="material-symbols-outlined text-[24px]">
              {view === 'individual' ? 'groups' : 'person'}
            </span>
          </button>
        </div>
      </header>

      <PullToRefresh>
        <main className="relative pt-16 px-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-primary/70 font-display tracking-widest text-sm animate-pulse">載入投資激勵任務檔案...</p>
            </div>
          ) : (
            <>
              {/* INDIVIDUAL VIEW */}
              {view === 'individual' && (
                <div className="flex flex-col gap-6 animate-fade-in">
                  {/* Top Header - Individual View */}
                  <div className="flex flex-row justify-between items-start shadow-[inset_0_0_15px_rgba(243,156,18,0.05)] h-[60px]" style={{ marginTop: 32, marginBottom: 32 }}>
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
                        className="font-label-caps text-primary font-bold text-[12px] tracking-[0.2em] mb-3 leading-none cursor-pointer"
                        onClick={() => setIsHunterDropdownOpen(!isHunterDropdownOpen)}
                      >
                        S級狩獵者
                      </p>
                      <h2 
                        key={selectedHunter}
                        className="font-headline-lg text-primary text-3xl font-bold tracking-wider uppercase leading-none transition-opacity cursor-pointer hover:opacity-80 animate-text-reveal"
                        onClick={() => setIsHunterDropdownOpen(!isHunterDropdownOpen)}
                      >
                        {selectedHunter || "選擇狩獵者"}
                      </h2>
                      {isHunterDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsHunterDropdownOpen(false)} />
                          <div className="absolute top-full left-0 mt-2 w-48 bg-surface-container-high border border-primary/30 rounded-[4px] shadow-lg z-[120] max-h-48 overflow-y-auto scrollbar-hide">
                            {data.scoreboard
                              .filter((item: any) => isAdmin || item.hunter === loggedInHunterName || (!loggedInHunterName && item.hunter === selectedHunter))
                              .map((item: any) => (
                              <div
                                key={item.hunter}
                                className={`px-4 py-3 hover:bg-primary/20 cursor-pointer text-[#efe0d2] text-sm border-b border-primary/10 last:border-b-0 ${selectedHunter === item.hunter ? 'bg-primary/30 text-primary font-bold' : ''}`}
                                onClick={() => { setSelectedHunter(item.hunter); setIsHunterDropdownOpen(false); }}
                              >
                                {item.hunter}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="text-right flex flex-col justify-end flex-shrink-0">
                      <p className="font-label-caps text-white font-bold text-[12px] tracking-[0.1em] mb-3 uppercase leading-none whitespace-nowrap">總累積獎金餘額</p>
                      <div className="font-headline-lg text-emerald-400 text-3xl font-bold tracking-tighter font-display flex items-baseline justify-end gap-1 leading-none">
                        <span className="text-xl">$</span>{((personalScoreboard?.challengeA.balance || 0) + (personalScoreboard?.challengeB.balance || 0) + (personalScoreboard?.challengeC.balance || 0) || (personalScoreboard?.totalReward || 0)).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Personal Dashboard (Individual View) */}
                  <section className="mb-[5px]">
                    <div className="pt-5 pb-8 px-5 sm:px-6 -mx-4 bg-[#121212] font-display">
                      {/* Assets List Header */}
                      <div className="flex justify-between items-center mb-6 relative z-10 h-[32px]">
                        <div className="relative">
                          <button 
                            onClick={() => setIsAwardYearDropdownOpen(!isAwardYearDropdownOpen)}
                            className="flex items-center gap-1 font-label-caps text-primary font-bold text-[12px] tracking-[0.1em] leading-none uppercase hover:text-emerald-400 transition-colors"
                          >
                            {awardYear} 年度資產庫
                          </button>
                          
                          {isAwardYearDropdownOpen && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setIsAwardYearDropdownOpen(false)} />
                              <div className="absolute top-full left-0 mt-2 bg-[#1A1A1A] border border-primary/30 rounded-lg shadow-xl z-50 min-w-[120px] overflow-hidden">
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
                      </div>

                      <div className="flex flex-col gap-3 pb-8 transition-opacity duration-300">
                        {/* L1 Asset (Challenge A: 耐性) */}
                        <div 
                          className="flex flex-col p-4 rounded-lg bg-surface-container-low/50 border border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                          onClick={() => toggleLevel('L1')}
                        >
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-primary text-[12px] font-bold tracking-widest">
                                L1 耐性
                              </span>
                              <span className={`text-[12px] font-bold ${(personalScoreboard?.challengeA.total || 0) > 0 ? 'text-emerald-400' : 'text-white/30'}`}>
                                {(personalScoreboard?.challengeA.total || 0) > 0 ? "已解鎖" : "未解鎖"}
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between">
                              <span className="text-white font-bold text-sm">長期持有 {personalLeadgeA_maxDays}天</span>
                              {(personalScoreboard?.challengeA.total || 0) > 0 && (
                                <span className="text-[11px] text-emerald-400/70 font-display">
                                  +${(personalScoreboard?.challengeA.total || 0).toLocaleString()} 價值 | 餘額 ${(personalScoreboard?.challengeA.balance || 0).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                          {expandedLevel === 'L1' && (
                            <div className="mt-3 pt-3 border-t border-white/10 text-xs text-white/80 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <p className="font-semibold text-white/90">
                                「耐性」講求延後消費，養成自控力 × 忍耐力
                              </p>
                              <p className="text-white/60">
                                根據買入日計算每筆市值型ETF持有天數（90 / 180 / 270 / 360 / 720 天），分別觸發倍增投資獎勵（乘數1~10倍），並採先進先出交易原則檢視持股時間。
                              </p>
                            </div>
                          )}

                          {/* 1-12 Month Details Grid directly rendered */}
                          <div className="grid grid-cols-2 gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                            {personalLeadgeA_monthsData.map((mData, idx) => {
                              const achieved = mData.hasData;
                              return (
                                <div key={idx} className={`flex justify-between items-center px-3 py-2 rounded ${achieved ? 'bg-emerald-400/10 border border-emerald-400/30' : 'bg-white/5 border border-transparent'}`}>
                                  <span className={`text-[12px] font-bold ${achieved ? 'text-white' : 'text-white/30'}`}>{mData.month}月</span>
                                  <div className="text-right flex flex-col justify-end">
                                    <span className={`text-[11px] font-bold block ${achieved ? 'text-emerald-400 font-display' : 'text-white/30 font-mono'}`}>
                                      {achieved ? (mData.totalReward > 0 ? mData.totalReward.toLocaleString() : "0") : "-"}
                                    </span>
                                    {achieved && (
                                      <span className="text-emerald-400/70 text-[10px] font-display block mt-0.5">
                                        持有 {mData.holdingDays}天
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* L2 Asset (Challenge B: 定性) */}
                        <div 
                          className="flex flex-col p-4 rounded-lg bg-surface-container-low/50 border border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                          onClick={() => toggleLevel('L2')}
                        >
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-primary text-[12px] font-bold tracking-widest">
                                L2 定性
                              </span>
                              <span className={`text-[12px] font-bold ${(personalScoreboard?.challengeB.total || 0) > 0 ? 'text-emerald-400' : 'text-white/30'}`}>
                                {(personalScoreboard?.challengeB.total || 0) > 0 ? "已解鎖" : "未解鎖"}
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between">
                              <span className="text-white font-bold text-sm">連續投資 {personalLeadgeB_maxMonths}月</span>
                              {(personalScoreboard?.challengeB.total || 0) > 0 && (
                                <span className="text-[11px] text-emerald-400/70 font-display">
                                  +${(personalScoreboard?.challengeB.total || 0).toLocaleString()} 價值 | 餘額 ${(personalScoreboard?.challengeB.balance || 0).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                          {expandedLevel === 'L2' && (
                            <div className="mt-3 pt-3 border-t border-white/10 text-xs text-white/80 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <p className="font-semibold text-white/90">
                                「定性」講求長期持有，打磨貫徹力 × 續航力
                              </p>
                              <p className="text-white/60">
                                定期定額或連續月份買入市值型ETF，分別觸發階梯式增長投資獎勵（基數1.0% +連續月數成長率0.1%），最高投資獎勵上限 3.3%。
                              </p>
                            </div>
                          )}

                          {/* 1-12 Month Circles directly rendered */}
                          <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                            {personalLeadgeB_monthsData.map((mData) => {
                              return (
                                <div
                                  key={mData.month}
                                  className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center text-xs font-bold font-mono transition-all duration-300 ${
                                    mData.status === 'invested'
                                      ? 'bg-emerald-400/20 border border-emerald-400 text-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.3)]'
                                      : mData.status === 'interrupted'
                                      ? 'bg-red-500/15 border border-red-500/30 text-red-400'
                                      : 'bg-white/5 border border-transparent text-white/30'
                                  }`}
                                >
                                  {mData.status === 'interrupted' ? '✕' : mData.month}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* L3 Asset (Challenge C: 韌性) */}
                        <div 
                          className="flex flex-col p-4 rounded-lg bg-surface-container-low/50 border border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                          onClick={() => toggleLevel('L3')}
                        >
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-primary text-[12px] font-bold tracking-widest">
                                L3 韌性
                              </span>
                              <span className={`text-[12px] font-bold ${(personalScoreboard?.challengeC.total || 0) > 0 ? 'text-emerald-400' : 'text-white/30'}`}>
                                {(personalScoreboard?.challengeC.total || 0) > 0 ? "已解鎖" : "未解鎖"}
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between">
                              <span className="text-white font-bold text-sm">{personalLeadgeC_label} {personalLeadgeC_returnRate}</span>
                              {(personalScoreboard?.challengeC.total || 0) > 0 && (
                                <span className="text-[11px] text-emerald-400/70 font-display">
                                  +${(personalScoreboard?.challengeC.total || 0).toLocaleString()} 價值 | 餘額 ${(personalScoreboard?.challengeC.balance || 0).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                          {expandedLevel === 'L3' && (
                            <div className="mt-4 pt-4 border-t border-white/10 text-xs text-white/80 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <p className="font-semibold text-white/90">
                                「韌性」講求無畏震盪，淬鍊受挫力 × 復原力
                              </p>
                              <p className="text-white/60">
                                依年度市值型ETF投資績效（含實現與未實現損益）競爭年度總獎金池。冠軍獨得30%、亞軍獨得20%、季軍獨得10%、其他依排名遞減分配。
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {/* TEAM VIEW */}
              {view === 'team' && (
                <div className="flex flex-col gap-6 animate-fade-in">
                  {/* Top Header - Team View */}
                  <div className="flex flex-row justify-between items-start shadow-[inset_0_0_15px_rgba(243,156,18,0.05)] h-[60px]" style={{ marginTop: 32, marginBottom: 32 }}>
                    <div className="flex flex-col border-l-[3px] border-primary pl-3 flex-1 pr-4">
                      <p className="font-label-caps text-white font-bold text-[12px] tracking-[0.1em] mb-3 leading-none whitespace-nowrap">狩獵季排行榜</p>
                      <div className="h-[30px] flex items-center w-full">
                        <h2 className="text-white font-bold tracking-wider uppercase w-full"
                          style={{
                            fontSize: (awardYear === '2026' ? (data.scoreboard[0]?.hunter || "-") : "-").length <= 4 ? '30px' :
                                      (awardYear === '2026' ? (data.scoreboard[0]?.hunter || "-") : "-").length <= 10 ? '20px' : '14px',
                            lineHeight: (awardYear === '2026' ? (data.scoreboard[0]?.hunter || "-") : "-").length <= 10 ? '30px' : '15px',
                            display: '-webkit-box',
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            wordBreak: 'break-all'
                          }}
                        >{awardYear === '2026' ? (data.scoreboard[0]?.hunter || "-") : "-"}</h2>
                      </div>
                    </div>
                    <div className="text-right flex flex-col justify-end flex-shrink-0">
                      <p className="font-label-caps text-white font-bold text-[12px] tracking-[0.1em] mb-3 uppercase leading-none whitespace-nowrap">蟬聯季數冠軍</p>
                      <p className="font-headline-lg text-white text-3xl font-bold tracking-tighter font-display shadow-primary/20 flex items-baseline justify-end gap-1 leading-none">{awardYear === '2026' ? "01" : "-"}</p>
                    </div>
                  </div>

                  {/* Team Leaderboard Bar Chart */}
                  <section className="mb-[5px]">
                    <div className="pt-5 pb-8 px-5 sm:px-6 -mx-4 bg-[#121212] font-display">
                      {/* Race date indicator - above title */}
                      <div className="h-[16px] mb-1">
                        {isRaceActive && (
                          <span className="text-primary/80 text-[11px] font-mono tracking-wider">{raceCurrentDate.replace(/^\d{4}\//, '')}</span>
                        )}
                      </div>

                      <div className="flex justify-between items-center mb-6 relative z-10 h-[32px]">
                        <div className="relative">
                          <button 
                            onClick={() => setIsLeaderboardYearDropdownOpen(!isLeaderboardYearDropdownOpen)}
                            className="flex items-center gap-1 font-label-caps text-primary font-bold text-[12px] tracking-[0.1em] leading-none uppercase hover:text-emerald-400 transition-colors"
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
                              onClick={() => setTeamLeaderboardMetric('holding')}
                              className={`px-3 py-1 rounded-full text-[10px] tracking-wider transition-colors ${teamLeaderboardMetric === 'holding' ? 'bg-primary text-black font-bold' : 'text-white/60 hover:text-white font-normal'}`}
                            >持有</button>
                            <button 
                              onClick={() => setTeamLeaderboardMetric('streak')}
                              className={`px-3 py-1 rounded-full text-[10px] tracking-wider transition-colors ${teamLeaderboardMetric === 'streak' ? 'bg-primary text-black font-bold' : 'text-white/60 hover:text-white font-normal'}`}
                            >連續</button>
                            <button 
                              onClick={() => setTeamLeaderboardMetric('performance')}
                              className={`px-3 py-1 rounded-full text-[10px] tracking-wider transition-colors ${teamLeaderboardMetric === 'performance' ? 'bg-primary text-black font-bold' : 'text-white/60 hover:text-white font-normal'}`}
                            >績效</button>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        {displayTeamLeaderboardData.length > 0 ? (() => {
                          const maxVal = Math.max(
                            ...displayTeamLeaderboardData.map((s: any) => {
                              if (teamLeaderboardMetric === 'holding') return s.holdingDays || 0;
                              if (teamLeaderboardMetric === 'streak') return s.consecutiveMonths || 0;
                              return s.returnRateNum || 0;
                            }),
                            1
                          );
                          return displayTeamLeaderboardData.map((item: any, index: number) => {
                            const maxIndex = Math.max(1, displayTeamLeaderboardData.length - 1);
                            const barOpacity = 1 - (0.3 * (index / maxIndex));
                            const val = teamLeaderboardMetric === 'holding'
                              ? (item.holdingDays || 0)
                              : teamLeaderboardMetric === 'streak'
                              ? (item.consecutiveMonths || 0)
                              : (item.returnRateNum || 0);
                            const barPct = Math.min(100, Math.max(8, (val / maxVal) * 100));
                            
                            return (
                              <div key={item.hunter} className="flex items-center w-full gap-3" style={{ transition: 'transform 0.35s ease-out, opacity 0.35s ease-out' }}>
                                <span className="text-[#efe0d2]/70 text-[12px] font-display w-4 text-left shrink-0">{index + 1}</span>
                                <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${index < 3 ? 'bg-primary/20 border-primary text-primary' : 'bg-white/10 border-white/20 text-white/80'} ${index === 0 ? 'shadow-[0_0_8px_rgba(243,156,18,0.8)]' : ''}`}>
                                  <span className={`text-[12px] ${index === 0 ? 'font-bold' : 'font-normal'}`}>{item.hunter.slice(-1)}</span>
                                </div>
                                <div className="flex-1 h-2 bg-primary/10 rounded-r-sm overflow-visible flex relative">
                                  <div 
                                    className={`h-full bg-primary ${index === 0 ? 'shadow-[0_0_8px_rgba(243,156,18,0.8)]' : ''}`} 
                                    style={{ width: `${barPct}%`, opacity: barOpacity, transition: 'width 0.35s ease-out' }}
                                  ></div>
                                </div>
                                <div className="w-24 text-right shrink-0">
                                  <div className="flex items-baseline justify-end gap-0.5">
                                    {teamLeaderboardMetric === 'holding' ? (
                                      <>
                                        <span className="text-white text-[13px] font-bold font-mono">{item.holdingDays || 0}</span>
                                        <span className="text-white/70 text-[10px]">天</span>
                                      </>
                                    ) : teamLeaderboardMetric === 'streak' ? (
                                      <>
                                        <span className="text-white text-[13px] font-bold font-mono">{item.consecutiveMonths || 0}</span>
                                        <span className="text-white/70 text-[10px]">月</span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-white text-[13px] font-bold font-mono">{(item.returnRateStr || "0.00%").replace(/%/g, '')}</span>
                                        <span className="text-white/70 text-[10px]">%</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })() : (
                          <div className="text-center text-primary/50 text-xs py-4">本年度暫無團隊數據</div>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Editable Tables Section for Tracker (交易) & Reward (兌獎) */}
                  <div className="pt-5 pb-8 px-5 sm:px-6 -mx-4 bg-[#121212] font-display">
                    {/* Header bar with toggle and add (+) button */}
                    <div className="flex justify-between items-center mb-6 relative z-10 h-[32px]">
                      <div></div> {/* Empty left side as simple style, no titles/complex info */}
                      <div className="flex items-center gap-2 ml-auto">
                        {/* Add button (+) in place of play button */}
                        {canEdit && (
                          <button
                            onClick={openAddModal}
                            className="rounded-full bg-primary flex items-center justify-center transition-all hover:brightness-110 active:scale-90 shrink-0"
                            style={{ width: '26px', height: '26px' }}
                            title="新增資料"
                          >
                            <span className="material-symbols-outlined text-[16px] text-black font-bold leading-none">add</span>
                          </button>
                        )}

                        {/* Toggle Pill Button */}
                        <div className="flex bg-[#1E1E1E] rounded-full p-1 border border-primary/20">
                          <button 
                            onClick={() => setActiveTab('Tracker')}
                            className={`px-3 py-1 rounded-full text-[10px] tracking-wider transition-colors ${activeTab === 'Tracker' ? 'bg-primary text-black font-bold' : 'text-white/60 hover:text-white font-normal'}`}
                          >交易</button>
                          <button 
                            onClick={() => setActiveTab('Reward')}
                            className={`px-3 py-1 rounded-full text-[10px] tracking-wider transition-colors ${activeTab === 'Reward' ? 'bg-primary text-black font-bold' : 'text-white/60 hover:text-white font-normal'}`}
                          >兌獎</button>
                        </div>
                      </div>
                    </div>

                    {/* Table Container exactly like running-records */}
                    <div className="border border-primary/30 bg-transparent rounded-sm overflow-hidden flex flex-col">
                      <div className="overflow-x-auto overflow-y-auto max-h-[606px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {activeTab === 'Tracker' ? (
                          <table className="w-full text-left font-data-mono border-collapse table-fixed text-[10px]">
                            <thead className="sticky top-0 z-10 bg-surface-container-high">
                              <tr className="text-[#efe0d2]/70 border-b border-primary/20 h-[30px]">
                                <th className="p-2 font-bold whitespace-nowrap" style={{ width: "23%", padding: 4 }}>狩獵者</th>
                                <th className="p-2 font-bold whitespace-nowrap" style={{ width: "27%", padding: 4, textAlign: "left" }}>標的</th>
                                <th className="p-2 font-bold text-right whitespace-nowrap" style={{ width: "17%", padding: 4, textAlign: "right" }}>股數</th>
                                <th className="p-2 font-bold text-right whitespace-nowrap" style={{ width: "19%", padding: 4, textAlign: "right" }}>金額</th>
                                <th className="p-2 font-bold text-center whitespace-nowrap" style={{ width: "14%", padding: 4, textAlign: "center" }}>交易</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-primary/5">
                              {data.tracker && data.tracker.length > 0 ? (
                                data.tracker.map((row: any, idx: number) => {
                                  const rawSharesStr = (row.shares || '').toString().replace(/[股]/g, '');
                                  const sharesNum = parseFloat(rawSharesStr.replace(/[^\d.-]/g, ''));
                                  const formattedShares = !isNaN(sharesNum) ? Math.round(sharesNum).toLocaleString('en-US') : rawSharesStr;

                                  const rawAmountStr = (row.amount || '').toString().replace(/[元NTD$]/gi, '');
                                  const amountNum = parseFloat(rawAmountStr.replace(/[^\d.-]/g, ''));
                                  const formattedAmount = !isNaN(amountNum) ? Math.round(amountNum).toLocaleString('en-US') : rawAmountStr;
                                  return (
                                    <tr key={idx} className={`h-[32px] ${idx % 2 === 1 ? "bg-primary/10" : ""}`}>
                                      <td className="p-2 whitespace-nowrap align-middle" style={{ width: "23%", padding: 4 }}>
                                        <div className="flex flex-col gap-0.5">
                                          <div 
                                            className={`font-bold text-primary ${canEdit ? "cursor-pointer hover:opacity-70 transition-opacity underline-offset-2 hover:underline" : ""} truncate`}
                                            onClick={() => {
                                              if (canEdit) openEditModal(row);
                                            }}
                                          >
                                            {row.hunter || '--'}
                                          </div>
                                          <div className="text-[9px] text-[#efe0d2]/60 font-mono">{row.date || '--'}</div>
                                        </div>
                                      </td>
                                      <td className="p-2 font-data-mono align-middle" style={{ width: "27%", padding: 4, color: "#ffffff", textAlign: "left" }}>
                                        <div className="truncate leading-tight text-white font-bold">
                                          {row.target || '--'}
                                        </div>
                                      </td>
                                      <td className="p-2 text-right whitespace-nowrap align-middle" style={{ width: "17%", padding: 4, color: "#ffffff", textAlign: "right" }}>
                                        <span className="text-white font-mono">{formattedShares}</span>
                                        {formattedShares && <span className="text-[8px] text-[#efe0d2]/60 ml-0.5">股</span>}
                                      </td>
                                      <td className="p-2 text-right whitespace-nowrap align-middle" style={{ width: "19%", padding: 4, color: "#ffffff", textAlign: "right" }}>
                                        <span className="text-white font-mono font-bold">{formattedAmount}</span>
                                        {formattedAmount && <span className="text-[8px] text-[#efe0d2]/60 ml-0.5">元</span>}
                                      </td>
                                      <td className="p-2 text-center whitespace-nowrap align-middle" style={{ width: "14%", padding: 4, color: "#ffffff", textAlign: "center" }}>
                                        <span className={`font-bold ${row.type === '買' ? 'text-red-400' : row.type === '賣' ? 'text-emerald-400' : 'text-white'}`}>{row.type || '買'}</span>
                                      </td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr>
                                  <td colSpan={5} className="p-6 text-center text-white/40 font-sans">目前尚無交易紀錄</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        ) : (
                          <table className="w-full text-left font-data-mono border-collapse table-fixed text-[10px]">
                            <thead className="sticky top-0 z-10 bg-surface-container-high">
                              <tr className="text-[#efe0d2]/70 border-b border-primary/20 h-[30px]">
                                <th className="p-2 font-bold whitespace-nowrap" style={{ width: "30%", padding: 4 }}>狩獵者</th>
                                <th className="p-2 font-bold text-left whitespace-nowrap" style={{ width: "38%", padding: 4, textAlign: "left" }}>類別</th>
                                <th className="p-2 font-bold text-right whitespace-nowrap" style={{ width: "32%", padding: 4, textAlign: "right" }}>兌換獎金</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-primary/5">
                              {data.reward && data.reward.length > 0 ? (
                                data.reward.map((row: any, idx: number) => {
                                  const rawAmountStr = (row.amount || '').toString().replace(/[元NTD$]/gi, '');
                                  const amountNum = parseFloat(rawAmountStr.replace(/[^\d.-]/g, ''));
                                  const formattedAmount = !isNaN(amountNum) ? Math.round(amountNum).toLocaleString('en-US') : rawAmountStr;
                                  return (
                                    <tr key={idx} className={`h-[32px] ${idx % 2 === 1 ? "bg-primary/10" : ""}`}>
                                      <td className="p-2 whitespace-nowrap align-middle" style={{ width: "30%", padding: 4 }}>
                                        <div className="flex flex-col gap-0.5">
                                          <div 
                                            className={`font-bold text-primary ${canEdit ? "cursor-pointer hover:opacity-70 transition-opacity underline-offset-2 hover:underline" : ""} truncate`}
                                            onClick={() => {
                                              if (canEdit) openEditModal(row);
                                            }}
                                          >
                                            {row.hunter || '--'}
                                          </div>
                                          <div className="text-[9px] text-[#efe0d2]/60 font-mono">{row.date || '--'}</div>
                                        </div>
                                      </td>
                                      <td className="p-2 text-left whitespace-nowrap align-middle" style={{ width: "38%", padding: 4, textAlign: "left" }}>
                                        {(() => {
                                          const cat = row.category || 'A耐性';
                                          if (cat.includes('A') || cat.includes('耐性')) {
                                            return <span className="bg-red-500/20 text-red-400 border border-red-500/40 px-2.5 py-0.5 rounded-md font-bold text-[10px] inline-block tracking-wider">{cat}</span>;
                                          }
                                          if (cat.includes('B') || cat.includes('定性')) {
                                            return <span className="bg-blue-500/20 text-blue-400 border border-blue-500/40 px-2.5 py-0.5 rounded-md font-bold text-[10px] inline-block tracking-wider">{cat}</span>;
                                          }
                                          if (cat.includes('C') || cat.includes('韌性')) {
                                            return <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2.5 py-0.5 rounded-md font-bold text-[10px] inline-block tracking-wider">{cat}</span>;
                                          }
                                          return <span className="bg-white/10 text-white/80 border border-white/20 px-2.5 py-0.5 rounded-md font-bold text-[10px] inline-block tracking-wider">{cat}</span>;
                                        })()}
                                      </td>
                                      <td className="p-2 text-right whitespace-nowrap align-middle" style={{ width: "32%", padding: 4, color: "#ffffff", textAlign: "right" }}>
                                        <span className="text-white font-mono font-bold text-xs">{formattedAmount}</span>
                                        {formattedAmount && <span className="text-[8px] text-[#efe0d2]/60 ml-0.5">元</span>}
                                      </td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr>
                                  <td colSpan={3} className="p-6 text-center text-white/40 font-sans">目前尚無兌獎紀錄</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </PullToRefresh>

      {/* Edit / Add Modal */}
      {isModalOpen && editingItem && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4" onClick={() => setIsModalOpen(false)}>
          <div className="bg-[#141414] border-2 border-primary/60 rounded-2xl shadow-[0_0_30px_rgba(243,156,18,0.3)] w-full max-w-md overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="bg-primary/15 border-b border-primary/30 px-5 py-4 flex justify-between items-center">
              <h3 className="text-primary font-bold text-base tracking-widest uppercase flex items-center gap-2">
                <span className="material-symbols-outlined">{modalMode === 'add' ? 'add_circle' : 'edit'}</span>
                <span>{modalMode === 'add' ? `新增 ${activeTab === 'Tracker' ? '投資紀錄' : '請領紀錄'}` : `編輯 ${activeTab === 'Tracker' ? '投資紀錄' : '請領紀錄'}`}</span>
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-primary/50 hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            
            <div className="p-5 flex flex-col gap-4 font-mono text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-primary/80 font-sans uppercase tracking-widest font-bold">日期</label>
                <input
                  type="date"
                  className="bg-black/60 border border-primary/40 rounded-lg px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                  style={{ colorScheme: 'dark' }}
                  value={(editingItem.date || '').replace(/\//g, '-')}
                  onChange={e => setEditingItem({ ...editingItem, date: e.target.value.replace(/-/g, '/') })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-primary/80 font-sans uppercase tracking-widest font-bold">狩獵者名稱</label>
                <select
                  className="bg-black/60 border border-primary/40 rounded-lg px-3 py-2 text-white text-sm focus:border-primary focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  value={editingItem.hunter || ''}
                  disabled={!canEdit}
                  onChange={e => setEditingItem({ ...editingItem, hunter: e.target.value })}
                >
                  <option value="">請選擇或選取狩獵者</option>
                  {hunterOptions.map((name, idx) => (
                    <option key={idx} value={name}>{name}</option>
                  ))}
                  {editingItem.hunter && !hunterOptions.includes(editingItem.hunter) && (
                    <option value={editingItem.hunter}>{editingItem.hunter}</option>
                  )}
                </select>
              </div>

              {activeTab === 'Tracker' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-primary/80 font-sans uppercase tracking-widest font-bold">標的 (股號)</label>
                      <select
                        className="bg-black/60 border border-primary/40 rounded-lg px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                        value={editingItem.target || ''}
                        onChange={e => setEditingItem({ ...editingItem, target: e.target.value })}
                      >
                        <option value="">請選擇標的</option>
                        <option value="009816">009816</option>
                        <option value="0050">0050</option>
                        <option value="006208">006208</option>
                        {editingItem.target && !['009816', '0050', '006208'].includes(editingItem.target) && (
                          <option value={editingItem.target}>{editingItem.target}</option>
                        )}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-primary/80 font-sans uppercase tracking-widest font-bold">股數</label>
                      <input
                        className="bg-black/60 border border-primary/40 rounded-lg px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                        value={editingItem.shares || ''}
                        onChange={e => setEditingItem({ ...editingItem, shares: e.target.value })}
                        placeholder=""
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-primary/80 font-sans uppercase tracking-widest font-bold">金額</label>
                      <input
                        className="bg-black/60 border border-primary/40 rounded-lg px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                        value={editingItem.amount || ''}
                        onChange={e => setEditingItem({ ...editingItem, amount: e.target.value })}
                        placeholder=""
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-primary/80 font-sans uppercase tracking-widest font-bold">交易類型</label>
                      <select
                        className="bg-black/60 border border-primary/40 rounded-lg px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                        value={editingItem.type || '買'}
                        onChange={e => setEditingItem({ ...editingItem, type: e.target.value })}
                      >
                        <option value="買">買</option>
                        <option value="賣">賣</option>
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-primary/80 font-sans uppercase tracking-widest font-bold">請領類別</label>
                    <select
                      className="bg-black/60 border border-primary/40 rounded-lg px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                      value={editingItem.category || 'A耐性'}
                      onChange={e => setEditingItem({ ...editingItem, category: e.target.value })}
                    >
                      <option value="A耐性">A耐性</option>
                      <option value="B定性">B定性</option>
                      <option value="C韌性">C韌性</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-primary/80 font-sans uppercase tracking-widest font-bold">獎金金額</label>
                    <input
                      className="bg-black/60 border border-primary/40 rounded-lg px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                      value={editingItem.amount || ''}
                      onChange={e => setEditingItem({ ...editingItem, amount: e.target.value })}
                      placeholder=""
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-white/10 font-sans">
                {modalMode === 'edit' && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleDelete}
                    className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 font-bold px-4 py-2 rounded-xl transition-all mr-auto"
                  >
                    刪除
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-2 rounded-xl transition-all"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSave}
                  className="bg-primary hover:bg-primary/90 text-black font-bold px-6 py-2 rounded-xl shadow-[0_0_15px_rgba(243,156,18,0.4)] transition-all flex items-center gap-1"
                >
                  {isSaving && <span className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin"></span>}
                  <span>{isSaving ? '儲存中...' : '確認儲存'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className={`fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-20 px-6 bg-surface/95 backdrop-blur-lg border-t border-primary/30 shadow-[0_-8px_20px_rgba(243,156,18,0.3)] transition-transform duration-300 ${showNav ? 'translate-y-0' : 'translate-y-full'}`}>
        <button className="flex flex-col items-center gap-1 text-[#efe0d2]" onClick={() => router.push("/basic-mission")}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>target</span>
          <span className="font-label-caps text-[11px] tracking-[0.1em]">基礎</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-primary" onClick={() => router.push("/hidden-mission")}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>diamond</span>
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
          <span className="font-label-caps text-[11px] tracking-[0.1em]">覺醒</span>
        </button>
      </nav>
    </div>
  );
}
