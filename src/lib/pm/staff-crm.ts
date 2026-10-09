/**
 * 拾壤CRM「員工CRM」分頁：內部職員的名冊（伺服器端）
 *
 * 指揮中心 → 團隊 → 內部職員 直接讀寫這一頁：
 *   讀：序列、姓名、等級、聯絡電話、Gmail、登入參戰日、離線登出日
 *   寫：同上幾欄（新增時填進第一個「有序列、沒姓名」的空列；都滿了就接在最後）
 *   刪：清空那一列序列以外的所有欄位（含身分證、地址、匯款帳號），序列保留，編號不會亂
 *
 * 生日、身分證字號、地址、富邦匯款帳號：APP 不讀出、不顯示、不提供編輯，只在刪除時一併清空。
 * 欄位以標題文字定位（不寫死欄位字母），試算表插欄或調換順序都不影響。
 */

import { readSheet, writeSheet } from "@/lib/google-sheets";

export const CRM_ID = "11IiXZbVxFAMzd8wEjU2Z9-W3CqoRa6aW1vQ50dJtrDk";
const TAB = "員工CRM";

export interface StaffRecord {
  /** 序列（這一列的編號，用來定位） */
  seq: string;
  name: string;
  level?: string;
  phone?: string;
  gmail?: string;
  /** 登入參戰日（yyyy/mm/dd） */
  joined?: string;
  /** 離線登出日（有填 = 已離職） */
  left?: string;
}

export type StaffField = Exclude<keyof StaffRecord, "seq">;

const HEADERS: Record<StaffField | "seq", string> = {
  seq: "序列",
  name: "姓名",
  level: "等級",
  phone: "聯絡電話",
  gmail: "Gmail",
  joined: "登入參戰日",
  left: "離線登出日",
};

interface Sheet {
  headerRow: number; // 0-based
  col: Record<StaffField | "seq", number>;
  lastCol: number;
  rows: { rowNumber: number; rec: StaffRecord }[]; // rowNumber 1-based（試算表列號）
}

let cache: { at: number; data: Sheet } | null = null;
const TTL = 60 * 1000;

export function invalidateStaff() {
  cache = null;
}

const colLetter = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const isLeft = (v?: string) => !!v && v !== "-" && v.toUpperCase() !== "N/A" && v !== "無";

async function load(): Promise<Sheet> {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  const raw = (await readSheet(CRM_ID, `${TAB}!A1:Z400`)) as string[][];
  let headerRow = -1;
  for (let i = 0; i < Math.min(8, raw.length); i++) {
    if ((raw[i] ?? []).some((c) => String(c ?? "").trim() === "姓名")) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) throw new Error("員工CRM 找不到「姓名」標題列");
  const h = (raw[headerRow] ?? []).map((c) => String(c ?? "").trim());
  const col = Object.fromEntries(Object.entries(HEADERS).map(([k, label]) => [k, h.indexOf(label)])) as Sheet["col"];
  if (col.name < 0 || col.seq < 0) throw new Error("員工CRM 缺少「序列」或「姓名」欄");
  const lastCol = h.reduce((m, v, i) => (v ? i : m), 0);
  const get = (r: string[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const rows = raw.slice(headerRow + 1).map((r, i) => ({
    rowNumber: headerRow + 2 + i,
    rec: {
      seq: get(r, col.seq),
      name: get(r, col.name),
      level: get(r, col.level) || undefined,
      phone: get(r, col.phone) || undefined,
      gmail: get(r, col.gmail).toLowerCase() || undefined,
      joined: get(r, col.joined) || undefined,
      left: get(r, col.left) || undefined,
    },
  }));
  const data: Sheet = { headerRow, col, lastCol, rows };
  cache = { at: Date.now(), data };
  return data;
}

/** 在職的人（有姓名、沒有離線登出日） */
export async function listStaff(): Promise<StaffRecord[]> {
  const s = await load();
  return s.rows.filter((r) => r.rec.name && !isLeft(r.rec.left)).map((r) => r.rec);
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);

/** 新增或修改；回傳這一列的序列 */
export async function saveStaff(seq: string | undefined, input: Partial<Record<StaffField, unknown>>): Promise<string> {
  invalidateStaff();
  const s = await load();
  const v: Partial<Record<StaffField, string>> = {
    name: clean(input.name, 30),
    level: clean(input.level, 4),
    phone: clean(input.phone, 30),
    gmail: clean(input.gmail, 80)?.toLowerCase(),
    joined: clean(input.joined, 20),
    left: clean(input.left, 20),
  };
  if (seq === undefined && !v.name) throw new StaffError("姓名必填");
  if (v.name !== undefined && !v.name) throw new StaffError("姓名必填");
  if (v.gmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.gmail)) throw new StaffError("Gmail 格式不正確");

  let target: { rowNumber: number; seq: string } | undefined;
  if (seq !== undefined) {
    const r = s.rows.find((x) => x.rec.seq === seq && x.rec.name);
    if (!r) throw new StaffError("找不到這位職員，可能已被刪除，請重新整理");
    target = { rowNumber: r.rowNumber, seq };
  } else {
    // 第一個「有序列、沒姓名」的空列；沒有就接在最後一列之後
    const empty = s.rows.find((x) => x.rec.seq && !x.rec.name);
    if (empty) target = { rowNumber: empty.rowNumber, seq: empty.rec.seq };
    else {
      const used = s.rows.filter((x) => x.rec.seq || x.rec.name);
      const last = used[used.length - 1];
      const nextSeq = String(Math.max(-1, ...s.rows.map((x) => Number(x.rec.seq)).filter((n) => Number.isFinite(n))) + 1);
      target = { rowNumber: (last?.rowNumber ?? s.headerRow + 1) + 1, seq: nextSeq };
      await writeSheet(CRM_ID, `${TAB}!${colLetter(s.col.seq)}${target.rowNumber}`, [[nextSeq]]);
    }
  }

  for (const [k, val] of Object.entries(v) as [StaffField, string | undefined][]) {
    if (val === undefined) continue;
    const c = s.col[k];
    if (c < 0) continue;
    // 電話以 0 開頭：加 ' 讓試算表當文字，不會被吃掉開頭的 0
    const cell = k === "phone" && /^0/.test(val) ? `'${val}` : val;
    await writeSheet(CRM_ID, `${TAB}!${colLetter(c)}${target.rowNumber}`, [[cell]]);
  }
  invalidateStaff();
  return target.seq;
}

/** 刪除：清空序列以外的所有欄位 */
export async function deleteStaff(seq: string): Promise<void> {
  invalidateStaff();
  const s = await load();
  const r = s.rows.find((x) => x.rec.seq === seq && x.rec.name);
  if (!r) throw new StaffError("找不到這位職員，可能已被刪除");
  const from = s.col.seq + 1;
  if (s.lastCol >= from) {
    const blanks = Array.from({ length: s.lastCol - from + 1 }, () => "");
    await writeSheet(CRM_ID, `${TAB}!${colLetter(from)}${r.rowNumber}:${colLetter(s.lastCol)}${r.rowNumber}`, [blanks]);
  }
  invalidateStaff();
}

export class StaffError extends Error {}
