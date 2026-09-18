"use client";

import React, { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import SignatureCanvas from "react-signature-canvas";

interface SignaturePadProps {
  onConfirm: (signatureDataUrl: string) => void;
  onCancel: () => void;
}

export default function SignaturePad({ onConfirm, onCancel }: SignaturePadProps) {
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // When mounted, match screen dimensions
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    
    // Prevent background scrolling and body scrolling
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    };
  }, []);

  const clear = () => {
    if (sigCanvas.current) {
      sigCanvas.current.clear();
    }
  };

  const confirm = () => {
    if (sigCanvas.current) {
      if (sigCanvas.current.isEmpty()) {
        alert("請先手寫簽名！");
        return;
      }
      // Get the image
      const dataUrl = sigCanvas.current.getTrimmedCanvas().toDataURL("image/png");
      onConfirm(dataUrl);
    }
  };

  if (dimensions.width === 0 || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] bg-white flex items-center justify-center overflow-hidden"
      style={{ touchAction: "none" }}
    >
      <div
        className="relative bg-white"
        style={{
          width: dimensions.width,
          height: dimensions.height,
        }}
      >
        <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
          <button
            onClick={onCancel}
            className="w-10 h-10 rounded-full bg-white shadow-md text-gray-600 flex items-center justify-center text-[24px]"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
          
          <div className="flex gap-4">
            <button
              onClick={clear}
              className="px-4 py-2 rounded-full bg-gray-100 text-gray-700 font-medium text-sm shadow-sm"
            >
              清除重寫
            </button>
            <button
              onClick={confirm}
              className="w-10 h-10 rounded-full bg-[#F39C12] shadow-md text-white flex items-center justify-center text-[24px]"
            >
              <span className="material-symbols-outlined">check</span>
            </button>
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <span className="text-4xl font-bold tracking-widest">請在此處簽名</span>
        </div>

        <SignatureCanvas
          ref={sigCanvas}
          penColor="black"
          canvasProps={{
            width: dimensions.width,
            height: dimensions.height,
            className: "signature-canvas",
          }}
          backgroundColor="rgba(255, 255, 255, 0)" // Transparent so we see the hint text
        />
        
        {/* Signature Line */}
        <div className="absolute bottom-1/4 left-10 right-10 border-b-2 border-gray-300 pointer-events-none border-dashed" />
      </div>
    </div>,
    document.body
  );
}
