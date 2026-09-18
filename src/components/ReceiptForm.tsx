"use client";

import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import useSWR from "swr";
import * as htmlToImage from 'html-to-image';
import SignaturePad from "./SignaturePad";
import { useDynamicPermissions } from "@/hooks/useDynamicPermissions";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export interface ReceiptFormRef {
  shareReceipt: () => void;
}

const ReceiptForm = forwardRef<ReceiptFormRef>((props, ref) => {
  const { permissions } = useDynamicPermissions();
  const userHunterName = permissions?.hunterName || "";

  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  });
  const [vendor, setVendor] = useState("");
  const [phone, setPhone] = useState("");
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("");
  const [handler, setHandler] = useState(userHunterName);
  const [project, setProject] = useState("");
  const [signature, setSignature] = useState<string | null>(null);

  const [isSigning, setIsSigning] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");

  const formRef = useRef<HTMLDivElement>(null);

  const { data: crmData } = useSWR("/api/crm-data", fetcher);
  const activeHunters = crmData?.activeHunters || [];
  const projects = crmData?.projects || [];

  useEffect(() => {
    if (userHunterName && !handler) {
      setHandler(userHunterName);
    }
  }, [userHunterName, handler]);

  const filteredProjects = projects.filter((p: string) => 
    p.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const handleShare = async () => {
    if (!formRef.current) return;
    
    try {
      // Small delay to ensure any UI states (like focus rings) are cleared
      await new Promise(resolve => setTimeout(resolve, 100));

      const blob = await htmlToImage.toBlob(formRef.current, {
        quality: 0.95,
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      });

      if (!blob) {
        alert("無法產生圖片！");
        return;
      }

      const fileName = `請款簽收單_${date.replace(/\//g, '')}_${vendor || '未命名'}.jpg`;
      const file = new File([blob], fileName, { type: "image/jpeg" });

      if (navigator.share && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "請款簽收單",
            text: `請款簽收單 - ${vendor}`,
          });
        } catch (error: any) {
          if (error.name !== 'AbortError') {
            console.error("Share failed", error);
            downloadFallback(blob, fileName);
          }
        }
      } else {
        downloadFallback(blob, fileName);
      }
    } catch (error) {
      console.error("Error capturing receipt:", error);
      alert("截圖失敗，請稍後再試。");
    }
  };

  const downloadFallback = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useImperativeHandle(ref, () => ({
    shareReceipt: handleShare
  }));

  return (
    <div className="w-full flex flex-col px-4 pt-4 pb-20 max-w-[500px] mx-auto">
      {/* Receipt View that will be captured */}
      <div 
        ref={formRef}
        className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col relative"
      >
        <div className="text-center mb-6 border-b border-gray-100 pb-4">
          <h2 className="text-[20px] font-bold tracking-widest text-[#18181B]">領款簽收單</h2>
          <div className="text-[12px] text-gray-500 mt-1">拾壤室內裝修股份有限公司</div>
        </div>

        <div className="flex flex-col gap-5 text-[15px]">
          {/* 日期 */}
          <div className="flex border-b border-gray-100 pb-2">
            <span className="w-24 text-gray-500 shrink-0">領款日期：</span>
            <input 
              type="text" 
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 outline-none text-[#18181B] bg-transparent"
              placeholder="YYYY/MM/DD"
            />
          </div>

          {/* 廠商 */}
          <div className="flex border-b border-gray-100 pb-2">
            <span className="w-24 text-gray-500 shrink-0">廠商/領款人：</span>
            <input 
              type="text" 
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className="flex-1 outline-none text-[#18181B] bg-transparent"
            />
          </div>

          {/* 電話 */}
          <div className="flex border-b border-gray-100 pb-2">
            <span className="w-24 text-gray-500 shrink-0">連絡電話：</span>
            <input 
              type="tel" 
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1 outline-none text-[#18181B] bg-transparent"
            />
          </div>

          {/* 請款項目 */}
          <div className="flex border-b border-gray-100 pb-2">
            <span className="w-24 text-gray-500 shrink-0">請款項目：</span>
            <input 
              type="text" 
              value={item}
              onChange={(e) => setItem(e.target.value)}
              className="flex-1 outline-none text-[#18181B] bg-transparent"
            />
          </div>

          {/* 專案 */}
          <div className="flex border-b border-gray-100 pb-2 relative">
            <span className="w-24 text-gray-500 shrink-0">專案：</span>
            <div className="flex-1 relative">
              <input 
                type="text" 
                value={isProjectDropdownOpen ? projectSearch : project}
                onChange={(e) => {
                  setProjectSearch(e.target.value);
                  setIsProjectDropdownOpen(true);
                }}
                onFocus={() => {
                  setProjectSearch(project);
                  setIsProjectDropdownOpen(true);
                }}
                className="w-full outline-none text-[#18181B] bg-transparent"
                placeholder="輸入關鍵字或選擇"
              />
              {isProjectDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsProjectDropdownOpen(false)} />
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg z-50">
                    {filteredProjects.length > 0 ? (
                      filteredProjects.map((p: string, i: number) => (
                        <div 
                          key={i} 
                          className="px-3 py-2 text-sm text-[#18181B] hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                          onClick={() => {
                            setProject(p);
                            setIsProjectDropdownOpen(false);
                          }}
                        >
                          {p}
                        </div>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-gray-400">無符合的專案</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 經手人 */}
          <div className="flex border-b border-gray-100 pb-2">
            <span className="w-24 text-gray-500 shrink-0">經手人：</span>
            <select 
              value={handler}
              onChange={(e) => setHandler(e.target.value)}
              className="flex-1 outline-none text-[#18181B] bg-transparent appearance-none cursor-pointer"
            >
              {handler && !activeHunters.includes(handler) && (
                <option value={handler}>{handler}</option>
              )}
              {activeHunters.map((h: string) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>

          <div className="flex border-b border-gray-100 pb-2 mt-4 text-[18px] font-bold">
            <span className="w-24 text-gray-500 shrink-0 font-normal text-[15px] pt-1">領款金額：</span>
            <span className="text-[#F39C12] mr-2">NT$</span>
            <input 
              type="tel"
              pattern="[0-9]*"
              value={amount}
              onChange={(e) => {
                const numericValue = e.target.value.replace(/\D/g, "");
                if (!numericValue) {
                  setAmount("");
                } else {
                  setAmount(Number(numericValue).toLocaleString("en-US"));
                }
              }}
              className="flex-1 outline-none text-[#18181B] bg-transparent font-data-mono tracking-wider"
              placeholder="0"
            />
          </div>

          {/* 簽收 */}
          <div className="mt-8 relative border-t-2 border-gray-800 border-dashed pt-8">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-3 bg-white px-4 text-gray-500 text-sm font-medium">
              領款簽收
            </div>
            
            <div 
              className="w-full h-[120px] bg-gray-50 rounded-lg flex items-center justify-center cursor-pointer border border-gray-200 overflow-hidden relative group"
              onClick={() => {
                setIsSigning(true);
                // Attempt to go fullscreen (works on Android, partially on iOS if PWA)
                try {
                  const elem = document.documentElement;
                  if (elem.requestFullscreen) {
                    elem.requestFullscreen().catch(() => {});
                  } else if ((elem as any).webkitRequestFullscreen) {
                    (elem as any).webkitRequestFullscreen();
                  }
                } catch (e) {}
              }}
            >
              {signature ? (
                <div className="w-full h-full relative">
                  <img 
                    src={signature} 
                    alt="Signature" 
                    className="object-contain w-full h-full p-2"
                  />
                  {/* Click to re-sign overlay (only visible when actively interacting) */}
                  <div className="absolute inset-0 bg-white/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <span className="bg-black/70 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">點擊重簽</span>
                  </div>
                </div>
              ) : (
                <span className="text-gray-400 text-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-xl">draw</span>
                  點擊此處全螢幕手機打橫
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Decorative corner cutouts for a "receipt" look */}
        <div className="absolute top-0 left-6 w-3 h-3 -mt-1.5 bg-[#FAFAFA] rounded-full shadow-inner"></div>
        <div className="absolute top-0 right-6 w-3 h-3 -mt-1.5 bg-[#FAFAFA] rounded-full shadow-inner"></div>
        <div className="absolute bottom-0 left-6 w-3 h-3 -mb-1.5 bg-[#FAFAFA] rounded-full shadow-inner"></div>
        <div className="absolute bottom-0 right-6 w-3 h-3 -mb-1.5 bg-[#FAFAFA] rounded-full shadow-inner"></div>
      </div>

      {isSigning && (
        <SignaturePad 
          onConfirm={(dataUrl) => {
            setSignature(dataUrl);
            setIsSigning(false);
            try {
              if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
              else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
            } catch (e) {}
          }}
          onCancel={() => {
            setIsSigning(false);
            try {
              if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
              else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
            } catch (e) {}
          }}
        />
      )}
    </div>
  );
});

ReceiptForm.displayName = "ReceiptForm";

export default ReceiptForm;
