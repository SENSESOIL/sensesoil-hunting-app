"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import {
  addDays,
  buildSiteGroups,
  diffDays,
  deriveProject,
  todayISO,
  type ProjectView,
} from "@/lib/project-ops";
import {
  defaultMark,
  isAssignee,
  taskAssignees,
  GOAL_COLORS,
  newGoalId,
  newTaskId,
  projectToOps,
  taskToWorkItem,
  type Goal,
  type PmData,
  type PmProject,
  type Section,
  type Person,
  type Task,
} from "@/lib/pm/model";
import { endOf, successorsOf } from "@/lib/pm/deps";
import { toast } from "./Sheet";
import { setAvatarDirectory } from "./kit";

/* ══════════════════════════════════════════════════════════
   專案／任務的前端資料層
   - 一份 SWR 快取（/api/pm），所有頁面共用；30 秒自動更新、回到 APP 時也更新
   - 寫入先更新畫面（樂觀更新），伺服器回來再換成正式的資料；失敗就還原
   - 同一個任務的連續操作排隊送出，每次都帶最新的版本號，不會自己跟自己衝突
   ══════════════════════════════════════════════════════════ */

export const PM_KEY = "/api/pm";

const fetcher = async (url: string): Promise<PmData> => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    const e = new Error((await r.json().catch(() => ({})))?.error || `HTTP ${r.status}`) as Error & { status?: number };
    e.status = r.status;
    throw e;
  }
  return r.json();
};

export async function pmPost<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  try {
    const r = await fetch(PM_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await r.json().catch(() => ({}))) as T & { error?: string };
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "網路連線失敗，請再試一次" } as T & { error?: string } };
  }
}

/** 畫面上的專案：資料庫欄位＋健康度等衍生指標 */
export interface ProjectItem extends PmProject {
  view: ProjectView;
  tasks: Task[];
  openCount: number;
  lateCount: number;
  /** 參與者：有任務在這個專案的人（未完成的在前） */
  participants: { email: string; name: string; open: number }[];
}

/** 本地先套用的狀態規則（與資料庫 pm_task_save 一致） */
function applyRules(prev: Task | undefined, t: Task, me: string): Task {
  const out = { ...t };
  if (out.status === "done") {
    out.progress = 100;
    if (!prev || prev.status !== "done") out.doneAt = new Date().toISOString();
  } else if (prev?.status === "done") {
    out.doneAt = undefined;
    if (out.progress >= 100) out.progress = 0;
    if (out.status === "todo" && out.progress > 0) out.status = "doing";
  } else if (out.progress >= 100) {
    out.status = "done";
    out.doneAt = new Date().toISOString();
  } else if (out.progress > 0 && out.status === "todo") {
    out.status = "doing";
  }
  if (out.assigneeEmail !== prev?.assigneeEmail) {
    out.assignedBy = out.assigneeEmail ? me : undefined;
    out.assignedAt = out.assigneeEmail ? new Date().toISOString() : undefined;
    out.seenAt = out.assigneeEmail === me ? new Date().toISOString() : undefined;
    out.ackAt = out.seenAt;
  }
  return out;
}

/** 畫面上的目標：連結的任務與自動計算的進度 */
export interface GoalItem extends Goal {
  color: string;
  tasks: Task[];
  doneCount: number;
  /** 0–100：完成件數／總件數（沒有任務時是 0） */
  progress: number;
  lateCount: number;
}

const CLEARABLE = ["start", "due", "note", "assigneeEmail", "assigneeName", "goalId", "parentId"] as const;
function clearable(patch: Partial<Task>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...patch };
  for (const k of CLEARABLE) if (k in patch && patch[k] === undefined) out[k] = null;
  return out;
}

export function isLate(t: Task, today: string) {
  return t.status !== "done" && !!t.due && t.due < today && t.kind !== "等待";
}

export function usePm() {
  const { data, error, isLoading, mutate } = useSWR<PmData>(PM_KEY, fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    dedupingInterval: 2_000,
    keepPreviousData: true,
  });
  const today = todayISO();
  const latest = useRef(data);
  latest.current = data;
  const queues = useRef(new Map<string, Promise<unknown>>());

  const me = data?.me;
  const isManager = me?.role === "manager";

  const people = useMemo(() => data?.people ?? [], [data?.people]);
  useEffect(() => setAvatarDirectory(people), [people]);
  const personBy = useMemo(() => new Map(people.map((p) => [p.email, p])), [people]);

  /** 專案（含衍生指標），依代碼排序 */
  const projects = useMemo<ProjectItem[]>(() => {
    if (!data) return [];
    const tasksBy = new Map<string, Task[]>();
    for (const t of data.tasks) tasksBy.set(t.code, [...(tasksBy.get(t.code) ?? []), t]);
    const reg = data.projects.map((p) => ({ code: p.code, seq: 0, company: p.company, name: p.name }));
    const siteGroups = buildSiteGroups(reg);
    const codesBySite = new Map<string, string[]>();
    siteGroups.forEach((g, code) => codesBySite.set(g, [...(codesBySite.get(g) || []), code]));
    return data.projects.map((p) => {
      const tasks = (tasksBy.get(p.code) ?? []).sort((a, b) => a.seq - b.seq || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
      const view = deriveProject(
        { code: p.code, seq: 0, company: p.company, name: p.name },
        projectToOps(p, tasks),
        tasks.map(taskToWorkItem),
        today,
        siteGroups,
        codesBySite
      );
      const who = new Map<string, { email: string; name: string; open: number }>();
      for (const t of tasks) {
        for (const e of taskAssignees(t)) {
          const cur = who.get(e) ?? { email: e, name: (e === t.assigneeEmail && t.assigneeName) || e.split("@")[0], open: 0 };
          if (t.status !== "done") cur.open++;
          who.set(e, cur);
        }
      }
      return {
        ...p,
        view,
        tasks,
        participants: [...who.values()].sort((a, b) => b.open - a.open),
        openCount: tasks.filter((t) => t.status !== "done").length,
        lateCount: tasks.filter((t) => isLate(t, today)).length,
      };
    });
  }, [data, today]);

  const projectBy = useMemo(() => new Map(projects.map((p) => [p.code, p])), [projects]);

  /** 公司目標（依排序），附連結的任務與進度 */
  const goals = useMemo<GoalItem[]>(() => {
    if (!data?.goals) return [];
    const byGoal = new Map<string, Task[]>();
    for (const t of data.tasks) if (t.goalId) byGoal.set(t.goalId, [...(byGoal.get(t.goalId) ?? []), t]);
    return [...data.goals]
      .sort((a, b) => a.seq - b.seq || (a.start ?? "9999").localeCompare(b.start ?? "9999"))
      .map((g, i) => {
        const tasks = (byGoal.get(g.id) ?? []).sort((a, b) => (a.start ?? a.due ?? "9999").localeCompare(b.start ?? b.due ?? "9999"));
        const doneCount = tasks.filter((t) => t.status === "done").length;
        return {
          ...g,
          color: g.color || GOAL_COLORS[i % GOAL_COLORS.length],
          tasks,
          doneCount,
          progress: tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0,
          lateCount: tasks.filter((t) => isLate(t, today)).length,
        };
      });
  }, [data?.goals, data?.tasks, today]);
  const goalBy = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);

  /** 排隊：同一個 key 的請求依序送出 */
  const enqueue = useCallback(<T,>(key: string, job: () => Promise<T>): Promise<T> => {
    const prev = queues.current.get(key) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(job);
    queues.current.set(key, next);
    next.finally(() => {
      if (queues.current.get(key) === next) queues.current.delete(key);
    });
    return next;
  }, []);

  const replaceTask = useCallback(
    (t: Task | undefined, removeId?: string) =>
      mutate(
        (d) => {
          if (!d) return d;
          let tasks = d.tasks.filter((x) => x.id !== (removeId ?? t?.id));
          if (t) tasks = [...tasks, t];
          return { ...d, tasks };
        },
        { revalidate: false }
      ),
    [mutate]
  );

  type SaveOpts = { quiet?: boolean; chain?: Set<string> };
  const saveRef = useRef<((patch: Partial<Task> & { id?: string }, opts?: SaveOpts) => Promise<Task | null>) | null>(null);

  /**
   * 新增或修改任務。patch 只要帶改了的欄位（新任務要帶 code、title）。
   * 回傳伺服器存好的任務；失敗回傳 null（畫面已還原、已提示）。
   */
  const saveTask = useCallback(
    async (patch: Partial<Task> & { id?: string }, opts: SaveOpts = {}): Promise<Task | null> => {
      const d = latest.current;
      if (!d) return null;
      const id = patch.id ?? newTaskId();
      const prev = d.tasks.find((t) => t.id === id);
      const base: Task = prev ?? {
        id,
        code: patch.code ?? "",
        title: "",
        kind: "施工",
        status: "todo",
        progress: 0,
        flagged: false,
        seq: Math.max(-1, ...d.tasks.filter((t) => t.code === patch.code).map((t) => t.seq)) + 1,
        version: 0,
        createdBy: d.me.email,
        createdAt: new Date().toISOString(),
      };
      // member 新建的待辦一律是自己的
      if (!prev && d.me.role !== "manager") {
        patch = { ...patch, assigneeEmail: d.me.email, assigneeName: d.me.name };
      }
      const optimistic = applyRules(prev, { ...base, ...patch, id } as Task, d.me.email);
      replaceTask(optimistic);

      // 前置任務（WBS）：結束日移了 → 接在後面的任務整段平移同樣的天數（間隔不變），一路往後接
      const oldEnd = prev ? endOf(prev) : undefined;
      const newEnd = endOf(optimistic);
      if (prev && newEnd && oldEnd !== newEnd) {
        const chain = new Set(opts.chain ?? []);
        chain.add(id);
        let moved = 0;
        for (const s of successorsOf(d.tasks, optimistic)) {
          if (chain.has(s.id) || s.status === "done" || !(s.start || s.due)) continue;
          // 前一個原本沒日期：直接排到它結束的隔天
          const delta = oldEnd ? diffDays(oldEnd, newEnd) : diffDays((s.start ?? s.due)!, addDays(newEnd, 1));
          if (!delta) continue;
          moved++;
          saveRef.current?.(
            { id: s.id, ...(s.start ? { start: addDays(s.start, delta) } : {}), ...(s.due ? { due: addDays(s.due, delta) } : {}) },
            { quiet: true, chain }
          );
        }
        if (moved && !opts.chain) toast(`接在後面的 ${moved} 個任務也一起移了`);
      }

      return enqueue(id, async () => {
        const cur = latest.current?.tasks.find((t) => t.id === id);
        const version = prev ? cur?.version ?? prev.version : undefined;
        const res = await pmPost<{ status: string; task?: Task; extraError?: string }>({
          op: "task.save",
          // 要清空的欄位送 null（JSON 會把 undefined 整個拿掉，伺服器就不知道要清空）
          task: { ...clearable(patch), id, code: patch.code ?? prev?.code ?? optimistic.code },
          baseVersion: version && version > 0 ? version : undefined,
        });
        if (res.ok && res.data.task) {
          replaceTask(res.data.task);
          // 子任務、標籤沒存進去（例如還沒執行 SQL、層級不合規則）
          if (res.data.extraError) toast(res.data.extraError, { tone: "error" });
          return res.data.task;
        }
        if (res.status === 409) {
          toast("有人剛改過這個任務，已換成最新的內容", { tone: "error" });
        } else if (!opts.quiet) {
          toast(res.data.error || "儲存失敗", { tone: "error" });
        }
        await mutate();
        return null;
      });
    },
    [enqueue, mutate, replaceTask]
  );
  saveRef.current = saveTask;

  const deleteTask = useCallback(
    async (id: string) => {
      const prev = latest.current?.tasks.find((t) => t.id === id);
      replaceTask(undefined, id);
      // 子任務留下來，變回一般任務（與資料庫 on delete set null 一致）
      mutate((d) => (d ? { ...d, tasks: d.tasks.map((t) => (t.parentId === id ? { ...t, parentId: undefined } : t)) } : d), { revalidate: false });
      const res = await enqueue(id, () => pmPost({ op: "task.delete", id }));
      if (!res.ok) {
        toast(res.data.error || "刪除失敗", { tone: "error" });
        await mutate();
        return false;
      }
      return prev ?? true;
    },
    [enqueue, mutate, replaceTask]
  );

  const reorderTasks = useCallback(
    async (ids: string[], opts: { localOnly?: boolean } = {}) => {
      mutate(
        (d) => {
          if (!d) return d;
          const pos = new Map(ids.map((id, i) => [id, i]));
          return { ...d, tasks: d.tasks.map((t) => (pos.has(t.id) ? { ...t, seq: pos.get(t.id)! } : t)) };
        },
        { revalidate: false }
      );
      if (opts.localOnly) return;
      const res = await pmPost({ op: "task.reorder", ids });
      if (!res.ok) {
        toast(res.data.error || "排序沒有存到", { tone: "error" });
        await mutate();
      }
    },
    [mutate]
  );

  /** 被指派的人：打開（seen）／按收到（ack） */
  const markTask = useCallback(
    async (id: string, what: "seen" | "ack") => {
      const d = latest.current;
      const t = d?.tasks.find((x) => x.id === id);
      if (!d || !t || !isAssignee(t, d.me.email)) return;
      if (what === "seen" && t.seenAt) return;
      if (what === "ack" && t.ackAt) return;
      const now = new Date().toISOString();
      replaceTask({ ...t, seenAt: t.seenAt ?? now, ackAt: what === "ack" ? now : t.ackAt });
      const res = await pmPost<{ task?: Task }>({ op: "task.mark", id, what });
      if (res.ok && res.data.task) {
        replaceTask(res.data.task);
        // 打開任務會把相關通知標為已讀
        mutate();
      }
    },
    [mutate, replaceTask]
  );

  const saveProject = useCallback(
    async (code: string, patch: Partial<PmProject>): Promise<boolean> => {
      const d = latest.current;
      const prev = d?.projects.find((p) => p.code === code);
      mutate(
        (x) =>
          x && {
            ...x,
            projects: prev
              ? x.projects.map((p) => (p.code === code ? { ...p, ...patch, hasRow: true } : p))
              : [...x.projects, { code, name: patch.name ?? code, company: patch.company ?? "", inCrm: false, hasRow: true, archived: false, version: 0, photoCount: 0, ...patch }],
          },
        { revalidate: false }
      );
      const res = await enqueue(`project:${code}`, () =>
        // 要清空的欄位送 null（JSON 會把 undefined 整個拿掉，伺服器就不知道要清空，重新整理後又跑回來）
        pmPost({ op: "project.save", code, patch: Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? null : v])), baseVersion: prev?.hasRow ? prev.version : undefined })
      );
      if (!res.ok) {
        toast(res.status === 409 ? "有人剛改過這個專案，已換成最新的內容" : res.data.error || "儲存失敗", { tone: "error" });
        await mutate();
        return false;
      }
      await mutate();
      return true;
    },
    [enqueue, mutate]
  );

  /** 刪除專案（只有管理者）：任務、排程、照片紀錄、專案資料全部清掉，只留案名；CRM 名冊不動 */
  const purgeProject = useCallback(
    async (code: string): Promise<{ tasks: number; photos: number } | null> => {
      const res = await pmPost<{ status: string; tasks?: number; photos?: number }>({ op: "project.purge", code });
      if (!res.ok || res.data.status !== "ok") {
        toast(res.data.error || "刪除失敗", { tone: "error" });
        return null;
      }
      await mutate();
      return { tasks: res.data.tasks ?? 0, photos: res.data.photos ?? 0 };
    },
    [mutate]
  );

  /** 設定專案的「可編輯的人」（只有管理者） */
  const saveEditors = useCallback(
    async (code: string, editors: string[]): Promise<boolean> => {
      mutate((x) => x && { ...x, projects: x.projects.map((p) => (p.code === code ? { ...p, editors } : p)) }, { revalidate: false });
      const res = await enqueue(`editors:${code}`, () => pmPost({ op: "editors.save", code, editors }));
      if (!res.ok) {
        toast(res.data.error || "可編輯的人儲存失敗", { tone: "error" });
        await mutate();
        return false;
      }
      return true;
    },
    [enqueue, mutate]
  );

  /** 設定專案的「可閱讀的人」（只有管理者） */
  const saveViewers = useCallback(
    async (code: string, viewers: string[]): Promise<boolean> => {
      mutate((x) => x && { ...x, projects: x.projects.map((p) => (p.code === code ? { ...p, viewers } : p)) }, { revalidate: false });
      const res = await enqueue(`viewers:${code}`, () => pmPost({ op: "viewers.save", code, viewers }));
      if (!res.ok) {
        toast(res.data.error || "可閱讀的人儲存失敗", { tone: "error" });
        await mutate();
        return false;
      }
      return true;
    },
    [enqueue, mutate]
  );

  /** 整份覆寫某個專案的清單分組（只有管理者） */
  const saveSections = useCallback(
    async (code: string, sections: Section[]): Promise<boolean> => {
      mutate((x) => x && { ...x, projects: x.projects.map((p) => (p.code === code ? { ...p, sections } : p)) }, { revalidate: false });
      const res = await enqueue(`sections:${code}`, () => pmPost({ op: "sections.save", code, sections }));
      if (!res.ok) {
        toast(res.data.error || "分組儲存失敗", { tone: "error" });
        await mutate();
        return false;
      }
      return true;
    },
    [enqueue, mutate]
  );

  /** 新增或修改公司目標（只有管理者）。回傳存好的目標；失敗回傳 null */
  const saveGoal = useCallback(
    async (patch: Partial<Goal> & { id?: string }): Promise<Goal | null> => {
      const d = latest.current;
      if (!d) return null;
      const id = patch.id ?? newGoalId();
      const prev = d.goals.find((g) => g.id === id);
      const optimistic: Goal = { ...(prev ?? { id, title: "", seq: d.goals.length, version: 0 }), ...patch, id };
      await mutate((cur) => (cur ? { ...cur, goals: [...cur.goals.filter((g) => g.id !== id), optimistic] } : cur), { revalidate: false });
      const res = await enqueue(`goal:${id}`, () =>
        pmPost<{ status: string; goal?: Goal }>({ op: "goal.save", goal: { ...patch, id }, baseVersion: prev?.version })
      );
      if (res.ok && res.data.goal) {
        const saved = res.data.goal;
        await mutate((cur) => (cur ? { ...cur, goals: [...cur.goals.filter((g) => g.id !== id), saved] } : cur), { revalidate: false });
        return saved;
      }
      toast(res.status === 409 ? "有人剛改過這個目標，已換成最新的內容" : res.data.error || "儲存失敗", { tone: "error" });
      await mutate();
      return null;
    },
    [enqueue, mutate]
  );

  const deleteGoal = useCallback(
    async (id: string) => {
      await mutate(
        (cur) =>
          cur
            ? {
                ...cur,
                goals: cur.goals.filter((g) => g.id !== id),
                tasks: cur.tasks.map((t) => (t.goalId === id ? { ...t, goalId: undefined } : t)),
              }
            : cur,
        { revalidate: false }
      );
      const res = await enqueue(`goal:${id}`, () => pmPost({ op: "goal.delete", id }));
      if (!res.ok) {
        toast(res.data.error || "刪除失敗", { tone: "error" });
        await mutate();
        return false;
      }
      return true;
    },
    [enqueue, mutate]
  );

  return {
    data,
    error: error as (Error & { status?: number }) | undefined,
    isLoading,
    refresh: () => mutate(),
    today,
    me,
    isManager,
    people,
    personBy,
    projects,
    projectBy,
    tasks: data?.tasks ?? [],
    goals,
    goalBy,
    goalsReady: data?.goalsReady ?? false,
    saveGoal,
    deleteGoal,
    saveTask,
    deleteTask,
    reorderTasks,
    markTask,
    saveProject,
    saveSections,
    saveEditors,
    saveViewers,
    purgeProject,
  };
}

export type Pm = ReturnType<typeof usePm>;

/** 顯示用的人名：自己顯示「我」 */
export function personLabel(pm: Pm, email?: string, fallback?: string): string {
  if (!email) return fallback ?? "未指派";
  if (email === pm.me?.email) return "我";
  return pm.personBy.get(email)?.name ?? fallback ?? email.split("@")[0];
}

/** 清單上大頭照旁邊的代表字：自己設定的，沒有就用名字最後一個字 */
export function personMark(pm: Pm, email: string, fallbackName?: string): string {
  const p = pm.personBy.get(email);
  return p?.mark || defaultMark(p?.name ?? fallbackName ?? email.split("@")[0]);
}

/** 所有負責人的名字：「我」、「王小明、陳大文」、「王小明、陳大文 等 4 人」 */
export function assigneeLabel(pm: Pm, t: Pick<Task, "assigneeEmail" | "assigneeName" | "coAssignees">): string {
  const names = taskAssignees(t).map((e) => personLabel(pm, e, e === t.assigneeEmail ? t.assigneeName : undefined));
  if (!names.length) return "未指派";
  return names.length <= 2 ? names.join("、") : `${names.slice(0, 2).join("、")} 等 ${names.length} 人`;
}

/** 負責人清單 → 存檔用的欄位：第一位是主要負責人（收通知、回條），其餘是協作者 */
export function assigneePatch(pm: Pm, list: string[]): Pick<Task, "assigneeEmail" | "assigneeName" | "coAssignees"> {
  const [first, ...rest] = [...new Set(list)];
  return { assigneeEmail: first, assigneeName: first ? pm.personBy.get(first)?.name : undefined, coAssignees: rest };
}

/** 能不能編輯這個專案（甘特圖編輯、改任務）：管理者，或專案設定的「可編輯的人」 */
export function canEditProject(pm: Pm, code?: string): boolean {
  if (pm.isManager) return true;
  const me = pm.me?.email;
  return !!me && !!code && !!pm.projectBy.get(code)?.editors?.includes(me);
}

/** 只能看的專案：被設成「可閱讀的人」、但不能編輯（不是管理者、也不是可編輯的人） */
export function isProjectViewer(pm: Pm, code?: string): boolean {
  const me = pm.me?.email;
  return !!me && !!code && !canEditProject(pm, code) && !!pm.projectBy.get(code)?.viewers?.includes(me);
}

export type { Person };
