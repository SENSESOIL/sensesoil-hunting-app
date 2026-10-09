/**
 * 拾壤CRM「員工CRM」：內部職員的名冊（伺服器端）
 *
 * 指揮中心 → 團隊 → 內部職員 直接讀寫這一頁（讀寫細節見 crm-sheet.ts）。
 *   APP 讀寫：序列、姓名、等級、聯絡電話、Gmail、登入參戰日、離線登出日、生日、身分證字號、地址、富邦匯款帳號
 *   身分證字號、地址、富邦匯款帳號是個資：只有權限表「團隊」欄 Admin／Editor 拿得到（由 /api/pm/team 過濾）；生日所有人都看得到。
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
  birthday?: string;
  idNo?: string;
  address?: string;
  bank?: string;
}

type F = "name" | "level" | "phone" | "gmail" | "joined" | "left" | "birthday" | "idNo" | "address" | "bank";

/** 個資欄位：只給 Admin／Editor（生日不算，一般成員也看得到） */
export const STAFF_PRIVATE = ["idNo", "address", "bank"] as const;

const STAFF: CrmTable<F> = {
  tab: "員工CRM",
  fields: {
    name: "姓名",
    level: "等級",
    phone: "聯絡電話",
    gmail: "Gmail",
    joined: "登入參戰日",
    left: "離線登出日",
    birthday: "生日",
    idNo: "身分證字號",
    address: "地址",
    bank: "富邦匯款帳號",
  },
  primary: "name",
  clearOnDelete: ["姓名", "登入參戰日", "離線登出日", "等級", "生日", "聯絡電話", "身分證字號", "Gmail", "地址", "富邦匯款帳號"],
  textFields: ["phone", "idNo", "bank", "birthday"],
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
      birthday: opt(r.v.birthday),
      idNo: opt(r.v.idNo),
      address: opt(r.v.address),
      bank: opt(r.v.bank),
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
    birthday: clean(input.birthday, 20),
    idNo: clean(input.idNo, 20)?.toUpperCase(),
    address: clean(input.address, 120),
    bank: clean(input.bank, 40),
  };
  if ((seq === undefined || v.name !== undefined) && !v.name) throw new CrmError("姓名必填");
  if (v.gmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.gmail)) throw new CrmError("Gmail 格式不正確");
  return saveCrm(STAFF, seq, v);
}

export async function deleteStaff(seq: string): Promise<void> {
  return deleteCrm(STAFF, seq);
}
