/**
 * 工程管理（專案情報／工進排程）的資料模型與計算。
 *
 * 資料來源分兩層：
 *   1. 專案名冊 —— 拾壤CRM 的「專案CRM」分頁（代碼、公司、專案名稱）。真實、已存在。
 *   2. 工程資料 —— 「狩獵管理」試算表的兩個分頁（SHEET_ID_HUNTING_MGMT）：
 *        專案情報：一個專案一列（階段、日期、合約與請款、進度…）
 *        工進排程：一個工項一列（工項、施作單位、起訖、進度）
 *      以「代碼」與專案名冊對應。欄位用表頭文字辨識，不依賴欄位順序。
 *
 * 這支檔案刻意不 import 任何東西、只用可被直接剝除的 TS 語法 ——
 * 伺服器與前端共用，也能直接用 node 跑測試。
 */

/* ══════════════════════════════════════════════════════════
   型別
   ══════════════════════════════════════════════════════════ */

export type Stage =
  | "洽談"
  | "報價"
  | "簽約"
  | "施工中"
  | "驗收"
  | "保固"
  | "結案"
  | "暫停";

export const STAGES: Stage[] = ["洽談", "報價", "簽約", "施工中", "驗收", "保固", "結案", "暫停"];

/** 在手（已簽約、尚未交屋）的階段：在手合約、應收款都以這幾個為準 */
export const ACTIVE_STAGES: Stage[] = ["簽約", "施工中", "驗收"];

export type Risk = "正常" | "注意" | "異常";

/** 綜合健康度：畫面上的狀態標籤與排序都依這個 */
export type Health = "逾期" | "落後" | "注意" | "正常" | "未開工" | "完工" | "未建檔";

export interface RegistryProject {
  code: string;
  seq: number;
  company: string;
  name: string;
}

/** 「專案情報」分頁的一列 */
export interface OpsRecord {
  code: string;
  stage?: Stage;
  category?: string;
  site?: string;
  client?: string;
  manager?: string;
  signedAt?: string;
  startAt?: string;
  dueAt?: string;
  doneAt?: string;
  contract?: number;
  variation?: number;
  billed?: number;
  collected?: number;
  progress?: number;
  risk?: Risk;
  note?: string;
  updatedAt?: string;
}

/** 「工進排程」分頁的一列 */
export interface WorkItem {
  code: string;
  trade: string;
  crew?: string;
  start?: string;
  end?: string;
  progress?: number;
  note?: string;
}

export type WorkStatus = "未開始" | "進行中" | "完成" | "延遲" | "未排定";

export interface WorkItemView extends WorkItem {
  status: WorkStatus;
}

export interface ProjectView extends RegistryProject {
  ops?: OpsRecord;
  items: WorkItemView[];
  /** 工程類別：試算表有填就用，沒填就依名稱推測 */
  category: string;
  categoryInferred: boolean;
  /** 同一案場的其他合約（依名稱判斷） */
  siteGroup?: string;
  siteMates: string[];
  health: Health;
  /** 依開工→預計完工的時間比例算出的「計畫進度」 */
  plannedPct?: number;
  /** 實際 − 計畫；負數代表落後 */
  variance?: number;
  contractTotal?: number;
  receivable?: number;
  billedRate?: number;
  collectedRate?: number;
  /** 距預計完工的天數；負數代表已逾期 */
  daysLeft?: number;
  /** 需要注意的原因（一句話，給清單顯示） */
  reason?: string;
}

/* ══════════════════════════════════════════════════════════
   試算表欄位定義
   表頭文字比對（去空白、忽略括號說明），可接受幾個同義寫法。
   ══════════════════════════════════════════════════════════ */

export const OPS_COLUMNS: { key: keyof OpsRecord; header: string; aliases?: string[]; hint: string }[] = [
  { key: "code", header: "代碼", hint: "對應專案CRM 的代碼，例如 A08、B37（必填）" },
  { key: "stage", header: "階段", hint: "洽談／報價／簽約／施工中／驗收／保固／結案／暫停" },
  { key: "category", header: "工程類別", aliases: ["類別"], hint: "室內裝修／泥作工藝／拆除／防水／修繕維護／追加減；留白則依專案名稱推測" },
  { key: "site", header: "工地地址", aliases: ["地址"], hint: "" },
  { key: "client", header: "業主", hint: "" },
  { key: "manager", header: "工地主任", aliases: ["負責人", "工務"], hint: "填狩獵者姓名" },
  { key: "signedAt", header: "簽約日", hint: "日期可填 2026/9/27 或民國 115/9/27" },
  { key: "startAt", header: "開工日", hint: "" },
  { key: "dueAt", header: "預計完工", aliases: ["預計完工日"], hint: "" },
  { key: "doneAt", header: "實際完工", aliases: ["實際完工日", "完工日"], hint: "" },
  { key: "contract", header: "合約金額", aliases: ["合約"], hint: "未稅或含稅擇一，全表一致即可；可寫 185萬" },
  { key: "variation", header: "追加減", hint: "追減填負數" },
  { key: "billed", header: "已請款", aliases: ["請款金額"], hint: "累計估驗請款金額" },
  { key: "collected", header: "已收款", aliases: ["收款金額"], hint: "累計實收金額" },
  { key: "progress", header: "實際進度", aliases: ["進度"], hint: "0–100，可寫 62 或 62%" },
  { key: "risk", header: "風險", hint: "正常／注意／異常" },
  { key: "note", header: "近況", aliases: ["備註"], hint: "最新狀況一句話" },
  { key: "updatedAt", header: "更新日", hint: "" },
];

export const WORK_COLUMNS: { key: keyof WorkItem; header: string; aliases?: string[]; hint: string }[] = [
  { key: "code", header: "代碼", hint: "對應專案代碼（必填）" },
  { key: "trade", header: "工項", hint: "例如 保護工程、拆除、水電配管、泥作打底、面層施作、木作、油漆、清潔、驗收（必填）" },
  { key: "crew", header: "施作單位", aliases: ["工班", "廠商"], hint: "工班或廠商" },
  { key: "start", header: "開始", aliases: ["開始日"], hint: "" },
  { key: "end", header: "結束", aliases: ["結束日", "完成日"], hint: "" },
  { key: "progress", header: "進度", hint: "0–100" },
  { key: "note", header: "備註", hint: "" },
];

export const OPS_TAB = "專案情報";
export const WORK_TAB = "工進排程";

/* ══════════════════════════════════════════════════════════
   解析
   ══════════════════════════════════════════════════════════ */

const norm = (s: unknown) =>
  String(s ?? "")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/\s+/g, "")
    .trim();

/**
 * 日期：接受 2026/9/27、2026-09-27、2026.9.27、民國 115/9/27，回傳 YYYY-MM-DD。
 * 讀不懂就回 undefined —— 寧可留白也不要猜錯日期。
 */
export function parseDate(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  const m = s.match(/^(\d{2,4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})日?$/);
  if (!m) return undefined;
  let y = +m[1];
  if (y < 1000) y += 1911; // 民國年
  const mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return undefined; // 2/30 之類
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 金額：接受 1,850,000、NT$1850000、185萬、-12萬（追減） */
export function parseMoney(v: unknown): number | undefined {
  let s = String(v ?? "").replace(/[,\s，]/g, "").replace(/^NT\$|^\$|元$/gi, "").trim();
  if (!s || s === "-") return undefined;
  let mul = 1;
  if (s.endsWith("萬")) { mul = 10000; s = s.slice(0, -1); }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * mul) : undefined;
}

/** 進度：接受 62、62%、0.62（小於 1 且有小數點時視為比例） */
export function parsePct(v: unknown): number | undefined {
  const s = String(v ?? "").replace(/\s/g, "").trim();
  if (!s) return undefined;
  const hasPct = s.endsWith("%");
  let n = Number(hasPct ? s.slice(0, -1) : s);
  if (!Number.isFinite(n)) return undefined;
  if (!hasPct && n > 0 && n < 1 && s.includes(".")) n *= 100;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function findHeaderRow(rows: string[][], first: string): number {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    if ((rows[i] || []).some((c) => norm(c) === first)) return i;
  }
  return -1;
}

function columnIndex(
  header: string[],
  cols: { key: string; header: string; aliases?: string[] }[]
): Record<string, number> {
  const idx: Record<string, number> = {};
  const h = header.map(norm);
  for (const c of cols) {
    const names = [c.header, ...(c.aliases || [])].map(norm);
    const i = h.findIndex((x) => names.includes(x));
    if (i >= 0) idx[c.key] = i;
  }
  return idx;
}

/** 專案CRM：表頭列含「代碼」「序列」「單位」「專案」 */
export function parseRegistry(rows: string[][]): RegistryProject[] {
  const hi = findHeaderRow(rows, "代碼");
  if (hi < 0) return [];
  const h = rows[hi].map(norm);
  const iCode = h.indexOf("代碼");
  const iSeq = h.indexOf("序列");
  const iCo = h.indexOf("單位");
  const iName = h.indexOf("專案");
  const out: RegistryProject[] = [];
  for (const r of rows.slice(hi + 1)) {
    const code = String(r[iCode] ?? "").trim();
    const name = String(r[iName] ?? "").trim();
    if (!code || !name) continue;
    out.push({
      code,
      seq: Number(r[iSeq]) || 0,
      company: String(r[iCo] ?? "").trim(),
      name,
    });
  }
  return out;
}

const STAGE_SET = new Set<string>(STAGES);
const RISK_SET = new Set<string>(["正常", "注意", "異常"]);

export function parseOpsRows(rows: string[][]): OpsRecord[] {
  const hi = findHeaderRow(rows, "代碼");
  if (hi < 0) return [];
  const ix = columnIndex(rows[hi], OPS_COLUMNS);
  const get = (r: string[], k: keyof OpsRecord) => (ix[k] === undefined ? "" : String(r[ix[k]] ?? "").trim());
  const out: OpsRecord[] = [];
  for (const r of rows.slice(hi + 1)) {
    const code = get(r, "code");
    if (!code) continue;
    const stage = get(r, "stage");
    const risk = get(r, "risk");
    const rec: OpsRecord = {
      code,
      stage: STAGE_SET.has(stage) ? (stage as Stage) : undefined,
      category: get(r, "category") || undefined,
      site: get(r, "site") || undefined,
      client: get(r, "client") || undefined,
      manager: get(r, "manager") || undefined,
      signedAt: parseDate(get(r, "signedAt")),
      startAt: parseDate(get(r, "startAt")),
      dueAt: parseDate(get(r, "dueAt")),
      doneAt: parseDate(get(r, "doneAt")),
      contract: parseMoney(get(r, "contract")),
      variation: parseMoney(get(r, "variation")),
      billed: parseMoney(get(r, "billed")),
      collected: parseMoney(get(r, "collected")),
      progress: parsePct(get(r, "progress")),
      risk: RISK_SET.has(risk) ? (risk as Risk) : undefined,
      note: get(r, "note") || undefined,
      updatedAt: parseDate(get(r, "updatedAt")),
    };
    // 只有代碼、其他全空的列（例如範本預先列好的代碼）不算建檔
    const filled = Object.entries(rec).some(([k, val]) => k !== "code" && val !== undefined);
    if (filled) out.push(rec);
  }
  return out;
}

export function parseWorkRows(rows: string[][]): WorkItem[] {
  const hi = findHeaderRow(rows, "代碼");
  if (hi < 0) return [];
  const ix = columnIndex(rows[hi], WORK_COLUMNS);
  const get = (r: string[], k: keyof WorkItem) => (ix[k] === undefined ? "" : String(r[ix[k]] ?? "").trim());
  const out: WorkItem[] = [];
  for (const r of rows.slice(hi + 1)) {
    const code = get(r, "code");
    const trade = get(r, "trade");
    if (!code || !trade) continue;
    out.push({
      code,
      trade,
      crew: get(r, "crew") || undefined,
      start: parseDate(get(r, "start")),
      end: parseDate(get(r, "end")),
      progress: parsePct(get(r, "progress")),
      note: get(r, "note") || undefined,
    });
  }
  return out;
}

/* ══════════════════════════════════════════════════════════
   日期工具（一律用本地時區的「日」為單位）
   ══════════════════════════════════════════════════════════ */

export function toDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, n: number): string {
  const d = toDay(iso);
  d.setDate(d.getDate() + n);
  return todayISO(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toDay(b).getTime() - toDay(a).getTime()) / 86400000);
}

/** 該日所在週的週一 */
export function mondayOf(iso: string): string {
  const d = toDay(iso);
  const dow = d.getDay() || 7;
  return addDays(iso, 1 - dow);
}

/* ══════════════════════════════════════════════════════════
   推測：工程類別、同案場
   ══════════════════════════════════════════════════════════ */

export const CATEGORIES = ["室內裝修", "泥作工藝", "拆除", "防水", "修繕維護", "追加減"];

export function inferCategory(name: string, company: string): string {
  if (/追加|追減/.test(name)) return "追加減";
  if (/拆除/.test(name)) return "拆除";
  if (/防水/.test(name)) return "防水";
  if (/修繕|維修|修補|維養/.test(name)) return "修繕維護";
  if (/泥牆|白泥|紅泥|泥作|泥窩|灰泥|夯土|磨石/.test(name)) return "泥作工藝";
  return company === "拾壤" ? "泥作工藝" : "室內裝修";
}

/** 名稱去掉工種字尾，留下「案場」的部分 */
export function siteKey(name: string): string {
  return name
    .replace(/[-－–].*$/, "")
    .replace(
      /(追加減|追加|追減|拆除|泥作工程|泥作|白泥牆|紅泥牆|泥牆維養|泥窩修補|泥牆|白泥|外牆防水|外牆|防水|室內裝修|裝修|修繕|維修工程|室裝|雜項工程|工程|新建|實品屋)+$/,
      ""
    )
    .trim();
}

/**
 * 同一案場的多份合約。保守規則：去掉工種字尾後，一方是另一方的開頭或結尾，才算同案場。
 *   若合山22B ⊂ 初倉若合山22B（結尾）、釀青山 ⊂ 釀青山IL（開頭）→ 同案場
 *   微熱南港店 vs 微熱三合院 → 同業主但不同案場，不會被併在一起
 * 回傳：代碼 → 群組名稱（群組內最短的那個案場名）
 */
export function buildSiteGroups(projects: RegistryProject[]): Map<string, string> {
  const keys = projects.map((p) => ({ code: p.code, key: siteKey(p.name) }));
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  keys.forEach((k) => parent.set(k.code, k.code));
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i].key, b = keys[j].key;
      if (a.length < 2 || b.length < 2) continue;
      const [s, l] = a.length <= b.length ? [a, b] : [b, a];
      if (l.startsWith(s) || l.endsWith(s)) parent.set(find(keys[i].code), find(keys[j].code));
    }
  }
  const groups = new Map<string, string[]>();
  keys.forEach((k) => {
    const r = find(k.code);
    groups.set(r, [...(groups.get(r) || []), k.code]);
  });
  const out = new Map<string, string>();
  const keyOf = new Map(keys.map((k) => [k.code, k.key]));
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const label = members.map((c) => keyOf.get(c)!).sort((x, y) => x.length - y.length)[0];
    members.forEach((c) => out.set(c, label));
  }
  return out;
}

/** 000–003 是公司內部帳（辦公室、各公司本身），不是工程專案 */
export const isInternal = (p: RegistryProject) => /^0\d+$/.test(p.code);

/* ══════════════════════════════════════════════════════════
   衍生指標
   ══════════════════════════════════════════════════════════ */

export function workStatus(it: WorkItem, today: string): WorkStatus {
  if ((it.progress ?? 0) >= 100) return "完成";
  if (!it.start || !it.end) return "未排定";
  if (it.end < today) return "延遲";
  if (it.start > today) return "未開始";
  return "進行中";
}

const HEALTH_RANK: Record<Health, number> = { 逾期: 0, 落後: 1, 注意: 2, 正常: 3, 未開工: 4, 完工: 5, 未建檔: 6 };
export const healthRank = (h: Health) => HEALTH_RANK[h];

/** 落後幾個百分點才算「落後」；介於兩者之間算「注意」 */
export const BEHIND_PCT = 15;
export const WATCH_PCT = 5;

export function deriveProject(
  p: RegistryProject,
  ops: OpsRecord | undefined,
  items: WorkItem[],
  today: string,
  siteGroups: Map<string, string>,
  codesBySite: Map<string, string[]>
): ProjectView {
  const category = ops?.category || inferCategory(p.name, p.company);
  const view: ProjectView = {
    ...p,
    ops,
    items: items
      .map((it) => ({ ...it, status: workStatus(it, today) }))
      .sort((a, b) => (a.start || "9").localeCompare(b.start || "9")),
    category,
    categoryInferred: !ops?.category,
    siteGroup: siteGroups.get(p.code),
    siteMates: (codesBySite.get(siteGroups.get(p.code) || "") || []).filter((c) => c !== p.code),
    health: "未建檔",
  };
  if (!ops) return view;

  const done = !!ops.doneAt || ops.stage === "保固" || ops.stage === "結案";
  const progress = done ? 100 : ops.progress;

  if (ops.startAt && ops.dueAt && ops.dueAt > ops.startAt) {
    const total = diffDays(ops.startAt, ops.dueAt);
    const elapsed = diffDays(ops.startAt, today);
    view.plannedPct = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
    if (progress !== undefined) view.variance = progress - view.plannedPct;
  }
  if (ops.dueAt && !done) view.daysLeft = diffDays(today, ops.dueAt);

  if (ops.contract !== undefined || ops.variation !== undefined) {
    view.contractTotal = (ops.contract ?? 0) + (ops.variation ?? 0);
  }
  if (ops.billed !== undefined) {
    view.receivable = ops.billed - (ops.collected ?? 0);
    if (view.contractTotal) view.billedRate = ops.billed / view.contractTotal;
    if (ops.billed > 0) view.collectedRate = (ops.collected ?? 0) / ops.billed;
  }

  // 健康度：逾期 > 落後 > 注意 > 正常；還沒開工、已完工各自獨立
  if (done) {
    view.health = "完工";
  } else if (ops.stage === "洽談" || ops.stage === "報價" || ops.stage === "暫停" || (ops.startAt && ops.startAt > today)) {
    view.health = "未開工";
  } else if (view.daysLeft !== undefined && view.daysLeft < 0 && (progress ?? 0) < 100) {
    // 逾期＝過了預計完工日「而且工程還沒做完」。已完工、等點交的不算逾期。
    view.health = "逾期";
    view.reason = `預計 ${fmtDate(ops.dueAt!)} 完工，已逾期 ${-view.daysLeft} 天` + (progress !== undefined ? `，進度 ${progress}%` : "");
  } else if (view.variance !== undefined && view.variance <= -BEHIND_PCT) {
    view.health = "落後";
    view.reason = `實際 ${progress}%，計畫應達 ${view.plannedPct}%（落後 ${-view.variance}%）`;
  } else if (ops.risk === "異常" || ops.risk === "注意" || (view.variance !== undefined && view.variance <= -WATCH_PCT)) {
    view.health = "注意";
    view.reason =
      ops.risk && ops.risk !== "正常"
        ? `風險標記「${ops.risk}」` + (ops.note ? `：${ops.note}` : "")
        : `進度略落後計畫 ${-view.variance!}%`;
  } else {
    view.health = "正常";
  }
  // 延遲的工項也要反映出來
  const late = view.items.filter((i) => i.status === "延遲");
  if (late.length && (view.health === "正常")) {
    view.health = "注意";
    view.reason = `${late.length} 個工項超過預定完成日（${late.map((i) => i.trade).slice(0, 2).join("、")}）`;
  }
  return view;
}

/** 名冊＋工程資料 → 畫面用的專案清單（不含內部帳） */
export function buildViews(
  registry: RegistryProject[],
  records: OpsRecord[],
  items: WorkItem[],
  today: string
): ProjectView[] {
  const projects = registry.filter((p) => !isInternal(p));
  const siteGroups = buildSiteGroups(projects);
  const codesBySite = new Map<string, string[]>();
  siteGroups.forEach((g, code) => codesBySite.set(g, [...(codesBySite.get(g) || []), code]));
  const opsBy = new Map(records.map((r) => [r.code, r]));
  const itemsBy = new Map<string, WorkItem[]>();
  items.forEach((it) => itemsBy.set(it.code, [...(itemsBy.get(it.code) || []), it]));
  return projects.map((p) => deriveProject(p, opsBy.get(p.code), itemsBy.get(p.code) || [], today, siteGroups, codesBySite));
}

/* ══════════════════════════════════════════════════════════
   格式
   ══════════════════════════════════════════════════════════ */

/** 工程業慣用「萬」：1,850,000 → 185 萬；未滿一萬顯示原數 */
export function fmtMoney(n: number | undefined, opts: { unit?: boolean } = {}): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  const unit = opts.unit !== false;
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 10000) {
    const w = abs / 10000;
    const s = w >= 100 ? Math.round(w).toLocaleString("zh-TW") : (Math.round(w * 10) / 10).toLocaleString("zh-TW");
    return `${sign}${s}${unit ? " 萬" : ""}`;
  }
  return `${sign}${abs.toLocaleString("zh-TW")}${unit ? " 元" : ""}`;
}

export function fmtDate(iso: string | undefined, today: string = todayISO()): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return y === +today.slice(0, 4) ? `${m}/${d}` : `${y}/${m}/${d}`;
}

export const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/* ══════════════════════════════════════════════════════════
   示範資料
   只在使用者主動開啟「預覽示範資料」時產生，且畫面上全程標示。
   以專案代碼為種子，每次產生的結果相同；日期相對於今天，示範畫面永遠是「現在」。
   不填人名、業主、地址 —— 避免把虛構資訊套在真實的人身上。
   ══════════════════════════════════════════════════════════ */

function seeded(code: string) {
  let h = 2166136261;
  for (const ch of code) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEMPLATES: Record<string, { trade: string; crew: string; w: number }[]> = {
  室內裝修: [
    { trade: "保護工程", crew: "清潔班", w: 2 },
    { trade: "拆除", crew: "拆除班", w: 4 },
    { trade: "水電配管", crew: "水電班", w: 6 },
    { trade: "泥作", crew: "泥作一班", w: 8 },
    { trade: "木作", crew: "木作班", w: 12 },
    { trade: "油漆", crew: "油漆班", w: 8 },
    { trade: "系統櫃", crew: "系統櫃廠", w: 4 },
    { trade: "燈具安裝", crew: "水電班", w: 2 },
    { trade: "細部清潔", crew: "清潔班", w: 2 },
    { trade: "驗收", crew: "工務", w: 1 },
  ],
  泥作工藝: [
    { trade: "保護工程", crew: "泥作二班", w: 1 },
    { trade: "基底整理", crew: "泥作二班", w: 3 },
    { trade: "泥作打底", crew: "泥作一班", w: 5 },
    { trade: "乾燥養護", crew: "自然養護（免派工）", w: 7 },
    { trade: "面層施作", crew: "泥作一班", w: 6 },
    { trade: "收邊修飾", crew: "泥作一班", w: 2 },
    { trade: "清潔", crew: "清潔班", w: 1 },
    { trade: "驗收", crew: "工務", w: 1 },
  ],
  拆除: [
    { trade: "保護工程", crew: "拆除班", w: 1 },
    { trade: "拆除", crew: "拆除班", w: 5 },
    { trade: "廢料清運", crew: "清運車隊", w: 2 },
    { trade: "驗收", crew: "工務", w: 1 },
  ],
  防水: [
    { trade: "基面處理", crew: "防水班", w: 2 },
    { trade: "防水塗佈", crew: "防水班", w: 4 },
    { trade: "試水", crew: "觀察期（免派工）", w: 3 },
    { trade: "保護層", crew: "泥作二班", w: 2 },
    { trade: "驗收", crew: "工務", w: 1 },
  ],
  修繕維護: [
    { trade: "現況勘查", crew: "工務", w: 1 },
    { trade: "修繕施作", crew: "泥作二班", w: 5 },
    { trade: "清潔", crew: "清潔班", w: 1 },
    { trade: "驗收", crew: "工務", w: 1 },
  ],
  追加減: [
    { trade: "追加項目施作", crew: "泥作一班", w: 8 },
    { trade: "驗收", crew: "工務", w: 1 },
  ],
};

const DURATION: Record<string, [number, number]> = {
  室內裝修: [45, 110],
  泥作工藝: [24, 55],
  拆除: [6, 14],
  防水: [9, 20],
  修繕維護: [5, 16],
  追加減: [8, 22],
};

const CONTRACT: Record<string, [number, number]> = {
  室內裝修: [90, 560],
  泥作工藝: [28, 190],
  拆除: [6, 38],
  防水: [8, 55],
  修繕維護: [3, 28],
  追加減: [4, 45],
};

const NOTES: Record<string, string[]> = {
  洽談: ["初次丈量完成，待提平面配置", "業主想看白泥牆實際樣板", "預算區間確認中"],
  報價: ["報價單已送出，待業主回覆", "依業主意見調整報價第二版"],
  簽約: ["訂金已收，排定開工日", "材料下訂中，等待色樣確認"],
  施工中: ["泥作打底完成，待乾燥後上面層", "水電配管完成，下週封板", "木作進場，天花板施作中", "雨天停工兩日，順延中", "等待業主確認面層色樣", "面層施作中，預計週五收邊"],
  驗收: ["已送驗收，待業主點交", "驗收缺失 3 項，修補中"],
  保固: ["點交完成，保固一年", "保固期內回訪一次，狀況良好"],
  結案: ["尾款已收，結案"],
  暫停: ["業主暫緩，待重新排程"],
};

const pick = <T,>(r: () => number, arr: T[]) => arr[Math.floor(r() * arr.length)];
const between = (r: () => number, [a, b]: [number, number]) => a + Math.floor(r() * (b - a + 1));

/**
 * 以最近的 36 個專案產生示範資料。
 * 刻意安排幾個「逾期／落後／應收未收」的案例，讓「需要注意」清單有東西可看。
 */
export function generateDemo(registry: RegistryProject[], today: string): { records: OpsRecord[]; items: WorkItem[] } {
  const recent = registry
    .filter((p) => !isInternal(p))
    .sort((a, b) => b.seq - a.seq)
    .slice(0, 36);
  const plan: Stage[] = [
    "洽談", "洽談", "報價", "報價", "報價", "簽約", "簽約", "簽約",
    "施工中", "施工中", "施工中", "施工中", "施工中", "施工中", "施工中", "施工中", "施工中", "施工中", "施工中", "施工中",
    "驗收", "驗收", "驗收", "暫停",
    "保固", "保固", "保固", "保固", "保固",
    "結案", "結案", "結案", "結案", "結案", "結案", "結案",
  ];
  const records: OpsRecord[] = [];
  const items: WorkItem[] = [];

  recent.forEach((p, i) => {
    const r = seeded(p.code + "·demo");
    const stage = plan[i] ?? "結案";
    const cat = inferCategory(p.name, p.company);
    const dur = between(r, DURATION[cat]);
    const contract = between(r, CONTRACT[cat]) * 10000 + between(r, [0, 9]) * 1000;
    const variation = r() < 0.3 ? Math.round((r() * 0.18 - 0.04) * contract / 1000) * 1000 : 0;
    const total = contract + variation;

    const rec: OpsRecord = { code: p.code, stage, category: cat, risk: "正常", note: pick(r, NOTES[stage]) };
    let progress = 0;

    if (stage === "洽談" || stage === "報價") {
      rec.contract = stage === "報價" ? contract : undefined;
      records.push(rec);
      return;
    }
    if (stage === "簽約") {
      rec.signedAt = addDays(today, -between(r, [3, 18]));
      rec.startAt = addDays(today, between(r, [3, 21]));
      rec.dueAt = addDays(rec.startAt, dur);
      rec.contract = contract;
      rec.billed = Math.round(total * 0.3);
      rec.collected = rec.billed;
      progress = 0;
    } else if (stage === "施工中" || stage === "暫停") {
      const elapsed = between(r, [Math.round(dur * 0.15), Math.round(dur * 0.85)]);
      rec.startAt = addDays(today, -elapsed);
      rec.dueAt = addDays(rec.startAt, dur);
      rec.signedAt = addDays(rec.startAt, -between(r, [7, 25]));
      const planned = Math.round((elapsed / dur) * 100);
      progress = Math.max(3, Math.min(97, planned + between(r, [-3, 8])));
      rec.contract = contract;
      rec.variation = variation || undefined;
      const stages = progress >= 90 ? 0.9 : progress >= 60 ? 0.6 : 0.3;
      rec.billed = Math.round(total * stages);
      rec.collected = rec.billed;
    } else if (stage === "驗收") {
      rec.startAt = addDays(today, -dur - between(r, [2, 8]));
      rec.dueAt = addDays(rec.startAt, dur);
      rec.signedAt = addDays(rec.startAt, -between(r, [7, 25]));
      progress = 100;
      rec.contract = contract;
      rec.variation = variation || undefined;
      rec.billed = Math.round(total * 0.9);
      rec.collected = Math.round(total * 0.6);
    } else {
      const back = stage === "保固" ? between(r, [20, 160]) : between(r, [170, 420]);
      rec.doneAt = addDays(today, -back);
      rec.dueAt = addDays(rec.doneAt, -between(r, [-3, 6]));
      rec.startAt = addDays(rec.dueAt, -dur);
      rec.signedAt = addDays(rec.startAt, -between(r, [7, 25]));
      progress = 100;
      rec.contract = contract;
      rec.variation = variation || undefined;
      rec.billed = total;
      rec.collected = stage === "結案" ? total : Math.round(total * 0.95); // 保固款 5% 未收
    }

    // 刻意製造幾個需要注意的狀況（依在清單中的位置，固定發生在同幾件）
    if (stage === "施工中" && i === 9) {
      // 逾期：預計完工已過，進度未滿
      rec.startAt = addDays(today, -dur - 6);
      rec.dueAt = addDays(rec.startAt, dur);
      rec.signedAt = addDays(rec.startAt, -between(r, [7, 25]));
      progress = 86;
      rec.billed = Math.round(total * 0.9);
      rec.collected = Math.round(total * 0.6);
      rec.risk = "異常";
      rec.note = "面層色差，業主要求局部重做";
    }
    if (stage === "施工中" && i === 12) {
      // 落後
      const planned = Math.round((diffDays(rec.startAt!, today) / dur) * 100);
      progress = Math.max(5, planned - 22);
      rec.risk = "注意";
      rec.note = "工班調度不及，泥作延後進場";
      rec.billed = Math.round(total * 0.3);
      rec.collected = rec.billed;
    }
    if (stage === "施工中" && i === 15) {
      // 應收未收
      rec.billed = Math.round(total * 0.6);
      rec.collected = Math.round(total * 0.3);
      rec.note = "第二期估驗款業主尚未匯款";
    }
    rec.progress = progress;
    rec.updatedAt = addDays(today, -between(r, [0, 6]));
    records.push(rec);

    // 工項：依類別範本，按權重分配到 開工→預計完工 之間
    if (!rec.startAt || !rec.dueAt) return;
    const tpl = TEMPLATES[cat];
    const span = diffDays(rec.startAt, rec.dueAt);
    const sumW = tpl.reduce((s, t) => s + t.w, 0);
    let cursor = 0;
    // span 是「第 0 天到第 span 天」，共 span+1 天；用 span+1 才能讓 100% 蓋滿最後一個工項
    const doneUntil = (progress / 100) * (span + 1);
    tpl.forEach((t, k) => {
      const len = Math.max(1, Math.round((t.w / sumW) * span));
      // 相鄰工項略為重疊，比較接近現場實際
      const s = Math.max(0, cursor - (k > 0 && r() < 0.35 ? 1 : 0));
      const e = Math.min(span, s + len - 1);
      const itemProg = doneUntil >= e + 1 ? 100 : doneUntil <= s ? 0 : Math.round(((doneUntil - s) / (e - s + 1)) * 100);
      items.push({
        code: p.code,
        trade: t.trade,
        crew: t.crew === "—" ? undefined : t.crew,
        start: addDays(rec.startAt!, s),
        end: addDays(rec.startAt!, e),
        progress: itemProg,
      });
      cursor = e + 1;
    });
  });
  return { records, items };
}
