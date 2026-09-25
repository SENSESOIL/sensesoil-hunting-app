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

/**
 * editor 在 data 裡只能動名冊與各層級的負責人（路徑中任一層是這些字就放行）。
 *
 * leadersBy 是分階段的負責人覆寫：leaders 當現況（N）用，
 * leadersBy.S／leadersBy.L 只存跟上一階段不同的人，沒填就往前沿用。
 * 鍵名刻意跟 layout.version 的實際值一致（N／S／L），不是按鈕上顯示的 S／M／L。
 */
const EDITOR_ALLOWED_DATA_SEGMENTS = new Set(["staff", "leaders", "leadersBy"]);

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
 * 以「現況」為底，只把白名單路徑的值換成 editor 送上來的版本。
 *
 * 為什麼不是「比對後整包拒絕」——
 * 架構圖載入時會跑 sanitize() 正規化資料（補缺欄位、換掉舊的預設文字），
 * 所以前端手上的 data 從一開始就跟資料庫有差異，使用者根本還沒動任何東西。
 * 若採「有白名單外的差異就拒絕」，這些正規化雜訊會讓 editor 永遠存不進去，
 * 而且是死結：要消掉差異得先存一次，但存不進去。
 *
 * 改成合併之後，白名單外的欄位一律沿用資料庫的值 —— 正規化雜訊被安靜忽略，
 * 真正越權的改動同樣寫不進去。安全性不變（仍是白名單），但不會被雜訊卡死。
 *
 * 結構以資料庫為準：只走現況既有的 key／陣列長度，
 * editor 無法新增或刪除區段，也無法改變陣列長度。
 */
function mergeAllowed(
  current: unknown,
  incoming: unknown,
  path: string[],
  isAllowed: (path: string[]) => boolean,
  dropped: string[]
): unknown {
  if (isAllowed(path)) {
    // 整個子樹交給 editor；但對方沒帶這個欄位時不要寫成 undefined
    return incoming === undefined ? current : incoming;
  }

  const bothArrays = Array.isArray(current) && Array.isArray(incoming);
  const bothPlainObjects =
    !Array.isArray(current) &&
    !Array.isArray(incoming) &&
    current !== null &&
    incoming !== null &&
    typeof current === "object" &&
    typeof incoming === "object";

  if (bothArrays) {
    // 長度以現況為準，逐項往下找白名單欄位
    return (current as unknown[]).map((item, i) =>
      mergeAllowed(item, (incoming as unknown[])[i], [...path, String(i)], isAllowed, dropped)
    );
  }

  if (bothPlainObjects) {
    const cur = current as Record<string, unknown>;
    const inc = incoming as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(cur)) {
      out[k] = mergeAllowed(cur[k], inc[k], [...path, k], isAllowed, dropped);
    }
    // 資料庫還沒有、但白名單允許的欄位也要放行。
    // 否則新欄位（例如某個節點第一次出現 leadersBy）因為現況裡沒有這個 key
    // 就不會被走訪，結果被靜默丟棄 —— 燈號還是綠的，使用者以為存好了。
    // 只認白名單本身，所以 editor 仍然無法憑空塞進任意結構。
    for (const k of Object.keys(inc)) {
      if (k in cur) continue;
      if (isAllowed([...path, k])) out[k] = inc[k];
      else if (inc[k] !== undefined) dropped.push([...path, k].join("."));
    }
    return out;
  }

  // 純值或結構對不上 —— 沿用現況，並記下來方便除錯
  if (incoming !== undefined && JSON.stringify(current) !== JSON.stringify(incoming)) {
    dropped.push(path.join(".") || "(root)");
  }
  return current;
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

  // 4) editor 只能改名冊與負責人 —— 以現況為底，只蓋上白名單欄位
  let outData: unknown = incoming.data;
  let outLayout: unknown = incoming.layout ?? {};
  let dropped: string[] = [];

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

    const droppedData: string[] = [];
    outData = mergeAllowed(
      currentPayload.data ?? {},
      incoming.data,
      [],
      // data：路徑中任一層是 staff／leaders 就放行
      (p) => p.length > 0 && p.some((seg) => EDITOR_ALLOWED_DATA_SEGMENTS.has(seg)),
      droppedData
    );

    const droppedLayout: string[] = [];
    outLayout = mergeAllowed(
      currentPayload.layout ?? {},
      incoming.layout ?? {},
      [],
      // layout：只認第一層欄位名，避免版面座標裡剛好有同名子欄位被放行
      (p) => p.length === 1 && EDITOR_ALLOWED_LAYOUT_KEYS.has(p[0]),
      droppedLayout
    );

    dropped = [
      ...droppedData.map((p) => "data." + p),
      ...droppedLayout.map((p) => "layout." + p),
    ];
    if (dropped.length > 0) {
      // 多半是架構圖 sanitize() 造成的正規化落差，不是真的越權；記著方便追。
      console.warn("[org-chart/save] editor 送來但未採用的欄位:", dropped.slice(0, 20));
    }
  }

  // 5) 寫入（service role key 只存在伺服器端，不會外流）
  const ts = new Date().toISOString();
  const res = await fetch(docUrl, {
    method: "PATCH",
    headers: supaHeaders(key),
    body: JSON.stringify({
      payload: { v: 2, ts, data: outData, layout: outLayout },
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
    ...(dropped.length > 0 ? { droppedPaths: dropped.slice(0, 20) } : {}),
  });
}
