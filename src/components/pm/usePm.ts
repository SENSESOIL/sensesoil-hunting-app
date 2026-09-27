"use client";

import { useCallback, useMemo, useRef } from "react";
import useSWR from "swr";
import {
  buildSiteGroups,
  deriveProject,
  todayISO,
  type ProjectView,
} from "@/lib/project-ops";
import {
  newTaskId,
  projectToOps,
  taskToWorkItem,
  type PmData,
  type PmProject,
  type Person,
  type Task,
} from "@/lib/pm/model";
import { toast } from "./Sheet";

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
      return {
        ...p,
        view,
        tasks,
        openCount: tasks.filter((t) => t.status !== "done").length,
        lateCount: tasks.filter((t) => isLate(t, today)).length,
      };
    });
  }, [data, today]);

  const projectBy = useMemo(() => new Map(projects.map((p) => [p.code, p])), [projects]);

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

  /**
   * 新增或修改任務。patch 只要帶改了的欄位（新任務要帶 code、title）。
   * 回傳伺服器存好的任務；失敗回傳 null（畫面已還原、已提示）。
   */
  const saveTask = useCallback(
    async (patch: Partial<Task> & { id?: string }, opts: { quiet?: boolean } = {}): Promise<Task | null> => {
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

      return enqueue(id, async () => {
        const cur = latest.current?.tasks.find((t) => t.id === id);
        const version = prev ? cur?.version ?? prev.version : undefined;
        const res = await pmPost<{ status: string; task?: Task }>({
          op: "task.save",
          task: { ...patch, id, code: patch.code ?? prev?.code ?? optimistic.code },
          baseVersion: version && version > 0 ? version : undefined,
        });
        if (res.ok && res.data.task) {
          replaceTask(res.data.task);
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

  const deleteTask = useCallback(
    async (id: string) => {
      const prev = latest.current?.tasks.find((t) => t.id === id);
      replaceTask(undefined, id);
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
    async (ids: string[]) => {
      mutate(
        (d) => {
          if (!d) return d;
          const pos = new Map(ids.map((id, i) => [id, i]));
          return { ...d, tasks: d.tasks.map((t) => (pos.has(t.id) ? { ...t, seq: pos.get(t.id)! } : t)) };
        },
        { revalidate: false }
      );
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
      if (!d || !t || t.assigneeEmail !== d.me.email) return;
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
        pmPost({ op: "project.save", code, patch, baseVersion: prev?.hasRow ? prev.version : undefined })
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
    saveTask,
    deleteTask,
    reorderTasks,
    markTask,
    saveProject,
  };
}

export type Pm = ReturnType<typeof usePm>;

/** 顯示用的人名：自己顯示「我」 */
export function personLabel(pm: Pm, email?: string, fallback?: string): string {
  if (!email) return fallback ?? "未指派";
  if (email === pm.me?.email) return "我";
  return pm.personBy.get(email)?.name ?? fallback ?? email.split("@")[0];
}

export type { Person };
