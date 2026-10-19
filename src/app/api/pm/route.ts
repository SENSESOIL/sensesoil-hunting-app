import { NextResponse } from "next/server";
import {
  explainDbError,
  getPmUser,
  listPeople,
  pmDbConfigured,
  readRegistry,
  rpc,
  type PmUser,
} from "@/lib/pm/server";
import { pushConfigured, pushNotifications, type NotifyRow } from "@/lib/pm/push";
import { photoConfigured } from "@/lib/pm/drive";
import {
  goalPatchToRow,
  PROJECT_MONEY_KEYS,
  projectPatchToRow,
  rowToGoal,
  rowToNotification,
  rowToProject,
  rowToTask,
  taskPatchToRow,
  TASK_STATUSES,
  type Goal,
  type PmData,
  type PmProject,
  type Task,
} from "@/lib/pm/model";
import { isInternal, STAGES, WORK_KINDS } from "@/lib/project-ops";
import { cleanMeta } from "@/lib/pm/tags";

export const dynamic = "force-dynamic";

/**
 * 專案／任務 API
 *   GET  /api/pm            首頁資料（專案、任務、公司目標、人員、未讀數）
 *   POST /api/pm {op, …}    寫入：task.save / task.delete / task.reorder / task.mark /
 *                           project.save / goal.save / goal.delete / notifications.list / notifications.read /
 *                           push.subscribe / push.unsubscribe / push.test
 *
 * 權限：登入且在權限表上（未離職）。manager 可以派工與看全部；member 只看得到指派給自己的任務，
 *       只能改狀態／進度／備註，也看不到金額。資料庫函式裡會再檢查一次。
 */

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function requireUser(): Promise<PmUser | NextResponse> {
  const user = await getPmUser();
  if (!user) return json({ error: "未登入或沒有權限" }, 401);
  return user;
}

/* ══════════════════════════════════════════════════════════
   GET
   ══════════════════════════════════════════════════════════ */

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const [people, registry] = await Promise.all([listPeople(), readRegistry()]);
  const base: PmData = {
    me: { email: user.email, name: user.name, role: user.role },
    configured: pmDbConfigured(),
    people,
    projects: [],
    tasks: [],
    goals: [],
    goalsReady: false,
    unread: 0,
    photoReady: photoConfigured(),
    pushReady: pushConfigured(),
    fetchedAt: new Date().toISOString(),
  };

  let rows: Record<string, unknown>[] = [];
  let photoCounts: Record<string, number> = {};
  if (base.configured) {
    try {
      const d = await rpc<{
        projects: Record<string, unknown>[];
        tasks: Record<string, unknown>[];
        unread: number;
        photo_counts: Record<string, number>;
      }>("pm_data", { actor: user.email, role: user.role });
      rows = d.projects ?? [];
      base.tasks = (d.tasks ?? []).map(rowToTask);
      base.unread = d.unread ?? 0;
      photoCounts = d.photo_counts ?? {};
    } catch (e) {
      base.dbError = explainDbError(e);
    }
    // 公司目標；20261014000000_pm_goals.sql 還沒執行也不影響其他功能
    if (!base.dbError) {
      try {
        const g = await rpc<Record<string, unknown>[]>("pm_goals_list", { actor: user.email });
        base.goals = (g ?? []).map(rowToGoal);
        base.goalsReady = true;
      } catch {
        /* 還沒建 pm_goals */
      }
    }
    // 大頭照（團隊頁上傳的）；團隊的資料表還沒建也不影響其他功能
    if (!base.dbError) {
      try {
        const avatars = await rpc<Record<string, string>>("pm_avatars", {});
        for (const p of base.people) if (avatars[p.email]) p.avatar = avatars[p.email];
      } catch {
        /* 20260929000000_pm_team.sql 還沒執行 */
      }
      try {
        const marks = await rpc<Record<string, string>>("pm_marks", {});
        for (const p of base.people) if (marks[p.email]) p.mark = marks[p.email];
      } catch {
        /* 20261019000000_pm_profile_mark.sql 還沒執行 */
      }
    }
  }

  // 名冊（CRM）＋資料庫：CRM 有的以 CRM 的名稱為準；資料庫裡 APP 新建的也列進來
  const byCode = new Map(rows.map((r) => [String(r.code), rowToProject(r)]));
  const projects: PmProject[] = [];
  for (const reg of registry.data) {
    if (isInternal(reg)) continue;
    const row = byCode.get(reg.code);
    byCode.delete(reg.code);
    projects.push({
      ...(row ?? { code: reg.code, hasRow: false, archived: false, version: 0 }),
      code: reg.code,
      name: reg.name,
      company: reg.company,
      inCrm: true,
      photoCount: photoCounts[reg.code] ?? 0,
    } as PmProject);
  }
  for (const row of byCode.values()) {
    projects.push({ ...row, name: row.name || row.code, company: row.company || "", inCrm: false, photoCount: photoCounts[row.code] ?? 0 } as PmProject);
  }

  // member 看不到金額
  if (user.role !== "manager") {
    for (const p of projects) for (const k of PROJECT_MONEY_KEYS) delete p[k];
  }
  base.projects = projects;
  return json(base);
}

/* ══════════════════════════════════════════════════════════
   POST
   ══════════════════════════════════════════════════════════ */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown) => v === undefined || v === null || (typeof v === "string" && ISO.test(v));

function checkTask(t: Partial<Task>): string | null {
  if (!t.id || typeof t.id !== "string" || t.id.length > 64) return "任務識別碼不正確";
  if ("title" in t && (typeof t.title !== "string" || !t.title.trim() || t.title.length > 80)) return "任務名稱必填（80 字內）";
  if ("status" in t && !TASK_STATUSES.includes(t.status as never)) return "狀態不正確";
  if ("kind" in t && t.kind !== undefined && !(WORK_KINDS as string[]).includes(t.kind)) return "類型不正確";
  if ("progress" in t && (typeof t.progress !== "number" || t.progress < 0 || t.progress > 100)) return "進度要在 0–100";
  if (!isDate(t.start) || !isDate(t.due)) return "日期格式不正確";
  if (t.start && t.due && t.due < t.start) return "期限不能早於開始日";
  if ("note" in t && t.note !== undefined && t.note !== null && (typeof t.note !== "string" || t.note.length > 2000)) return "備註太長";
  if ("parentId" in t && t.parentId !== null && t.parentId !== undefined && (typeof t.parentId !== "string" || t.parentId.length > 64 || t.parentId === t.id)) return "上層任務不正確";
  if ("coAssignees" in t && t.coAssignees !== undefined && t.coAssignees !== null && (!Array.isArray(t.coAssignees) || t.coAssignees.length > 20 || t.coAssignees.some((e) => typeof e !== "string" || e.length > 120))) return "協作者格式不正確";
  if ("meta" in t && t.meta !== undefined && (typeof t.meta !== "object" || t.meta === null || Array.isArray(t.meta))) return "標籤格式不正確";
  return null;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
function checkGoal(g: Partial<Goal>): string | null {
  if (!g.id || typeof g.id !== "string" || g.id.length > 64) return "目標識別碼不正確";
  if ("title" in g && (typeof g.title !== "string" || !g.title.trim() || g.title.length > 80)) return "目標名稱必填（80 字內）";
  if (!isDate(g.start) || !isDate(g.due)) return "日期格式不正確";
  if (g.start && g.due && g.due < g.start) return "結束日不能早於開始日";
  if ("color" in g && g.color !== undefined && g.color !== null && !HEX.test(String(g.color))) return "顏色格式不正確";
  if ("note" in g && g.note !== undefined && (typeof g.note !== "string" || g.note.length > 2000)) return "說明太長";
  return null;
}

function checkProjectPatch(p: Partial<PmProject>): string | null {
  if ("stage" in p && p.stage !== undefined && !STAGES.includes(p.stage)) return "階段不正確";
  for (const k of ["signedAt", "startAt", "dueAt", "doneAt"] as const) if (!isDate(p[k])) return "日期格式不正確";
  if (p.startAt && p.dueAt && p.dueAt < p.startAt) return "預計完工不能早於開工";
  for (const k of PROJECT_MONEY_KEYS) {
    const v = p[k];
    if (v !== undefined && v !== null && (typeof v !== "number" || !Number.isInteger(v) || Math.abs(v) > 1e11)) return "金額要是整數（元）";
  }
  if (p.progress !== undefined && p.progress !== null && (typeof p.progress !== "number" || p.progress < 0 || p.progress > 100)) return "進度要在 0–100";
  if (p.name !== undefined && p.name !== null && (typeof p.name !== "string" || p.name.length > 80)) return "專案名稱太長";
  return null;
}

type Body = Record<string, unknown> & { op?: string };

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!pmDbConfigured()) return json({ error: "資料庫尚未設定" }, 503);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "格式錯誤" }, 400);
  }
  const actor = { actor: user.email, actor_name: user.name, role: user.role };
  // 專案的「可編輯的人」：在這個專案裡和管理者一樣（改任務、排程、指派）
  const actorFor = async (q: { code?: string; task_id?: string }) => {
    if (user.role === "manager") return actor;
    try {
      const ok = await rpc<boolean>("pm_project_can_edit", { actor: user.email, ...q });
      return ok ? { ...actor, role: "manager" as const } : actor;
    } catch {
      return actor; // 20261022000000_pm_project_editors.sql 還沒執行
    }
  };

  try {
    switch (body.op) {
      case "task.save": {
        const t = body.task as Partial<Task> & { id: string };
        const bad = checkTask(t ?? {});
        const act = await actorFor({ code: t?.code, task_id: t?.id });
        if (bad) return json({ error: bad }, 400);
        // 指派對象必須是權限表上的人；名字以權限表為準
        if (t.assigneeEmail) {
          const people = await listPeople();
          const who = people.find((p) => p.email === t.assigneeEmail!.toLowerCase());
          if (!who) return json({ error: "指派對象不在人員名單上" }, 400);
          t.assigneeName = who.name;
        }
        // 協作者也必須在人員名單上；去重、拿掉主要負責人
        if (Array.isArray(t.coAssignees)) {
          const people = await listPeople();
          const list = [...new Set(t.coAssignees.map((e) => e.trim().toLowerCase()).filter(Boolean))];
          if (list.some((e) => !people.some((p) => p.email === e))) return json({ error: "協作者不在人員名單上" }, 400);
          t.coAssignees = list;
        }
        if (t.meta) t.meta = cleanMeta(t.meta);
        let projectName = "";
        if (t.code) {
          const reg = await readRegistry();
          projectName = reg.data.find((p) => p.code === t.code)?.name ?? "";
        }
        // 上層任務、標籤、目標另外寫（pm_task_save 修改既有任務時不會更新這些後來加的欄位）
        const row = taskPatchToRow(t);
        const extra: Record<string, unknown> = {};
        for (const k of ["parent_id", "meta", "goal_id", "co_assignees"]) if (k in row) extra[k] = row[k];
        delete row.parent_id;
        delete row.co_assignees;
        // 新增任務時 pm_task_save 用 jsonb_populate_record 建整列，沒帶到的欄位會是 null（不會套用預設值）；
        // meta 是 not null，一定要帶 {}。既有任務的 update 不會動 meta，所以帶了也沒關係
        if (!("meta" in row)) row.meta = {};
        const r = await rpc<{ status: string; task?: Record<string, unknown>; notify?: NotifyRow[] }>("pm_task_save", {
          ...act,
          project_name: projectName,
          base_version: typeof body.baseVersion === "number" ? body.baseVersion : null,
          task: row,
        });
        let task = r.task;
        let extraError: string | undefined;
        if (Object.keys(extra).length && r.task && ["ok", "created", "unchanged"].includes(r.status)) {
          try {
            const x = await rpc<{ status: string; task?: Record<string, unknown>; notify?: NotifyRow[] }>("pm_task_set_extra", { ...act, id: t.id, extra });
            if (x.task) task = x.task;
            if (x.notify?.length) r.notify = [...(r.notify ?? []), ...x.notify];
            // 舊版函式不認得 co_assignees，會默默略過：提醒要先執行 SQL
            if ("co_assignees" in extra && x.task && !("co_assignees" in x.task)) extraError = "多人指派還沒啟用：請在 Supabase 執行 20261018000000_pm_task_assignees.sql";
            if (x.status === "invalid") extraError = "子任務只能有一層，而且要在同一個專案裡";
            if (x.status === "forbidden") extraError = "只能調整自己建立的任務";
          } catch (e) {
            extraError = explainDbError(e).includes("資料庫還沒建立")
              ? "子任務與標籤還沒啟用：請在 Supabase 執行 20261017000000_pm_task_tree.sql"
              : explainDbError(e);
          }
        }
        const pushed = await pushNotifications(r.notify);
        return json(
          { status: r.status, task: task ? rowToTask(task) : undefined, notified: (r.notify ?? []).length, pushed, extraError },
          statusCode(r.status)
        );
      }
      case "task.delete": {
        const act = await actorFor({ task_id: String(body.id ?? "") });
        const r = await rpc<{ status: string; notify?: NotifyRow[] }>("pm_task_delete", { ...act, id: String(body.id ?? "") });
        await pushNotifications(r.notify);
        return json({ status: r.status }, statusCode(r.status));
      }
      case "task.reorder": {
        const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 500) : [];
        const act = await actorFor({ task_id: ids[0] });
        const r = await rpc<{ status: string }>("pm_task_reorder", { ...act, ids });
        return json(r, statusCode(r.status));
      }
      case "task.mark": {
        const what = body.what === "ack" ? "ack" : "seen";
        const r = await rpc<{ status: string; task?: Record<string, unknown>; notify?: NotifyRow[] }>("pm_task_mark", {
          ...actor,
          id: String(body.id ?? ""),
          what,
        });
        await pushNotifications(r.notify);
        return json({ status: r.status, task: r.task ? rowToTask(r.task) : undefined }, statusCode(r.status));
      }
      case "project.save": {
        if (user.role !== "manager") return json({ error: "只有管理者可以修改專案" }, 403);
        const code = String(body.code ?? "").trim();
        if (!code || code.length > 32) return json({ error: "專案代碼不正確" }, 400);
        const patch = (body.patch ?? {}) as Partial<PmProject>;
        const bad = checkProjectPatch(patch);
        if (bad) return json({ error: bad }, 400);
        const r = await rpc<{ status: string; project?: Record<string, unknown> }>("pm_project_save", {
          ...actor,
          code,
          base_version: typeof body.baseVersion === "number" && body.baseVersion > 0 ? body.baseVersion : null,
          patch: projectPatchToRow(patch),
        });
        return json({ status: r.status, project: r.project ? rowToProject(r.project) : undefined }, statusCode(r.status));
      }
      case "editors.save": {
        if (user.role !== "manager") return json({ error: "只有管理者可以設定可編輯的人" }, 403);
        const code = String(body.code ?? "").trim();
        const list = Array.isArray(body.editors) ? [...new Set((body.editors as unknown[]).map((e) => String(e).trim().toLowerCase()).filter(Boolean))] : null;
        if (!code || code.length > 32 || !list || list.length > 50) return json({ error: "格式不正確" }, 400);
        const people = await listPeople();
        if (list.some((e) => !people.some((p) => p.email === e))) return json({ error: "有人不在人員名單上" }, 400);
        try {
          const r = await rpc<{ status: string; editors?: string[] }>("pm_project_set_editors", { ...actor, code, editors: list });
          return json(r, r.status === "forbidden" ? 403 : 200);
        } catch (e) {
          const msg = explainDbError(e);
          return json({ error: msg.includes("資料庫還沒建立") ? "可編輯的人還沒啟用：請在 Supabase 執行 20261022000000_pm_project_editors.sql" : msg }, 500);
        }
      }
      case "sections.save": {
        if (user.role !== "manager") return json({ error: "只有管理者可以調整分組" }, 403);
        const code = String(body.code ?? "").trim();
        const list = Array.isArray(body.sections) ? (body.sections as { id?: unknown; name?: unknown }[]) : null;
        if (!code || code.length > 32 || !list || list.length > 50) return json({ error: "分組格式不正確" }, 400);
        const clean = list.map((x) => ({ id: String(x.id ?? "").slice(0, 40), name: String(x.name ?? "").trim().slice(0, 40) || "未命名分組" }));
        if (clean.some((x) => !x.id) || new Set(clean.map((x) => x.id)).size !== clean.length) return json({ error: "分組格式不正確" }, 400);
        try {
          const r = await rpc<{ status: string; sections?: unknown }>("pm_sections_set", { ...actor, code, sections: clean });
          return json(r, r.status === "forbidden" ? 403 : 200);
        } catch (e) {
          const msg = explainDbError(e);
          return json({ error: msg.includes("資料庫還沒建立") ? "分組還沒啟用：請在 Supabase 執行 20261021000000_pm_sections.sql" : msg }, 500);
        }
      }
      case "goal.save": {
        if (user.role !== "manager") return json({ error: "只有管理者可以設定公司目標" }, 403);
        const g = body.goal as Partial<Goal> & { id: string };
        const bad = checkGoal(g ?? {});
        if (bad) return json({ error: bad }, 400);
        if (g.ownerEmail) {
          const people = await listPeople();
          const who = people.find((p) => p.email === g.ownerEmail!.toLowerCase());
          if (!who) return json({ error: "負責人不在人員名單上" }, 400);
          g.ownerName = who.name;
        }
        if (g.title) g.title = g.title.trim();
        const r = await rpc<{ status: string; goal?: Record<string, unknown> }>("pm_goal_save", {
          ...actor,
          base_version: typeof body.baseVersion === "number" && body.baseVersion > 0 ? body.baseVersion : null,
          goal: goalPatchToRow(g),
        });
        return json({ status: r.status, goal: r.goal ? rowToGoal(r.goal) : undefined }, statusCode(r.status));
      }
      case "goal.delete": {
        if (user.role !== "manager") return json({ error: "只有管理者可以刪除公司目標" }, 403);
        const r = await rpc<{ status: string }>("pm_goal_delete", { ...actor, id: String(body.id ?? "") });
        return json(r, statusCode(r.status));
      }
      case "notifications.list": {
        const r = await rpc<{ items: Record<string, unknown>[]; unread: number }>("pm_notifications_list", { ...actor, limit: 60 });
        return json({ items: r.items.map(rowToNotification), unread: r.unread });
      }
      case "notifications.read": {
        const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isFinite) : undefined;
        const r = await rpc<{ unread: number }>("pm_notifications_read", { ...actor, ...(ids ? { ids } : {}) });
        return json(r);
      }
      case "push.subscribe": {
        const sub = body.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
        if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return json({ error: "訂閱資料不完整" }, 400);
        await rpc("pm_push_save", {
          ...actor,
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          user_agent: req.headers.get("user-agent") ?? "",
        });
        return json({ status: "ok" });
      }
      case "push.unsubscribe": {
        await rpc("pm_push_delete", { endpoint: String(body.endpoint ?? "") });
        return json({ status: "ok" });
      }
      case "push.test": {
        const sent = await pushNotifications([
          { recipient: user.email, type: "updated", title: "通知已開啟", body: "之後有人指派任務給你，這支手機會收到提醒。" },
        ]);
        return json({ status: sent ? "ok" : "none", sent });
      }
      default:
        return json({ error: "未知的操作" }, 400);
    }
  } catch (e) {
    console.error("[api/pm]", body.op, e);
    return json({ error: explainDbError(e) }, 500);
  }
}

function statusCode(status: string): number {
  if (status === "conflict") return 409;
  if (status === "forbidden") return 403;
  if (status === "not_found") return 404;
  return 200;
}
