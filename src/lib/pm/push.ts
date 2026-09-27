/**
 * 手機推播（Web Push）。只在伺服器端使用。
 *
 * 需要環境變數：NEXT_PUBLIC_VAPID_PUBLIC_KEY、VAPID_PRIVATE_KEY、VAPID_SUBJECT
 * iPhone：iOS 16.4 以上，且 APP 要先「加入主畫面」，從主畫面打開後按「開啟通知」。
 */

import webpush from "web-push";
import { rpc } from "./server";

export function pushConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
}

let ready = false;
function setup() {
  if (ready) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@sensesoil.tw",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  ready = true;
}

/** 資料庫回傳的通知列（pm__notify 的結果） */
export interface NotifyRow {
  recipient: string;
  type: string;
  title: string;
  body?: string | null;
  task_id?: string | null;
  project_code?: string | null;
}

interface Target {
  endpoint: string;
  email: string;
  p256dh: string;
  auth: string;
}

/**
 * 把新產生的通知推到收件人的手機。失敗不影響主要動作（通知已經在 APP 的鈴鐺裡）。
 * Vercel 的函式回應後可能被凍結，所以這裡要等推播送完（最多約 5 秒）再回應。
 */
export async function pushNotifications(rows: NotifyRow[] | null | undefined): Promise<number> {
  const list = (rows ?? []).filter(Boolean);
  if (!list.length || !pushConfigured()) return 0;
  setup();
  let targets: Target[] = [];
  try {
    targets = await rpc<Target[]>("pm_push_targets", { emails: [...new Set(list.map((r) => r.recipient))] });
  } catch (e) {
    console.error("[pm push] 讀不到訂閱", e);
    return 0;
  }
  if (!targets.length) return 0;

  let sent = 0;
  const jobs: Promise<void>[] = [];
  for (const n of list) {
    for (const t of targets.filter((x) => x.email === n.recipient)) {
      const payload = JSON.stringify({
        title: n.title,
        body: n.body ?? "",
        tag: n.task_id ? `task-${n.task_id}` : undefined,
        url: n.task_id ? `/hunting-mgmt?task=${encodeURIComponent(n.task_id)}` : "/hunting-mgmt?tab=tasks",
      });
      jobs.push(
        webpush
          .sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, {
            TTL: 60 * 60 * 24,
            urgency: "high",
            timeout: 5000,
          })
          .then(() => {
            sent++;
          })
          .catch(async (e: { statusCode?: number }) => {
            // 404／410：這支手機已取消訂閱或換了瀏覽器 → 刪掉
            if (e?.statusCode === 404 || e?.statusCode === 410) {
              await rpc("pm_push_delete", { endpoint: t.endpoint }).catch(() => {});
            } else {
              console.error("[pm push] 推播失敗", e?.statusCode, String(e).slice(0, 200));
            }
          })
      );
    }
  }
  await Promise.allSettled(jobs);
  return sent;
}
