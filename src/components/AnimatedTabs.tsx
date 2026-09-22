"use client";
import React, { useEffect, useRef, useState } from "react";

interface AnimatedTabsProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  showManual?: boolean;
  onManualChange?: (v: boolean) => void;
}

export default function AnimatedTabs({
  tabs,
  activeTab,
  onTabChange,
  showManual,
  onManualChange
}: AnimatedTabsProps) {
  const activeIdx = tabs.indexOf(activeTab);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const [isMounted, setIsMounted] = useState(false);
  const tabsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    tabsRef.current = tabsRef.current.slice(0, tabs.length);
    const activeEl = tabsRef.current[activeIdx];
    
    if (activeEl) {
      setIsMounted(true);
      setIndicatorStyle({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
      });
    }
  }, [activeIdx, tabs]);

  return (
    <div
      className="relative inline-flex items-center bg-transparent rounded-[10px] p-[3px] cursor-pointer select-none"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <div
        className={`absolute top-[3px] bottom-[3px] rounded-[8px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] ease-[cubic-bezier(0.25,0.1,0.25,1)] ${showManual ? "opacity-0" : "opacity-100"} ${isMounted ? "transition-all duration-300" : ""}`}
        style={{
          left: indicatorStyle.width ? indicatorStyle.left : `calc(3px + (100% - 6px) / ${tabs.length} * ${activeIdx})`,
          width: indicatorStyle.width || `calc((100% - 6px) / ${tabs.length})`,
        }}
      />
      {tabs.map((tab, idx) => (
        <div
          key={tab}
          ref={(el) => { tabsRef.current[idx] = el; }}
          onClick={() => {
            if (onManualChange) onManualChange(false);
            onTabChange(tab);
          }}
          className={`relative z-10 px-4 h-[26px] flex items-center justify-center text-[13px] font-semibold tracking-wide whitespace-nowrap transition-colors duration-300 ${activeTab === tab && !showManual ? "text-[#18181B]" : "text-[#A1A1AA]"}`}
        >
          {tab}
        </div>
      ))}
    </div>
  );
}
