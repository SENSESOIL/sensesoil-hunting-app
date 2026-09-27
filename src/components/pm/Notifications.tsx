"use client";

import React, { useEffect, useState } from "react";
import useSWR from "swr";
import type { PmNotification } from "@/lib/pm/model";
import { Sheet, toast } from "./Sheet";
import { Icon } from "./ui";
import { Avatar, Empty, GREEN, ORANGE, RED, Spinner } from "./kit";
import { enablePush, isIOS, pushState, type PushState } from "./push-client";
import { pmPost, usePm } from "./usePm";

/* ══════════════════════════════════════════════════════════
   通知（右上角鈴鐺）
   - 列出最近的指派、改期、完成、收到
   - 點一則 → 打開那個任務
   - 上方提示「開啟手機通知」（還沒開的裝置才顯示）
   ══════════════════════════════════════════════════════════ */

const TYPE_META: Record<PmNotification["type"], { icon: string; color: string }> = {
  assigned: { icon: "assignment_ind", color: ORANGE },
  updated: { icon: "edit_calendar", color: "#3B82C4" },
  removed: { icon: "person_remove", color: "#8E8E93" },
  deleted: { icon: "delete", color: RED },
  done: { icon: "task_alt", color: GREEN },
  ack: { icon: "done_all", color: GREEN },
  reopened: { icon: "undo", color: ORANGE },
};

const listFetcher = async (): Promise<{ items: PmNotification[]; unread: number }> => {
  const r = await pmPost<{ items: PmNotification[]; unread: number }>({ op: "notifications.list" });
  if (!r.ok) throw new Error(r.data.error || "讀不到通知");
  return r.data;
};

/** 鈴鐺按鈕（含未讀數） */
export function NotificationBell({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const pm = usePm();
  const [open, setOpen] = useState(false);
  const unread = pm.data?.unread ?? 0;
  const ready = !!pm.data?.configured && !pm.data.dbError;
  return (
    <>
      <button
        onClick={() => ready && setOpen(true)}
        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F4F4F5] transition-all text-[#71717A] hover:text-[#18181B] relative outline-none"
        aria-label={unread ? `通知，${unread} 則未讀` : "通知"}
      >
        <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: unread ? "'wght' 300, 'FILL' 1" : "'wght' 200" }}>
          {unread ? "notifications_active" : "notifications_none"}
        </span>
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10.5px] font-bold text-white flex items-center justify-center tabular-nums" style={{ background: RED }}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {ready && (
        <NotificationsSheet
          open={open}
          onClose={() => setOpen(false)}
          onOpenTask={(id) => {
            setOpen(false);
            onOpenTask(id);
          }}
        />
      )}
    </>
  );
}

function NotificationsSheet({ open, onClose, onOpenTask }: { open: boolean; onClose: () => void; onOpenTask: (id: string) => void }) {
  const pm = usePm();
  const { data, mutate, isLoading } = useSWR(open ? "pm:notifications" : null, listFetcher, { revalidateOnFocus: false });

  const readAll = async () => {
    mutate((d) => d && { ...d, items: d.items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })), unread: 0 }, { revalidate: false });
    await pmPost({ op: "notifications.read" });
    pm.refresh();
  };

  const tap = async (n: PmNotification) => {
    if (!n.readAt) {
      mutate((d) => d && { ...d, items: d.items.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) }, { revalidate: false });
      pmPost({ op: "notifications.read", ids: [n.id] }).then(() => pm.refresh());
    }
    if (n.taskId && n.type !== "deleted") {
      if (pm.tasks.some((t) => t.id === n.taskId)) onOpenTask(n.taskId);
      else toast("這個任務已經不在你的清單裡了");
    }
  };

  const items = data?.items ?? [];
  const hasUnread = items.some((n) => !n.readAt);

  return (
    <Sheet open={open} title="通知" onClose={onClose}>
      <div className="px-4 pt-3 pb-8 flex flex-col gap-3">
        <PushCard />
        {hasUnread && (
          <div className="flex justify-end -mb-1">
            <button onClick={readAll} className="h-9 px-3 rounded-full text-[13px] font-semibold active:bg-[#F4F4F5]" style={{ color: ORANGE }}>
              全部標為已讀
            </button>
          </div>
        )}
        {isLoading && !data ? (
          <div className="flex justify-center py-10">
            <Spinner size={20} />
          </div>
        ) : items.length === 0 ? (
          <Empty icon="notifications" title="還沒有通知" hint="有人指派任務給你、或你指派的任務有進展時，會出現在這裡。" />
        ) : (
          <div className="bg-white rounded-[14px] border border-[#EBEBED] overflow-hidden">
            {items.map((n, i) => {
              const meta = TYPE_META[n.type] ?? TYPE_META.updated;
              return (
                <button
                  key={n.id}
                  onClick={() => tap(n)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left active:bg-[#F7F7F8] ${i ? "border-t border-[#F2F2F4]" : ""} ${n.readAt ? "" : "bg-[#FFFAF2]"}`}
                >
                  <span className="relative shrink-0">
                    <Avatar name={n.actorName} size={36} />
                    <span className="absolute -right-1 -bottom-1 w-[18px] h-[18px] rounded-full border-2 border-white flex items-center justify-center" style={{ background: meta.color }}>
                      <Icon name={meta.icon} weight={500} className="text-[11px] text-white" />
                    </span>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-[14.5px] leading-snug ${n.readAt ? "text-[#3F3F46]" : "text-[#18181B] font-semibold"}`}>{n.title}</span>
                    {n.body && <span className="block text-[13px] text-[#71717A] leading-snug mt-0.5">{n.body}</span>}
                    <span className="block text-[12px] text-[#A1A1AA] mt-1">{ago(n.createdAt)}</span>
                  </span>
                  {!n.readAt && <span className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: ORANGE }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "剛剛";
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 開啟手機通知 */
export function PushCard({ compact }: { compact?: boolean }) {
  const pm = usePm();
  const [state, setState] = useState<PushState | "error" | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    pushState().then(setState);
    try {
      setDismissed(!!compact && localStorage.getItem("pm:push-card") === "hide");
    } catch {
      setDismissed(false);
    }
  }, [compact]);
  if (!pm.data?.pushReady || state === null || state === "on" || state === "unsupported") return null;
  // 頁面上的精簡提示：只提醒「還沒開」，被封鎖的說明留在通知抽屜裡；可以關掉
  if (compact && (state === "denied" || state === "error" || dismissed)) return null;
  const hide = () => {
    setDismissed(true);
    try {
      localStorage.setItem("pm:push-card", "hide");
    } catch {
      /* 忽略 */
    }
  };

  const on = async () => {
    setBusy(true);
    const r = await enablePush();
    setBusy(false);
    setState(r);
    if (r === "on") toast("已開啟通知，這支手機會收到任務提醒");
    else if (r === "denied") toast("通知被封鎖了，請到手機設定裡允許", { tone: "error" });
    else if (r === "error") toast("開啟失敗，請稍後再試", { tone: "error" });
  };

  let body: React.ReactNode;
  if (state === "needs-install") {
    body = (
      <>
        <p className="text-[14px] font-semibold text-[#18181B]">iPhone 要先加入主畫面才收得到通知</p>
        <p className="text-[12.5px] text-[#71717A] mt-0.5 leading-relaxed">
          Safari 下方的分享 <Icon name="ios_share" className="text-[14px] align-[-2px]" /> →「加入主畫面」→ 從主畫面的圖示打開 APP，再回到這裡開啟通知。
        </p>
      </>
    );
  } else if (state === "denied") {
    body = (
      <>
        <p className="text-[14px] font-semibold text-[#18181B]">通知被封鎖了</p>
        <p className="text-[12.5px] text-[#71717A] mt-0.5 leading-relaxed">
          {isIOS() ? "到「設定」→「通知」→ 找到這個 APP → 允許通知。" : "到瀏覽器的網站設定，把通知改成「允許」。"}
        </p>
      </>
    );
  } else {
    body = (
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-[#18181B]">開啟手機通知</p>
          {!compact && <p className="text-[12.5px] text-[#71717A] mt-0.5">有人指派任務給你時，手機會跳出提醒</p>}
        </div>
        <button onClick={on} disabled={busy} className="h-10 px-4 rounded-full text-white text-[14px] font-semibold shrink-0 disabled:opacity-60 inline-flex items-center gap-1.5" style={{ background: ORANGE }}>
          {busy && <Spinner size={14} color="#fff" />}
          開啟
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-[14px] px-4 py-3 flex gap-3 items-start" style={{ background: "#FFF6E8" }}>
      <Icon name="notifications_active" weight={400} className="text-[22px] mt-0.5 shrink-0" style={{ color: ORANGE }} />
      <div className="flex-1 min-w-0">{body}</div>
      {compact && (
        <button onClick={hide} className="w-8 h-8 -mr-2 -mt-1 rounded-full flex items-center justify-center text-[#A1A1AA] shrink-0" aria-label="不再提示">
          <Icon name="close" className="text-[18px]" />
        </button>
      )}
    </div>
  );
}

