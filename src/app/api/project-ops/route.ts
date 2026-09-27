import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-options";
import { checkPermissions } from "@/lib/permissions";
import { readSheet } from "@/lib/google-sheets";
import {
  parseRegistry,
  parseOpsRows,
  parseWorkRows,
  OPS_TAB,
  WORK_TAB,
  type RegistryProject,
  type OpsRecord,
  type WorkItem,
} from "@/lib/project-ops";

export const dynamic = "force-dynamic";

/**
 * 專案情報／工進排程的資料。目前只開放 admin。
 *
 * 專案名冊：拾壤CRM →「專案CRM」分頁（服務帳號唯讀）
 * 工程資料：狩獵管理試算表（SHEET_ID_HUNTING_MGMT）→「專案情報」「工進排程」兩個分頁
 *
 * 工程資料有合約金額與請款，所以只從這支（admin 限定）提供；
 * 通用的 /api/sheets/[sheetKey] 對 hunting-mgmt 一律拒絕。
 */

const CRM_SPREADSHEET_ID = "11IiXZbVxFAMzd8wEjU2Z9-W3CqoRa6aW1vQ50dJtrDk";

type TabState = "ok" | "missing" | "error";

export interface ProjectOpsResponse {
  registry: RegistryProject[];
  records: OpsRecord[];
  items: WorkItem[];
  source: {
    registry: { state: "ok" | "error"; count: number };
    ops: {
      state: "not-configured" | "ok" | "partial" | "error";
      sheetUrl?: string;
      tabs?: Record<string, TabState>;
      /** 試算表要共用給這個帳號（檢視者即可），設定說明頁會顯示 */
      serviceAccount?: string;
      /** 工程資料的來源 */
      backend?: "supabase" | "sheet";
      /** 可以從 APP 寫入（目前只有雲端資料庫可以） */
      writable?: boolean;
    };
  };
  fetchedAt: string;
}

/** POST /api/project-ops 的請求 */
export type SaveRequest =
  | { op: "saveRecord"; record: OpsRecord; expectedUpdatedAt: string | null }
  | { op: "saveItems"; code: string; items: WorkItem[] }
  | { op: "import"; records: OpsRecord[]; items: Record<string, WorkItem[]> };

export interface SaveResponse {
  ok: boolean;
  error?: string;
  updatedAt?: string;
}

async function readTab(spreadsheetId: string, tab: string): Promise<{ state: TabState; rows: string[][] }> {
  try {
    const rows = (await readSheet(spreadsheetId, `${tab}!A:Z`)) as string[][];
    return { state: "ok", rows };
  } catch (e) {
    // 分頁不存在時 Sheets API 回 400「Unable to parse range」
    const msg = String((e as Error)?.message || "");
    return { state: /Unable to parse range/i.test(msg) ? "missing" : "error", rows: [] };
  }
}

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  const perms = await checkPermissions(email);
  const isAdmin = Object.values(perms?.roles ?? {}).some((r) => r === "admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "目前只開放管理者" }, { status: 403 });
  }

  return build();
}

/** 讀取與組裝（權限檢查在 GET 裡，這裡不重複） */
async function build() {
  // 1) 專案名冊
  let registry: RegistryProject[] = [];
  let registryState: "ok" | "error" = "ok";
  try {
    registry = parseRegistry((await readSheet(CRM_SPREADSHEET_ID, "專案CRM!A1:F")) as string[][]);
  } catch (e) {
    console.error("[project-ops] 讀不到專案CRM", e);
    registryState = "error";
  }

  // 2) 工程資料（尚未設定試算表時照樣回傳名冊，頁面會顯示如何連接）
  const opsId = process.env.SHEET_ID_HUNTING_MGMT;
  let records: OpsRecord[] = [];
  let items: WorkItem[] = [];
  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let ops: ProjectOpsResponse["source"]["ops"] = { state: "not-configured", serviceAccount };

  if (opsId) {
    const [a, b] = await Promise.all([readTab(opsId, OPS_TAB), readTab(opsId, WORK_TAB)]);
    records = parseOpsRows(a.rows);
    items = parseWorkRows(b.rows);
    const states = [a.state, b.state];
    ops = {
      state: states.every((s) => s === "ok")
        ? "ok"
        : states.some((s) => s === "ok")
        ? "partial"
        : "error",
      sheetUrl: `https://docs.google.com/spreadsheets/d/${opsId}`,
      tabs: { [OPS_TAB]: a.state, [WORK_TAB]: b.state },
      serviceAccount,
    };
  }

  const body: ProjectOpsResponse = {
    registry,
    records,
    items,
    source: { registry: { state: registryState, count: registry.length }, ops },
    fetchedAt: new Date().toISOString(),
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
