import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-options";

export const dynamic = "force-dynamic";

/**
 * 流程圖目錄：讀 Supabase public.workflow_doc 的 id='index'（{ flows: [{ id, title, en?, updatedAt }] }）。
 * 指揮中心 →「流程」分頁用它列出每一張流程圖的卡片；之後在流程圖頁新增的流程會自動出現在這裡。
 * 目錄還是空的（從沒存過）時，至少列出內建的「專案管理流程」（id = pm）。
 */

export interface FlowEntry {
  id: string;
  title: string;
  en?: string;
  updatedAt?: number | string;
}

const DEFAULT_FLOWS: FlowEntry[] = [{ id: "pm", title: "專案管理流程", en: "PROJECT MANAGEMENT FLOW" }];

export async function GET() {
  const session = await auth();
  const devUser = process.env.NODE_ENV === "development" && process.env.PM_DEV_USER;
  if (!session?.user?.email && !devUser) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const url = process.env.ORG_CHART_SUPABASE_URL;
  const key = process.env.ORG_CHART_SUPABASE_SERVICE_KEY;
  let flows: FlowEntry[] = [];
  if (url && key) {
    try {
      const r = await fetch(`${url}/rest/v1/workflow_doc?id=eq.index&select=payload`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      if (r.ok) {
        const rows = (await r.json()) as { payload?: { flows?: FlowEntry[] } }[];
        flows = (rows[0]?.payload?.flows ?? []).filter((f) => f && typeof f.id === "string" && f.id);
      }
    } catch (e) {
      console.error("[workflow-chart/list]", e);
    }
  }
  // 目錄只記 id／title，英文副標存在各流程自己的文件裡 —— 一次撈回來補上（流程圖頁改了標題也以這裡為準）
  if (url && key && flows.length) {
    try {
      const ids = flows.map((f) => `"${f.id.replace(/"/g, "")}"`).join(",");
      const r = await fetch(
        `${url}/rest/v1/workflow_doc?id=in.(${encodeURIComponent(ids)})&select=id,title:payload->>title,en:payload->>en`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
      );
      if (r.ok) {
        const docs = (await r.json()) as { id: string; title?: string | null; en?: string | null }[];
        const byId = new Map(docs.map((d) => [d.id, d]));
        flows = flows.map((f) => {
          const d = byId.get(f.id);
          return { ...f, title: d?.title?.trim() || f.title, en: d?.en?.trim() || f.en };
        });
      }
    } catch (e) {
      console.error("[workflow-chart/list] 讀取流程副標失敗", e);
    }
  }
  for (const d of DEFAULT_FLOWS) if (!flows.some((f) => f.id === d.id)) flows.unshift(d);
  return NextResponse.json({ flows }, { headers: { "Cache-Control": "no-store" } });
}
