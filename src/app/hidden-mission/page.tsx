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

  // Modal states for editing / adding Tracker or Reward
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch API data
  const { data: res, isLoading, mutate } = useSWR("/api/sheets/hidden-mission", fetcher, {
    refreshInterval: 30000,
  });

  const data = res?.data || {
    scoreboard: [],
    tracker: [],
    reward: [],
    leadgeA: [],
    leadgeB: [],
    leadgeC: [],
  };

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
    return data.scoreboard.find((item: any) => item.hunter === selectedHunter) || null;
  }, [data.scoreboard, selectedHunter]);

  const personalLeadgeA = useMemo(() => {
    return data.leadgeA.filter((item: any) => item.hunter === selectedHunter);
  }, [data.leadgeA, selectedHunter]);

  const personalLeadgeB = useMemo(() => {
    return data.leadgeB.find((item: any) => item.hunter === selectedHunter) || null;
  }, [data.leadgeB, selectedHunter]);

  const personalLeadgeC = useMemo(() => {
    return data.leadgeC.find((item: any) => item.hunter === selectedHunter) || null;
  }, [data.leadgeC, selectedHunter]);

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
    <div className="flex-1 flex flex-col min-h-screen bg-[#0a0a0a] text-[#efe0d2] font-sans pb-24">
      {/* Fixed Header */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center h-16 bg-surface/90 backdrop-blur-md border-b border-primary/30 shadow-[0_8px_20px_rgba(243,156,18,0.3)] px-4">
        <div className="flex items-center gap-3 flex-nowrap cursor-pointer" onClick={() => router.push("/diversion")}>
          <Image priority alt="SenseSoil Logo" width={28} height={28} className="h-[28px] w-auto object-contain flex-shrink-0 translate-y-[-2px]" src="/Logo｜Orange.svg" />
          <h1 className="font-headline-md uppercase tracking-widest font-bold text-primary text-[24px] leading-none">自我覺醒試煉</h1>
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
        <main className="relative pt-20 px-4 max-w-5xl mx-auto w-full">
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
                        className={`font-label-caps text-primary font-bold text-[12px] tracking-[0.2em] mb-3 leading-none ${canEdit ? "cursor-pointer" : ""}`}
                        onClick={() => { if(canEdit) setIsHunterDropdownOpen(!isHunterDropdownOpen) }}
                      >
                        S級狩獵者
                      </p>
                      <h2 
                        key={selectedHunter}
                        className={`font-headline-lg text-primary text-3xl font-bold tracking-wider uppercase leading-none transition-opacity ${canEdit ? "cursor-pointer hover:opacity-80" : ""} animate-text-reveal`}
                        onClick={() => { if(canEdit) setIsHunterDropdownOpen(!isHunterDropdownOpen) }}
                      >
                        {selectedHunter || "選擇狩獵者"}
                      </h2>
                      {isHunterDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsHunterDropdownOpen(false)} />
                          <div className="absolute top-full left-0 mt-2 w-48 bg-surface-container-high border border-primary/30 rounded-[4px] shadow-lg z-[120] max-h-60 overflow-y-auto">
                            {data.scoreboard.map((item: any) => (
                              <div
                                key={item.hunter}
                                className={`px-4 py-3 hover:bg-primary/20 cursor-pointer text-[#efe0d2] text-sm border-b border-primary/10 last:border-b-0 flex justify-between items-center ${selectedHunter === item.hunter ? 'bg-primary/30 text-primary font-bold' : ''}`}
                                onClick={() => { setSelectedHunter(item.hunter); setIsHunterDropdownOpen(false); }}
                              >
                                <span>{item.hunter}</span>
                                <span className="text-[11px] opacity-70">${item.totalReward || 0}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="text-right flex flex-col justify-end flex-shrink-0">
                      <p className="font-label-caps text-white font-bold text-[12px] tracking-[0.1em] mb-3 uppercase leading-none whitespace-nowrap">總累積獎金餘額</p>
                      <div className="font-headline-lg text-[#00E5FF] text-3xl font-bold tracking-tighter font-display flex items-baseline justify-end gap-1 leading-none">
                        <span className="text-xl">$</span>{((personalScoreboard?.challengeA.balance || 0) + (personalScoreboard?.challengeB.balance || 0) + (personalScoreboard?.challengeC.balance || 0) || (personalScoreboard?.totalReward || 0)).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Personal Scoreboard Overview Card */}
                  <div className="bg-gradient-to-br from-[#1c1a17] via-[#121212] to-[#0a0a0a] border-2 border-primary/60 rounded-2xl p-6 shadow-[0_0_30px_rgba(243,156,18,0.15)] relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-primary/20 pb-6 mb-6 gap-4">
                      <div>
                        <span className="text-xs font-mono text-primary tracking-widest uppercase">Total Investment Reward</span>
                        <div className="text-4xl sm:text-5xl font-extrabold font-data-mono text-white tracking-tight drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] mt-1">
                          {formatMoney(personalScoreboard?.totalReward || 0)}
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="bg-black/40 border border-white/10 px-4 py-2 rounded-xl text-center">
                          <div className="text-[10px] text-white/50 uppercase">已請領獎金</div>
                          <div className="text-lg font-bold text-emerald-400 font-mono">
                            {formatMoney((personalScoreboard?.challengeA.claimed || 0) + (personalScoreboard?.challengeB.claimed || 0) + (personalScoreboard?.challengeC.claimed || 0))}
                          </div>
                        </div>
                        <div className="bg-black/40 border border-white/10 px-4 py-2 rounded-xl text-center">
                          <div className="text-[10px] text-white/50 uppercase">獎金餘額</div>
                          <div className="text-lg font-bold text-primary font-mono">
                            {formatMoney((personalScoreboard?.challengeA.balance || 0) + (personalScoreboard?.challengeB.balance || 0) + (personalScoreboard?.challengeC.balance || 0))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 3 Challenges Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Challenge A */}
                      <div className="bg-black/60 border border-primary/30 rounded-xl p-4 flex flex-col justify-between hover:border-primary/60 transition-all">
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-primary tracking-wider">挑戰A：耐性</span>
                            <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded font-mono">持股試煉</span>
                          </div>
                          <div className="text-2xl font-bold font-mono text-white mb-3">{formatMoney(personalScoreboard?.challengeA.total || 0)}</div>
                        </div>
                        <div className="border-t border-white/10 pt-2 flex justify-between text-xs text-white/60 font-mono">
                          <span>已請: {formatMoney(personalScoreboard?.challengeA.claimed || 0)}</span>
                          <span className="text-primary font-bold">餘額: {formatMoney(personalScoreboard?.challengeA.balance || 0)}</span>
                        </div>
                      </div>

                      {/* Challenge B */}
                      <div className="bg-black/60 border border-primary/30 rounded-xl p-4 flex flex-col justify-between hover:border-primary/60 transition-all">
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-primary tracking-wider">挑戰B：定性</span>
                            <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded font-mono">連續月數</span>
                          </div>
                          <div className="text-2xl font-bold font-mono text-white mb-3">{formatMoney(personalScoreboard?.challengeB.total || 0)}</div>
                        </div>
                        <div className="border-t border-white/10 pt-2 flex justify-between text-xs text-white/60 font-mono">
                          <span>已請: {formatMoney(personalScoreboard?.challengeB.claimed || 0)}</span>
                          <span className="text-primary font-bold">餘額: {formatMoney(personalScoreboard?.challengeB.balance || 0)}</span>
                        </div>
                      </div>

                      {/* Challenge C */}
                      <div className="bg-black/60 border border-primary/30 rounded-xl p-4 flex flex-col justify-between hover:border-primary/60 transition-all">
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-primary tracking-wider">挑戰C：韌性</span>
                            <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded font-mono">年度排行榜</span>
                          </div>
                          <div className="text-2xl font-bold font-mono text-white mb-3">{formatMoney(personalScoreboard?.challengeC.total || 0)}</div>
                        </div>
                        <div className="border-t border-white/10 pt-2 flex justify-between text-xs text-white/60 font-mono">
                          <span>已請: {formatMoney(personalScoreboard?.challengeC.claimed || 0)}</span>
                          <span className="text-primary font-bold">餘額: {formatMoney(personalScoreboard?.challengeC.balance || 0)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Challenge Details Section */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Challenge B Details Card */}
                    <div className="bg-[#141414] border border-primary/30 rounded-2xl p-5 flex flex-col justify-between shadow-lg">
                      <div>
                        <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-3">
                          <span className="material-symbols-outlined text-primary">psychology</span>
                          <h3 className="text-base font-bold font-display text-white tracking-wider">挑戰B：定性試煉（連續投資）</h3>
                        </div>
                        <p className="text-xs text-white/60 mb-4 leading-relaxed">
                          規則：定期定額或連續月份買入持股。依據累計投入金額與連續月數，計算底薪率 (1.0%) 與成長率 (0.1%，最高達 3.3%) 獎勵金。
                        </p>
                        <div className="bg-black/50 rounded-xl p-4 border border-white/5 flex flex-col gap-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-white/70">連續達成月數</span>
                            <span className="text-lg font-bold font-mono text-primary">{personalLeadgeB?.consecutiveMonths || 0} 個月</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-white/70">累計投入金額</span>
                            <span className="text-lg font-bold font-mono text-white">{personalLeadgeB?.accumulatedAmount || "$0"}</span>
                          </div>
                          <div className="border-t border-white/10 pt-2 flex justify-between items-center">
                            <span className="text-xs font-bold text-primary">目前試算獎金</span>
                            <span className="text-xl font-bold font-mono text-emerald-400">{personalLeadgeB?.reward || "$0"}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Challenge C Details Card */}
                    <div className="bg-[#141414] border border-primary/30 rounded-2xl p-5 flex flex-col justify-between shadow-lg">
                      <div>
                        <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-3">
                          <span className="material-symbols-outlined text-primary">military_tech</span>
                          <h3 className="text-base font-bold font-display text-white tracking-wider">挑戰C：韌性試煉（年度投資排行）</h3>
                        </div>
                        <p className="text-xs text-white/60 mb-4 leading-relaxed">
                          規則：依據年度結算日之總損益率 <span className="font-mono text-primary">(A+C+E)/(B+D)</span> 排行，競爭年度總獎金池 <span className="font-mono text-primary">$50,000</span>！
                        </p>
                        <div className="bg-black/50 rounded-xl p-4 border border-white/5 flex flex-col gap-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-white/70">總損益率</span>
                            <span className="text-lg font-bold font-mono text-primary">{personalLeadgeC?.returnRate || "0.00%"}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-white/60 font-mono">
                            <div>未實現損益: <span className="text-white">{personalLeadgeC?.pnlA || "$0"}</span></div>
                            <div>已實現損益: <span className="text-white">{personalLeadgeC?.realizedPnlC || "$0"}</span></div>
                            <div>付出成本: <span className="text-white">{personalLeadgeC?.costB || "$0"}</span></div>
                            <div>配息: <span className="text-white">{personalLeadgeC?.dividendE || "$0"}</span></div>
                          </div>
                          <div className="border-t border-white/10 pt-2 flex justify-between items-center">
                            <span className="text-xs font-bold text-primary">排名瓜分獎金</span>
                            <span className="text-xl font-bold font-mono text-emerald-400">{personalLeadgeC?.rankReward || "$0"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Challenge A Details Card - Full Width */}
                  <div className="bg-[#141414] border border-primary/30 rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-3">
                      <span className="material-symbols-outlined text-primary">hourglass_bottom</span>
                      <h3 className="text-base font-bold font-display text-white tracking-wider">挑戰A：耐性試煉（長期持股明細）</h3>
                    </div>
                    <p className="text-xs text-white/60 mb-4">
                      規則：根據買入日計算持股屆滿天數（90 / 180 / 270 / 360 / 720 天），分別觸發 Q1~Q4 階梯式長期投資獎金。
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse font-mono text-xs">
                        <thead>
                          <tr className="border-b border-primary/30 text-primary/80 bg-black/40">
                            <th className="p-3">買入日</th>
                            <th className="p-3">標的</th>
                            <th className="p-3 text-right">股數</th>
                            <th className="p-3 text-right">金額</th>
                            <th className="p-3 text-right">累計股數</th>
                            <th className="p-3 text-center">90天</th>
                            <th className="p-3 text-center">180天</th>
                            <th className="p-3 text-center">270天</th>
                            <th className="p-3 text-center">360天</th>
                            <th className="p-3 text-right text-emerald-400">Q1獎金</th>
                            <th className="p-3 text-right text-emerald-400">Q2獎金</th>
                            <th className="p-3 text-right text-emerald-400">Q3獎金</th>
                            <th className="p-3 text-right text-emerald-400">Q4獎金</th>
                          </tr>
                        </thead>
                        <tbody>
                          {personalLeadgeA.length > 0 ? (
                            personalLeadgeA.map((row: any, idx: number) => (
                              <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                <td className="p-3 text-white/80">{row.buyDate}</td>
                                <td className="p-3 font-bold text-primary">{row.target}</td>
                                <td className="p-3 text-right text-white">{row.shares}</td>
                                <td className="p-3 text-right text-white/70">{row.amount}</td>
                                <td className="p-3 text-right font-bold text-white">{row.accumulatedShares}</td>
                                <td className="p-3 text-center text-white/60">{row.days90}</td>
                                <td className="p-3 text-center text-white/60">{row.days180}</td>
                                <td className="p-3 text-center text-white/60">{row.days270}</td>
                                <td className="p-3 text-center text-white/60">{row.days360}</td>
                                <td className="p-3 text-right font-bold text-emerald-400">{row.q1Reward || "-"}</td>
                                <td className="p-3 text-right font-bold text-emerald-400">{row.q2Reward || "-"}</td>
                                <td className="p-3 text-right font-bold text-emerald-400">{row.q3Reward || "-"}</td>
                                <td className="p-3 text-right font-bold text-emerald-400">{row.q4Reward || "-"}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={13} className="p-6 text-center text-white/40 font-sans">
                                目前尚無 {selectedHunter} 的持股耐性明細
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TEAM VIEW */}
              {view === 'team' && (
                <div className="flex flex-col gap-8 animate-fade-in">
                  {/* Team Leaderboard Card */}
                  <div className="bg-[#141414] border border-primary/40 rounded-2xl p-6 shadow-xl">
                    <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                      <div>
                        <span className="text-[10px] font-label-caps tracking-[0.2em] text-primary/70 uppercase">Scoreboard</span>
                        <h2 className="text-2xl font-bold font-display text-white">團隊投資激勵總覽與排行榜</h2>
                      </div>
                      <span className="text-xs text-white/50 font-mono">更新自 Google Sheet</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse font-mono text-sm">
                        <thead>
                          <tr className="border-b-2 border-primary text-primary bg-black/60">
                            <th className="p-3">排行</th>
                            <th className="p-3">狩獵者</th>
                            <th className="p-3 text-right">挑戰A：耐性</th>
                            <th className="p-3 text-right">挑戰B：定性</th>
                            <th className="p-3 text-right">挑戰C：韌性</th>
                            <th className="p-3 text-right text-emerald-400">Total 總獎金</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.scoreboard.map((row: any, idx: number) => (
                            <tr key={row.hunter} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                              <td className="p-3 font-bold text-primary/80">#{idx + 1}</td>
                              <td className="p-3 font-bold text-white flex items-center gap-2">
                                <span>{row.hunter}</span>
                                {idx === 0 && <span className="material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span>}
                              </td>
                              <td className="p-3 text-right text-white/80">{formatMoney(row.challengeA.total)}</td>
                              <td className="p-3 text-right text-white/80">{formatMoney(row.challengeB.total)}</td>
                              <td className="p-3 text-right text-white/80">{formatMoney(row.challengeC.total)}</td>
                              <td className="p-3 text-right font-bold text-emerald-400 text-base">{formatMoney(row.totalReward)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

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
