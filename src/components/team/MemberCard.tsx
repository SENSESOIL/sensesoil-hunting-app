"use client";

import React from "react";
import { cardBg, type TeamMember } from "@/lib/pm/model";
import { bodyPath, collarPath, hoodPath, logoBox, seamPaths, stringsPaths, UNIFORM } from "./uniform";
import { CARD_H, CARD_W, FACE_CX, FACE_CY, FACE_W } from "./portrait";

/* ══════════════════════════════════════════════════════════
   員工卡牌：漸層底＋穿制服的人像＋姓名、職稱
   還沒上傳照片的人顯示同一套制服的剪影，整排看起來仍然一致
   ══════════════════════════════════════════════════════════ */

const GEO = { cx: FACE_CX, collarY: FACE_CY + FACE_W * 0.8, fw: FACE_W, H: CARD_H };

export function Silhouette() {
  const logo = logoBox(GEO);
  return (
    <svg viewBox={`0 0 ${CARD_W} ${CARD_H}`} className="absolute inset-0 w-full h-full" aria-hidden>
      <defs>
        <linearGradient id="ss-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={UNIFORM.top} />
          <stop offset="1" stopColor={UNIFORM.bottom} />
        </linearGradient>
      </defs>
      {UNIFORM.hood && <path d={hoodPath(GEO)} fill={UNIFORM.hoodColor} />}
      <rect x={FACE_CX - FACE_W * 0.2} y={FACE_CY + FACE_W * 0.3} width={FACE_W * 0.4} height={FACE_W * 0.55} rx={FACE_W * 0.1} fill="rgba(255,255,255,0.35)" />
      <ellipse cx={FACE_CX} cy={FACE_CY} rx={FACE_W * 0.52} ry={FACE_W * 0.64} fill="rgba(255,255,255,0.42)" />
      <path d={bodyPath(GEO)} fill="url(#ss-body)" />
      {seamPaths(GEO).map((d) => (
        <path key={d} d={d} stroke="rgba(0,0,0,0.45)" strokeWidth={FACE_W * 0.02} fill="none" strokeLinecap="round" />
      ))}
      <path d={collarPath(GEO)} stroke={UNIFORM.trim} strokeWidth={FACE_W * 0.075} fill="none" strokeLinecap="round" />
      {stringsPaths(GEO).map((d) => (
        <path key={d} d={d} stroke={UNIFORM.string} strokeWidth={FACE_W * 0.026} fill="none" strokeLinecap="round" />
      ))}
      <image href={encodeURI(UNIFORM.logo)} x={logo.x - logo.size / 2} y={logo.y} width={logo.size} height={logo.size} opacity={0.95} />
    </svg>
  );
}

export function MemberCard({
  member,
  src,
  active,
  onClick,
}: {
  member: TeamMember;
  /** 卡牌人像（沒有就顯示剪影） */
  src?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const [a, b] = cardBg(member.cardBg, member.email);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className="relative block w-full aspect-[3/4] rounded-[22px] overflow-hidden text-left select-none"
      style={{
        background: `linear-gradient(150deg, ${a}, ${b})`,
        boxShadow: active ? `0 18px 50px -12px ${a}AA, inset 0 0 0 1px rgba(255,255,255,0.35)` : "inset 0 0 0 1px rgba(255,255,255,0.15)",
      }}
      aria-label={`${member.name}${member.title ? "，" + member.title : ""}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <Silhouette />
      )}
      <div className="absolute inset-x-0 bottom-0 pt-16 pb-3.5 px-3 text-center bg-gradient-to-t from-[#0E0E11] via-[#0E0E11]/70 to-transparent">
        <p className="text-white text-[17px] font-semibold tracking-tight truncate">{member.name}</p>
        <span className="inline-block mt-1.5 px-2.5 h-[20px] leading-[18px] rounded-full border border-white/35 text-[10.5px] text-white/85 max-w-full truncate">
          {member.title || (member.manager ? "管理" : "狩獵者")}
        </span>
      </div>
    </Tag>
  );
}
