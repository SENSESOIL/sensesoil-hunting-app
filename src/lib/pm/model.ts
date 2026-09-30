/**
 * 專案／任務的資料模型（前端與伺服器共用，不 import 任何伺服器套件）。
 *
 * 資料放在 APP 自己的 Supabase（pm_* 資料表，見 supabase/migrations/20260928000000_pm_schema.sql）。
 * 資料庫欄位是 snake_case，這裡轉成 camelCase；轉換只在這支檔案做。
 */

import {
  weightedProgress,
  type OpsRecord,
  type Risk,
  type Stage,
  type WorkItem,
  type WorkKind,
} from "@/lib/project-ops";

export type TaskStatus = "todo" | "doing" | "done";
export const TASK_STATUSES: TaskStatus[] = ["todo", "doing", "done"];
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: "待辦", doing: "進行中", done: "完成" };

export type Role = "manager" | "member";

/**
 * 可以派工的人：權限表任何一欄是 Admin，或「專案情報／工進排程／任務追蹤」任一欄是 Editor。
 * 其他在權限表上的人都是 member：只看得到指派給自己的任務。
 */
const PM_PERM_KEYS = ["專案情報", "工進排程", "任務追蹤"];
export function isManagerRoles(roles: Record<string, string | undefined>): boolean {
  if (Object.values(roles).some((r) => r === "admin")) return true;
  return PM_PERM_KEYS.some((k) => roles[k] === "admin" || roles[k] === "editor");
}

export interface Person {
  email: string;
  name: string;
  /** 可以建立／指派任務、看全部 */
  manager: boolean;
  /** 大頭照（團隊頁上傳的，data URL） */
  avatar?: string;
}

export interface Task {
  id: string;
  code: string;
  title: string;
  kind: WorkKind;
  status: TaskStatus;
  progress: number;
  flagged: boolean;
  assigneeEmail?: string;
  assigneeName?: string;
  start?: string;
  due?: string;
  note?: string;
  seq: number;
  assignedBy?: string;
  assignedByName?: string;
  assignedAt?: string;
  seenAt?: string;
  ackAt?: string;
  doneAt?: string;
  doneBy?: string;
  version: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface PmProject {
  code: string;
  name: string;
  company: string;
  /** 在拾壤CRM 名冊上（否則是 APP 新建的） */
  inCrm: boolean;
  /** 資料庫裡有這個專案的資料列 */
  hasRow: boolean;
  stage?: Stage;
  category?: string;
  site?: string;
  client?: string;
  manager?: string;
  signedAt?: string;
  startAt?: string;
  dueAt?: string;
  doneAt?: string;
  /** 金額欄位只有 manager 收得到 */
  contract?: number;
  variation?: number;
  billed?: number;
  collected?: number;
  progress?: number;
  risk?: Risk;
  note?: string;
  driveFolderId?: string;
  archived: boolean;
  version: number;
  updatedAt?: string;
  updatedBy?: string;
  photoCount: number;
}

export interface PmNotification {
  id: number;
  type: "assigned" | "updated" | "removed" | "deleted" | "done" | "ack" | "reopened";
  taskId?: string;
  code?: string;
  title: string;
  body?: string;
  actorName?: string;
  actorEmail?: string;
  createdAt: string;
  readAt?: string;
}

export interface PmPhoto {
  id: string;
  code: string;
  taskId?: string;
  driveFileId?: string;
  driveUrl?: string;
  fileName: string;
  caption?: string;
  takenOn?: string;
  uploadedByName?: string;
  thumb?: string;
  createdAt: string;
}

export interface PmData {
  me: { email: string; name: string; role: Role };
  /** 資料庫已設定 */
  configured: boolean;
  /** 設定了但讀不到（金鑰錯、還沒執行 SQL…） */
  dbError?: string;
  people: Person[];
  projects: PmProject[];
  tasks: Task[];
  unread: number;
  /** 工程照上傳已設定（Apps Script） */
  photoReady: boolean;
  /** 手機推播已設定（VAPID） */
  pushReady: boolean;
  fetchedAt: string;
}

/* ══════════════════════════════════════════════════════════
   資料庫列 ↔ 前端物件
   ══════════════════════════════════════════════════════════ */

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function rowToTask(r: Row): Task {
  return {
    id: String(r.id),
    code: String(r.project_code),
    title: String(r.title ?? ""),
    kind: ((s(r.kind) as WorkKind) ?? "施工"),
    status: (s(r.status) as TaskStatus) ?? "todo",
    progress: n(r.progress) ?? 0,
    flagged: r.flagged === true,
    assigneeEmail: s(r.assignee_email),
    assigneeName: s(r.assignee_name),
    start: s(r.start_on),
    due: s(r.due_on),
    note: s(r.note),
    seq: n(r.sort_order) ?? 0,
    assignedBy: s(r.assigned_by),
    assignedByName: s(r.assigned_by_name),
    assignedAt: s(r.assigned_at),
    seenAt: s(r.seen_at),
    ackAt: s(r.ack_at),
    doneAt: s(r.done_at),
    doneBy: s(r.done_by),
    version: n(r.version) ?? 1,
    createdBy: s(r.created_by),
    createdAt: s(r.created_at),
    updatedAt: s(r.updated_at),
    updatedBy: s(r.updated_by),
  };
}

/** 前端的任務修改 → 資料庫欄位（只帶有給的欄位） */
export function taskPatchToRow(t: Partial<Task> & { id: string }): Row {
  const out: Row = { id: t.id };
  const map: [keyof Task, string][] = [
    ["code", "project_code"],
    ["title", "title"],
    ["kind", "kind"],
    ["status", "status"],
    ["progress", "progress"],
    ["flagged", "flagged"],
    ["assigneeEmail", "assignee_email"],
    ["assigneeName", "assignee_name"],
    ["start", "start_on"],
    ["due", "due_on"],
    ["note", "note"],
    ["seq", "sort_order"],
  ];
  for (const [k, col] of map) {
    if (k in t) out[col] = t[k] === undefined ? null : (t[k] as unknown);
  }
  return out;
}

export const PROJECT_MONEY_KEYS = ["contract", "variation", "billed", "collected"] as const;

export function rowToProject(r: Row): Omit<PmProject, "name" | "company" | "inCrm" | "photoCount"> & {
  name?: string;
  company?: string;
} {
  return {
    code: String(r.code),
    hasRow: true,
    name: s(r.name),
    company: s(r.company),
    stage: s(r.stage) as Stage | undefined,
    category: s(r.category),
    site: s(r.site),
    client: s(r.client),
    manager: s(r.manager),
    signedAt: s(r.signed_on),
    startAt: s(r.start_on),
    dueAt: s(r.due_on),
    doneAt: s(r.done_on),
    contract: n(r.contract),
    variation: n(r.variation),
    billed: n(r.billed),
    collected: n(r.collected),
    progress: n(r.progress),
    risk: s(r.risk) as Risk | undefined,
    note: s(r.note),
    driveFolderId: s(r.drive_folder_id),
    archived: r.archived === true,
    version: n(r.version) ?? 1,
    updatedAt: s(r.updated_at),
    updatedBy: s(r.updated_by),
  };
}

const PROJECT_COLS: [keyof PmProject, string][] = [
  ["name", "name"],
  ["company", "company"],
  ["stage", "stage"],
  ["category", "category"],
  ["site", "site"],
  ["client", "client"],
  ["manager", "manager"],
  ["signedAt", "signed_on"],
  ["startAt", "start_on"],
  ["dueAt", "due_on"],
  ["doneAt", "done_on"],
  ["contract", "contract"],
  ["variation", "variation"],
  ["billed", "billed"],
  ["collected", "collected"],
  ["progress", "progress"],
  ["risk", "risk"],
  ["note", "note"],
  ["driveFolderId", "drive_folder_id"],
  ["archived", "archived"],
];

export function projectPatchToRow(p: Partial<PmProject>): Row {
  const out: Row = {};
  for (const [k, col] of PROJECT_COLS) {
    if (k in p) out[col] = p[k] === undefined ? null : (p[k] as unknown);
  }
  return out;
}

export function rowToNotification(r: Row): PmNotification {
  return {
    id: Number(r.id),
    type: r.type as PmNotification["type"],
    taskId: s(r.task_id),
    code: s(r.project_code),
    title: String(r.title ?? ""),
    body: s(r.body),
    actorName: s(r.actor_name),
    actorEmail: s(r.actor),
    createdAt: String(r.created_at),
    readAt: s(r.read_at),
  };
}

export function rowToPhoto(r: Row): PmPhoto {
  return {
    id: String(r.id),
    code: String(r.project_code),
    taskId: s(r.task_id),
    driveFileId: s(r.drive_file_id),
    driveUrl: s(r.drive_url),
    fileName: String(r.file_name ?? ""),
    caption: s(r.caption),
    takenOn: s(r.taken_on),
    uploadedByName: s(r.uploaded_by_name),
    thumb: s(r.thumb),
    createdAt: String(r.created_at),
  };
}

/* ══════════════════════════════════════════════════════════
   與舊有計算（健康度、甘特圖）銜接
   ══════════════════════════════════════════════════════════ */

/** 任務 → 工項（deriveProject／甘特圖沿用） */
export function taskToWorkItem(t: Task): WorkItem {
  return {
    id: t.id,
    code: t.code,
    trade: t.title,
    crew: t.assigneeName,
    start: t.start ?? t.due,
    end: t.due ?? t.start,
    progress: t.status === "done" ? 100 : t.progress,
    kind: t.kind,
    note: t.note,
    seq: t.seq,
  };
}

/** 專案 → 專案情報列；沒有填任何工程資料時回傳 undefined（顯示「未填資料」） */
export function projectToOps(p: PmProject, tasks: Task[]): OpsRecord | undefined {
  const filled = p.stage || p.startAt || p.dueAt || p.signedAt || p.contract !== undefined || p.progress !== undefined;
  if (!filled) return undefined;
  const auto = weightedProgress(tasks.map(taskToWorkItem));
  return {
    code: p.code,
    stage: p.stage,
    category: p.category,
    site: p.site,
    client: p.client,
    manager: p.manager,
    signedAt: p.signedAt,
    startAt: p.startAt,
    dueAt: p.dueAt,
    doneAt: p.doneAt,
    contract: p.contract,
    variation: p.variation,
    billed: p.billed,
    collected: p.collected,
    progress: p.progress ?? auto,
    risk: p.risk,
    note: p.note,
    updatedAt: p.updatedAt?.slice(0, 10),
  };
}

/* ══════════════════════════════════════════════════════════
   小工具
   ══════════════════════════════════════════════════════════ */

export function newTaskId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const r = c?.randomUUID ? c.randomUUID().replace(/-/g, "") : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `t-${r.slice(0, 14)}`;
}

/** 名字的第一個字（頭像用）：中文取姓後一字較好認，例：陳政剛 → 政剛 的「政」 */
export function initials(name?: string): string {
  if (!name) return "?";
  const t = name.trim();
  if (/^[一-鿿]{3}$/.test(t)) return t.slice(1, 3);
  if (/^[一-鿿]{2}$/.test(t)) return t;
  return t.slice(0, 2).toUpperCase();
}

/** 依 email 固定配一個顏色（同一個人在各處同色） */
const AVATAR_COLORS = ["#E8833A", "#3B82C4", "#4E9F6D", "#9D6BC2", "#C4553B", "#2E9C9C", "#B08A2E", "#5B6BC4", "#C44E86", "#6E8B3D"];
export function personColor(key?: string): string {
  if (!key) return "#A1A1AA";
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/* ══════════════════════════════════════════════════════════
   團隊（指揮中心 → 團隊）
   ══════════════════════════════════════════════════════════ */

export interface TeamMember {
  email: string;
  name: string;
  title?: string;
  bio?: string;
  phone?: string;
  avatar?: string;
  cardBg?: string;
  hasCard: boolean;
  /** 卡牌圖的版本（更新時間），網址帶著它才不會吃到舊快取 */
  cardVersion?: string;
  manager: boolean;
  sort?: number;
}

export type ContactKind = "external" | "vendor" | "brand";

export interface Contact {
  id: string;
  kind: ContactKind;
  name: string;
  company?: string;
  title?: string;
  phone?: string;
  email?: string;
  website?: string;
  note?: string;
  avatar?: string;
  /** 從廠商CRM 讀來的（唯讀） */
  fromCrm?: boolean;
  /** 廠商CRM 的第二位聯絡人 */
  contact2?: string;
  phone2?: string;
}

export interface TeamData {
  me: { email: string; name: string; role: Role };
  configured: boolean;
  /** AI 重新生成人像已設定（GEMINI_API_KEY 等） */
  aiReady?: boolean;
  dbError?: string;
  members: TeamMember[];
  contacts: Contact[];
}

export function rowToContact(r: Row): Contact {
  return {
    id: String(r.id),
    kind: r.kind as ContactKind,
    name: String(r.name ?? ""),
    company: s(r.company),
    title: s(r.title),
    phone: s(r.phone),
    email: s(r.email),
    website: s(r.website),
    note: s(r.note),
    avatar: s(r.avatar),
  };
}

/** 卡牌背景色組（與參考影片一樣的柔和漸層） */
export const CARD_BGS: Record<string, [string, string]> = {
  peach: ["#FFB88C", "#F7A8E8"],
  lilac: ["#C9A8FF", "#7ED6C9"],
  mint: ["#9BE3C3", "#F4E28A"],
  sky: ["#8EC5FF", "#E0B3FF"],
  sunset: ["#FF9A6B", "#E36BAE"],
  sand: ["#F2D29B", "#E7A27A"],
  ocean: ["#6FB7E9", "#86E3B5"],
  rose: ["#F7A1B5", "#FFD3A5"],
};
export const CARD_BG_KEYS = Object.keys(CARD_BGS);
export function cardBg(key: string | undefined, seed: string): [string, string] {
  if (key && CARD_BGS[key]) return CARD_BGS[key];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CARD_BGS[CARD_BG_KEYS[h % CARD_BG_KEYS.length]];
}
