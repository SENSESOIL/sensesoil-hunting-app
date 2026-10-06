import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-options";
import { checkPermissions } from "@/lib/permissions";
import { flowRoleFromRoles } from "@/lib/flow-role";

export const dynamic = "force-dynamic";

/**
 * 流程圖的寫入通道（規格：Sensesoil_Workflow_chart/Workflow-Chart_APP串接規格.md §5.2）
 *
 * 流程圖頁（https://sensesoil-workflow-chart.vercel.app）嵌在 APP 的 iframe 裡，
 * 存檔時 postMessage(ssf-save) 給 APP，APP 再呼叫這支，在伺服器端用 service role key 寫入
 * Supabase public.workflow_doc。瀏覽器端不持有任何寫入金鑰。
 *
 * 與組織圖共用同一個 Supabase 專案與環境變數：
 *   ORG_CHART_SUPABASE_URL / ORG_CHART_SUPABASE_SERVICE_KEY
 *
 * 文件：id = 'index'（流程目錄，{ flows: [...] }）或 '<流程id>'（{ stages, depts, steps, ... }）
 * 角色：admin 全部；editor 可編輯、新增，不能刪除流程圖；user／viewer 唯讀
 */

const MAX_BODY_BYTES = 4 * 1024 * 1024;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

function supaHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export async function POST(request: Request) {
  const url = process.env.ORG_CHART_SUPABASE_URL;
  const key = process.env.ORG_CHART_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error("[workflow-chart/save] 缺少 ORG_CHART_SUPABASE_URL / _SERVICE_KEY");
    return json({ ok: false, error: "伺服器尚未設定" }, 500);
  }

  // 1) 身分以 APP 的登入為準，不信任前端傳來的角色
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return json({ ok: false, error: "未登入", status: 401 }, 401);
  const perms = await checkPermissions(email);
  if (!perms) return json({ ok: false, error: "沒有寫入權限", status: 403 }, 403);
  const role = flowRoleFromRoles(perms.roles);
  if (role !== "admin" && role !== "editor") return json({ ok: false, error: "沒有寫入權限", status: 403 }, 403);

  // 2) 格式檢查
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: "資料太大" }, 413);
  let body: { id?: unknown; payload?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "格式錯誤" }, 400);
  }
  const { id, payload } = body;
  if (typeof id !== "string" || !/^[\w-]{1,64}$/.test(id) || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json({ ok: false, error: "格式錯誤" }, 400);
  }
  const p = payload as Record<string, unknown>;

  if (id === "index") {
    if (!Array.isArray(p.flows)) return json({ ok: false, error: "格式錯誤" }, 400);
    // editor 不能刪除流程圖：目錄裡原本有、新的沒有 → 拒絕
    if (role === "editor") {
      const r = await fetch(`${url}/rest/v1/workflow_doc?id=eq.index&select=payload`, { headers: supaHeaders(key) });
      const rows = r.ok ? ((await r.json()) as { payload?: { flows?: { id: string }[] } }[]) : [];
      const before = (rows[0]?.payload?.flows ?? []).map((f) => f.id);
      const after = new Set((p.flows as { id?: string }[]).map((f) => f?.id));
      const removed = before.filter((x) => !after.has(x));
      if (removed.length) return json({ ok: false, error: "只有管理者可以刪除流程圖", rejectedPaths: removed, status: 403 }, 403);
    }
  } else if (!Array.isArray(p.stages) || !Array.isArray(p.depts) || !Array.isArray(p.steps)) {
    return json({ ok: false, error: "格式錯誤" }, 400);
  }

  // 3) 寫入（upsert）
  const now = new Date().toISOString();
  const res = await fetch(`${url}/rest/v1/workflow_doc?on_conflict=id`, {
    method: "POST",
    headers: { ...supaHeaders(key), Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{ id, payload: p, updated_at: now }]),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("[workflow-chart/save] Supabase 寫入失敗", res.status, t.slice(0, 300));
    return json({ ok: false, error: `資料庫寫入失敗（${res.status}）` }, 500);
  }
  const rows = (await res.json().catch(() => [])) as { updated_at?: string }[];
  return json({ ok: true, updated_at: rows[0]?.updated_at ?? now });
}
