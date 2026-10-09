/**
 * 拾壤CRM 試算表的通用讀寫（伺服器端）：員工CRM、廠商CRM 共用
 *
 * 每一頁都是「標題列＋一列一筆」，第一欄「序列」是那一列的編號，用來定位。
 *   讀：只讀設定裡列出的欄位（以標題文字定位，不寫死欄位字母，插欄或換順序都不影響）
 *   寫：只寫有改的欄位；新增時填進第一個「有序列、沒主要欄位」的空列，都滿了就接在最後
 *   刪：清空 clearOnDelete 列出的欄位（含不在 APP 顯示的敏感欄），序列保留，編號不會亂
 */

import { batchWriteSheet, readSheet } from "@/lib/google-sheets";

export const CRM_ID = "11IiXZbVxFAMzd8wEjU2Z9-W3CqoRa6aW1vQ50dJtrDk";

export interface CrmTable<F extends string> {
  tab: string;
  /** APP 讀寫的欄位：key → 試算表標題 */
  fields: Record<F, string>;
  /** 判斷「這一列有資料」的欄位（例如姓名） */
  primary: F;
  /** 刪除時要清空的標題（沒列到的，例如公式欄，不動） */
  clearOnDelete: string[];
  /** 內容一律當文字存（電話、帳號、證號：開頭的 0 不會不見，長數字也不會變成科學記號） */
  textFields?: F[];
}

export interface CrmRow<F extends string> {
  rowNumber: number; // 試算表列號（1 起算）
  seq: string;
  v: Record<F, string>;
}

interface Loaded<F extends string> {
  headerRow: number;
  header: string[];
  seqCol: number;
  rows: CrmRow<F>[];
}

export class CrmError extends Error {}

const caches = new Map<string, { at: number; data: Loaded<string> }>();
const TTL = 60 * 1000;

export function invalidateCrm(tab: string) {
  caches.delete(tab);
}

const colLetter = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

async function load<F extends string>(t: CrmTable<F>): Promise<Loaded<F>> {
  const hit = caches.get(t.tab);
  if (hit && Date.now() - hit.at < TTL) return hit.data as Loaded<F>;
  const raw = (await readSheet(CRM_ID, `${t.tab}!A1:Z600`)) as string[][];
  const primaryLabel = t.fields[t.primary];
  let headerRow = -1;
  for (let i = 0; i < Math.min(8, raw.length); i++) {
    if ((raw[i] ?? []).some((c) => String(c ?? "").trim() === primaryLabel)) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) throw new Error(`${t.tab} 找不到「${primaryLabel}」標題列`);
  const header = (raw[headerRow] ?? []).map((c) => String(c ?? "").trim());
  const seqCol = header.indexOf("序列");
  if (seqCol < 0) throw new Error(`${t.tab} 缺少「序列」欄`);
  const keys = Object.keys(t.fields) as F[];
  const rows = raw.slice(headerRow + 1).map((r, i) => {
    const v = {} as Record<F, string>;
    for (const k of keys) {
      const c = header.indexOf(t.fields[k]);
      v[k] = c >= 0 ? String(r[c] ?? "").trim() : "";
    }
    return { rowNumber: headerRow + 2 + i, seq: String(r[seqCol] ?? "").trim(), v };
  });
  const data: Loaded<F> = { headerRow, header, seqCol, rows };
  caches.set(t.tab, { at: Date.now(), data });
  return data;
}

/** 有資料的列（主要欄位不是空的） */
export async function listCrm<F extends string>(t: CrmTable<F>): Promise<CrmRow<F>[]> {
  const s = await load(t);
  return s.rows.filter((r) => r.v[t.primary]);
}

/** 新增（seq 不給）或修改；只寫 values 裡有的欄位。回傳這一列的序列 */
export async function saveCrm<F extends string>(t: CrmTable<F>, seq: string | undefined, values: Partial<Record<F, string>>): Promise<string> {
  invalidateCrm(t.tab);
  const s = await load(t);
  let target: { rowNumber: number; seq: string };
  if (seq !== undefined) {
    const r = s.rows.find((x) => x.seq === seq && x.v[t.primary]);
    if (!r) throw new CrmError("找不到這一筆，可能已被刪除，請重新整理");
    target = { rowNumber: r.rowNumber, seq };
  } else {
    const empty = s.rows.find((x) => x.seq && !x.v[t.primary]);
    if (empty) target = { rowNumber: empty.rowNumber, seq: empty.seq };
    else {
      const used = s.rows.filter((x) => x.seq || x.v[t.primary]);
      const lastRow = used.length ? used[used.length - 1].rowNumber : s.headerRow + 1;
      const nums = s.rows.map((x) => Number(x.seq)).filter((n) => Number.isFinite(n));
      const nextSeq = String((nums.length ? Math.max(...nums) : -1) + 1);
      target = { rowNumber: lastRow + 1, seq: nextSeq };
    }
  }
  const data: { range: string; values: string[][] }[] = [];
  if (seq === undefined && !s.rows.some((x) => x.rowNumber === target.rowNumber && x.seq)) {
    data.push({ range: `${t.tab}!${colLetter(s.seqCol)}${target.rowNumber}`, values: [[target.seq]] });
  }
  for (const [k, val] of Object.entries(values) as [F, string | undefined][]) {
    if (val === undefined) continue;
    const c = s.header.indexOf(t.fields[k]);
    if (c < 0) continue;
    const cell = t.textFields?.includes(k) && val ? `'${val}` : val;
    data.push({ range: `${t.tab}!${colLetter(c)}${target.rowNumber}`, values: [[cell]] });
  }
  await batchWriteSheet(CRM_ID, data);
  invalidateCrm(t.tab);
  return target.seq;
}

/** 刪除：清空 clearOnDelete 的欄位，序列保留 */
export async function deleteCrm<F extends string>(t: CrmTable<F>, seq: string): Promise<void> {
  invalidateCrm(t.tab);
  const s = await load(t);
  const r = s.rows.find((x) => x.seq === seq && x.v[t.primary]);
  if (!r) throw new CrmError("找不到這一筆，可能已被刪除");
  const data = t.clearOnDelete
    .map((label) => s.header.indexOf(label))
    .filter((c) => c >= 0)
    .map((c) => ({ range: `${t.tab}!${colLetter(c)}${r.rowNumber}`, values: [[""]] }));
  await batchWriteSheet(CRM_ID, data);
  invalidateCrm(t.tab);
}

export const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
