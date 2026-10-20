import type { Section, Task } from "@/lib/pm/model";

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


/**
 * 任務屬於哪個分組：子任務跟著上層走；分組被刪掉（id 不在清單上）就回到「其他」（""）
 * all：用來找上層（上層可能因為已完成被隱藏，不在畫面上的清單裡）
 */
export function sectionOf(t: Task, all: Map<string, Task>, valid: Set<string>): string {
  const src = (t.parentId && all.get(t.parentId)) || t;
  const s = src.meta?.section;
  return s && valid.has(s) ? s : "";
}

/**
 * 舊版：「其他」（沒分組的任務）的名稱可以改，存在分組清單裡這個特殊 id。
 * 現在不用了（每個分組都一樣、沒分組的任務放最上面不加標題）；
 * 管理者打開專案時，舊的這筆會自動轉成真正的分組（Reminders.tsx）。
 */
export const OTHER_SECTION = "_other";

/** 真正的分組（不含「其他」的名稱設定） */
export function realSections(sections: Section[]): Section[] {
  return sections.filter((s) => s.id !== OTHER_SECTION);
}

/** 「其他」顯示的名稱 */
export function otherName(sections: Section[]): string {
  return sections.find((s) => s.id === OTHER_SECTION)?.name || "其他";
}

/**
 * 依分組切開（像提醒事項）：沒分組的任務放最上面、不加標題（name 是空字串），
 * 接著是各分組，照專案設定的順序。
 * 還沒轉換的舊資料（「其他」改過名字）：維持在最後、用那個名字當標題。
 */
export function splitBySection(tasks: Task[], sections: Section[], all: Map<string, Task>): { id: string; name: string; tasks: Task[] }[] {
  const real = realSections(sections);
  const valid = new Set(real.map((s) => s.id));
  const legacy = sections.some((s) => s.id === OTHER_SECTION);
  const loose = { id: "", name: legacy ? otherName(sections) : "", tasks: [] as Task[] };
  const named = real.map((s) => ({ id: s.id, name: s.name, tasks: [] as Task[] }));
  const groups = legacy ? [...named, loose] : [loose, ...named];
  const at = new Map(groups.map((g) => [g.id, g]));
  for (const t of tasks) at.get(sectionOf(t, all, valid))!.tasks.push(t);
  return groups;
}
