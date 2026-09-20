// src/lib/handbook-config.ts
// 公司制度／SOP 的內容註冊表。
//
// 目前先放在程式碼裡，資料形狀刻意比照 Google Sheet 的一列，
// 日後要改成從 Sheet 讀取時，只要換掉 getPolicies() / getSops() 的實作，
// 上層 UI 完全不用動。
//
// body 留空的項目會顯示「內容待建立」，不會假裝有內容。

export interface HandbookDoc {
  id: string;
  title: string;
  category: string;
  /** 一句話說明，列表上會顯示 */
  summary?: string;
  /** 正文，支援簡單換行。留空代表尚未建立 */
  body?: string;
  /** 外部連結（Google Doc／PDF 等）。有值時點擊會開新分頁 */
  url?: string;
  updatedAt?: string;
}

export const POLICY_CATEGORIES = ["人事", "薪酬福利", "績效考核", "行政", "資安"] as const;

export const SOP_CATEGORIES = ["專案執行", "行政作業", "財務請款", "設備管理"] as const;

// ── 公司制度 ────────────────────────────────────────────────
const POLICIES: HandbookDoc[] = [
  { id: "pol-salary", title: "薪酬福利制度", category: "薪酬福利" },
  { id: "pol-review", title: "績效考核制度", category: "績效考核" },
];

// ── SOP ────────────────────────────────────────────────────
const SOPS: HandbookDoc[] = [];

// ── 表單 ────────────────────────────────────────────────────
// 表單是互動式元件（不是文件），用 component 欄位標記要開哪一個。
export interface FormEntry {
  id: string;
  title: string;
  summary?: string;
  /** 對應到 CommandCenter 裡的表單元件 */
  component: "receipt";
}

export const FORMS: FormEntry[] = [
  {
    id: "form-receipt",
    title: "領款簽收單",
    summary: "填寫並簽名後送出，自動歸檔至簽收紀錄",
    component: "receipt",
  },
];

export function getPolicies(): HandbookDoc[] {
  return POLICIES;
}

export function getSops(): HandbookDoc[] {
  return SOPS;
}
