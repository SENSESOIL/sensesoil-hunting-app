import type { Task } from "@/lib/pm/model";

/* 任務的層級：上層在前、子任務接在下面（像提醒事項一樣只有一層）。清單與甘特圖共用同一個順序 */

export interface TreeRow {
  task: Task;
  depth: 0 | 1;
  childCount: number;
}

const bySeq = (a: Task, b: Task) => a.seq - b.seq || (a.createdAt ?? "").localeCompare(b.createdAt ?? "");

export function treeOrder(tasks: Task[]): TreeRow[] {
  const ids = new Set(tasks.map((t) => t.id));
  const kids = new Map<string, Task[]>();
  const tops: Task[] = [];
  for (const t of tasks) {
    if (t.parentId && ids.has(t.parentId)) kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t]);
    else tops.push(t);
  }
  const out: TreeRow[] = [];
  for (const t of tops.sort(bySeq)) {
    const ch = (kids.get(t.id) ?? []).sort(bySeq);
    out.push({ task: t, depth: 0, childCount: ch.length });
    for (const c of ch) out.push({ task: c, depth: 1, childCount: 0 });
  }
  return out;
}

