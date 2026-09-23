"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useDynamicPermissions } from "@/hooks/useDynamicPermissions";
import { mutate } from "swr";
import HuntingTasksView, {
  HuntingTasksViewRef,
} from "@/components/HuntingTasksView";
import CommandCenter, { getCommandTabs } from "@/components/CommandCenter";
import ReceiptForm, { ReceiptFormRef } from "@/components/ReceiptForm";
import VersionGuard from "@/components/VersionGuard";
import AnimatedTabs from "@/components/AnimatedTabs";

// Mock Data
const projects = [
  {
    id: "P001",
    name: "徐公館裝修工程",
    location: "信義區, 台北",
    status: "進行中",
    progress: 65,
    crew: 34,
    milestone: "木作天花板封板",
    tag: "On Track",
    tagColor: "border border-[#E4E4E7] text-[#A1A1AA] bg-[#FAFAFA]",
  },
  {
    id: "P002",
    name: "微熱山丘裝修工程",
    location: "南投市, 南投",
    status: "待處理",
    progress: 10,
    crew: 12,
    milestone: "現場尺寸丈量",
    tag: "Pending",
    tagColor: "border border-[#E4E4E7] text-[#A1A1AA] bg-[#FAFAFA]",
  },
  {
    id: "P003",
    name: "A區防水補漏專案",
    location: "內湖區, 台北",
    status: "異常",
    progress: 45,
    crew: 8,
    milestone: "防水漆塗佈",
    tag: "Issue",
    tagColor: "border border-[#E4E4E7] text-[#A1A1AA] bg-[#FAFAFA]",
  },
];

const liveFeed = [
  {
    id: 1,
    name: "德霖",
    action: "完成「地下室鋼筋勘驗」",
    time: "15 分鐘前",
    project: "PRJ-A",
    icon: "done",
    iconColor: "text-[#F39C12]",
    iconBg: "bg-white border border-[#F39C12]/30 shadow-sm",
  },
  {
    id: 2,
    name: "阿剛",
    action: "新增 4 項任務至 PRJ-B",
    time: "1 小時前",
    project: "已指派",
    icon: "add",
    iconColor: "text-[#18181B]",
    iconBg: "bg-white border border-[#E4E4E7] shadow-sm",
  },
  {
    id: 3,
    name: "阿威",
    action: "晉升為 A 級獵人",
    time: "3 小時前",
    project: "戰力 +320",
    icon: "north",
    iconColor: "text-[#F39C12]",
    iconBg: "bg-white border border-[#F39C12]/30 shadow-sm",
  },
];

const allNavItems = [
  { id: "project_info", label: "專案情報", icon: "home", permKey: "專案情報" },
  {
    id: "schedule",
    label: "工進排程",
    icon: "calendar_today",
    permKey: "工進排程",
  },
  {
    id: "hunting_tasks",
    label: "狩獵任務",
    icon: "check_circle",
    permKey: "狩獵任務",
  },
  {
    id: "command_center",
    label: "指揮中心",
    icon: "grid_view",
    permKey: "指揮中心",
  },
];

const HUNTING_MGMT_PERM_KEYS = [
  "專案情報",
  "工進排程",
  "任務追蹤",
  "狩獵任務",
  "指揮中心",
];

const ManualCards = () => (
  <>
    <div className="bg-white rounded-3xl border border-[#E4E4E7] shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-4 px-6 bg-white text-center">
        <h2 className="text-[17px] font-bold text-[#18181B]">子任務</h2>
      </div>
      <hr className="border-[#E4E4E7] m-0" />
      {/* 上層：截圖說明區域 (Mock UI) */}
      <div className="p-4 bg-[#FAFAFA]/50 flex flex-col items-center">
        <div className="w-full max-w-[280px] bg-white rounded-2xl border border-[#E4E4E7] p-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          

          {/* Task 1 */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border-[1.5px] border-[#E4E4E7]"></div>
              <span className="text-[14px] text-[#A1A1AA]">1.</span>
              <span className="text-[15px] text-[#18181B] font-medium">
                新任務
              </span>
            </div>
            {/* Add Subtask Button - Highlighted */}
            <div className="relative">
              <div className="absolute inset-0 bg-[#F39C12] rounded-full animate-ping opacity-20"></div>
              <button className="w-8 h-8 rounded-full border-2 border-[#F39C12] text-[#F39C12] flex items-center justify-center relative z-10 bg-white shadow-[0_0_12px_rgba(243,156,18,0.2)]">
                <span
                  className="material-symbols-outlined text-[16px]"
                  style={{ fontVariationSettings: "'wght' 300" }}
                >
                  add
                </span>
              </button>
            </div>
          </div>

          {/* Subtask 1 */}
          <div className="flex items-center justify-between mb-3 pl-1">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[16px] text-[#D4D4D8]">
                drag_indicator
              </span>
              <div className="w-[18px] h-[18px] rounded-full border-[1.5px] border-[#E4E4E7]"></div>
              <span className="text-[14px] text-[#A1A1AA]">新子任務</span>
            </div>
            {/* Delete Subtask Button - Highlighted */}
            <div className="relative">
              <div className="absolute inset-0 bg-[#F39C12] rounded-full animate-ping opacity-20"></div>
              <button className="w-8 h-8 rounded-full border-2 border-[#F39C12] text-[#F39C12] flex items-center justify-center relative z-10 bg-white shadow-[0_0_12px_rgba(243,156,18,0.2)]">
                <span
                  className="material-symbols-outlined text-[16px]"
                  style={{ fontVariationSettings: "'wght' 300" }}
                >
                  remove
                </span>
              </button>
            </div>
          </div>

          {/* Task 2 */}
          <div className="flex items-center justify-between mb-1 opacity-50">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border-[1.5px] border-[#E4E4E7]"></div>
              <span className="text-[14px] text-[#A1A1AA]">2.</span>
              <span className="text-[15px] text-[#18181B] font-medium">
                新任務
              </span>
            </div>
            <button className="w-8 h-8 rounded-full flex items-center justify-center text-[#A1A1AA]">
              <span
                className="material-symbols-outlined text-[16px]"
                style={{ fontVariationSettings: "'wght' 300" }}
              >
                add
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 以水平線為界 */}
      <hr className="border-[#E4E4E7] m-0" />

      {/* 下層：文字說明區域 */}
      <div className="p-4 bg-white flex-1">
        <div className="space-y-3 text-[13px] leading-relaxed text-[#52525B]">
          <div>
            <p>
              <strong className="text-[#18181B] font-semibold text-[14px]">
                新增子任務
              </strong>
              <br />
              點擊主任務右側的
              <span className="inline-flex items-center justify-center w-[16px] h-[16px] rounded-full border-[1.2px] border-[#F39C12] text-[#F39C12] align-middle mx-1 bg-white shadow-[0_0_4px_rgba(243,156,18,0.15)] relative -top-[1px]">
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "10px",
                    fontVariationSettings: "'wght' 500",
                  }}
                >
                  add
                </span>
              </span>
              即可新增。
            </p>
          </div>
          <div>
            <p>
              <strong className="text-[#18181B] font-semibold text-[14px]">
                刪除子任務
              </strong>
              <br />
              點擊子任務右側的
              <span className="inline-flex items-center justify-center w-[16px] h-[16px] rounded-full border-[1.2px] border-[#F39C12] text-[#F39C12] align-middle mx-1 bg-white shadow-[0_0_4px_rgba(243,156,18,0.15)] relative -top-[1px]">
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "10px",
                    fontVariationSettings: "'wght' 500",
                  }}
                >
                  remove
                </span>
              </span>
              即可刪除。
            </p>
          </div>
        </div>
      </div>
    </div>

    {/* 第三張卡片：主任務操作說明 */}
    <div className="bg-white rounded-3xl border border-[#E4E4E7] shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-4 px-6 bg-white text-center">
        <h2 className="text-[17px] font-bold text-[#18181B]">主任務</h2>
      </div>
      <hr className="border-[#E4E4E7] m-0" />
      {/* 上層：截圖說明區域 (Mock UI) */}
      <div className="p-4 bg-[#FAFAFA]/50 flex flex-col items-center">
        <div className="w-full max-w-[280px] bg-white rounded-2xl border border-[#E4E4E7] p-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          

          {/* Task 5 (Dimmed) */}
          <div className="flex items-center justify-between mb-1 opacity-50">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border-[1.5px] border-[#E4E4E7]"></div>
              <span className="text-[14px] text-[#A1A1AA]">5.</span>
              <span className="text-[15px] text-[#18181B] font-medium">
                格局
              </span>
            </div>
            <button className="w-8 h-8 rounded-full flex items-center justify-center text-[#A1A1AA]">
              <span
                className="material-symbols-outlined text-[16px]"
                style={{ fontVariationSettings: "'wght' 300" }}
              >
                add
              </span>
            </button>
          </div>

          {/* Task 6 - Highlighted */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border-[1.5px] border-[#E4E4E7]"></div>
              <span className="text-[14px] text-[#A1A1AA]">6.</span>
              <span className="text-[15px] text-[#18181B] font-medium">
                新任務
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button className="w-8 h-8 rounded-full flex items-center justify-center text-[#A1A1AA]">
                <span
                  className="material-symbols-outlined text-[16px]"
                  style={{ fontVariationSettings: "'wght' 300" }}
                >
                  add
                </span>
              </button>
              <div className="relative">
                <div className="absolute inset-0 bg-[#F39C12] rounded-full animate-ping opacity-20"></div>
                <button className="w-8 h-8 rounded-full border-2 border-[#F39C12] text-[#F39C12] flex items-center justify-center relative z-10 bg-white shadow-[0_0_12px_rgba(243,156,18,0.2)]">
                  <span
                    className="material-symbols-outlined text-[16px]"
                    style={{ fontVariationSettings: "'wght' 300" }}
                  >
                    remove
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Add Main Task Button - Highlighted */}
          <div className="relative mt-2">
            <style>{`
                      @keyframes ping-shadow-orange {
                        0% { box-shadow: 0 0 0 0 rgba(243,156,18,0.3); }
                        75%, 100% { box-shadow: 0 0 0 16px rgba(243,156,18,0); }
                      }
                      .animate-ping-shadow {
                        animation: ping-shadow-orange 1s cubic-bezier(0, 0, 0.2, 1) infinite;
                      }
                    `}</style>
            <div className="absolute inset-0 rounded-2xl animate-ping-shadow"></div>
            <button className="w-full py-3.5 border-2 border-[#F39C12] border-dashed rounded-2xl flex items-center justify-center gap-2 text-[#F39C12] transition-colors relative z-10 bg-white shadow-[0_0_12px_rgba(243,156,18,0.2)]">
              <span
                className="material-symbols-outlined text-[16px]"
                style={{ fontVariationSettings: "'wght' 300" }}
              >
                add
              </span>
              <span className="text-[13px] font-bold tracking-wider">
                新增主任務
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 以水平線為界 */}
      <hr className="border-[#E4E4E7] m-0" />

      {/* 下層：文字說明區域 */}
      <div className="p-4 bg-white flex-1">
        <div className="space-y-3 text-[13px] leading-relaxed text-[#52525B]">
          <div>
            <p>
              <strong className="text-[#18181B] font-semibold text-[14px]">
                新增主任務
              </strong>
              <br />
              點擊清單最下方的
              <span className="inline-flex items-center justify-center h-[18px] px-1.5 rounded-[4px] border-[1.2px] border-dashed border-[#F39C12] text-[#F39C12] align-middle mx-1 bg-white shadow-[0_0_4px_rgba(243,156,18,0.15)] text-[11px] font-bold gap-0.5 relative -top-[1px]">
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "10px",
                    fontVariationSettings: "'wght' 500",
                  }}
                >
                  add
                </span>
                新增主任務
              </span>
              即可新增主任務。
            </p>
          </div>
          <div>
            <p>
              <strong className="text-[#18181B] font-semibold text-[14px]">
                刪除主任務
              </strong>
              <br />
              點擊主任務右側的
              <span className="inline-flex items-center justify-center w-[16px] h-[16px] rounded-full border-[1.2px] border-[#F39C12] text-[#F39C12] align-middle mx-1 bg-white shadow-[0_0_4px_rgba(243,156,18,0.15)] relative -top-[1px]">
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "10px",
                    fontVariationSettings: "'wght' 500",
                  }}
                >
                  remove
                </span>
              </span>
              即可刪除該筆任務。
            </p>
          </div>
        </div>
      </div>
    </div>

    {/* 第三張卡片：複製前週任務操作說明 */}
    <div className="bg-white rounded-3xl border border-[#E4E4E7] shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-4 px-6 bg-white text-center">
        <h2 className="text-[17px] font-bold text-[#18181B]">複製任務</h2>
      </div>
      <hr className="border-[#E4E4E7] m-0" />
      {/* 上層：截圖說明區域 (Mock UI) */}
      <div className="p-4 bg-[#FAFAFA]/50 flex flex-col items-center">
        <div className="w-full max-w-[280px] bg-white rounded-2xl border border-[#E4E4E7] p-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          

          {/* Tasks 4 to 5 */}
          {[4, 5].map((num) => (
            <div key={num} className={`flex items-center justify-between mb-1 ${num === 4 ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full border-[1.5px] border-[#E4E4E7]"></div>
                <span className="text-[14px] text-[#A1A1AA]">{num}.</span>
                <span className="text-[15px] text-[#18181B] font-medium">
                  {num === 4 ? "體能" : "格局"}
                </span>
              </div>
              <button className="w-8 h-8 rounded-full flex items-center justify-center text-[#A1A1AA]">
                <span
                  className="material-symbols-outlined text-[16px]"
                  style={{ fontVariationSettings: "'wght' 300" }}
                >
                  add
                </span>
              </button>
            </div>
          ))}

          {/* Add Main Task Button */}
          <div className="mt-2">
            <button className="w-full py-3.5 border-2 border-[#E4E4E7] border-dashed rounded-2xl flex items-center justify-center gap-2 text-[#A1A1AA] transition-colors bg-[#FAFAFA] opacity-50">
              <span
                className="material-symbols-outlined text-[16px]"
                style={{ fontVariationSettings: "'wght' 300" }}
              >
                add
              </span>
              <span className="text-[13px] font-bold tracking-wider">
                新增主任務
              </span>
            </button>
          </div>

          {/* Divider */}
          <hr className="border-[#E4E4E7] my-5" />

          {/* Bottom Stats & Copy Icon */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2 text-[11px] font-medium">
              <div className="flex items-center gap-1">
                <span className="text-[#F39C12] text-[13px] font-bold">0</span>{" "}
                <span className="text-[#A1A1AA]">完成</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[#18181B] text-[13px] font-bold">0</span>{" "}
                <span className="text-[#A1A1AA]">部分</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[#18181B] text-[13px] font-bold">0</span>{" "}
                <span className="text-[#A1A1AA]">未達</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[#A1A1AA] text-[13px] font-bold">5</span>{" "}
                <span className="text-[#A1A1AA]">待辦</span>
              </div>
            </div>
            {/* Copy Button - Highlighted */}
            <div className="relative shrink-0 ml-2">
              <div className="absolute inset-0 bg-[#F39C12] rounded-full animate-ping opacity-20"></div>
              <button className="w-8 h-8 rounded-full border-2 border-[#F39C12] text-[#F39C12] flex items-center justify-center relative z-10 bg-white shadow-[0_0_12px_rgba(243,156,18,0.2)]">
                <span
                  className="material-symbols-outlined text-[15px]"
                  style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}
                >
                  content_copy
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 以水平線為界 */}
      <hr className="border-[#E4E4E7] m-0" />

      {/* 下層：文字說明區域 */}
      <div className="p-4 bg-white flex-1">
        <div className="space-y-3 text-[13px] leading-relaxed text-[#52525B]">
          <div>
            <p>
              <strong className="text-[#18181B] font-semibold text-[14px]">
                複製前週任務
              </strong>
              <br />
              點擊卡片右下角的
              <span className="inline-flex items-center justify-center w-[16px] h-[16px] rounded-full border-[1.2px] border-[#F39C12] text-[#F39C12] align-middle mx-1 bg-white shadow-[0_0_4px_rgba(243,156,18,0.15)] relative -top-[1px]">
                <span
                  className="material-symbols-outlined text-[15px] scale-50"
                  style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}
                >
                  content_copy
                </span>
              </span>
              會跳出複製選單，您可依需求選擇複製模式。
            </p>
          </div>
          <div>
            <p>
              <strong className="text-[#18181B] font-semibold text-[14px]">
                複製主任務
              </strong>
              <br />
              點選選單中的
              <span className="inline-flex items-center justify-center h-[18px] px-1.5 rounded-[4px] border-[1.2px] border-solid border-[#F39C12] text-[#F39C12] align-middle mx-1 bg-white shadow-[0_0_4px_rgba(243,156,18,0.15)] text-[11px] font-bold gap-0.5 relative -top-[1px]">
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "10px",
                    fontVariationSettings: "'wght' 500",
                  }}
                >
                  format_list_bulleted
                </span>
                複製主任務
              </span>
              ：僅複製上一週的各項主任務。
            </p>
          </div>
          <div>
            <p>
              <strong className="text-[#18181B] font-semibold text-[14px]">
                複製全任務
              </strong>
              <br />
              點選選單中的
              <span className="inline-flex items-center justify-center h-[18px] px-1.5 rounded-[4px] border-[1.2px] border-solid border-[#F39C12] text-[#F39C12] align-middle mx-1 bg-white shadow-[0_0_4px_rgba(243,156,18,0.15)] text-[11px] font-bold gap-0.5 relative -top-[1px]">
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "10px",
                    fontVariationSettings: "'wght' 500",
                  }}
                >
                  notes
                </span>
                複製全任務
              </span>
              ：將上一週的「主任務與子任務」完整複製。
            </p>
          </div>
        </div>
      </div>
    </div>
    {/* 第四欄：移動與發送 (垂直堆疊) */}
    <div className="flex flex-col gap-4 h-full">

    {/* 第二張卡片：移動子任務操作說明 */}
    <div className="bg-white rounded-3xl border border-[#E4E4E7] shadow-sm overflow-hidden flex flex-col">
      <div className="p-4 px-6 bg-white text-center">
        <h2 className="text-[17px] font-bold text-[#18181B]">移動子任務</h2>
      </div>
      <hr className="border-[#E4E4E7] m-0" />
      {/* 上層：截圖說明區域 (Mock UI) */}
      <div className="p-4 bg-[#FAFAFA]/50 flex flex-col items-center">
        <div className="w-full max-w-[280px] bg-white rounded-2xl border border-[#E4E4E7] p-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          {/* Task 1 */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border-[1.5px] border-[#E4E4E7]"></div>
              <span className="text-[14px] text-[#A1A1AA]">1.</span>
              <span className="text-[15px] text-[#18181B] font-medium">新任務</span>
            </div>
            <button className="w-8 h-8 rounded-full flex items-center justify-center text-[#A1A1AA]">
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'wght' 300" }}>add</span>
            </button>
          </div>

          {/* Subtask 1 */}
          <div className="flex items-center justify-between mb-3 pl-1">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-7 h-7 rounded-[8px]">
                <div className="absolute inset-0 bg-[#F39C12] rounded-[8px] animate-ping opacity-20"></div>
                <div className="relative z-10 w-full h-full flex items-center justify-center border-2 border-[#F39C12] rounded-[8px] bg-white shadow-[0_0_12px_rgba(243,156,18,0.2)]">
                  <span className="material-symbols-outlined text-[18px] text-[#F39C12]">drag_indicator</span>
                </div>
              </div>
              <div className="w-[18px] h-[18px] rounded-full border-[1.5px] border-[#E4E4E7]"></div>
              <span className="text-[14px] text-[#A1A1AA]">新子任務</span>
            </div>
            <button className="w-8 h-8 rounded-full flex items-center justify-center text-[#A1A1AA]">
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'wght' 300" }}>remove</span>
            </button>
          </div>

          {/* Task 2 */}
          <div className="flex items-center justify-between mb-1 opacity-50">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border-[1.5px] border-[#E4E4E7]"></div>
              <span className="text-[14px] text-[#A1A1AA]">2.</span>
              <span className="text-[15px] text-[#18181B] font-medium">新任務</span>
            </div>
            <button className="w-8 h-8 rounded-full flex items-center justify-center text-[#A1A1AA]">
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'wght' 300" }}>add</span>
            </button>
          </div>
          
          {/* Task 3 */}
          <div className="flex items-center justify-between mb-1 opacity-50">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border-[1.5px] border-[#E4E4E7]"></div>
              <span className="text-[14px] text-[#A1A1AA]">3.</span>
              <span className="text-[15px] text-[#18181B] font-medium">新任務</span>
            </div>
            <button className="w-8 h-8 rounded-full flex items-center justify-center text-[#A1A1AA]">
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'wght' 300" }}>add</span>
            </button>
          </div>
        </div>
      </div>

      {/* 以水平線為界 */}
      <hr className="border-[#E4E4E7] m-0" />

      {/* 下層：文字說明區域 */}
      <div className="p-4 bg-white flex-1">
        <div className="space-y-3 text-[13px] leading-relaxed text-[#52525B]">
          <div>
            <p>
              <strong className="text-[#18181B] font-semibold text-[14px]">移動排序</strong><br />
              按住子任務左側的
              <span className="inline-flex items-center justify-center w-[16px] h-[16px] rounded-[4px] border-[1.2px] border-[#F39C12] text-[#F39C12] align-middle mx-1 bg-white shadow-[0_0_4px_rgba(243,156,18,0.15)] relative -top-[1px]">
                <span className="material-symbols-outlined" style={{ fontSize: "12px", fontVariationSettings: "'wght' 500" }}>drag_indicator</span>
              </span>
              圖示，即可上下拖曳調整順序。
            </p>
          </div>
        </div>
      </div>
    </div>
    {/* 第五張卡片：發送操作說明 */}
    <div className="bg-white rounded-3xl border border-[#E4E4E7] shadow-sm overflow-hidden flex flex-col">
      <div className="p-4 px-6 bg-white text-center">
        <h2 className="text-[17px] font-bold text-[#18181B]">匯出任務</h2>
      </div>
      <hr className="border-[#E4E4E7] m-0" />
      {/* 上層：截圖說明區域 (Mock UI) */}
      <div className="p-4 bg-[#FAFAFA]/50 flex flex-col items-center">
        <div className="w-full max-w-[280px] bg-white rounded-2xl border border-[#E4E4E7] p-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col gap-3">
            <div className="w-full flex items-center justify-center gap-3 bg-[#FAFAFA] text-[#18181B] rounded-2xl py-2.5 border border-[#E4E4E7]">
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'wght' 300" }}>content_copy</span>
              <span className="text-[15px] font-medium">複製內容</span>
            </div>
            <div className="w-full flex items-center justify-center gap-3 bg-[#06C755]/10 text-[#06C755] rounded-2xl py-2.5 font-medium text-[15px]">
              <div className="w-[20px] h-[20px] flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
                  <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 3.945 8.917 9.444 9.605.369.079.873.243.999.559.114.286.074.735.034 1.037l-.208 1.258c-.053.315-.246 1.206 1.056.657 1.303-.549 7.026-4.144 9.539-7.054 2.008-2.316 3.136-4.301 3.136-6.062z" />
                  <path fill="#FFFFFF" d="M7.75 12.83H6.18V8.45H5v5.44h2.75v-1.06zM9.46 13.89h-1.06V8.45h1.06v5.44zM14.54 13.89h-1.12l-1.92-3.18v3.18h-1.06V8.45h1.12l1.92 3.18V8.45h1.06v5.44zM18.89 9.51h-2.18v1.08h1.9v1.06h-1.9v1.18h2.18v1.06h-3.24V8.45h3.24v1.06z" />
                </svg>
              </div>
              LINE分享
            </div>
          </div>
        </div>
      </div>

      {/* 以水平線為界 */}
      <hr className="border-[#E4E4E7] m-0" />

      {/* 下層：文字說明區域 */}
      <div className="p-4 bg-white flex-1">
        <div className="space-y-3 text-[13px] leading-relaxed text-[#52525B]">
          <div>
            <p>
              <strong className="text-[#18181B] font-semibold text-[14px]">複製與分享</strong><br />
              點擊視窗右上角的分享
              <span className="inline-flex items-center justify-center w-[20px] h-[20px] rounded-full border-[1.2px] border-[#F39C12] text-[#F39C12] align-middle mx-1 bg-white shadow-[0_0_4px_rgba(243,156,18,0.15)] relative -top-[1px]">
                <span className="material-symbols-outlined" style={{ fontSize: "14px", fontVariationSettings: "'wght' 200" }}>ios_share</span>
              </span>
              圖示會跳出匯出選單，可選擇複製內容或直接LINE分享到群組。
            </p>
          </div>
        </div>
      </div>
    </div>
    </div>
  </>
);
export default function HuntingManagementPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { permissions } = useDynamicPermissions();
  const userName =
    permissions?.hunterName ||
    (session?.user as any)?.hunterName ||
    session?.user?.name ||
    "System Admin";
  const userEmail = session?.user?.email || "admin@sensesoil.tw";
  const userAvatar =
    session?.user?.image ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=F39C12&color=FFFFFF`;
  const roles: Record<string, string> =
    permissions?.roles || (session?.user as any)?.roles || {};

  // Check if user is admin (any role is admin)
  const isAdmin = Object.values(roles).some((r) => r === "admin");

  const hunterName =
    permissions?.hunterName || (session?.user as any)?.hunterName || "";

  // 財務只給管理層。權限表若加了「財務」欄就以該欄為準，
  // 還沒加欄位時退回 admin-only（保守，不會不小心外洩）。
  const canSeeFinance = (() => {
    const r = roles["財務"];
    if (r) return r === "admin" || r === "editor" || r === "user" || r === "viewer";
    return isAdmin;
  })();

  // 指揮中心的分頁：沒有財務權限就只有兩頁。分頁列與內容面板共用同一份清單。
  const commandTabs = getCommandTabs(canSeeFinance);

  // Filter nav items based on permissions
  const navItems = isAdmin
    ? allNavItems
    : allNavItems.filter((item) => {
        const role = roles[item.permKey];
        return role === "admin" || role === "editor" || role === "user" || role === "viewer";
      });

  const defaultNav = navItems.length > 0 ? navItems[0].id : "hunting_tasks";
  const [activeNav, setActiveNav] = useState(defaultNav);
  const [activeSubTab, setActiveSubTab] = useState("每週任務");
  const [commandTab, setCommandTab] = useState("定位定崗");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const shareRefMobile = useRef<HTMLDivElement>(null);
  const shareRefDesktop = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const tasksViewRef = useRef<HuntingTasksViewRef>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const swipeLocked = useRef(false); // locks to prevent vertical scroll from triggering swipe

  const [overscrollY, setOverscrollY] = useState(0);

  const [showNav, setShowNav] = useState(true);
  const lastScrollY = useRef(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showManual, setShowManual] = useState(false);

  // 子頁標題列是純白，狀態列要跟著白，否則會出現灰白斷層。
  // 主頁維持 #FAFAFA（與它自己的標題列同色），所以這裡要動態切換。
  //
  // iOS 讀取 theme-color 變更有延遲，實測「同一個值寫兩次」比只寫一次容易被它注意到，
  // 所以連續兩個影格各推一次（大小寫互換，屬性值有變才會觸發變更通知）。
  useEffect(() => {
    if (!showManual) return;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const original = meta.getAttribute("content");
    meta.setAttribute("content", "#FFFFFF");
    const r1 = requestAnimationFrame(() => {
      meta.setAttribute("content", "#ffffff");
      requestAnimationFrame(() => meta.setAttribute("content", "#FFFFFF"));
    });
    return () => {
      cancelAnimationFrame(r1);
      if (original) meta.setAttribute("content", original);
    };
  }, [showManual]);
  const [showOrgChart, setShowOrgChart] = useState(false);
  const receiptFormRef = useRef<ReceiptFormRef>(null);
  // 組織圖 iframe 只在開啟時掛載：避免 6MB 的架構圖頁在指揮中心背景持續輪詢拖慢畫面，
  // 也確保它的「適應螢幕」是在正確尺寸下算出來的（先滑入、尺寸穩定後才載入）。
  const [orgFrameMounted, setOrgFrameMounted] = useState(false);
  const [orgFrameLoaded, setOrgFrameLoaded] = useState(false);
  // 滑入動畫結束後才把被蓋住的主內容移出渲染樹，省下版面與合成層記憶體
  const [orgContentHidden, setOrgContentHidden] = useState(false);
  // 鎖死 iframe 高度：手機網址列收合會讓 fixed inset-0 的高度變動，
  // 架構圖頁收到 resize 就會重新定位／重新適應，縮放到一半就會「跳針」。
  const [orgViewportH, setOrgViewportH] = useState<number | null>(null);
  // 視窗變矮時把 iframe 往上位移（而不是改它的高度），底部控制列才不會被切掉，
  // 同時完全不會有 resize 傳進架構圖裡觸發重新定位。
  const [orgShiftY, setOrgShiftY] = useState(0);
  const orgLockedHRef = useRef<number | null>(null);

  // Swipe gesture handler for mobile sub-tab switching with real-time content sliding
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (activeNav !== "hunting_tasks") return;
      
      const target = e.target as HTMLElement;
      if (target.tagName.toLowerCase() === 'input' || target.tagName.toLowerCase() === 'textarea') {
        swipeLocked.current = true;
        setIsSwiping(false);
        return;
      }
      
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      swipeLocked.current = false;
      setIsSwiping(false);
    },
    [activeNav],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (
        activeNav !== "hunting_tasks" ||
        touchStartX.current === null ||
        touchStartY.current === null
      )
        return;

      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - touchStartY.current;

      // On first significant move, decide if it's horizontal or vertical
      if (!isSwiping && !swipeLocked.current) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
          // Vertical scroll — lock out swipe
          swipeLocked.current = true;
          return;
        }
        if (Math.abs(dx) > 10) {
          setIsSwiping(true);
        }
        return;
      }

      if (swipeLocked.current) return;

      const tabs = ["專案任務", "每週任務", "領款簽收"];
      const activeIdx = tabs.indexOf(activeSubTab);
      let clampedOffset = dx;
      // If on first tab, can't swipe right further; if on last, can't swipe left further
      if (activeIdx === 0 && dx > 0) clampedOffset = dx * 0.3; // rubber-band effect
      if (activeIdx === tabs.length - 1 && dx < 0) clampedOffset = dx * 0.3;

      setSwipeOffset(clampedOffset);
    },
    [activeNav, activeSubTab, isSwiping],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (activeNav !== "hunting_tasks" || touchStartX.current === null) {
        setSwipeOffset(0);
        setIsSwiping(false);
        return;
      }

      const diff = e.changedTouches[0].clientX - touchStartX.current;
      touchStartX.current = null;
      touchStartY.current = null;

      if (Math.abs(diff) > 60 && isSwiping) {
        const tabs = ["專案任務", "每週任務", "領款簽收"];
        const activeIdx = tabs.indexOf(activeSubTab);
        if (diff > 0 && activeIdx > 0) {
          setActiveSubTab(tabs[activeIdx - 1]);
        } else if (diff < 0 && activeIdx < tabs.length - 1) {
          setActiveSubTab(tabs[activeIdx + 1]);
        }
      }

      setSwipeOffset(0);
      setIsSwiping(false);
    },
    [activeNav, isSwiping],
  );

  // 組織圖覆蓋層開關：鎖住底層捲動、鎖定 iframe 高度、延後掛載 iframe。
  useEffect(() => {
    if (!showOrgChart) {
      // 主內容要立刻回來，滑出動畫期間才不會露出空白
      setOrgContentHidden(false);
      // 滑出動畫跑完再卸載，避免收合時畫面閃一下空白
      const t = window.setTimeout(() => {
        setOrgFrameMounted(false);
        setOrgFrameLoaded(false);
        setOrgViewportH(null);
        setOrgShiftY(0);
        orgLockedHRef.current = null;
      }, 320);
      return () => window.clearTimeout(t);
    }

    // 0) 狀態列底色跟著 theme-color 走（iOS 16+ 的 PWA 與 Android 都吃這個）。
    //
    //    先前的寫法是「開啟時才 document.createElement 一個 theme-color meta」，
    //    結果實機上要等 2～4 秒、甚至要轉一次螢幕才會變色。
    //    原因是 iOS 對新插入的 meta 反應很遲鈍，但對「既有 meta 的 content 變更」
    //    會立刻重畫。所以 layout.tsx 現在會固定輸出一個 theme-color，
    //    這裡只改它的值，不再建立元素。
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    const originalTheme = metaTheme?.getAttribute("content") ?? null;
    if (metaTheme) {
      metaTheme.setAttribute("content", "#18181B");
      // 保險：部分 iOS 版本要等下一個繪製影格才會去讀，
      // 這裡在下一影格再寫一次，把它推醒。
      requestAnimationFrame(() => {
        if (metaTheme.getAttribute("content") === "#18181B") {
          metaTheme.setAttribute("content", "#18181b");
        }
      });
    }

    // 1) 先量一次可視高度並固定下來，之後不隨網址列收合而變
    orgLockedHRef.current = window.innerHeight;
    setOrgViewportH(window.innerHeight);

    // 2) 鎖住底層頁面捲動：底層不動，手機網址列就不會在拖曳時收合，
    //    iframe 的高度也就不會被動變化
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
      overscrollBehavior: body.style.overscrollBehavior,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    // 3) 滑入動畫結束後才掛載 iframe：動畫期間不必合成 6MB 的頁面，
    //    而且架構圖首次「適應」時容器尺寸已經是最終值
    const mountT = window.setTimeout(() => {
      setOrgFrameMounted(true);
      setOrgContentHidden(true);
    }, 300);

    // 4) iOS Safari 會忽略 user-scalable=no，雙指放大架構圖時，外層整個 APP 頁面
    //    也會跟著被瀏覽器縮放、放開又彈回 —— 這就是「版面晃動跳針」。
    //    覆蓋層開啟期間把這幾個手勢事件擋掉，縮放就只會發生在架構圖自己身上。
    const blockGesture = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", blockGesture, { passive: false });
    document.addEventListener("gesturechange", blockGesture, { passive: false });
    document.addEventListener("gestureend", blockGesture, { passive: false });

    // 5) 視窗高度變動的處理原則：iframe 的高度「永遠不動」。
    //    任何尺寸變化傳進去，架構圖都會重新定位整張圖（它自己的 _onResize 行為），
    //    那就是跳針。變矮時改用位移把 iframe 往上推，讓底部的縮放列留在畫面內，
    //    被推到上面的部分會滑進標題列底下；轉向才真的重新量一次。
    let lastW = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth !== lastW) {
        // 轉向：寬度本來就變了，重新量高度無可避免
        lastW = window.innerWidth;
        orgLockedHRef.current = window.innerHeight;
        setOrgShiftY(0);
        setOrgViewportH(window.innerHeight);
        return;
      }
      const locked = orgLockedHRef.current;
      if (locked != null) setOrgShiftY(Math.max(0, locked - window.innerHeight));
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.clearTimeout(mountT);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
      document.removeEventListener("gestureend", blockGesture);
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      body.style.overscrollBehavior = prev.overscrollBehavior;
      window.scrollTo(0, scrollY);
      
      // 還原 theme-color（元素是 layout.tsx 固定輸出的，只還原值、不刪元素）
      if (metaTheme && originalTheme) {
        metaTheme.setAttribute("content", originalTheme);
      }
    };
  }, [showOrgChart]);

  // Set body background to #FAFAFA for this page only, revert to black on unmount
  useEffect(() => {
    const originalBackground = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#FAFAFA";
    return () => {
      document.body.style.backgroundColor = originalBackground || "black";
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // Auto-hide navigation logic
      if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
        setShowNav(false);
      } else {
        setShowNav(true);
      }
      lastScrollY.current = currentScrollY;

      // In iOS Safari, window.scrollY becomes negative during top bounce (pull-to-refresh)
      if (currentScrollY < 0) {
        setOverscrollY(-currentScrollY);
        // Trigger refresh if pulled down past a threshold
        if (currentScrollY < -80 && !isRefreshing) {
          setIsRefreshing(true);
          setTimeout(() => {
            mutate(() => true, undefined, { revalidate: true });
            setTimeout(() => setIsRefreshing(false), 500); // Reset spinner after half a second
          }, 800);
        }
      } else {
        setOverscrollY(0);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isRefreshing]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // On mobile, bottom sheets have their own full-screen backdrop to handle clicks outside
      if (window.innerWidth < 768) return;

      const isOutsideMobileShare =
        shareRefMobile.current &&
        !shareRefMobile.current.contains(event.target as Node);
      const isOutsideDesktopShare =
        shareRefDesktop.current &&
        !shareRefDesktop.current.contains(event.target as Node);
      if (shareRefMobile.current || shareRefDesktop.current) {
        if (
          (!shareRefMobile.current || isOutsideMobileShare) &&
          (!shareRefDesktop.current || isOutsideDesktopShare)
        ) {
          setIsShareOpen(false);
        }
      }

      if (
        settingsRef.current &&
        !settingsRef.current.contains(event.target as Node)
      ) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCopy = () => {
    if (activeSubTab === "專案任務") {
      alert("專案任務功能開發中，目前尚未有資料可供分享！");
      setIsShareOpen(false);
      return;
    }

    if (tasksViewRef.current) {
      try {
        const text = tasksViewRef.current.getShareText();
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setIsShareOpen(false);
            alert("已複製當週與下週的任務資料！");
          })
          .catch((err) => {
            console.error("Failed to copy text: ", err);
          });
      } catch (err: any) {
        alert(err.message);
        setIsShareOpen(false);
      }
    }
  };

  const handleShareLine = () => {
    if (activeSubTab === "專案任務") {
      alert("專案任務功能開發中，目前尚未有資料可供分享！");
      setIsShareOpen(false);
      return;
    }

    if (tasksViewRef.current) {
      try {
        const text = tasksViewRef.current.getShareText();
        window.location.href = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;
        setIsShareOpen(false);
      } catch (err: any) {
        alert(err.message);
        setIsShareOpen(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans selection:bg-[#F39C12]/20 flex flex-col md:flex-row pb-20 md:pb-0 relative">
      {/* 下拉更新指示器。
          基準點放在 header 分割線（118px）上，靜止時用負位移把自己藏到 header 底下
          （z-30 < header 的 z-40，所以被不透明的 header 蓋住），
          下拉時才從分割線下方滑出來。
          樣式是極簡細環：淡橘色軌道 + 稍深的弧，無底色無陰影。 */}
      <div
        className="fixed left-0 right-0 z-[30] flex items-center justify-center pointer-events-none md:hidden"
        style={{
          top: 118,
          transform: `translateY(${
            isRefreshing ? 18 : Math.min(overscrollY * 0.7, 56) - 30
          }px)`,
          opacity: overscrollY > 6 || isRefreshing ? 1 : 0,
          transition: isRefreshing
            ? "transform 0.25s ease, opacity 0.2s ease"
            : "opacity 0.2s ease",
        }}
      >
        <div
          className={`w-[22px] h-[22px] rounded-full border-2 ${
            isRefreshing ? "animate-spin" : ""
          }`}
          style={{
            borderColor: "rgba(243,156,18,0.18)",
            borderTopColor: "rgba(243,156,18,0.7)",
            // 轉圈動畫本身就吃 transform，所以更新中不要再自己設
            transform: isRefreshing ? undefined : `rotate(${overscrollY * 4}deg)`,
          }}
        />
      </div>

      {/* Left Sidebar (Desktop Only) */}
      <aside
        className={`hidden md:flex flex-col bg-[#FAFAFA] border-r border-[#E4E4E7]/60 h-screen sticky top-0 shrink-0 z-50 transition-[width] duration-300 ease-in-out overflow-x-hidden ${isSidebarCollapsed ? "w-[72px]" : "w-[240px]"}`}
      >
        {/* Row 1: Logo & Toggle — aligned with title row */}
        <div className="h-[70px] flex items-end pb-[14px] pl-[17.5px] shrink-0 overflow-hidden relative w-full">
          <div
            className="flex items-end gap-3 cursor-pointer shrink-0 relative"
            onClick={() =>
              isSidebarCollapsed
                ? setIsSidebarCollapsed(false)
                : router.push("/diversion")
            }
          >
            <div className="w-[35px] h-[35px] flex items-center justify-center shrink-0 relative group">
              <img
                src="/Logo｜Orange.svg"
                alt="SENSESOIL"
                className={`w-full h-full object-contain ${isSidebarCollapsed ? "block group-hover:hidden" : "block"}`}
              />
              {/* Expand Icon (only visible when collapsed and hovered) */}
              <div
                className={`absolute inset-0 items-center justify-center text-[#52525B] hover:text-[#18181B] ${isSidebarCollapsed ? "hidden group-hover:flex" : "hidden"}`}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="translate-y-[2px]"
                >
                  <rect
                    x="1"
                    y="1"
                    width="18"
                    height="18"
                    rx="4"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                  <line
                    x1="7.5"
                    y1="1"
                    x2="7.5"
                    y2="19"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                  <path
                    d="M10.5 7.5L13.5 10L10.5 12.5"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarCollapsed(true)}
            className={`text-[#A1A1AA] hover:text-[#18181B] transition-opacity duration-300 p-1 shrink-0 absolute right-4 bottom-[13px] ${isSidebarCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"}`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                x="1"
                y="1"
                width="18"
                height="18"
                rx="4"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <line
                x1="7.5"
                y1="1"
                x2="7.5"
                y2="19"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <path
                d="M14 7.5L11.5 10L14 12.5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Row 2: Search Bar — h-[48px] to align with sub-tabs row */}
        <div className="h-[48px] flex items-center shrink-0 overflow-hidden relative w-full px-4">
          <div
            className="relative group flex items-center transition-all duration-300 bg-[#F4F4F5] h-9 shrink-0 focus-within:bg-white overflow-hidden"
            style={{
              width: isSidebarCollapsed ? "38px" : "100%",
              borderRadius: isSidebarCollapsed ? "19px" : "12px",
              cursor: isSidebarCollapsed ? "pointer" : "text",
            }}
            onClick={() => {
              if (isSidebarCollapsed) setIsSidebarCollapsed(false);
            }}
          >
            <span
              className="material-symbols-outlined absolute text-[13px] text-[#A1A1AA] group-focus-within:text-[#F39C12] transition-colors duration-300 left-[19px] -translate-x-1/2"
              style={{ fontVariationSettings: "'wght' 200" }}
            >
              search
            </span>
            <input
              type="text"
              placeholder=""
              className={`bg-transparent outline-none border-none text-[#18181B] text-[13px] h-full transition-all duration-300 placeholder:text-[#A1A1AA] absolute right-0 focus:ring-0 ${isSidebarCollapsed ? "w-0 opacity-0 pr-0" : "w-[calc(100%-38px)] opacity-100 pr-4"}`}
              readOnly={isSidebarCollapsed}
            />
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto scrollbar-hide overflow-x-hidden flex flex-col">
          {/* Navigation */}
          <nav className="pt-4 flex flex-col gap-0.5 px-4 pb-4 relative w-full">
            {navItems.map((item) => {
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className={`w-full flex items-center h-9 rounded-[12px] transition-colors relative outline-none shrink-0 ${
                    isActive
                      ? "bg-[#F4F4F5] text-[#18181B]"
                      : "text-[#71717A] hover:bg-[#F4F4F5]/60 hover:text-[#18181B]"
                  } px-2`}
                >
                  {/* Orange indicator on the divider line */}
                  {isActive && (
                    <div className="absolute top-1/2 -translate-y-1/2 w-[2px] h-[18px] bg-[#F39C12] rounded-l-full shadow-[0_0_6px_rgba(243,156,18,0.4)] -right-[16px]"></div>
                  )}
                  <div className="w-[22px] h-[22px] flex items-center justify-center shrink-0">
                    <span
                      className={`material-symbols-outlined transition-colors shrink-0 ${item.icon === "home" ? "text-[15px]" : "text-[13px]"}`}
                      style={{
                        fontVariationSettings: isActive
                          ? "'FILL' 1, 'wght' 200"
                          : "'wght' 200",
                      }}
                    >
                      {item.icon}
                    </span>
                  </div>
                  <span
                    className={`text-[12px] font-medium whitespace-nowrap tracking-wide transition-all duration-300 overflow-hidden text-left ${isSidebarCollapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[150px] opacity-100 ml-3"}`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Profile / Settings (Bottom Left) */}
        <div className="shrink-0 border-t border-[#E4E4E7]/60 py-4 px-4 relative w-full">
          <div className="relative w-full shrink-0" ref={settingsRef}>
            <div
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="flex items-center w-full rounded-[12px] py-1.5 transition-colors cursor-pointer outline-none hover:bg-[#F4F4F5] shrink-0"
              style={{
                paddingLeft: isSidebarCollapsed ? "4px" : "3px",
                paddingRight: isSidebarCollapsed ? "4px" : "3px",
                transition: "padding 300ms ease-in-out",
              }}
              role="button"
              tabIndex={0}
            >
              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-[#E4E4E7]">
                <img
                  src={userAvatar}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              </div>
              <div
                className={`flex flex-col min-w-0 transition-all duration-300 overflow-hidden whitespace-nowrap text-left ${isSidebarCollapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[150px] opacity-100 ml-0.5"}`}
              >
                <span className="text-[13px] font-medium text-[#18181B] leading-tight">
                  {userName}
                </span>
                <span className="text-[11px] text-[#A1A1AA]">{userEmail}</span>
              </div>
            </div>

            {isSettingsOpen && (
              <div
                className={`absolute bottom-full mb-2 bg-white border border-[#E4E4E7] rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] py-2 z-50 left-0 ${isSidebarCollapsed ? "w-48" : "w-[200px]"}`}
              >
                <div className="px-4 py-2 border-b border-[#E4E4E7]/60 mb-1">
                  <p className="text-sm font-semibold text-[#18181B]">
                    {userName}
                  </p>
                  <p className="text-[11px] text-[#A1A1AA]">{userEmail}</p>
                </div>
                <button className="w-full text-left px-4 py-2.5 text-sm text-[#18181B] hover:bg-[#FAFAFA] flex items-center gap-3 transition-colors outline-none focus-visible:bg-[#FAFAFA]">
                  <span
                    className="material-symbols-outlined text-[13px] text-[#A1A1AA]"
                    style={{ fontVariationSettings: "'wght' 200" }}
                  >
                    person
                  </span>
                  個人設定
                </button>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors outline-none focus-visible:bg-red-50"
                >
                  <span
                    className="material-symbols-outlined text-[13px] text-red-500"
                    style={{ fontVariationSettings: "'wght' 200" }}
                  >
                    logout
                  </span>
                  登出
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      {/* 組織圖開啟時把主內容移出渲染樹：它整個被覆蓋層蓋住，留著只是白白佔用
          版面與合成層記憶體。組織圖的 iframe 本身就很吃記憶體，iOS 在接近上限時
          會直接把 WebView 殺掉，能省一點是一點。
          等滑入動畫跑完才隱藏，否則動畫期間旁邊會出現空白。 */}
      {/* 手機版 header 是 fixed（才能在下拉時固定不動、讓內容從它底下滑出），
          fixed 會脫離文件流，必須補回它佔掉的 118px（Row1 70 + Row2 48），
          否則內容會被壓在 header 底下、文件高度也會少一截而幾乎捲不動。
          桌機版 header 是 sticky、仍在流程內，所以 md 以上不需要補。 */}
      <main
        className={`flex-1 flex flex-col min-w-0 pt-[118px] md:pt-0 ${
          orgContentHidden ? "hidden" : ""
        }`}
      >
        {/* Row 1: Title + Avatar — aligned with sidebar logo row */}
        <header className="fixed md:sticky top-0 left-0 right-0 md:left-auto md:right-auto w-full z-40 bg-[#FAFAFA]">
          <div className="h-[70px] px-6 lg:px-10 flex items-end pb-[14px] justify-between">
            {/* Mobile Logo & Title */}
            <div
              className="flex md:hidden items-end gap-3 cursor-pointer"
              onClick={() => router.push("/diversion")}
            >
              <div className="w-[35px] h-[35px] flex items-center justify-center">
                <img
                  src="/Logo｜Orange.svg"
                  alt="SENSESOIL"
                  className="w-full h-full object-contain"
                />
              </div>
              <h1 className="text-[22px] font-semibold text-[#18181B] tracking-tight leading-none mb-[2px]">
                {navItems.find((item) => item.id === activeNav)?.label}
              </h1>
            </div>
            {/* Page Title */}
            <div className="hidden md:flex items-end">
              <h1 className="text-[22px] font-semibold text-[#18181B] tracking-tight leading-none mb-[2px]">
                {navItems.find((item) => item.id === activeNav)?.label}
              </h1>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1 md:gap-3 translate-y-[5px]">
              {/* Mobile Share Button (Hidden on Desktop) */}
              <div className="relative md:hidden" ref={shareRefMobile}>
                <button
                  onClick={() => {
                    if (activeNav === "hunting_tasks" && activeSubTab === "領款簽收") {
                      receiptFormRef.current?.shareReceipt();
                    } else {
                      setIsShareOpen(!isShareOpen);
                    }
                  }}
                  className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${isShareOpen ? "bg-[#F4F4F5] text-[#18181B]" : "hover:bg-[#F4F4F5] text-[#71717A]"}`}
                  title="分享"
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={{ fontVariationSettings: "'wght' 200" }}
                  >
                    ios_share
                  </span>
                </button>
              </div>

              <button className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F4F4F5] transition-all text-[#71717A] hover:text-[#18181B] relative outline-none">
                <span
                  className="material-symbols-outlined text-[20px]"
                  style={{ fontVariationSettings: "'wght' 200" }}
                >
                  notifications_none
                </span>
              </button>

              {/* Mobile Avatar */}
              <div className="relative md:hidden">
                <div
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center cursor-pointer ring-2 ring-transparent hover:ring-[#E4E4E7] outline-none transition-all"
                  role="button"
                  tabIndex={0}
                >
                  <img
                    src={userAvatar}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Sub-tabs — aligned with sidebar search bar row */}
          <div className="h-[48px] px-6 lg:px-10 flex items-center justify-between border-b border-[#E4E4E7]/60">
            <div className="flex items-center">
              {/* 指揮中心的分頁列：與狩獵任務用同一組樣式與位置 */}
              {activeNav === "command_center" && (
                <AnimatedTabs
                  tabs={commandTabs}
                  activeTab={commandTab}
                  onTabChange={setCommandTab}
                />
              )}

              {activeNav === "hunting_tasks" &&
                (() => {
                  const tabs = ["專案任務", "每週任務", "領款簽收"];
                  return (
                    <AnimatedTabs
                      tabs={tabs}
                      activeTab={activeSubTab}
                      onTabChange={setActiveSubTab}
                      showManual={showManual}
                      onManualChange={setShowManual}
                    />
                  );
                })()}
            </div>
            <div className="flex items-center gap-1">
              {activeNav === "hunting_tasks" && activeSubTab === "每週任務" && (
                <button
                  onClick={() => setShowManual(!showManual)}
                  className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${showManual ? "text-[#F39C12] bg-[#F39C12]/10" : "text-[#71717A] hover:bg-[#F4F4F5]"}`}
                  title="如何操作"
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={{ fontVariationSettings: "'wght' 200" }}
                  >
                    help
                  </span>
                </button>
              )}

              {/* Desktop Share Button (Hidden on Mobile) */}
              <div className="relative hidden md:block" ref={shareRefDesktop}>
                <button
                  onClick={() => {
                    if (activeNav === "hunting_tasks" && activeSubTab === "領款簽收") {
                      receiptFormRef.current?.shareReceipt();
                    } else {
                      setIsShareOpen(!isShareOpen);
                    }
                  }}
                  className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${isShareOpen ? "bg-[#F4F4F5] text-[#18181B]" : "hover:bg-[#F4F4F5] text-[#71717A]"}`}
                  title="分享"
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={{ fontVariationSettings: "'wght' 200" }}
                  >
                    ios_share
                  </span>
                </button>

                {isShareOpen && (
                  <div className="absolute right-0 top-10 w-48 bg-white border border-[#E4E4E7] rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] py-2 z-50">
                    <button
                      onClick={handleCopy}
                      className="w-full text-left px-4 py-2.5 text-sm text-[#18181B] hover:bg-[#FAFAFA] flex items-center gap-3 transition-colors outline-none focus-visible:bg-[#FAFAFA]"
                    >
                      <span
                        className="material-symbols-outlined text-[18px] text-[#A1A1AA]"
                        style={{ fontVariationSettings: "'wght' 200" }}
                      >
                        content_copy
                      </span>
                      複製內容
                    </button>
                    <button
                      onClick={handleShareLine}
                      className="w-full text-left px-4 py-2.5 text-sm text-[#18181B] hover:bg-[#FAFAFA] flex items-center gap-3 transition-colors outline-none focus-visible:bg-[#FAFAFA]"
                    >
                      <svg
                        className="w-[18px] h-[18px] text-[#06C755]"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 3.945 8.917 9.444 9.605.369.079.873.243.999.559.114.286.074.735.034 1.037l-.208 1.258c-.053.315-.246 1.206 1.056.657 1.303-.549 7.026-4.144 9.539-7.054 2.008-2.316 3.136-4.301 3.136-6.062z" />
                        <path
                          fill="#FFFFFF"
                          d="M7.75 12.83H6.18V8.45H5v5.44h2.75v-1.06zM9.46 13.89h-1.06V8.45h1.06v5.44zM14.54 13.89h-1.12l-1.92-3.18v3.18h-1.06V8.45h1.12l1.92 3.18V8.45h1.06v5.44zM18.89 9.51h-2.18v1.08h1.9v1.06h-1.9v1.18h2.18v1.06h-3.24V8.45h3.24v1.06z"
                        />
                      </svg>
                      分享至 LINE
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>


        {/* Content Container */}
        <div
          className="flex-1 w-full flex flex-col gap-6 pt-6 pb-4"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Mobile Search Bar */}
          {/* 指揮中心不顯示這個搜尋列：它不搜尋任何東西，
              真正需要搜尋的制度／SOP 清單各自內建 */}
          {!(activeNav === "hunting_tasks" && (activeSubTab === "每週任務" || activeSubTab === "領款簽收")) &&
            activeNav !== "command_center" && (
            <div className="px-6 md:hidden">
              <div className="relative group w-full">
                <span
                  className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-[#A1A1AA] group-focus-within:text-[#F39C12] transition-colors"
                  style={{ fontVariationSettings: "'wght' 200" }}
                >
                  search
                </span>
                <input
                  type="text"
                  placeholder=""
                  className="w-full bg-[#FFFFFF] border border-[#E4E4E7] shadow-[0_2px_10px_rgba(0,0,0,0.02)] focus:border-[#F39C12] focus:ring-1 focus:ring-[#F39C12] text-[#18181B] text-[14px] rounded-full pl-11 pr-4 h-11 outline-none transition-all placeholder:text-[#A1A1AA]"
                />
              </div>
            </div>
          )}

          {activeNav === "hunting_tasks" ? (
            /* ============ Sliding Panel Container ============ */
            <div className="flex-1 overflow-hidden relative">
              <div
                className="flex w-[300%] md:w-full h-full md:!transform-none"
                style={{
                  transform:
                    activeSubTab === "領款簽收"
                      ? `translateX(calc(-66.666% + ${swipeOffset}px))`
                      : activeSubTab === "每週任務"
                      ? `translateX(calc(-33.333% + ${swipeOffset}px))`
                      : `translateX(${swipeOffset}px)`,
                  transition: isSwiping
                    ? "none"
                    : "transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)",
                }}
              >
                {/* Panel 1: 專案任務 */}
                <div
                  className={`w-1/3 md:w-full flex-shrink-0 transition-[height] duration-300 ${activeSubTab !== "專案任務" ? "h-0 overflow-hidden md:h-auto md:overflow-visible md:hidden" : "h-auto md:h-full"}`}
                >
                  <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh]">
                    <span
                      className="material-symbols-outlined text-[48px] text-[#E4E4E7] mb-4"
                      style={{ fontVariationSettings: "'wght' 200" }}
                    >
                      construction
                    </span>
                    <p className="text-[#A1A1AA] text-sm tracking-widest font-medium">
                      設計施工中
                    </p>
                  </div>
                </div>
                {/* Panel 2: 每週任務 */}
                <div
                  className={`w-1/3 md:w-full flex-shrink-0 transition-[height] duration-300 ${activeSubTab !== "每週任務" ? "h-0 overflow-hidden md:h-auto md:overflow-visible md:hidden" : "h-auto md:h-full"}`}
                >
                  <div className="px-6 lg:px-10 pb-20 w-full h-full flex flex-col">
                    <div className={`flex-1 ${showManual ? "md:hidden" : ""}`}>
                      <HuntingTasksView ref={tasksViewRef} />
                    </div>
                    {showManual && (
                      <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-6 flex-1 w-full items-stretch pt-2 pb-6">
                        <ManualCards />
                      </div>
                    )}
                  </div>
                </div>
                {/* Panel 3: 領款簽收 */}
                <div
                  className={`w-1/3 md:w-full flex-shrink-0 transition-[height] duration-300 ${activeSubTab !== "領款簽收" ? "h-0 overflow-hidden md:h-auto md:overflow-visible md:hidden" : "h-auto md:h-full"}`}
                >
                  <div className="px-6 lg:px-10 pb-20 w-full h-full flex flex-col overflow-y-auto scrollbar-hide">
                    <div className="flex-1 max-w-3xl mx-auto w-full">
                      <ReceiptForm ref={receiptFormRef} />
                    </div>
                  </div>
                </div>
                {/* 簽收表單臨時入口 */}
              </div>
            </div>
          ) : activeNav === "command_center" ? (
            <CommandCenter
              onOpenOrgChart={() => setShowOrgChart(true)}
              hunterName={hunterName}
              canSeeFinance={canSeeFinance}
              activeTab={commandTab}
              onTabChange={setCommandTab}
            />
          ) : (
            /* ============ Default Dashboard View ============ */
            <>
              {/* 4-Column Grid */}
              <div className="px-6 lg:px-10 grid grid-cols-1 lg:grid-cols-4 gap-2">
                {/* Col 1: Portfolio Rank -> Task Status */}
                <div className="lg:col-span-1 flex flex-col gap-4">
                  <div className="bg-transparent md:bg-[#FFFFFF] p-0 md:p-5 rounded-[24px] border-none md:border-solid md:border-[#E4E4E7] shadow-none md:shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex flex-col h-full">
                    <div className="hidden md:block mb-5">
                      <h3 className="font-semibold text-[17px] text-[#18181B]">
                        任務狀態
                      </h3>
                    </div>

                    <div className="hidden md:flex flex-col items-center justify-center mb-6 mt-2">
                      <span className="text-[72px] leading-none font-light tracking-tighter text-[#1d1d1f]">
                        5
                      </span>
                      <span className="text-gray-400 text-sm font-bold tracking-widest mt-2">
                        今天
                      </span>
                    </div>

                    {/* Desktop View: List */}
                    <div className="hidden md:flex flex-col gap-3.5 pt-4 border-t border-[#E4E4E7]/60">
                      {[
                        { label: "待辦", count: 12, icon: "note" },
                        { label: "緊急", count: 2, icon: "error" },
                        { label: "重要", count: 8, icon: "bookmark" },
                        { label: "超時", count: 1, icon: "schedule" },
                        { label: "完成", count: 24, icon: "check_circle" },
                      ].map((item, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center group cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 text-[#A1A1AA] group-hover:text-[#F39C12] transition-colors">
                            <span
                              className="material-symbols-outlined text-[16px]"
                              style={{ fontVariationSettings: "'wght' 200" }}
                            >
                              {item.icon}
                            </span>
                            <span className="text-[12px] font-medium uppercase tracking-widest">
                              {item.label}
                            </span>
                          </div>
                          <span className="text-[14px] font-bold text-[#18181B] group-hover:text-[#F39C12] transition-colors">
                            {item.count}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Mobile View: Minimalist Grid */}
                    <div className="grid md:hidden grid-cols-2 gap-2">
                      {[
                        { label: "今天", count: 5, icon: "calendar_today" },
                        { label: "待辦", count: 12, icon: "note" },
                        { label: "緊急", count: 2, icon: "error" },
                        { label: "重要", count: 8, icon: "bookmark" },
                        { label: "超時", count: 1, icon: "schedule" },
                        { label: "完成", count: 24, icon: "check_circle" },
                      ].map((item, idx) => (
                        <button
                          key={idx}
                          className="relative overflow-hidden rounded-[14px] p-3 shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-[#E4E4E7] flex flex-col justify-between h-[76px] bg-white text-left outline-none hover:border-[#F39C12]/50 transition-colors group"
                        >
                          <div className="flex justify-between items-start w-full">
                            <span
                              className="material-symbols-outlined text-[20px] text-[#A1A1AA] group-hover:text-[#F39C12] transition-colors"
                              style={{ fontVariationSettings: "'wght' 200" }}
                            >
                              {item.icon}
                            </span>
                            <span className="text-[24px] font-bold leading-none text-[#18181B] tracking-tight">
                              {item.count}
                            </span>
                          </div>
                          <span className="font-semibold text-[10px] text-[#A1A1AA] uppercase tracking-widest mt-1">
                            {item.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Col 2 & 3: Active Projects List */}
                <div className="lg:col-span-2 flex flex-col gap-2">
                  {/* Mobile Section Title Outside Panel */}
                  <div className="md:hidden px-2 pt-5 pb-1">
                    <h2 className="font-bold text-[24px] text-[#1d1d1f]">
                      專案列表
                    </h2>
                  </div>

                  <div className="bg-[#FFFFFF] p-5 rounded-[24px] border border-[#E4E4E7] shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex flex-col h-full">
                    {/* Desktop Section Title Inside Panel */}
                    <div className="hidden md:block mb-5">
                      <h3 className="font-semibold text-[17px] text-[#18181B]">
                        專案列表
                      </h3>
                    </div>

                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-4 pb-3 border-b border-dashed border-[#E4E4E7] text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-widest">
                      <div className="col-span-4">專案</div>
                      <div className="col-span-2 text-center">狀態</div>
                      <div className="col-span-3">進度</div>
                      <div className="col-span-3">下一步里程碑</div>
                    </div>

                    {/* Table Rows */}
                    <div className="flex flex-col pt-3 gap-0">
                      {projects.map((p, idx) => (
                        <div
                          key={p.id}
                          className={`grid grid-cols-12 gap-4 items-center group cursor-pointer py-4 ${idx !== projects.length - 1 ? "border-b border-dashed border-[#E4E4E7]" : ""}`}
                        >
                          <div className="col-span-4 flex flex-col">
                            <span className="text-[14px] font-semibold text-[#18181B] group-hover:text-[#F39C12] transition-colors">
                              {p.name}
                            </span>
                            <span className="text-[11px] text-[#A1A1AA] flex items-center gap-1 mt-0.5 uppercase tracking-wide">
                              <span
                                className="material-symbols-outlined text-[12px]"
                                style={{ fontVariationSettings: "'wght' 200" }}
                              >
                                pin_drop
                              </span>
                              {p.location}
                            </span>
                          </div>

                          <div className="col-span-2 flex justify-center">
                            <span
                              className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest ${p.tagColor}`}
                            >
                              {p.tag}
                            </span>
                          </div>

                          <div className="col-span-3 flex items-center gap-3">
                            <div className="w-full bg-[#F4F4F5] rounded-full h-1 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[#F39C12]"
                                style={{ width: `${p.progress}%` }}
                              ></div>
                            </div>
                            <span className="text-[10px] font-bold text-[#A1A1AA] w-8">
                              {p.progress}%
                            </span>
                          </div>

                          <div className="col-span-3 flex items-center justify-between">
                            <span className="text-[12px] text-[#A1A1AA] font-medium truncate">
                              {p.milestone}
                            </span>
                            <div className="flex items-center gap-1 text-[#A1A1AA]">
                              <span
                                className="material-symbols-outlined text-[14px]"
                                style={{ fontVariationSettings: "'wght' 200" }}
                              >
                                people
                              </span>
                              <span className="text-[11px] font-semibold">
                                {p.crew}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Col 4: Recent Activity (LIVE) */}
                <div className="lg:col-span-1 flex flex-col gap-2">
                  <div className="bg-[#FFFFFF] p-5 rounded-[24px] border border-[#E4E4E7] shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex flex-col">
                    <div className="flex justify-between items-center mb-5">
                      <h3 className="font-semibold text-[17px] text-[#18181B]">
                        近期戰報
                      </h3>
                      <span className="text-[10px] font-bold tracking-widest text-[#A1A1AA] uppercase">
                        Live
                      </span>
                    </div>

                    <div className="flex flex-col gap-5">
                      {liveFeed.map((feed) => (
                        <div
                          key={feed.id}
                          className="flex gap-4 items-start group"
                        >
                          <div
                            className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${feed.iconBg}`}
                          >
                            <span
                              className={`material-symbols-outlined text-[16px] ${feed.iconColor}`}
                              style={{ fontVariationSettings: "'wght' 200" }}
                            >
                              {feed.icon}
                            </span>
                          </div>
                          <div className="flex flex-col pt-0.5">
                            <p className="text-[13px] text-[#18181B] font-medium leading-tight mb-1">
                              <span className="font-semibold">{feed.name}</span>{" "}
                              <span className="text-[#A1A1AA]">
                                {feed.action}
                              </span>
                            </p>
                            <p className="text-[10px] uppercase tracking-widest text-[#A1A1AA] font-semibold">
                              {feed.time} · {feed.project}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button className="mt-6 w-full py-2.5 rounded-full border border-[#E4E4E7] text-[11px] uppercase tracking-widest font-bold text-[#18181B] hover:bg-[#F4F4F5] transition-colors outline-none">
                      View All
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Mobile Floating Bottom Navigation */}
      <div
        className={`md:hidden fixed bottom-6 left-0 right-0 z-50 flex items-center justify-center gap-4 pointer-events-none transition-transform duration-300 ${showNav ? "translate-y-0" : "translate-y-[150%]"}`}
      >
        {/* Navigation Pill */}
        <div className="bg-white/90 backdrop-blur-xl border border-[#E4E4E7] shadow-[0_8px_30px_rgba(0,0,0,0.12)] rounded-full p-1.5 flex items-center gap-1 pointer-events-auto">
          {navItems.map((item) => {
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`w-[42px] h-[42px] flex items-center justify-center rounded-full transition-all outline-none ${
                  isActive
                    ? "text-[#F39C12]"
                    : "text-[#A1A1AA] hover:text-[#18181B] hover:bg-[#F4F4F5]"
                }`}
              >
                <span
                  className={`material-symbols-outlined ${item.icon === "home" ? "text-[28px]" : "text-[22px]"}`}
                  style={{
                    fontVariationSettings: isActive
                      ? "'FILL' 1, 'wght' 200"
                      : "'wght' 200",
                  }}
                >
                  {item.icon}
                </span>
              </button>
            );
          })}

          <div className="w-[1px] h-6 bg-[#E4E4E7]/60 mx-1"></div>

          {/* Integrated Add Button */}
          <button className="w-[42px] h-[42px] flex items-center justify-center rounded-full transition-all outline-none text-[#A1A1AA] hover:text-[#18181B] hover:bg-[#F4F4F5] focus:text-[#18181B] shrink-0">
            <span
              className="material-symbols-outlined text-[22px]"
              style={{ fontVariationSettings: "'wght' 200" }}
            >
              add_circle
            </span>
          </button>
        </div>
      </div>

      {/* Mobile FAB padding spacer */}
      <div className="h-[84px] md:hidden shrink-0"></div>

      {/* Mobile Bottom Sheets (Rendered at root to avoid transform containment issues) */}
      <div className="md:hidden">
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}</style>

        {isShareOpen && (
          <div className="fixed inset-0 z-[100] flex flex-col justify-end">
            <div
              className="absolute inset-0 bg-black/40 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                setIsShareOpen(false);
              }}
            ></div>
            <div
              className="relative bg-white rounded-t-3xl shadow-xl flex flex-col p-6 pb-8 transform transition-transform"
              style={{
                animation:
                  "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
              }}
            >
              <div className="w-12 h-1.5 bg-[#E4E4E7] rounded-full mx-auto mb-6"></div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleCopy}
                  className="w-full flex items-center justify-center gap-3 bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#18181B] rounded-2xl py-4 transition-colors font-medium text-base outline-none"
                >
                  <span
                    className="material-symbols-outlined text-[22px]"
                    style={{ fontVariationSettings: "'wght' 300" }}
                  >
                    content_copy
                  </span>
                  複製內容
                </button>

                <button
                  onClick={handleShareLine}
                  className="w-full flex items-center justify-center gap-3 bg-[#06C755]/10 hover:bg-[#06C755]/20 text-[#06C755] rounded-2xl py-4 transition-colors font-medium text-base outline-none"
                >
                  <div className="w-[24px] h-[24px] flex items-center justify-center shrink-0">
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-full h-full"
                    >
                      <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 3.945 8.917 9.444 9.605.369.079.873.243.999.559.114.286.074.735.034 1.037l-.208 1.258c-.053.315-.246 1.206 1.056.657 1.303-.549 7.026-4.144 9.539-7.054 2.008-2.316 3.136-4.301 3.136-6.062z" />
                      <path
                        fill="#FFFFFF"
                        d="M7.75 12.83H6.18V8.45H5v5.44h2.75v-1.06zM9.46 13.89h-1.06V8.45h1.06v5.44zM14.54 13.89h-1.12l-1.92-3.18v3.18h-1.06V8.45h1.12l1.92 3.18V8.45h1.06v5.44zM18.89 9.51h-2.18v1.08h1.9v1.06h-1.9v1.18h2.18v1.06h-3.24V8.45h3.24v1.06z"
                      />
                    </svg>
                  </div>
                  LINE分享
                </button>
              </div>
            </div>
          </div>
        )}

        {isSettingsOpen && (
          <div className="fixed inset-0 z-[100] flex flex-col justify-end">
            <div
              className="absolute inset-0 bg-black/40 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                setIsSettingsOpen(false);
              }}
            ></div>
            <div
              className="relative bg-white rounded-t-3xl shadow-xl flex flex-col p-6 pb-8 transform transition-transform"
              style={{
                animation:
                  "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
              }}
            >
              <div className="w-12 h-1.5 bg-[#E4E4E7] rounded-full mx-auto mb-6"></div>
              <div className="flex flex-col items-center mb-6">
                <div className="w-16 h-16 rounded-full overflow-hidden mb-3 border border-[#E4E4E7]">
                  <img
                    src={userAvatar}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-lg font-semibold text-[#18181B]">
                  {userName}
                </h3>
                <p className="text-[13px] text-[#A1A1AA]">{userEmail}</p>
              </div>

              <div className="flex flex-col gap-3">
                <button className="w-full flex items-center justify-center gap-3 bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#18181B] rounded-2xl py-4 transition-colors font-medium text-base outline-none">
                  <span
                    className="material-symbols-outlined text-[22px]"
                    style={{ fontVariationSettings: "'wght' 300" }}
                  >
                    person
                  </span>
                  個人設定
                </button>

                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full flex items-center justify-center gap-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl py-4 transition-colors font-medium text-base outline-none"
                >
                  <span
                    className="material-symbols-outlined text-[22px]"
                    style={{ fontVariationSettings: "'wght' 300" }}
                  >
                    logout
                  </span>
                  登出
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Weekly Tasks Manual Overlay */}
      <div
        className={`fixed inset-0 bg-[#FFFFFF] z-[100] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] md:hidden ${showManual ? "translate-x-0" : "translate-x-full"}`}
      >
        <header className="fixed top-0 left-0 right-0 h-[60px] bg-[#FFFFFF] z-[110] border-b border-[#E4E4E7]/60 flex items-center justify-between px-4">
          <button
            onClick={() => setShowManual(false)}
            className="w-10 h-10 flex items-center justify-center rounded-full text-[#18181B] active:bg-[#F4F4F5] transition-colors"
          >
            <span
              className="material-symbols-outlined text-[14px]"
              style={{ fontVariationSettings: "'wght' 300" }}
            >
              arrow_back_ios_new
            </span>
          </button>
          <h1 className="text-[17px] font-bold text-[#18181B] absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
            每週任務操作說明
          </h1>
          <div className="w-10"></div> {/* Spacer for flex balance */}
        </header>
        <div className="pt-[60px] h-full overflow-y-auto scrollbar-hide pb-20 bg-[#FAFAFA]">
          <div className="px-6 py-4 flex flex-col gap-4">
            <ManualCards />
          </div>
        </div>
      </div>


      {/* Full Screen Org Chart Overlay Modal */}
      <div
        className={`fixed inset-0 z-[9999] bg-[#18181B] overflow-hidden overscroll-none transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          showOrgChart ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
        aria-hidden={!showOrgChart}
      >
        {/* 內層才是實際內容，高度鎖定；外層滿版純深色，高度有落差時留白也是同色 */}
        <div
          className="flex flex-col w-full"
          style={{ height: orgViewportH ? `${orgViewportH}px` : "100%" }}
        >
        {/* 架構圖頁在掛載後 300／1000／2000ms 還會各做一次自我重新適應，
            onLoad 後再多撐一下遮罩，讓使用者看到的是已經定位好的畫面 */}
        {orgFrameMounted && (
          <iframe
            src="https://sensesoil-org-structure.vercel.app/?view=1"
            className="flex-1 w-full border-none bg-[#18181B]"
            title="組織架構"
            style={orgShiftY ? { transform: `translateY(-${orgShiftY}px)` } : undefined}
            onLoad={() => window.setTimeout(() => setOrgFrameLoaded(true), 900)}
            allowFullScreen
          />
        )}
        </div>

        {/* 懸浮返回鍵：取代原本的標題列，把整個高度讓給架構圖。
            架構圖自己的工具列靠右上、縮放列在左下，左上是空的。
            尺寸依「APP返回鍵尺寸規格.md」：架構圖在手機上會對工具列套用 scale(0.66)，
            所以右上那排按鈕的實際視覺直徑是 54 × 0.66 ≈ 36px，不是 54px。
            觸控區維持 44px（無障礙最小範圍），但可見圓形只畫 36px；
            按鈕放在 12px，讓 36px 的圓剛好落在距邊 16px，與右上那排同一條基準線。 */}
        <button
          onClick={() => setShowOrgChart(false)}
          aria-label="返回指揮中心"
          className="group absolute z-30 top-3 left-3 w-11 h-11 flex items-center justify-center bg-transparent border-none p-0 outline-none"
        >
          <span className="absolute w-9 h-9 rounded-full bg-[rgba(22,24,29,0.95)] border border-[rgba(243,156,18,0.4)] transition-colors group-active:bg-[#27272A]" />
          <svg
            viewBox="0 0 24 24"
            className="relative w-3.5 h-3.5"
            fill="none"
            stroke="#B9BEC9"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>

        {/* 載入中遮罩，蓋掉架構圖開場那幾次自我重新適應的跳動 */}
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#18181B] transition-opacity duration-500 ${
            orgFrameLoaded ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <span className="material-symbols-outlined text-[28px] text-[#F39C12] animate-spin">progress_activity</span>
          <span className="text-[13px] text-[#A1A1AA]">組織架構圖載入中…</span>
        </div>

        {/* 首次載入完成後提示操作方式。
            標題列拿掉後，架構圖自己的工具列會上移到頂部，所以提示改放底部：
            夾在縮放列（左下，約佔 14–58px）與漢堡鈕（右下）之上。 */}
        <div
          className={`absolute z-20 left-1/2 -translate-x-1/2 bottom-[76px] px-3.5 py-2 rounded-full bg-[#18181B]/85 border border-[#F39C12]/35 text-[12px] text-[#F2E9DC] whitespace-nowrap backdrop-blur-sm pointer-events-none transition-opacity duration-500 ${
            orgFrameLoaded ? "opacity-100" : "opacity-0"
          }`}
          style={{ animation: orgFrameLoaded ? "orgHintFade 1s ease 4s forwards" : undefined }}
        >
          雙指縮放 · 單指拖曳 · 左下可切換倍率
        </div>
      </div>
    </div>
  );
}
