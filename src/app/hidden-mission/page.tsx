"use client";

import { useEffect, useState, useMemo } from "react";
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
  const [view, setView] = useState<'individual' | 'team'>('individual');

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

  // Check user role
  const roles = (session?.user as any)?.roles || {};
  const userRole = roles["hidden"] || "viewer";
  const canEdit = userRole === "admin" || userRole === "editor" || process.env.NODE_ENV === "development";

  // Set default hunter to logged in user or first in scoreboard
  useEffect(() => {
    if (!selectedHunter && data.scoreboard.length > 0) {
      const currentUserName = session?.user?.name || "";
      const match = data.scoreboard.find((item: any) => item.hunter === currentUserName);
      if (match) {
        setSelectedHunter(match.hunter);
      } else {
        setSelectedHunter(data.scoreboard[0].hunter);
      }
    }
  }, [data.scoreboard, session, selectedHunter]);

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

  // Current hunter's data
  const personalScoreboard = useMemo(() => {
    if (awardYear !== '2026') return null;
    return data.scoreboard.find((item: any) => item.hunter === selectedHunter) || null;
  }, [data.scoreboard, selectedHunter, awardYear]);

  const personalLeadgeA_maxDays = useMemo(() => {
    if (awardYear !== '2026' || !selectedHunter || !data.leadgeA) return 0;
    const hunterRows = data.leadgeA.filter((item: any) => item.hunter === selectedHunter);
    let maxD = 0;
    for (const item of hunterRows) {
      if (item.buyDate) {
        const buy = new Date(item.buyDate);
        if (!isNaN(buy.getTime())) {
          const diffMs = Date.now() - buy.getTime();
          const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
          if (days > maxD) maxD = days;
        }
      }
    }
    return maxD;
  }, [data.leadgeA, selectedHunter, awardYear]);

  const personalLeadgeB_maxMonths = useMemo(() => {
    if (awardYear !== '2026' || !selectedHunter || !data.leadgeB) return 0;
    const hunterRows = data.leadgeB.filter((item: any) => item.hunter === selectedHunter);
    let maxM = 0;
    for (const item of hunterRows) {
      const m = Number(item.consecutiveMonths) || 0;
      if (m > maxM) maxM = m;
    }
    return maxM;
  }, [data.leadgeB, selectedHunter, awardYear]);

  const personalLeadgeC_returnRate = useMemo(() => {
    if (!selectedHunter || !data.leadgeC || data.leadgeC.length === 0) return "0.00%";
    
    const matches = data.leadgeC.filter((item: any) => item.hunter === selectedHunter && (item.date || '').includes(awardYear));
    
    let target = null;
    if (matches.length > 0) {
      target = matches[matches.length - 1];
    } else if (awardYear === '2026') {
      target = data.leadgeC.find((item: any) => item.hunter === selectedHunter);
    }
    
    if (!target || !target.returnRate || !target.returnRate.trim()) return "0.00%";
    const rate = target.returnRate.trim();
    return rate.endsWith('%') ? rate : `${rate}%`;
  }, [data.leadgeC, selectedHunter, awardYear]);

  // Handle Save / Add
  const handleSave = async () => {
    if (!editingItem) return;
    setIsSaving(true);
    try {
      const url = "/api/sheets/hidden-mission";
      let payload: any = {};

      if (modalMode === 'add') {
        let values: string[][] = [];
        if (activeTab === 'Tracker') {
          values = [[
            editingItem.date || '',
            editingItem.hunter || '',
            editingItem.target || '',
            String(editingItem.shares || ''),
            String(editingItem.amount || ''),
            editingItem.type || '買'
          ]];
        } else {
          values = [[
            editingItem.date || '',
            editingItem.hunter || '',
            String(editingItem.amount || ''),
            editingItem.category || 'A耐性'
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
            String(editingItem.shares || ''),
            String(editingItem.amount || ''),
            editingItem.type || '買'
          ]];
        } else {
          values = [[
            editingItem.date || '',
            editingItem.hunter || '',
            String(editingItem.amount || ''),
            editingItem.category || 'A耐性'
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

  const openAddModal = () => {
    setModalMode('add');
    if (activeTab === 'Tracker') {
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '/');
      setEditingItem({
        date: today,
        hunter: selectedHunter || session?.user?.name || '',
        target: '0050',
        shares: '50',
        amount: '$10,000',
        type: '買'
      });
    } else {
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '/');
      setEditingItem({
        date: today,
        hunter: selectedHunter || session?.user?.name || '',
        amount: '$3,000',
        category: 'A耐性'
      });
    }
    setIsModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setModalMode('edit');
    setEditingItem({ ...item });
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
            onClick={() => setView(view === 'individual' ? 'team' : 'individual')}
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
                            {data.scoreboard.map((item: any) => (
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
                            <div className="mt-4 pt-4 border-t border-white/10 text-xs text-white/80 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200" onClick={(e) => e.stopPropagation()}>
                              <p className="text-white/60">
                                根據買入日計算持股屆滿天數（90 / 180 / 270 / 360 / 720 天），分別觸發 Q1~Q4 階梯式長期投資獎金。
                              </p>
                            </div>
                          )}
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
                            <div className="mt-4 pt-4 border-t border-white/10 text-xs text-white/80 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200" onClick={(e) => e.stopPropagation()}>
                              <p className="text-white/60">
                                定期定額或連續月份買入持股。依據累計投入金額與連續月數，計算底薪率 (1.0%) 與成長率 (0.1%，最高達 3.3%) 獎勵金。
                              </p>
                            </div>
                          )}
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
                              <span className="text-white font-bold text-sm">年度績效 {personalLeadgeC_returnRate}</span>
                              {(personalScoreboard?.challengeC.total || 0) > 0 && (
                                <span className="text-[11px] text-emerald-400/70 font-display">
                                  +${(personalScoreboard?.challengeC.total || 0).toLocaleString()} 價值 | 餘額 ${(personalScoreboard?.challengeC.balance || 0).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                          {expandedLevel === 'L3' && (
                            <div className="mt-4 pt-4 border-t border-white/10 text-xs text-white/80 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200" onClick={(e) => e.stopPropagation()}>
                              <p className="text-white/60">
                                依據年度結算日之總損益率 <span className="font-mono text-primary">(A+C+E)/(B+D)</span> 排行，競爭年度總獎金池 <span className="font-mono text-primary">$50,000</span>！
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
                      </div>

                      <div className="flex flex-col gap-2">
                        {awardYear === '2026' && data.scoreboard.length > 0 ? data.scoreboard.map((item: any, index: number) => {
                          const maxIndex = Math.max(1, data.scoreboard.length - 1);
                          const barOpacity = 1 - (0.3 * (index / maxIndex));
                          const maxReward = Math.max(...data.scoreboard.map((s: any) => s.totalReward || 0), 1);
                          const barPct = Math.min(100, Math.max(8, ((item.totalReward || 0) / maxReward) * 100));
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
                                  <span className="text-emerald-400 text-[13px] font-bold font-mono">${(item.totalReward || 0).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          );
                        }) : (
                          <div className="text-center text-primary/50 text-xs py-4">本年度暫無團隊數據</div>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Editable Tables Section for Tracker (投資) & Reward (請領) */}
                  <div className="bg-[#141414] border-2 border-primary/50 rounded-2xl p-6 shadow-2xl">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-white/10 pb-4">
                      <div>
                        <span className="text-[10px] font-label-caps tracking-[0.2em] text-primary/70 uppercase">Management Table</span>
                        <h3 className="text-xl font-bold font-display text-white flex items-center gap-2">
                          <span>{activeTab === 'Tracker' ? '投資交易紀錄表 (Tracker)' : '獎金請領撥款表 (Reward)'}</span>
                          {canEdit ? (
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded">直接連動編輯中</span>
                          ) : (
                            <span className="text-[10px] bg-white/10 text-white/50 px-2 py-0.5 rounded">僅供瀏覽</span>
                          )}
                        </h3>
                      </div>

                      {/* Chinese Toggle Switch & Add Button */}
                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        <div className="flex bg-[#1E1E1E] rounded-full p-1 border border-primary/30">
                          <button
                            onClick={() => setActiveTab('Tracker')}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab === 'Tracker' ? 'bg-primary text-black shadow-md' : 'text-white/70 hover:text-white'}`}
                          >
                            投資
                          </button>
                          <button
                            onClick={() => setActiveTab('Reward')}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab === 'Reward' ? 'bg-primary text-black shadow-md' : 'text-white/70 hover:text-white'}`}
                          >
                            請領
                          </button>
                        </div>

                        {canEdit && (
                          <button
                            onClick={openAddModal}
                            className="bg-primary hover:bg-primary/90 text-black font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1 shadow-lg transition-transform active:scale-95"
                          >
                            <span className="material-symbols-outlined text-[16px]">add</span>
                            <span>新增{activeTab === 'Tracker' ? '投資' : '請領'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Table Render */}
                    <div className="overflow-x-auto">
                      {activeTab === 'Tracker' ? (
                        <table className="w-full text-left border-collapse font-mono text-xs">
                          <thead>
                            <tr className="border-b border-primary/40 text-primary bg-black/60">
                              <th className="p-3">日期</th>
                              <th className="p-3">狩獵者</th>
                              <th className="p-3">標的</th>
                              <th className="p-3 text-right">股數</th>
                              <th className="p-3 text-right">金額</th>
                              <th className="p-3 text-center">交易</th>
                              {canEdit && <th className="p-3 text-center">操作</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {data.tracker.length > 0 ? (
                              data.tracker.map((row: any, idx: number) => (
                                <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                  <td className="p-3 text-white/80">{row.date}</td>
                                  <td className="p-3 font-bold text-white">{row.hunter}</td>
                                  <td className="p-3 text-primary font-bold">{row.target}</td>
                                  <td className="p-3 text-right text-white">{row.shares}</td>
                                  <td className="p-3 text-right text-emerald-400 font-bold">{row.amount}</td>
                                  <td className="p-3 text-center">
                                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${row.type === '買' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                                      {row.type || '買'}
                                    </span>
                                  </td>
                                  {canEdit && (
                                    <td className="p-3 text-center">
                                      <button
                                        onClick={() => openEditModal(row)}
                                        className="text-primary hover:text-white bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded transition-colors"
                                        title="編輯/刪除此紀錄"
                                      >
                                        <span className="material-symbols-outlined text-[14px]">edit</span>
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))
                            ) : (
                              <tr><td colSpan={7} className="p-6 text-center text-white/40 font-sans">目前尚無投資交易紀錄</td></tr>
                            )}
                          </tbody>
                        </table>
                      ) : (
                        <table className="w-full text-left border-collapse font-mono text-xs">
                          <thead>
                            <tr className="border-b border-primary/40 text-primary bg-black/60">
                              <th className="p-3">請領日期</th>
                              <th className="p-3">狩獵者</th>
                              <th className="p-3 text-right">獎金金額</th>
                              <th className="p-3">請領類別</th>
                              {canEdit && <th className="p-3 text-center">操作</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {data.reward.length > 0 ? (
                              data.reward.map((row: any, idx: number) => (
                                <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                  <td className="p-3 text-white/80">{row.date}</td>
                                  <td className="p-3 font-bold text-white">{row.hunter}</td>
                                  <td className="p-3 text-right text-emerald-400 font-bold text-sm">{row.amount}</td>
                                  <td className="p-3">
                                    <span className="bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 rounded font-bold text-[10px]">
                                      {row.category || 'A耐性'}
                                    </span>
                                  </td>
                                  {canEdit && (
                                    <td className="p-3 text-center">
                                      <button
                                        onClick={() => openEditModal(row)}
                                        className="text-primary hover:text-white bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded transition-colors"
                                        title="編輯/刪除此紀錄"
                                      >
                                        <span className="material-symbols-outlined text-[14px]">edit</span>
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))
                            ) : (
                              <tr><td colSpan={5} className="p-6 text-center text-white/40 font-sans">目前尚無獎金請領紀錄</td></tr>
                            )}
                          </tbody>
                        </table>
                      )}
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
                <input
                  className="bg-black/60 border border-primary/40 rounded-lg px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                  value={editingItem.hunter || ''}
                  onChange={e => setEditingItem({ ...editingItem, hunter: e.target.value })}
                  placeholder="例如: 陳政剛"
                />
              </div>

              {activeTab === 'Tracker' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-primary/80 font-sans uppercase tracking-widest font-bold">標的 (股號)</label>
                      <input
                        className="bg-black/60 border border-primary/40 rounded-lg px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                        value={editingItem.target || ''}
                        onChange={e => setEditingItem({ ...editingItem, target: e.target.value })}
                        placeholder="例如: 0050"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-primary/80 font-sans uppercase tracking-widest font-bold">股數</label>
                      <input
                        className="bg-black/60 border border-primary/40 rounded-lg px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                        value={editingItem.shares || ''}
                        onChange={e => setEditingItem({ ...editingItem, shares: e.target.value })}
                        placeholder="例如: 50.00"
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
                        placeholder="例如: $10,000"
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
                    <label className="text-[10px] text-primary/80 font-sans uppercase tracking-widest font-bold">獎金金額</label>
                    <input
                      className="bg-black/60 border border-primary/40 rounded-lg px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                      value={editingItem.amount || ''}
                      onChange={e => setEditingItem({ ...editingItem, amount: e.target.value })}
                      placeholder="例如: $3,000"
                    />
                  </div>

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
