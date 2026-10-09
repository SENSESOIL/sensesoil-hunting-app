/**
 * 拾壤CRM「員工CRM」：內部職員的名冊（伺服器端）
 *
 * 指揮中心 → 團隊 → 內部職員 直接讀寫這一頁（讀寫細節見 crm-sheet.ts）。
 *   APP 讀寫：序列、姓名、等級、聯絡電話、Gmail、登入參戰日、離線登出日
 *   生日、身分證字號、地址、富邦匯款帳號：APP 不讀出、不顯示、不提供編輯，只在刪除時一併清空。
 */

import { clean, CrmError, deleteCrm, listCrm, saveCrm, type CrmTable } from "./crm-sheet";

export interface StaffRecord {
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

type F = "name" | "level" | "phone" | "gmail" | "joined" | "left";

const STAFF: CrmTable<F> = {
  tab: "員工CRM",
  fields: { name: "姓名", level: "等級", phone: "聯絡電話", gmail: "Gmail", joined: "登入參戰日", left: "離線登出日" },
  primary: "name",
  clearOnDelete: ["姓名", "登入參戰日", "離線登出日", "等級", "生日", "聯絡電話", "身分證字號", "Gmail", "地址", "富邦匯款帳號"],
  textFields: ["phone"],
};

export { CrmError as StaffError };

const isLeft = (v?: string) => !!v && v !== "-" && v.toUpperCase() !== "N/A" && v !== "無";
const opt = (v: string) => v || undefined;

/** 在職的人（有姓名、沒有離線登出日） */
export async function listStaff(): Promise<StaffRecord[]> {
  const rows = await listCrm(STAFF);
  return rows
    .filter((r) => !isLeft(r.v.left))
    .map((r) => ({
      seq: r.seq,
      name: r.v.name,
      level: opt(r.v.level),
      phone: opt(r.v.phone),
      gmail: opt(r.v.gmail.toLowerCase()),
      joined: opt(r.v.joined),
      left: opt(r.v.left),
    }));
}

export async function saveStaff(seq: string | undefined, input: Partial<Record<F, unknown>>): Promise<string> {
  const v: Partial<Record<F, string>> = {
    name: clean(input.name, 30),
    level: clean(input.level, 4),
    phone: clean(input.phone, 30),
    gmail: clean(input.gmail, 80)?.toLowerCase(),
    joined: clean(input.joined, 20),
    left: clean(input.left, 20),
  };
  if ((seq === undefined || v.name !== undefined) && !v.name) throw new CrmError("姓名必填");
  if (v.gmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.gmail)) throw new CrmError("Gmail 格式不正確");
  return saveCrm(STAFF, seq, v);
}

export async function deleteStaff(seq: string): Promise<void> {
  return deleteCrm(STAFF, seq);
}
