import { NextResponse } from "next/server";
import { readSheet } from "@/lib/google-sheets";
import { explainDbError, getPmUser, listPeople, pmDbConfigured, rpc } from "@/lib/pm/server";
import { rowToContact, type Contact, type ContactKind, type TeamData, type TeamMember } from "@/lib/pm/model";

export const dynamic = "force-dynamic";

/**
 * 團隊（指揮中心 → 團隊）
 *   GET  /api/pm/team                 內部職員（權限表＋員工CRM 電話＋APP 內的照片職稱）、聯絡人、協力廠商
 *   GET  /api/pm/team?card=email&v=…  某人的卡牌人像（圖片；帶版本號可長期快取）
 *   POST /api/pm/team {op:"profile.save"|"contact.save"|"contact.delete", …}
 *
 * 試算表只取需要的欄位：員工CRM 的「聯絡電話」，廠商CRM 的工項／名稱／聯絡人／電話。
 * 身分證、生日、地址、匯款帳號、統編一律不讀出。
 */

const CRM = "11IiXZbVxFAMzd8wEjU2Z9-W3CqoRa6aW1vQ50dJtrDk";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

type Cache<T> = { at: number; data: T } | null;
let phoneCache: Cache<Map<string, string>> = null;
let vendorCache: Cache<Contact[]> = null;
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
async function crmVendors(): Promise<Contact[]> {
  if (vendorCache && Date.now() - vendorCache.at < TTL) return vendorCache.data;
  const out: Contact[] = [];
  try {
    const rows = (await readSheet(CRM, "廠商CRM!A1:O400")) as string[][];
    const h = headerIndex(rows, "姓名/公司");
    if (h) {
      const c = {
        seq: h.col("序列"), trade: h.col("工項"), name: h.col("姓名/公司"), short: h.col("簡稱"),
        c1: h.col("聯絡人1"), p1: h.col("聯絡電話1"), c2: h.col("聯絡人2"), p2: h.col("聯絡電話2"),
      };
      const get = (r: string[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
      for (const r of rows.slice(h.row + 1)) {
        const name = get(r, c.name);
        if (!name) continue;
        const short = get(r, c.short);
        out.push({
          id: `crm-${get(r, c.seq) || out.length}`,
          kind: "vendor",
          name: short || name,
          company: short && short !== name ? name : undefined,
          title: get(r, c.trade) || undefined,
          note: get(r, c.c1) || undefined,
          phone: get(r, c.p1) || undefined,
          contact2: get(r, c.c2) || undefined,
          phone2: get(r, c.p2) || undefined,
          fromCrm: true,
        });
      }
    }
    vendorCache = { at: Date.now(), data: out };
  } catch (e) {
    console.error("[team] 讀不到廠商CRM", e);
  }
  return out;
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

  const [people, phones, vendors] = await Promise.all([listPeople(), staffPhones(), crmVendors()]);
  const data: TeamData = {
    me: { email: user.email, name: user.name, role: user.role },
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
  data.members = people.map((p): TeamMember => {
    const pr = byEmail.get(p.email);
    return {
      email: p.email,
      name: p.name,
      manager: p.manager,
      phone: phones.get(p.email) ?? phones.get(p.name),
      title: str(pr?.title),
      bio: str(pr?.bio),
      avatar: str(pr?.avatar),
      cardBg: str(pr?.card_bg),
      hasCard: pr?.has_card === true,
      cardVersion: str(pr?.updated_at),
      sort: typeof pr?.sort_order === "number" ? pr.sort_order : undefined,
    };
  });
  data.contacts = [...contacts, ...vendors];
  return json(data);
}

const KINDS: ContactKind[] = ["external", "vendor", "brand"];
const isImg = (v: unknown, max: number) => v === null || v === undefined || (typeof v === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(v) && v.length <= max);

export async function POST(req: Request) {
  const user = await getPmUser();
  if (!user) return json({ error: "未登入或沒有權限" }, 401);
  if (!pmDbConfigured()) return json({ error: "資料庫尚未設定" }, 503);
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ error: "資料太大或格式錯誤" }, 400);
  }
  const actor = { actor: user.email, actor_name: user.name, role: user.role };
  try {
    if (b.op === "profile.save") {
      const email = String(b.email ?? "").toLowerCase();
      if (email !== user.email && user.role !== "manager") return json({ error: "只能修改自己的照片" }, 403);
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
      if (user.role !== "manager") return json({ error: "只有管理者可以編輯" }, 403);
      const c = (b.contact ?? {}) as Partial<Contact>;
      if (!c.id || !c.name?.trim() || !KINDS.includes(c.kind as ContactKind)) return json({ error: "名稱必填" }, 400);
      if (String(c.id).startsWith("crm-")) return json({ error: "廠商CRM 的資料請在試算表修改" }, 400);
      if (!isImg(c.avatar, 60000)) return json({ error: "圖片格式或大小不正確" }, 400);
      const r = await rpc<{ status: string; contact?: Record<string, unknown> }>("pm_contact_save", { ...actor, contact: c });
      return json({ status: r.status, contact: r.contact ? rowToContact(r.contact) : undefined });
    }
    if (b.op === "contact.delete") {
      if (user.role !== "manager") return json({ error: "只有管理者可以刪除" }, 403);
      return json(await rpc("pm_contact_delete", { ...actor, id: String(b.id ?? "") }));
    }
    return json({ error: "未知的操作" }, 400);
  } catch (e) {
    console.error("[api/pm/team]", b.op, e);
    return json({ error: explainDbError(e) }, 500);
  }
}
