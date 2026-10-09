/**
 * 拾壤CRM「廠商CRM」：協力廠商（伺服器端）
 *
 * 指揮中心 → 團隊 → 協力廠商 直接讀寫這一頁（讀寫細節見 crm-sheet.ts）。
 *   APP 讀寫：序列、工項、等級、姓名/公司、簡稱、聯絡人1、聯絡電話1、聯絡人2、聯絡電話2、備註、統編、銀行分行、分行、匯款帳號
 *   後四欄是帳務資料：只有權限表「團隊」欄 Admin／Editor 拿得到（由 /api/pm/team 過濾）。
 *   「代號」可能是公式，APP 不寫也不清。
 */

import type { VendorInfo } from "./model";
import { clean, CrmError, deleteCrm, listCrm, saveCrm, type CrmTable } from "./crm-sheet";

type F = Exclude<keyof VendorInfo, "seq">;

/** 帳務欄位：只給 Admin／Editor */
export const VENDOR_PRIVATE = ["taxId", "bankBranch", "branch", "account"] as const;

const VENDOR: CrmTable<F> = {
  tab: "廠商CRM",
  fields: {
    trade: "工項",
    level: "等級",
    fullName: "姓名/公司",
    short: "簡稱",
    contact1: "聯絡人1",
    phone1: "聯絡電話1",
    contact2: "聯絡人2",
    phone2: "聯絡電話2",
    note: "備註",
    taxId: "統編",
    bankBranch: "銀行分行",
    branch: "分行",
    account: "匯款帳號",
  },
  primary: "fullName",
  clearOnDelete: ["工項", "等級", "姓名/公司", "簡稱", "統編", "聯絡人1", "聯絡電話1", "聯絡人2", "聯絡電話2", "銀行分行", "分行", "匯款帳號", "備註"],
  textFields: ["phone1", "phone2", "taxId", "account"],
};

export { CrmError as VendorError };

export async function listVendors(): Promise<VendorInfo[]> {
  const rows = await listCrm(VENDOR);
  return rows.map((r) => ({ seq: r.seq, ...r.v }));
}

export async function saveVendor(seq: string | undefined, input: Partial<Record<F, unknown>>): Promise<string> {
  const v: Partial<Record<F, string>> = {
    trade: clean(input.trade, 20),
    level: clean(input.level, 10),
    fullName: clean(input.fullName, 60),
    short: clean(input.short, 20),
    contact1: clean(input.contact1, 30),
    phone1: clean(input.phone1, 30),
    contact2: clean(input.contact2, 30),
    phone2: clean(input.phone2, 30),
    note: clean(input.note, 200),
    taxId: clean(input.taxId, 20),
    bankBranch: clean(input.bankBranch, 40),
    branch: clean(input.branch, 40),
    account: clean(input.account, 40),
  };
  if ((seq === undefined || v.fullName !== undefined) && !v.fullName) throw new CrmError("公司名稱必填");
  return saveCrm(VENDOR, seq, v);
}

export async function deleteVendor(seq: string): Promise<void> {
  return deleteCrm(VENDOR, seq);
}
