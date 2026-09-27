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
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    tabsRef.current = tabsRef.current.slice(0, tabs.length);
    const activeEl = tabsRef.current[activeIdx];
    if (!activeEl) return;

    // offsetLeft／offsetWidth 只量按鈕本身的框，放大點擊範圍的 ::before 是絕對定位，不會算進來
    const measure = () =>
      setIndicatorStyle((s) =>
        s.left === activeEl.offsetLeft && s.width === activeEl.offsetWidth
          ? s
          : { left: activeEl.offsetLeft, width: activeEl.offsetWidth }
      );
    setIsMounted(true);
    measure();
    // 字型晚一步載入時分頁寬度會變，指示塊要跟著重量，否則會跟文字對不齊
    const ro = new ResizeObserver(measure);
    ro.observe(activeEl);
    return () => ro.disconnect();
  }, [activeIdx, tabs]);

  const select = (tab: string) => {
    if (onManualChange) onManualChange(false);
    onTabChange(tab);
  };

  // 分頁列的鍵盤操作（WAI-ARIA tabs）：Tab 只停在目前的分頁，左右鍵／Home／End 在分頁間移動
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const cur = tabsRef.current.findIndex((el) => el === document.activeElement);
    if (cur < 0) return;
    let next = -1;
    if (e.key === "ArrowRight") next = (cur + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (cur - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    tabsRef.current[next]?.focus();
    select(tabs[next]);
  };

  // 沒有任何分頁被選取時（例如正在看使用說明），仍要讓第一個分頁可以用 Tab 進來
  const focusIdx = activeIdx >= 0 ? activeIdx : 0;

  return (
    <div
      role="tablist"
      onKeyDown={onKeyDown}
      className="relative inline-flex items-center bg-transparent rounded-[10px] p-[3px] cursor-pointer select-none"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <div
        className={`absolute top-[3px] bottom-[3px] rounded-[8px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] ease-[cubic-bezier(0.25,0.1,0.25,1)] ${showManual ? "opacity-0" : "opacity-100"} ${isMounted ? "transition-all duration-300" : ""}`}
        style={{
          left: indicatorStyle.width ? indicatorStyle.left : `calc(3px + (100% - 6px) / ${tabs.length} * ${activeIdx})`,
          width: indicatorStyle.width || `calc((100% - 6px) / ${tabs.length})`,
        }}
        aria-hidden
      />
      {tabs.map((tab, idx) => {
        const selected = activeTab === tab && !showManual;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={idx === focusIdx ? 0 : -1}
            ref={(el) => { tabsRef.current[idx] = el; }}
            onClick={() => select(tab)}
            // 視覺維持 26px 高；::before 上下各延伸 9px，點擊範圍約 44px（手指點得到）
            // 焦點：globals.css 清掉了 outline／box-shadow，改用 ::after 畫一圈橘色細框
            className={`relative z-10 px-4 h-[26px] flex items-center justify-center text-[13px] font-semibold tracking-wide whitespace-nowrap cursor-pointer transition-colors duration-300 before:absolute before:inset-x-0 before:-inset-y-[9px] before:content-[''] after:absolute after:inset-0 after:rounded-[8px] after:border after:border-transparent after:pointer-events-none after:content-[''] focus-visible:after:border-[#F39C12] ${
              selected ? "text-[#18181B]" : "text-[#71717A] [@media(hover:hover)]:hover:text-[#3F3F46]"
            }`}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
