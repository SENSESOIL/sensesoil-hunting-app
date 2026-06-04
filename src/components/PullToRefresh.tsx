"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function PullToRefresh({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const pullDistanceRef = useRef(0);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const router = useRouter();

  const MAX_PULL = 120;
  const THRESHOLD = 60;

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 0) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || isRefreshing) return;

      const dy = e.touches[0].clientY - startY.current;

      if (dy > 0 && window.scrollY <= 0) {
        if (e.cancelable) e.preventDefault();
        const distance = Math.min(dy * 0.4, MAX_PULL);
        pullDistanceRef.current = distance;
        setPullDistance(distance);
      }
    };

    const handleTouchEnd = () => {
      if (!isPulling.current) return;
      isPulling.current = false;

      if (pullDistanceRef.current >= THRESHOLD) {
        setIsRefreshing(true);
        pullDistanceRef.current = THRESHOLD;
        setPullDistance(THRESHOLD);

        router.refresh();
        
        setTimeout(() => {
          setIsRefreshing(false);
          pullDistanceRef.current = 0;
          setPullDistance(0);
        }, 1000);
      } else {
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isRefreshing, router]);

  return (
    <div className={`relative w-full ${className}`}>
      <div 
        className="absolute left-0 right-0 flex justify-center items-center pointer-events-none overflow-hidden" 
        style={{ top: '64px', height: `${pullDistance}px`, opacity: pullDistance / THRESHOLD }}
      >
        <div 
          className={`w-7 h-7 text-primary ${isRefreshing ? 'animate-spin' : ''}`}
          style={!isRefreshing ? { transform: `rotate(${pullDistance * 3}deg)` } : {}}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
            {Array.from({ length: 10 }).map((_, i) => (
              <line
                key={i}
                x1="50"
                y1="22"
                x2="50"
                y2="8"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
                transform={`rotate(${i * 36} 50 50)`}
                opacity={0.2 + (i / 10) * 0.8}
              />
            ))}
          </svg>
        </div>
      </div>
      <div 
        className={`w-full min-h-screen ${!isPulling.current ? "transition-transform duration-300 ease-out" : ""}`}
        style={{ transform: `translateY(${pullDistance}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
