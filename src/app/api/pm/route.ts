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
  PROJECT_MONEY_KEYS,
  projectPatchToRow,
  rowToNotification,
  rowToProject,
  rowToTask,
  taskPatchToRow,
  TASK_STATUSES,
  type PmData,
  type PmProject,
  type Task,
} from "@/lib/pm/model";
import { isInternal, STAGES, WORK_KINDS } from "@/lib/project-ops";

export const dynamic = "force-dynamic";

/**
 * 專案／任務 API
 *   GET  /api/pm            首頁資料（專案、任務、人員、未讀數）
 *   POST /api/pm {op, …}    寫入：task.save / task.delete / task.reorder / task.mark /
 *                           project.save / notifications.list / notifications.read /
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
  if ("note" in t && t.note !== undefined && (typeof t.note !== "string" || t.note.length > 2000)) return "備註太長";
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

  try {
    switch (body.op) {
      case "task.save": {
        const t = body.task as Partial<Task> & { id: string };
        const bad = checkTask(t ?? {});
        if (bad) return json({ error: bad }, 400);
        // 指派對象必須是權限表上的人；名字以權限表為準
        if (t.assigneeEmail) {
          const people = await listPeople();
          const who = people.find((p) => p.email === t.assigneeEmail!.toLowerCase());
          if (!who) return json({ error: "指派對象不在人員名單上" }, 400);
          t.assigneeName = who.name;
        }
        let projectName = "";
        if (t.code) {
          const reg = await readRegistry();
          projectName = reg.data.find((p) => p.code === t.code)?.name ?? "";
        }
        const r = await rpc<{ status: string; task?: Record<string, unknown>; notify?: NotifyRow[] }>("pm_task_save", {
          ...actor,
          project_name: projectName,
          base_version: typeof body.baseVersion === "number" ? body.baseVersion : null,
          task: taskPatchToRow(t),
        });
        const pushed = await pushNotifications(r.notify);
        return json({ status: r.status, task: r.task ? rowToTask(r.task) : undefined, notified: (r.notify ?? []).length, pushed }, statusCode(r.status));
      }
      case "task.delete": {
        const r = await rpc<{ status: string; notify?: NotifyRow[] }>("pm_task_delete", { ...actor, id: String(body.id ?? "") });
        await pushNotifications(r.notify);
        return json({ status: r.status }, statusCode(r.status));
      }
      case "task.reorder": {
        const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 500) : [];
        const r = await rpc<{ status: string }>("pm_task_reorder", { ...actor, ids });
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
