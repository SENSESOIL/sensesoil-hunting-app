/**
 * 專案／任務：伺服器端（只給 src/app/api/pm/** 使用，不可被前端 import）
 *
 * - 資料庫：APP 自己的 Supabase，用伺服器金鑰 SUPABASE_SECRET_KEY 呼叫 pm_* 函式。
 *   瀏覽器拿不到這把金鑰，pm_* 資料表也對 anon 關閉（見 migration）。
 *   ⚠ 絕不可改用組織圖的 Supabase（ORG_CHART_SUPABASE_*）：那邊的資料是公開可讀的。
 * - 身分：NextAuth 登入的 email → 權限表（Google Sheet）→ manager / member
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { auth } from "@/lib/auth-options";
import { checkPermissions, listPermissionUsers } from "@/lib/permissions";
import { readSheet } from "@/lib/google-sheets";
import { parseRegistry, type RegistryProject } from "@/lib/project-ops";
import { isManagerRoles, type Person, type Role } from "./model";

/* ── 資料庫 ─────────────────────────────────────────────── */

const DB_URL = () => process.env.PM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const DB_KEY = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function pmDbConfigured(): boolean {
  return !!DB_URL() && !!DB_KEY() && !DB_URL().includes("placeholder");
}

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!client) {
    client = createClient(DB_URL(), DB_KEY(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { "x-client-info": "sensesoil-pm" } },
    });
  }
  return client;
}

export class PmDbError extends Error {
  constructor(
    message: string,
    public code?: string,
    public hint?: string
  ) {
    super(message);
  }
}

/** 呼叫 pm_* 函式（每支都是 fn(p jsonb) returns jsonb） */
export async function rpc<T = Record<string, unknown>>(fn: string, p: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, { p });
  if (error) {
    // PGRST202 = 找不到函式（還沒執行 SQL）；42501 = 權限（金鑰用成 anon）
    throw new PmDbError(error.message, error.code, error.hint ?? undefined);
  }
  return data as T;
}

/** 把資料庫錯誤翻成給管理者看的一句話 */
export function explainDbError(e: unknown): string {
  const err = e as PmDbError;
  const msg = String(err?.message || e);
  if (err?.code === "PGRST202" || /Could not find the function/i.test(msg)) {
    return "資料庫還沒建立資料表：請到 Supabase → SQL Editor 執行 supabase/migrations/20260928000000_pm_schema.sql";
  }
  if (err?.code === "42501" || /permission denied/i.test(msg)) {
    return "資料庫拒絕存取：SUPABASE_SECRET_KEY 可能填成了公開的 anon key";
  }
  if (/Invalid API key|JWT|apikey/i.test(msg)) {
    return "SUPABASE_SECRET_KEY 無效，請重新複製";
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|timeout/i.test(msg)) {
    return "連不上資料庫（網路或 Supabase 暫停中）";
  }
  return msg.slice(0, 200);
}

/* ── 身分與權限 ─────────────────────────────────────────── */

export interface PmUser {
  email: string;
  name: string;
  role: Role;
}

/**
 * 目前登入的人。沒登入、不在權限表或已離職 → null。
 * 開發環境可用 PM_DEV_USER 指定身分（只在 next dev 有效，正式環境永遠不會走到）。
 */
export async function getPmUser(): Promise<PmUser | null> {
  const session = await auth();
  let email = session?.user?.email?.toLowerCase() ?? "";
  if (!email && process.env.NODE_ENV === "development" && process.env.PM_DEV_USER) {
    email = process.env.PM_DEV_USER.toLowerCase();
  }
  if (!email) return null;
  const perms = await checkPermissions(email);
  if (!perms) return null;
  return {
    email,
    name: perms.hunterName || session?.user?.name || email.split("@")[0],
    role: isManagerRoles(perms.roles) ? "manager" : "member",
  };
}

/** 可以被指派的人（權限表上、未離職） */
export async function listPeople(): Promise<Person[]> {
  const users = await listPermissionUsers().catch(() => []);
  return users
    .map((u) => ({ email: u.email, name: u.hunterName || u.email.split("@")[0], manager: isManagerRoles(u.roles) }))
    .sort((a, b) => Number(b.manager) - Number(a.manager) || a.name.localeCompare(b.name, "zh-Hant"));
}

/* ── 專案名冊（拾壤CRM）─────────────────────────────────── */

const CRM_SPREADSHEET_ID = "11IiXZbVxFAMzd8wEjU2Z9-W3CqoRa6aW1vQ50dJtrDk";
let registryCache: { at: number; data: RegistryProject[] } | null = null;
const REGISTRY_TTL = 5 * 60 * 1000;

export async function readRegistry(): Promise<{ data: RegistryProject[]; ok: boolean }> {
  if (registryCache && Date.now() - registryCache.at < REGISTRY_TTL) {
    return { data: registryCache.data, ok: true };
  }
  try {
    const data = parseRegistry((await readSheet(CRM_SPREADSHEET_ID, "專案CRM!A1:F")) as string[][]);
    registryCache = { at: Date.now(), data };
    return { data, ok: true };
  } catch (e) {
    console.error("[pm] 讀不到專案CRM", e);
    return { data: registryCache?.data ?? [], ok: false };
  }
}
