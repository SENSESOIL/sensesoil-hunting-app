import { readSheet } from "./google-sheets";

export type Role = "admin" | "editor" | "user" | "viewer" | "none";

export interface UserPermissions {
  email: string;
  hunterName: string;
  roles: {
    [key: string]: Role;
  };
}

// Memory cache to avoid hitting Google Sheets API rate limits
let cachedPermissions: string[][] | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 30000; // 30 seconds

/**
 * 權限表是一張「合併儲存格的樹狀標題」，不是單純的一列標題：
 *
 *   row1  獵人APP │ 系統  │ 狩獵覺醒(C:G)                │ 狩獵管理(H:R)
 *   row2  狩獵者  │ 主頁  │ BASIC HIDDEN … RUNNING       │ 專案情報 工進排程 任務追蹤 狩獵任務(K:N) 指揮中心(O:R)
 *   row3          │ 分頁  │                              │ 專案任務 每周任務 領款 請假 │ 定位定崗(O:P) 營運 財務
 *   row4          │ 子頁  │                              │                              │ 組織圖 職務說明
 *
 * 合併儲存格只有最左邊那一格有值，右邊都是空字串，所以要逐層往右延伸 ——
 * 但延伸必須被「上一層的範圍」限制住，否則 B 欄的「分頁」會一路蔓延到 C…J 欄去。
 */
const HEADER_ROW_COUNT = 4;

const ROLE_RANK: Record<Role, number> = {
  none: 0,
  viewer: 1,
  user: 2,
  editor: 3,
  admin: 4,
};

function parseRole(raw: unknown): Role {
  const v = (raw ?? "").toString().trim().toLowerCase();
  if (v === "admin") return "admin";
  if (v === "editor") return "editor";
  if (v === "user") return "user";
  if (v === "viewer" || v === "view") return "viewer";
  return "none";
}

function cell(rows: string[][], r: number, c: number): string {
  return (rows[r]?.[c] ?? "").toString().trim();
}

/**
 * 算出每一個權限欄位的完整階層路徑，例如
 *   L 欄 → ["狩獵管理", "狩獵任務", "每周任務"]
 *   O 欄 → ["狩獵管理", "指揮中心", "定位定崗", "組織圖"]
 *
 * 作法：逐層切分區段。某一層的一個標題，其範圍是「從它自己的欄位，到同一層
 * 下一個非空標題之前」，而且不能越過上一層的邊界。
 */
function buildColumnPaths(
  rows: string[][],
  firstCol: number,
  lastCol: number
): string[][] {
  const paths: string[][] = [];
  for (let c = 0; c <= lastCol; c++) paths[c] = [];

  // 每一層各自維護「目前生效的標題」與「這個標題的結束欄」
  const walk = (level: number, from: number, to: number) => {
    if (level >= HEADER_ROW_COUNT) return;
    let segStart = -1;
    let segLabel = "";
    const flush = (end: number) => {
      if (segStart < 0) return;
      for (let c = segStart; c <= end; c++) paths[c].push(segLabel);
      walk(level + 1, segStart, end);
      segStart = -1;
      segLabel = "";
    };
    for (let c = from; c <= to; c++) {
      const v = cell(rows, level, c);
      if (v) {
        flush(c - 1);
        segStart = c;
        segLabel = v;
      }
    }
    flush(to);
  };

  walk(0, firstCol, lastCol);
  return paths;
}

/** 找出 email 欄：看資料列哪一欄的內容像 email，比依賴標題文字可靠 */
function findEmailColumn(rows: string[][]): number {
  const maxCols = Math.max(...rows.map((r) => r.length), 0);
  let best = -1;
  let bestHits = 0;
  for (let c = 0; c < maxCols; c++) {
    let hits = 0;
    for (let r = HEADER_ROW_COUNT; r < rows.length; r++) {
      if (cell(rows, r, c).includes("@")) hits++;
    }
    if (hits > bestHits) {
      bestHits = hits;
      best = c;
    }
  }
  return bestHits > 0 ? best : -1;
}

/** 找出姓名欄：email 欄左邊第一個有內容的欄，通常是 A */
function findNameColumn(rows: string[][], emailIdx: number): number {
  for (let c = 0; c < emailIdx; c++) {
    for (let r = HEADER_ROW_COUNT; r < rows.length; r++) {
      if (cell(rows, r, c)) return c;
    }
  }
  return 0;
}

async function fetchPermissionsFromSheet(): Promise<string[][]> {
  const spreadsheetId =
    process.env.SHEET_ID_PERMISSIONS?.trim() ||
    "14ldpC7mD1wYjouSiR9gizl--fPFcIowGGzkQdkxQNvQ";
  if (!spreadsheetId) {
    console.error("[Permissions] SHEET_ID_PERMISSIONS is not set");
    return [];
  }

  const now = Date.now();
  if (cachedPermissions && now - lastFetchTime < CACHE_TTL) {
    return cachedPermissions;
  }

  try {
    // A:Z —— 權限表已經長到 R 欄，舊版寫死 A:M 會把「請假／組織圖／職務說明／營運／財務」整批讀不到
    let rows = await readSheet(spreadsheetId, "Permission!A:Z").catch(() => null);
    if (!rows) {
      rows = await readSheet(spreadsheetId, "A:Z");
    }

    if (rows && rows.length > 0) {
      cachedPermissions = rows as string[][];
      lastFetchTime = now;
      return cachedPermissions;
    }
  } catch (err) {
    console.error("[Permissions] Failed to fetch permissions sheet:", err);
    if (cachedPermissions) return cachedPermissions; // 讀失敗時沿用舊快取
  }
  return [];
}

export async function checkPermissions(
  email: string
): Promise<UserPermissions | null> {
  const rows = await fetchPermissionsFromSheet();
  if (rows.length <= HEADER_ROW_COUNT) {
    console.log("[Permissions] Not enough rows.");
    return null;
  }

  const emailIdx = findEmailColumn(rows);
  if (emailIdx === -1) {
    console.error("[Permissions] Could not locate the email column.");
    return null;
  }
  const nameIdx = findNameColumn(rows, emailIdx);

  const userRow = rows
    .slice(HEADER_ROW_COUNT)
    .find(
      (r) => (r?.[emailIdx] ?? "").toString().trim().toLowerCase() === email.toLowerCase()
    );
  if (!userRow) {
    console.log(`[Permissions] No row for ${email}`);
    return null;
  }

  const hunterName = (userRow[nameIdx] ?? "").toString().trim();

  const resignedHunters = await getResignedHunters();
  if (hunterName && resignedHunters.includes(hunterName)) {
    return null; // 已離職，強制撤銷
  }

  const maxCols = Math.max(...rows.map((r) => r.length), 0);
  const paths = buildColumnPaths(rows, emailIdx + 1, maxCols - 1);

  const roles: { [key: string]: Role } = {};
  const raise = (key: string, role: Role) => {
    const k = key.trim().toLowerCase();
    if (!k) return;
    const current = roles[k] ?? "none";
    if (ROLE_RANK[role] > ROLE_RANK[current]) roles[k] = role;
    else if (!(k in roles)) roles[k] = current;
  };

  for (let c = emailIdx + 1; c < maxCols; c++) {
    const path = paths[c] ?? [];
    if (!path.length) continue;
    const role = parseRole(userRow[c]);
    // 葉節點記自己的值；每一層祖先取「底下所有子項目中最高的權限」——
    // 這就是父層的 canEnter：只要任何一個子項目有權限，父層就進得去。
    for (const label of path) raise(label, role);
  }

  return { email, hunterName, roles };
}

let cachedResignedHunters: { data: string[]; timestamp: number } | null = null;

export async function getResignedHunters(): Promise<string[]> {
  const now = Date.now();
  if (cachedResignedHunters && now - cachedResignedHunters.timestamp < CACHE_TTL) {
    return cachedResignedHunters.data;
  }

  const spreadsheetId =
    process.env.SHEET_ID_PERMISSIONS ||
    "14ldpC7mD1wYjouSiR9gizl--fPFcIowGGzkQdkxQNvQ";
  const rows = (await readSheet(spreadsheetId, "員工CRM!A:Z").catch(() => null)) as
    | string[][]
    | null;

  if (!rows || rows.length < 3) return [];

  // 標題列位置不固定，往下找幾列直到出現「狩獵者／姓名」
  let headerRow = -1;
  let hunterIdx = -1;
  let leaveDateIdx = -1;
  for (let r = 0; r < Math.min(6, rows.length); r++) {
    const cells = (rows[r] || []).map((h) => (h ?? "").toString().trim());
    const hi = cells.indexOf("狩獵者") !== -1 ? cells.indexOf("狩獵者") : cells.indexOf("姓名");
    if (hi !== -1) {
      headerRow = r;
      hunterIdx = hi;
      leaveDateIdx = cells.indexOf("離線登出日");
      break;
    }
  }
  if (hunterIdx === -1 || leaveDateIdx === -1) return [];

  const resignedHunters: string[] = [];
  rows.slice(headerRow + 1).forEach((row) => {
    const leaveDate = (row?.[leaveDateIdx] ?? "").toString().trim();
    const hunterName = (row?.[hunterIdx] ?? "").toString().trim();
    const isValidLeaveDate =
      leaveDate &&
      leaveDate !== "-" &&
      leaveDate.toUpperCase() !== "N/A" &&
      leaveDate !== "無";
    if (isValidLeaveDate && hunterName) resignedHunters.push(hunterName);
  });

  cachedResignedHunters = { data: resignedHunters, timestamp: now };
  return resignedHunters;
}
