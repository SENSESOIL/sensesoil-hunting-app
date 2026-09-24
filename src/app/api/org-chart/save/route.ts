import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-options";
import { checkPermissions } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * 組織架構圖的寫入通道。
 *
 * 架構圖頁不再自己寫 Supabase —— 它把要存的內容 postMessage 給 APP，
 * 由這支 route 在「伺服器端」用 service role key 寫入。
 * 好處是瀏覽器端完全不需要任何憑證，也就沒有 token 會外流；
 * Supabase 的 policy 可以收成「只有 service_role 能寫」。
 *
 * 需要的環境變數（Vercel）：
 *   ORG_CHART_SUPABASE_URL          https://rynhfvyoaswynyvghyzi.supabase.co
 *   ORG_CHART_SUPABASE_SERVICE_KEY  該專案的 service_role key（絕不可放進 NEXT_PUBLIC_*）
 */

const DOC_ID = "shirang";

/** editor 在 data 裡只能動名冊與各層級的負責人（路徑中任一層是這些字就放行） */
const EDITOR_ALLOWED_DATA_SEGMENTS = new Set(["staff", "leaders"]);

/**
 * editor 在 layout 裡只能動這三個頂層欄位：
 *   offS / offN  逐項的 S／M 版本開關（編輯面板裡的 S/M/L 切換）
 *   version      目前顯示的版本（右上角 S/M/L 鈕，點了就會寫入）
 * 其餘（sysPaths、sysPos、logo、title 等版面座標）一律不准。
 * 注意這裡比對的是「第一層」欄位名，不是任意層 —— 版面座標裡若剛好有同名子欄位不該被放行。
 */
const EDITOR_ALLOWED_LAYOUT_KEYS = new Set(["offS", "offN", "version"]);

/** payload 上限，避免有人塞超大 JSON 進來 */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

function supaHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

/**
 * 逐層比對兩份資料，收集「有差異的路徑」。
 * 刻意以欄位名稱（而非位置）判斷，這樣架構圖日後調整結構也不容易誤判。
 */
function collectChangedPaths(
  a: unknown,
  b: unknown,
  path: string[] = [],
  out: string[][] = []
): string[][] {
  if (a === b) return out;

  const bothObjects =
    a !== null &&
    b !== null &&
    typeof a === "object" &&
    typeof b === "object" &&
    Array.isArray(a) === Array.isArray(b);

  if (!bothObjects) {
    out.push(path);
    return out;
  }

  const keys = new Set([
    ...Object.keys(a as object),
    ...Object.keys(b as object),
  ]);
  for (const k of keys) {
    collectChangedPaths(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
      [...path, k],
      out
    );
  }
  return out;
}

export async function POST(request: Request) {
  const url = process.env.ORG_CHART_SUPABASE_URL;
  const key = process.env.ORG_CHART_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error("[org-chart/save] 缺少 ORG_CHART_SUPABASE_URL / _SERVICE_KEY");
    return NextResponse.json({ ok: false, error: "伺服器尚未設定" }, { status: 500 });
  }

  // 1) 必須是已登入的狩獵者
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: "未登入" }, { status: 401 });
  }

  // 2) 依權限表的「組織圖」欄決定能不能寫、能寫什麼
  const perms = await checkPermissions(email);
  const orgRole = perms?.roles?.["組織圖"] ?? "none";
  if (orgRole !== "admin" && orgRole !== "editor") {
    return NextResponse.json({ ok: false, error: "沒有編輯權限" }, { status: 403 });
  }

  // 3) 解析並檢查 body
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "內容過大" }, { status: 413 });
  }
  let incoming: { data?: unknown; layout?: unknown };
  try {
    incoming = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 格式錯誤" }, { status: 400 });
  }
  if (!incoming || typeof incoming !== "object" || !incoming.data) {
    return NextResponse.json({ ok: false, error: "缺少 data" }, { status: 400 });
  }

  const docUrl = `${url.replace(/\/$/, "")}/rest/v1/org_doc?id=eq.${DOC_ID}`;

  // 4) editor 只能改名冊與負責人 —— 跟現況比對，逾越範圍就擋下
  if (orgRole === "editor") {
    const cur = await fetch(`${docUrl}&select=payload`, {
      headers: supaHeaders(key),
      cache: "no-store",
    });
    if (!cur.ok) {
      return NextResponse.json(
        { ok: false, error: "讀不到現有資料，無法驗證編輯範圍" },
        { status: 502 }
      );
    }
    const rows = (await cur.json()) as Array<{ payload?: { data?: unknown; layout?: unknown } }>;
    const currentPayload = rows?.[0]?.payload ?? {};

    const illegalData = collectChangedPaths(
      currentPayload.data ?? {},
      incoming.data
    ).filter((p) => !p.some((seg) => EDITOR_ALLOWED_DATA_SEGMENTS.has(seg)));

    const illegalLayout = collectChangedPaths(
      currentPayload.layout ?? {},
      incoming.layout ?? {}
    ).filter((p) => !(p.length > 0 && EDITOR_ALLOWED_LAYOUT_KEYS.has(p[0])));

    if (illegalData.length > 0 || illegalLayout.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "editor 只能修改負責人名冊與版本開關",
          // 回報前幾筆逾越的路徑，方便對照除錯
          rejectedPaths: [
            ...illegalData.map((p) => "data." + p.join(".")),
            ...illegalLayout.map((p) => "layout." + (p.join(".") || "(root)")),
          ].slice(0, 5),
        },
        { status: 403 }
      );
    }
  }

  // 5) 寫入（service role key 只存在伺服器端，不會外流）
  const ts = new Date().toISOString();
  const res = await fetch(docUrl, {
    method: "PATCH",
    headers: supaHeaders(key),
    body: JSON.stringify({
      payload: { v: 2, ts, data: incoming.data, layout: incoming.layout ?? {} },
      updated_at: ts,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[org-chart/save] Supabase 寫入失敗", res.status, detail.slice(0, 300));
    return NextResponse.json({ ok: false, error: "寫入失敗" }, { status: 502 });
  }

  const saved = (await res.json().catch(() => null)) as Array<{ updated_at?: string }> | null;
  return NextResponse.json({
    ok: true,
    updated_at: saved?.[0]?.updated_at ?? ts,
    orgRole,
  });
}
