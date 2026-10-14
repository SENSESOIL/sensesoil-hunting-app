"use client";

import React, { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Sheet, toast } from "@/components/pm/Sheet";
import { Avatar, Spinner } from "@/components/pm/kit";
import { Icon } from "@/components/pm/ui";
import { disablePush, enablePush, pushState, type PushState } from "@/components/pm/push-client";
import { PortraitSheet } from "@/components/team/PortraitSheet";
import { useTeam } from "@/components/team/useTeam";
import { setThemeMode, useThemeMode, type ThemeMode } from "@/lib/theme";

/* ══════════════════════════════════════════════════════════
   設定（右上角頭像）
   帳號：大頭照、姓名、信箱、身分
   外觀：白天／夜晚模式（強調色固定品牌橘）
   偏好：開啟 APP 先看哪一頁、任務的預設檢視
   通知：這支手機的推播
   登出
   都存在這支裝置上（localStorage），換手機要重設；大頭照存在資料庫，全 APP 共用。
   ══════════════════════════════════════════════════════════ */

export const START_NAV_KEY = "app:startNav";
const TASK_VIEW_KEY = "pm:my:view";

const MODES: { value: ThemeMode; label: string; icon: string; page: string; card: string; ink: string; sub: string }[] = [
  { value: "light", label: "白天", icon: "light_mode", page: "#F2F2F4", card: "#FFFFFF", ink: "#3F3F46", sub: "#D4D4D8" },
  { value: "dark", label: "夜晚", icon: "dark_mode", page: "#111113", card: "#26262A", ink: "#E4E4E7", sub: "#55555C" },
];

const TASK_VIEWS = [
  { value: "list", label: "清單", icon: "checklist" },
  { value: "board", label: "看板", icon: "view_kanban" },
  { value: "gantt", label: "甘特", icon: "view_timeline" },
];

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* 私密瀏覽：這次有效 */
  }
};

export function SettingsSheet({
  open,
  onClose,
  name,
  email,
  role,
  pages,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  email: string;
  /** 例：管理者、狩獵者 */
  role: string;
  /** 可以設成「開啟時先看」的頁面（依權限） */
  pages: { id: string; label: string }[];
}) {
  const mode = useThemeMode();
  const team = useTeam(open);
  const me = team.data?.members.find((m) => m.email === email);
  const [portrait, setPortrait] = useState(false);
  const [start, setStart] = useState<string>("");
  const [taskView, setTaskView] = useState<string>("list");
  const [push, setPush] = useState<PushState | "loading">("loading");
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStart(read(START_NAV_KEY) ?? "");
    setTaskView(read(TASK_VIEW_KEY) ?? "list");
    pushState().then(setPush, () => setPush("unsupported"));
  }, [open]);

  const togglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    if (push === "on") {
      await disablePush().catch(() => {});
      setPush("off");
      toast("已關閉這支手機的通知");
    } else {
      const r = await enablePush();
      if (r === "error") toast("開啟失敗，請再試一次", { tone: "error" });
      else setPush(r);
      if (r === "on") toast("已開啟通知，會先收到一則測試通知");
    }
    setPushBusy(false);
  };

  const pushHint: Record<PushState | "loading", string> = {
    loading: "",
    on: "被指派任務、任務改期或完成時通知你",
    off: "被指派任務時不會跳通知",
    denied: "通知被系統封鎖了，請到手機設定開啟",
    "needs-install": "iPhone 要先「加入主畫面」，從主畫面打開 APP 才能收通知",
    unsupported: "這個瀏覽器不支援通知",
  };
  const canTogglePush = push === "on" || push === "off";

  return (
    <>
      <Sheet open={open} title="設定" onClose={onClose}>
        <div className="px-4 pt-3 pb-8 flex flex-col gap-6">
          {/* 帳號 */}
          <section className="bg-white rounded-[22px] shadow-card p-4 flex items-center gap-4">
            <button
              type="button"
              onClick={() => me && setPortrait(true)}
              disabled={!me}
              className="relative rounded-full shrink-0 active:opacity-80 disabled:active:opacity-100"
              aria-label="更換大頭照"
            >
              <Avatar name={name} email={email} src={me?.avatar} size={64} color="var(--accent)" />
              {me && (
                <span className="absolute -right-0.5 -bottom-0.5 w-7 h-7 rounded-full bg-[#18181B] border-2 border-white flex items-center justify-center">
                  <Icon name="photo_camera" weight={400} className="text-[14px] text-white" />
                </span>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[19px] font-bold text-[#18181B] truncate">{name}</p>
              <p className="text-[13px] text-[#A1A1AA] truncate">{email}</p>
              <span className="mt-1.5 inline-flex h-6 px-2.5 rounded-full items-center text-[12px] font-medium bg-[var(--accent-soft)] text-[var(--accent-ink)]">{role}</span>
            </div>
          </section>

          {/* 切換：狩獵管理／狩獵覺醒（原本的分流頁拿掉後，改在這裡切換） */}
          <Section title="切換">
            <div className="p-1.5 grid grid-cols-2 gap-1.5">
              {[
                { href: "/hunting-mgmt", label: "狩獵管理", icon: "shield" },
                { href: "/basic-mission", label: "狩獵覺醒", icon: "local_fire_department" },
              ].map((m) => {
                const on = typeof window !== "undefined" && window.location.pathname.startsWith(m.href);
                return (
                  <button
                    key={m.href}
                    type="button"
                    onClick={() => {
                      if (on) return onClose();
                      window.location.href = m.href;
                    }}
                    aria-pressed={on}
                    className={`h-11 rounded-[16px] flex items-center justify-center gap-1.5 text-[15px] transition-colors ${on ? "bg-[var(--accent)] text-white font-semibold" : "text-[#52525B] active:bg-[#F4F4F5]"}`}
                  >
                    <Icon name={m.icon} weight={400} className="text-[19px]" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* 外觀：白天／夜晚（強調色固定品牌橘），小圖示切換 */}
          <Section title="外觀" hint="只改這支裝置">
            <div className="px-4 py-3 flex items-center justify-between">
              <p className="text-[15px] text-[#18181B]">{MODES.find((m) => m.value === mode)?.label ?? "白天"}模式</p>
              <div className="flex gap-1 p-1 rounded-full bg-[#F4F4F5]">
                {MODES.map((m) => {
                  const on = mode === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setThemeMode(m.value)}
                      aria-pressed={on}
                      aria-label={m.label}
                      title={m.label}
                      className={`w-10 h-8 rounded-full flex items-center justify-center transition-colors ${on ? "bg-white shadow-card" : ""}`}
                    >
                      <Icon name={m.icon} weight={400} className={`text-[19px] ${on ? "text-[var(--accent)]" : "text-[#A1A1AA]"}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>

          {/* 偏好 */}
          <Section title="偏好">
            <div className="px-4 py-3.5">
              <p className="text-[15px] text-[#18181B]">開啟 APP 時先看</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {[{ id: "", label: "自動" }, ...pages].map((p) => {
                  const on = start === p.id;
                  return (
                    <button
                      key={p.id || "auto"}
                      type="button"
                      onClick={() => {
                        setStart(p.id);
                        write(START_NAV_KEY, p.id);
                      }}
                      aria-pressed={on}
                      className={`h-9 px-3.5 rounded-full text-[14px] transition-colors ${on ? "bg-[var(--accent)] text-white" : "bg-[#F4F4F5] text-[#3F3F46] active:bg-[#E4E4E7]"}`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="px-4 py-3.5">
              <p className="text-[15px] text-[#18181B]">任務追蹤的預設檢視</p>
              <div className="mt-2.5 flex gap-2">
                {TASK_VIEWS.map((v) => {
                  const on = taskView === v.value;
                  return (
                    <button
                      key={v.value}
                      type="button"
                      onClick={() => {
                        setTaskView(v.value);
                        write(TASK_VIEW_KEY, v.value);
                      }}
                      aria-pressed={on}
                      className={`h-9 px-3.5 rounded-full text-[14px] inline-flex items-center gap-1.5 transition-colors ${on ? "bg-[var(--accent)] text-white" : "bg-[#F4F4F5] text-[#3F3F46] active:bg-[#E4E4E7]"}`}
                    >
                      <Icon name={v.icon} className="text-[17px]" />
                      {v.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>

          {/* 通知 */}
          <Section title="通知">
            <div className="px-4 py-3.5 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-[var(--accent-soft)] flex items-center justify-center shrink-0">
                <Icon name="notifications" weight={400} className="text-[20px] text-[var(--accent-strong)]" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] text-[#18181B]">這支手機的通知</span>
                <span className="block text-[13px] leading-[18px] text-[#A1A1AA] mt-0.5">{pushHint[push]}</span>
              </span>
              {push === "loading" || pushBusy ? (
                <Spinner size={18} />
              ) : (
                canTogglePush && <Switch on={push === "on"} onChange={togglePush} label="通知" />
              )}
            </div>
          </Section>

          <button
            type="button"
            onClick={async () => {
              // 登出前先取消這支手機的推播，才不會收到下一個人的任務通知
              await disablePush().catch(() => {});
              signOut({ callbackUrl: "/" });
            }}
            className="h-12 rounded-full bg-white shadow-card text-[16px] font-medium text-[#E5484D] inline-flex items-center justify-center gap-2 active:bg-[#FDECEC]"
          >
            <Icon name="logout" className="text-[20px]" />
            登出
          </button>
        </div>
      </Sheet>
      {me && <PortraitSheet member={me} open={portrait} onClose={() => setPortrait(false)} onSaved={() => team.mutate()} />}
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="px-1 pb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-[#52525B] whitespace-nowrap">{title}</h3>
        {hint && <span className="text-[12px] text-[#A1A1AA] text-right">{hint}</span>}
      </div>
      <div className="bg-white rounded-[22px] shadow-card overflow-hidden [&>*+*]:border-t [&>*+*]:border-[#F4F4F5]">{children}</div>
    </section>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative w-[51px] h-[31px] rounded-full transition-colors shrink-0 ${on ? "bg-[var(--accent)]" : "bg-[#E4E4E7]"}`}
    >
      <span className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-transform ${on ? "translate-x-[20px]" : ""}`} />
    </button>
  );
}
