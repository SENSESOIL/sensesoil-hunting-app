/* ══════════════════════════════════════════════════════════
   前置任務（WBS）：「接在某個任務之後開始」
   - 存在 task.meta.after（前一個任務的 id），同一個專案內才算
   - 前一個任務的結束日移動 → 接在後面的任務整段平移同樣的天數（中間的間隔不變）
   - 不能繞成一圈（A 接 B、B 又接 A）
   ══════════════════════════════════════════════════════════ */

import { addDays } from "@/lib/project-ops";
import type { Task } from "./model";

/** 任務的結束日（沒有期限就用開始日） */
export const endOf = (t: Pick<Task, "start" | "due">) => t.due ?? t.start;

/** 接在前一個任務後面時的開始日：前一個結束的隔天 */
export function startAfter(pred: Pick<Task, "start" | "due">): string | undefined {
  const e = endOf(pred);
  return e ? addDays(e, 1) : undefined;
}

/** 這個任務的前一個任務（已刪掉或不在同一個專案就當沒有） */
export function predecessorOf(tasks: Task[], t: Task): Task | undefined {
  const id = t.meta?.after;
  if (!id) return undefined;
  const p = tasks.find((x) => x.id === id);
  return p && p.code === t.code ? p : undefined;
}

/** 直接接在這個任務後面的任務 */
export function successorsOf(tasks: Task[], t: Task): Task[] {
  return tasks.filter((x) => x.meta?.after === t.id && x.code === t.code && x.id !== t.id);
}

/** 把 predId 設成 taskId 的前一個任務會不會繞成一圈 */
export function wouldCycle(tasks: Task[], taskId: string, predId: string): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  let cur: string | undefined = predId;
  while (cur && !seen.has(cur)) {
    if (cur === taskId) return true;
    seen.add(cur);
    cur = byId.get(cur)?.meta?.after;
  }
  return false;
}
