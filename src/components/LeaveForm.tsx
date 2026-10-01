"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import useSWR from "swr";
import { useDynamicPermissions } from "@/hooks/useDynamicPermissions";

/* ══════════════════════════════════════════════════════════
   狩獵任務 → 請假：填好後按右上「分享」，複製文字或直接傳 LINE
   人員選單來自拾壤CRM「員工CRM」（已填離線登出日的離職員工不出現）
   ══════════════════════════════════════════════════════════ */

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface LeaveFormRef {
  getShareText: () => string;
}

const LEAVE_TYPES = ["事假", "病假", "特休", "公務"];
const PERIODS = ["整天", "上午", "下午"];
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const md = (iso: string) => {
  const d = parse(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
const weekday = (iso: string) => `星期${WEEK[parse(iso).getDay()]}`;

const LeaveForm = forwardRef<LeaveFormRef>((_props, ref) => {
  const { permissions } = useDynamicPermissions();
  const me = permissions?.hunterName || "";
  const { data: crm } = useSWR("/api/crm-data", fetcher);
  const hunters: string[] = crm?.activeHunters || [];

  const [person, setPerson] = useState(me);
  const [type, setType] = useState("");
  const [range, setRange] = useState(false);
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [period, setPeriod] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [handover, setHandover] = useState("");

  useEffect(() => {
    if (me && !person) setPerson(me);
  }, [me, person]);
  useEffect(() => {
    if (end < start) setEnd(start);
  }, [start, end]);

  const multi = range && end > start;
  const dateText = multi ? `${md(start)}～${md(end)}` : md(start);
  const weekText = multi ? `${weekday(start)}～${weekday(end)}` : weekday(start);
  const days = multi ? Math.round((parse(end).getTime() - parse(start).getTime()) / 86400000) + 1 : 1;

  useImperativeHandle(ref, () => ({
    getShareText: () => {
      const missing = [!person && "請假人員", !type && "請假類別", !period && "影響時序", !supervisor && "通報主管", !handover && "任務交接"].filter(Boolean);
      if (missing.length) throw new Error(`請先選擇：${missing.join("、")}`);
      return [
        "【請假公告】",
        `• 請假人員：${person}`,
        `• 請假類別：${type}`,
        `• 離線日期：${dateText}${multi ? `（共 ${days} 天）` : ""}`,
        `• 星期：${weekText}`,
        `• 影響時序：${period}`,
        `• 通報主管：${supervisor}`,
        `• 任務交接：${handover}`,
      ].join("\n");
    },
  }));

  const row = "flex items-center border-b border-gray-100 pb-2 min-h-[44px]";
  const label = "w-[100px] text-gray-500 shrink-0 whitespace-nowrap";
  const chip = (on: boolean) =>
    `h-9 px-3.5 rounded-full text-[14px] transition-colors ${on ? "bg-[#F39C12] text-white" : "bg-[#F4F4F5] text-[#3F3F46] active:bg-[#E4E4E7]"}`;

  return (
    <div className="w-full flex flex-col pt-0 pb-4 gap-4">
      <div className="bg-white rounded-[24px] border border-[#E4E4E7] shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-6 flex flex-col">
        <div className="text-center mb-6 border-b border-gray-100 pb-4">
          <h2 className="text-[20px] font-bold tracking-widest text-[#18181B]">請假公告</h2>
          <LeaveRules />
        </div>

        <div className="flex flex-col gap-5 text-[15px]">
          <div className={row}>
            <span className={label}>請假人員：</span>
            <PersonSelect hunters={hunters} value={person} onChange={setPerson} placeholder="選擇人員" />
          </div>

          <div className={row}>
            <span className={label}>請假類別：</span>
            <PersonSelect hunters={LEAVE_TYPES} value={type} onChange={setType} placeholder="選擇假別" />
          </div>

          <div className="flex items-start border-b border-gray-100 pb-3">
            <span className={`${label} pt-2`}>離線日期：</span>
            <div className="flex-1 flex flex-col gap-2.5">
              <div className="flex gap-2">
                <button type="button" onClick={() => setRange(false)} aria-pressed={!range} className={chip(!range)}>
                  單日
                </button>
                <button type="button" onClick={() => setRange(true)} aria-pressed={range} className={chip(range)}>
                  期間
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={start}
                  onChange={(e) => e.target.value && setStart(e.target.value)}
                  className="h-10 px-2 rounded-lg border border-gray-200 bg-white text-[#18181B] text-[16px] [color-scheme:light]"
                />
                {range && (
                  <>
                    <span className="text-gray-400">至</span>
                    <input
                      type="date"
                      value={end}
                      min={start}
                      onChange={(e) => e.target.value && setEnd(e.target.value)}
                      className="h-10 px-2 rounded-lg border border-gray-200 bg-white text-[#18181B] text-[16px] [color-scheme:light]"
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className={row}>
            <span className={label}>影響時序：</span>
            <PersonSelect hunters={PERIODS} value={period} onChange={setPeriod} placeholder="選擇時段" />
          </div>

          <div className={row}>
            <span className={label}>通報主管：</span>
            <PersonSelect hunters={hunters} value={supervisor} onChange={setSupervisor} placeholder="選擇主管" />
          </div>

          <div className={row}>
            <span className={label}>任務交接：</span>
            <PersonSelect hunters={hunters} value={handover} onChange={setHandover} placeholder="選擇交接人" />
          </div>
        </div>

      </div>
    </div>
  );
});

LeaveForm.displayName = "LeaveForm";

/* 請假規則提醒（表單上方，直接寫在背景上，像說明文字） */

function LeaveRules() {
  const hl = "text-[#F39C12] font-medium";
  return (
    <p className="mt-2 text-[12.5px] leading-relaxed text-[#71717A]">
      須提前申請：長假<span className={hl}> 1 月前</span>、事假<span className={hl}> 1 週前</span>、病假<span className={hl}>即時</span>
    </p>
  );
}


function PersonSelect({ hunters, value, onChange, placeholder }: { hunters: string[]; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`flex-1 outline-none bg-transparent appearance-none cursor-pointer ${value ? "text-[#18181B]" : "text-gray-400"}`}
    >
      <option value="">{placeholder}</option>
      {hunters.map((h) => (
        <option key={h} value={h}>
          {h}
        </option>
      ))}
      {value && !hunters.includes(value) && <option value={value}>{value}</option>}
    </select>
  );
}
export default LeaveForm;
