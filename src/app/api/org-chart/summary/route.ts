import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-options";

export const dynamic = "force-dynamic";

/**
 * 組織圖摘要：指揮中心 → 營運 →「組織圖」右側的數量（幾個部門）。
 * 讀 Supabase public.org_doc（id = 'shirang'）的 payload.data.divisions。
 */
export async function GET() {
  const session = await auth();
  const devUser = process.env.NODE_ENV === "development" && process.env.PM_DEV_USER;
  if (!session?.user?.email && !devUser) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const url = process.env.ORG_CHART_SUPABASE_URL;
  const key = process.env.ORG_CHART_SUPABASE_SERVICE_KEY;
  if (!url || !key) return NextResponse.json({ divisions: null });

  try {
    const r = await fetch(`${url}/rest/v1/org_doc?id=eq.shirang&select=divisions:payload->data->divisions`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!r.ok) return NextResponse.json({ divisions: null });
    const rows = (await r.json()) as { divisions?: unknown[] | null }[];
    const divisions = Array.isArray(rows[0]?.divisions) ? rows[0].divisions.length : null;
    return NextResponse.json({ divisions }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[org-chart/summary]", e);
    return NextResponse.json({ divisions: null });
  }
}
