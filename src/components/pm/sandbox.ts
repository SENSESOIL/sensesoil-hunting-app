"use client";

import type { OpsRecord, WorkItem } from "@/lib/project-ops";

/**
 * 本機試編：還沒有雲端資料庫之前，編輯先存在這台裝置的 localStorage。
 *
 * 分兩個命名空間：
 *   demo  —— 在「示範資料」上試編。永遠不會上傳（底稿本身是模擬數字）。
 *   real  —— 在真實名冊上建立的資料。之後接上雲端資料庫時可以一鍵上傳。
 *
 * 以專案為單位整筆覆蓋：某代碼一旦有試編紀錄，就以試編版本為準；
 * 工項也是整組覆蓋（包含「刪到一個都不剩」—— 空陣列代表刻意清空，不是沒動過）。
 */

export type SandboxBase = "demo" | "real";

export interface SandboxDoc {
  v: 1;
  records: Record<string, OpsRecord>;
  items: Record<string, WorkItem[]>;
  /** 每個專案最後一次試編的時間（ISO） */
  touched: Record<string, string>;
}

const EVENT = "ss-pm-sandbox-change";
const key = (base: SandboxBase) => `ss-pm-sandbox:${base}:v1`;
const EMPTY: SandboxDoc = Object.freeze({ v: 1, records: {}, items: {}, touched: {} }) as SandboxDoc;

/* useSyncExternalStore 需要「內容沒變就回傳同一個物件」，所以用原始字串做快取 */
const cache: Record<SandboxBase, { raw: string | null; doc: SandboxDoc }> = {
  demo: { raw: null, doc: EMPTY },
  real: { raw: null, doc: EMPTY },
};

export function readSandbox(base: SandboxBase): SandboxDoc {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key(base));
  } catch {
    return EMPTY;
  }
  const c = cache[base];
  if (raw === c.raw) return c.doc;
  let doc = EMPTY;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as SandboxDoc;
      if (parsed && parsed.v === 1) {
        doc = { v: 1, records: parsed.records || {}, items: parsed.items || {}, touched: parsed.touched || {} };
      }
    } catch {
      /* 壞掉的資料當作沒有，不讓整頁掛掉 */
    }
  }
  cache[base] = { raw, doc };
  return doc;
}

function writeSandbox(base: SandboxBase, doc: SandboxDoc): boolean {
  try {
    window.localStorage.setItem(key(base), JSON.stringify(doc));
  } catch {
    return false; // 私密瀏覽或空間不足
  }
  window.dispatchEvent(new Event(EVENT));
  return true;
}

export function subscribeSandbox(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

const stamp = () => new Date().toISOString();

export function sandboxSaveRecord(base: SandboxBase, rec: OpsRecord): boolean {
  const cur = readSandbox(base);
  return writeSandbox(base, {
    ...cur,
    records: { ...cur.records, [rec.code]: rec },
    touched: { ...cur.touched, [rec.code]: stamp() },
  });
}

export function sandboxSaveItems(base: SandboxBase, code: string, items: WorkItem[]): boolean {
  const cur = readSandbox(base);
  return writeSandbox(base, {
    ...cur,
    items: { ...cur.items, [code]: items.map((it) => ({ ...it, code })) },
    touched: { ...cur.touched, [code]: stamp() },
  });
}

/**
 * 一次寫入某專案的欄位與工項（任一可省略）。今日回報、順延這類動作會同時改兩者，
 * 一次寫入才不會出現「只存到一半」，也讓「復原」一步回到原狀。
 */
export function sandboxSaveProject(
  base: SandboxBase,
  code: string,
  rec: OpsRecord | undefined,
  items: WorkItem[] | undefined
): boolean {
  const cur = readSandbox(base);
  return writeSandbox(base, {
    v: 1,
    records: rec ? { ...cur.records, [code]: rec } : cur.records,
    items: items ? { ...cur.items, [code]: items.map((it) => ({ ...it, code })) } : cur.items,
    touched: { ...cur.touched, [code]: stamp() },
  });
}

/** 還原某個專案：丟掉這個專案的所有試編，回到底稿 */
export function sandboxResetProject(base: SandboxBase, code: string): boolean {
  const cur = readSandbox(base);
  const records = { ...cur.records };
  const items = { ...cur.items };
  const touched = { ...cur.touched };
  delete records[code];
  delete items[code];
  delete touched[code];
  return writeSandbox(base, { v: 1, records, items, touched });
}

export function sandboxClear(base: SandboxBase): boolean {
  try {
    window.localStorage.removeItem(key(base));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(EVENT));
  return true;
}

export const sandboxCount = (doc: SandboxDoc) => Object.keys(doc.touched).length;

/** 底稿＋試編 → 合併後的資料（試編整筆覆蓋底稿） */
export function overlay(
  baseRecords: OpsRecord[],
  baseItems: WorkItem[],
  doc: SandboxDoc
): { records: OpsRecord[]; items: WorkItem[] } {
  const recs = new Map(baseRecords.map((r) => [r.code, r]));
  Object.values(doc.records).forEach((r) => recs.set(r.code, r));
  const overridden = new Set(Object.keys(doc.items));
  const items = baseItems.filter((it) => !overridden.has(it.code));
  Object.values(doc.items).forEach((arr) => items.push(...arr));
  return { records: [...recs.values()], items };
}
