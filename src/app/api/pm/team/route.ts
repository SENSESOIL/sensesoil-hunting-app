import { NextResponse } from "next/server";
import { readSheet } from "@/lib/google-sheets";
import { explainDbError, getPmUser, listPeople, pmDbConfigured, rpc } from "@/lib/pm/server";
import { rowToContact, type Contact, type ContactKind, type TeamData, type TeamMember, type TeamRole } from "@/lib/pm/model";
import { checkPermissions } from "@/lib/permissions";
import { deleteStaff, listStaff, saveStaff, STAFF_PRIVATE, type StaffRecord } from "@/lib/pm/staff-crm";
import { deleteVendor, listVendors, saveVendor, VENDOR_PRIVATE } from "@/lib/pm/vendor-crm";

/** 拿掉個資／帳務欄位（給非 Admin／Editor） */
function omit<T extends object>(o: T, keys: readonly string[]): T {
  const c = { ...o } as Record<string, unknown>;
  for (const k of keys) delete c[k];
  return c as T;
}
import { CrmError } from "@/lib/pm/crm-sheet";

export const dynamic = "force-dynamic";

/**
 * 團隊（指揮中心 → 團隊）
 *   GET  /api/pm/team                 內部職員（權限表＋員工CRM 電話＋APP 內的照片職稱）、聯絡人、協力廠商
 *   GET  /api/pm/team?card=email&v=…  某人的卡牌人像（圖片；帶版本號可長期快取）
 *   POST /api/pm/team {op:"profile.save"|"staff.save"|"staff.delete"|"vendor.save"|"vendor.delete"|"contact.save"|"contact.delete", …}
 *
 * 內部職員、協力廠商直接讀寫拾壤CRM「員工CRM」「廠商CRM」（src/lib/pm/staff-crm.ts、vendor-crm.ts）。
 * 新增／編輯／刪除依權限表「團隊」欄：Admin 全部；Editor 新增、編輯；其他人唯讀。
 * 身分證、生日、地址、匯款帳號、統編等個資只回給「團隊」欄 Admin／Editor，其他人的回應裡不會有。
 */

const CRM = "11IiXZbVxFAMzd8wEjU2Z9-W3CqoRa6aW1vQ50dJtrDk";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

type Cache<T> = { at: number; data: T } | null;
let phoneCache: Cache<Map<string, string>> = null;
const TTL = 5 * 60 * 1000;

function headerIndex(rows: string[][], mustHave: string): { row: number; col: (name: string) => number } | null {
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    const h = (rows[i] ?? []).map((x) => String(x ?? "").trim());
    if (h.includes(mustHave)) return { row: i, col: (n) => h.indexOf(n) };
  }
  return null;
}

/** 員工CRM：姓名／Gmail → 電話 */
async function staffPhones(): Promise<Map<string, string>> {
  if (phoneCache && Date.now() - phoneCache.at < TTL) return phoneCache.data;
  const map = new Map<string, string>();
  try {
    const rows = (await readSheet(CRM, "員工CRM!A1:Z200")) as string[][];
    const h = headerIndex(rows, "姓名");
    if (h) {
      const [iName, iPhone, iMail] = [h.col("姓名"), h.col("聯絡電話"), h.col("Gmail")];
      for (const r of rows.slice(h.row + 1)) {
        const phone = String(r[iPhone] ?? "").trim();
        if (!phone) continue;
        const name = String(r[iName] ?? "").trim();
        const mail = String(r[iMail] ?? "").trim().toLowerCase();
        if (name) map.set(name, phone);
        if (mail.includes("@")) map.set(mail, phone);
      }
    }
    phoneCache = { at: Date.now(), data: map };
  } catch (e) {
    console.error("[team] 讀不到員工CRM", e);
  }
  return map;
}

/** 廠商CRM → 協力廠商（唯讀） */
/** 廠商CRM → 協力廠商（名稱用簡稱，下方顯示全名；工項當分類標籤） */
async function crmVendors(): Promise<Contact[]> {
  try {
    const rows = await listVendors();
    return rows.map((v) => ({
      id: `crm-${v.seq}`,
      kind: "vendor" as const,
      name: v.short || v.fullName,
      company: v.short && v.short !== v.fullName ? v.fullName : undefined,
      title: v.trade || undefined,
      note: v.contact1 || undefined,
      phone: v.phone1 || undefined,
      contact2: v.contact2 || undefined,
      phone2: v.phone2 || undefined,
      fromCrm: true,
      vendor: v,
    }));
  } catch (e) {
    console.error("[team] 讀不到廠商CRM", e);
    return [];
  }
}

/** 權限表「團隊」欄；表上沒有這欄時：管理者 = admin，其他人唯讀 */
async function teamRoleOf(email: string, isManager: boolean): Promise<TeamRole> {
  const perms = await checkPermissions(email).catch(() => null);
  const r = perms?.roles?.["團隊"];
  if (r === "admin" || r === "editor" || r === "user" || r === "viewer" || r === "none") return r;
  return isManager ? "admin" : "user";
}

export async function GET(req: Request) {
  const user = await getPmUser();
  if (!user) return json({ error: "未登入或沒有權限" }, 401);

  // 卡牌人像（圖片）
  const cardOf = new URL(req.url).searchParams.get("card");
  if (cardOf) {
    if (!pmDbConfigured()) return new NextResponse(null, { status: 404 });
    try {
      const r = await rpc<{ card?: string }>("pm_profile_card", { email: cardOf });
      const m = r.card?.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
      if (!m) return new NextResponse(null, { status: 404 });
      return new NextResponse(Buffer.from(m[2], "base64"), {
        headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=31536000, immutable" },
      });
    } catch {
      return new NextResponse(null, { status: 404 });
    }
  }

  const [people, phones, vendors, teamRole, staff] = await Promise.all([
    listPeople(),
    staffPhones(),
    crmVendors(),
    teamRoleOf(user.email, user.role === "manager"),
    listStaff().then(
      (s) => ({ ok: true as const, s }),
      (e) => ({ ok: false as const, e: e instanceof Error ? e.message : String(e) })
    ),
  ]);
  // 個資（身分證、生日、地址、帳號）只給 Admin／Editor
  const canSeePrivate = teamRole === "admin" || teamRole === "editor";
  const data: TeamData = {
    me: { email: user.email, name: user.name, role: user.role, teamRole },
    configured: pmDbConfigured(),
    members: [],
    contacts: [],
  };

  let profiles: Record<string, unknown>[] = [];
  let contacts: Contact[] = [];
  if (data.configured) {
    try {
      const r = await rpc<{ profiles: Record<string, unknown>[]; contacts: Record<string, unknown>[] }>("pm_team_list", {});
      profiles = r.profiles ?? [];
      contacts = (r.contacts ?? []).map(rowToContact);
    } catch (e) {
      data.dbError = explainDbError(e);
    }
  }
  const byEmail = new Map(profiles.map((p) => [String(p.email), p]));
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const profileOf = (email: string) => {
    const pr = byEmail.get(email);
    return {
      title: str(pr?.title),
      bio: str(pr?.bio),
      avatar: str(pr?.avatar),
      cardBg: str(pr?.card_bg),
      hasCard: pr?.has_card === true,
      cardVersion: str(pr?.updated_at),
      sort: typeof pr?.sort_order === "number" ? pr.sort_order : undefined,
    };
  };
  if (staff.ok) {
    // 名冊以員工CRM 為準（在職、依序列排）；用 Gmail 或姓名對回權限表，拿管理者身分與登入信箱
    const byMail = new Map(people.map((p) => [p.email, p]));
    const byName = new Map(people.map((p) => [p.name, p]));
    data.members = staff.s.map((r: StaffRecord, i): TeamMember => {
      const p = (r.gmail && byMail.get(r.gmail)) || byName.get(r.name);
      const email = p?.email ?? r.gmail ?? `staff-${r.seq}`;
      const prof = profileOf(email);
      return {
        email,
        name: r.name,
        manager: p?.manager ?? false,
        phone: r.phone,
        ...prof,
        sort: prof.sort ?? i,
        staff: canSeePrivate ? { ...r } : omit(r, STAFF_PRIVATE),
      };
    });
  } else {
    data.staffError = `讀不到員工CRM（${staff.e}），名單暫時改用權限表`;
    data.members = people.map((p): TeamMember => ({
      email: p.email,
      name: p.name,
      manager: p.manager,
      phone: phones.get(p.email) ?? phones.get(p.name),
      ...profileOf(p.email),
    }));
  }
  data.contacts = [...contacts, ...vendors.map((c) => (c.vendor && !canSeePrivate ? { ...c, vendor: omit(c.vendor, VENDOR_PRIVATE) } : c))];
  return json(data);
}

const KINDS: ContactKind[] = ["external", "vendor", "brand"];
const isImg = (v: unknown, max: number) => v === null || v === undefined || (typeof v === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(v) && v.length <= max);

export async function POST(req: Request) {
  const user = await getPmUser();
  if (!user) return json({ error: "未登入或沒有權限" }, 401);
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ error: "資料太大或格式錯誤" }, 400);
  }
  // 員工CRM／廠商CRM 寫在試算表，不需要資料庫；其他（照片、聯絡人）要
  const sheetOp = /^(staff|vendor)\./.test(String(b.op));
  if (!sheetOp && !pmDbConfigured()) return json({ error: "資料庫尚未設定" }, 503);
  const teamRole = await teamRoleOf(user.email, user.role === "manager");
  const canEdit = teamRole === "admin" || teamRole === "editor";
  // 權限由這支 API 依權限表把關；通過後以管理者身分呼叫資料庫
  const actor = { actor: user.email, actor_name: user.name, role: canEdit ? "manager" : user.role };
  try {
    if (b.op === "staff.save") {
      if (!canEdit) return json({ error: "沒有編輯權限（權限表「團隊」欄需為 Admin 或 Editor）" }, 403);
      const seq = b.seq === undefined || b.seq === null ? undefined : String(b.seq);
      const saved = await saveStaff(seq, (b.fields ?? {}) as Record<string, unknown>);
      return json({ status: "ok", seq: saved });
    }
    if (b.op === "staff.delete") {
      if (teamRole !== "admin") return json({ error: "只有 Admin 可以刪除" }, 403);
      await deleteStaff(String(b.seq ?? ""));
      return json({ status: "ok" });
    }
    if (b.op === "vendor.save") {
      if (!canEdit) return json({ error: "沒有編輯權限（權限表「團隊」欄需為 Admin 或 Editor）" }, 403);
      const seq = b.seq === undefined || b.seq === null ? undefined : String(b.seq);
      const saved = await saveVendor(seq, (b.fields ?? {}) as Record<string, unknown>);
      return json({ status: "ok", seq: saved });
    }
    if (b.op === "vendor.delete") {
      if (teamRole !== "admin") return json({ error: "只有 Admin 可以刪除" }, 403);
      await deleteVendor(String(b.seq ?? ""));
      return json({ status: "ok" });
    }
    if (b.op === "profile.save") {
      const email = String(b.email ?? "").toLowerCase();
      if (email !== user.email && !canEdit) return json({ error: "只能修改自己的照片" }, 403);
      const patch = (b.patch ?? {}) as Record<string, unknown>;
      if (!isImg(patch.avatar, 60000) || !isImg(patch.card, 700000)) return json({ error: "圖片格式或大小不正確" }, 400);
      if (patch.title !== undefined && patch.title !== null && (typeof patch.title !== "string" || patch.title.length > 30)) return json({ error: "職稱太長" }, 400);
      if (patch.bio !== undefined && patch.bio !== null && (typeof patch.bio !== "string" || patch.bio.length > 200)) return json({ error: "介紹太長" }, 400);
      const allowed = ["title", "bio", "avatar", "card", "card_bg", "sort_order"];
      const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
      const r = await rpc<{ status: string; updated_at?: string }>("pm_profile_save", { ...actor, email, patch: clean });
      return json(r, r.status === "forbidden" ? 403 : 200);
    }
    if (b.op === "contact.save") {
      if (!canEdit) return json({ error: "沒有編輯權限（權限表「團隊」欄需為 Admin 或 Editor）" }, 403);
      const c = (b.contact ?? {}) as Partial<Contact>;
      if (!c.id || !c.name?.trim() || !KINDS.includes(c.kind as ContactKind)) return json({ error: "名稱必填" }, 400);
      if (String(c.id).startsWith("crm-")) return json({ error: "廠商CRM 的資料請在試算表修改" }, 400);
      if (!isImg(c.avatar, 60000)) return json({ error: "圖片格式或大小不正確" }, 400);
      const r = await rpc<{ status: string; contact?: Record<string, unknown> }>("pm_contact_save", { ...actor, contact: c });
      return json({ status: r.status, contact: r.contact ? rowToContact(r.contact) : undefined });
    }
    if (b.op === "contact.delete") {
      if (teamRole !== "admin") return json({ error: "只有 Admin 可以刪除" }, 403);
      return json(await rpc("pm_contact_delete", { ...actor, id: String(b.id ?? "") }));
    }
    return json({ error: "未知的操作" }, 400);
  } catch (e) {
    if (e instanceof CrmError) return json({ error: e.message }, 400);
    console.error("[api/pm/team]", b.op, e);
    if (sheetOp) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: /permission|403|PERMISSION_DENIED/i.test(msg) ? "APP 沒有寫入拾壤CRM 的權限，請把服務帳號加為試算表編輯者" : `寫入拾壤CRM 失敗：${msg}` }, 500);
    }
    return json({ error: explainDbError(e) }, 500);
  }
}
