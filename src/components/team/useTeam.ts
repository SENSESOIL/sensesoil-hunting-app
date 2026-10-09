"use client";

import { useEffect } from "react";
import useSWR from "swr";
import type { Contact, TeamData, TeamMember } from "@/lib/pm/model";
import { setAvatarDirectory } from "@/components/pm/kit";

export const TEAM_KEY = "/api/pm/team";

const fetcher = async (url: string): Promise<TeamData> => {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
};

export async function teamPost(body: Record<string, unknown>): Promise<{ ok: boolean; data: { error?: string } & Record<string, unknown> }> {
  try {
    const r = await fetch(TEAM_KEY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: "網路連線失敗，請再試一次" } };
  }
}

/** 移除某人的大頭照；成功後全 APP 的頭像立刻改回姓名縮寫 */
export async function removeAvatar(email: string): Promise<{ ok: boolean; error?: string }> {
  const r = await teamPost({ op: "profile.save", email, patch: { avatar: null, card: null } });
  if (r.ok) setAvatarDirectory([{ email, avatar: undefined }]);
  return { ok: r.ok, error: r.data.error };
}

export function cardUrl(m: TeamMember): string | undefined {
  return m.hasCard ? `${TEAM_KEY}?card=${encodeURIComponent(m.email)}&v=${encodeURIComponent(m.cardVersion ?? "")}` : undefined;
}

export function useTeam() {
  const swr = useSWR<TeamData>(TEAM_KEY, fetcher, { revalidateOnFocus: true, dedupingInterval: 3000, keepPreviousData: true });
  const members = swr.data?.members;
  useEffect(() => {
    if (members) setAvatarDirectory(members);
  }, [members]);
  return swr;
}

export type { Contact, TeamData, TeamMember };
