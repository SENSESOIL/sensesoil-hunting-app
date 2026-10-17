"use client";

import React, { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Sheet, toast } from "@/components/pm/Sheet";
import { Avatar, Spinner } from "@/components/pm/kit";
import { Icon } from "@/components/pm/ui";
import { disablePush, enablePush, pushState, type PushState } from "@/components/pm/push-client";
import { PortraitSheet } from "@/components/team/PortraitSheet";
import { teamPost, useTeam } from "@/components/team/useTeam";
import { mutate as swrMutate } from "swr";
import { PM_KEY } from "@/components/pm/usePm";
import { defaultMark, markOptions } from "@/lib/pm/model";
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
  const [markOpen, setMarkOpen] = useState(false);
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
    "not-configured": "推播還沒設定好，請管理者到 Vercel 加上推播金鑰",
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
              {/* 代表字：任務清單上大頭照旁邊的字；像大頭照一樣點了再改 */}
              <button
                type="button"
                onClick={() => setMarkOpen(true)}
                aria-label={`清單代表字：${me?.mark || defaultMark(name)}，點一下更換`}
                className="mt-1.5 inline-flex h-7 pl-2.5 pr-1.5 rounded-full items-center gap-1 text-[13px] bg-[var(--accent-soft)] text-[var(--accent-ink)] active:opacity-70"
              >
                <span className="text-[12px] opacity-75">代表字</span>
                <span className="font-bold">{me?.mark || defaultMark(name)}</span>
                <Icon name="chevron_right" weight={400} className="text-[16px] opacity-60" />
              </button>
            </div>
          </section>

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
      <MarkSheet open={markOpen} onClose={() => setMarkOpen(false)} name={name} email={email} current={me?.mark || defaultMark(name)} onSaved={() => team.mutate()} />
      {me && <PortraitSheet member={me} open={portrait} onClose={() => setPortrait(false)} onSaved={() => team.mutate()} />}
    </>
  );
}

/** 代表字選擇：名字第一字、第二字、英文縮寫兩種（姓＋名首字、名兩字），點一下就存 */
function MarkSheet({ open, onClose, name, email, current, onSaved }: { open: boolean; onClose: () => void; name: string; email: string; current: string; onSaved: () => void }) {
  const [latin, setLatin] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // 英文縮寫要用拼音：打開時才載入拼音字典，平常不拖慢 APP
  useEffect(() => {
    if (!open || latin) return;
    let alive = true;
    import("pinyin-pro")
      .then(({ pinyin }) => {
        if (alive) setLatin(pinyin(name, { pattern: "first", toneType: "none", type: "array", surname: "head" }).map((x) => x.toUpperCase()));
      })
      .catch(() => alive && setLatin([]));
    return () => {
      alive = false;
    };
  }, [open, latin, name]);
  const options = markOptions(name, latin ?? undefined);
  const pick = async (mark: string) => {
    if (busy) return;
    if (mark === current) return onClose();
    setBusy(mark);
    const r = await teamPost({ op: "profile.save", email, patch: { mark: mark === defaultMark(name) ? null : mark } });
    setBusy(null);
    if (!r.ok) {
      toast(r.data.error ?? "儲存失敗，請再試一次", { tone: "error" });
      return;
    }
    toast(`代表字改成「${mark}」`);
    onSaved();
    swrMutate(PM_KEY);
    onClose();
  };
  return (
    <Sheet open={open} title="清單代表字" subtitle="任務清單上大頭照旁邊顯示的字" onClose={onClose}>
      <div className="px-4 pt-3 pb-8 grid grid-cols-2 gap-3">
        {options.map((o) => {
          const on = o.mark === current;
          return (
            <button
              key={o.label}
              type="button"
              onClick={() => pick(o.mark)}
              disabled={!!busy}
              aria-pressed={on}
              className={`rounded-[18px] bg-white shadow-card p-4 flex flex-col items-center gap-2 transition-shadow active:scale-[0.98] ${on ? "ring-2 ring-[var(--accent)]" : ""}`}
            >
              <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-[#F4F4F5] text-[17px] font-semibold text-[#18181B]">
                <Avatar name={name} email={email} size={24} />
                {busy === o.mark ? <Spinner size={14} /> : o.mark}
              </span>
              <span className={`text-[13px] ${on ? "font-semibold text-[var(--accent-ink)]" : "text-[#71717A]"}`}>{o.label}</span>
            </button>
          );
        })}
        {latin === null && (
          <div className="col-span-2 flex justify-center py-2">
            <Spinner size={16} />
          </div>
        )}
      </div>
    </Sheet>
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
