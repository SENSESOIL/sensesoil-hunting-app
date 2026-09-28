// 本機假 Supabase：只實作 PostgREST 的 POST /rest/v1/rpc/:fn（supabase-js 的 .rpc() 用這個）
// 資料放在 PGlite（WASM Postgres），套用正式的 migration 檔，行為與線上一致。
//
// 用法（只在本機開發用，不會部署）：
//   npm i --no-save @electric-sql/pglite
//   node scripts/pm-dev-db.mjs
//   PM_SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=dev PM_DEV_USER=你的email npm run dev
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../.pm-dev-db/", import.meta.url));
const fresh = !existsSync(DIR);
const db = new PGlite(DIR);
const MIG = new URL("../supabase/migrations/", import.meta.url);
if (fresh) await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;`);
// 依檔名順序套用全部 migration（每一份都可以重複執行）
for (const f of readdirSync(MIG).filter((x) => x.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(new URL(f, MIG), "utf8"));
}
console.log("[pm-dev-db] schema applied", fresh ? "(fresh)" : "(existing data)");

http
  .createServer((req, res) => {
    const m = req.url.match(/^\/rest\/v1\/rpc\/([a-z_]+)/);
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      if (!m || req.method !== "POST") {
        res.writeHead(404, { "content-type": "application/json" });
        return res.end(JSON.stringify({ message: "not found" }));
      }
      try {
        const args = body ? JSON.parse(body) : {};
        const r = await db.query(`select public.${m[1]}($1::jsonb) as r`, [JSON.stringify(args.p ?? {})]);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(r.rows[0].r));
      } catch (e) {
        console.log("[pm-dev-db] error", m[1], e.message);
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: e.code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null }));
      }
    });
  })
  .listen(54321, () => console.log("[pm-dev-db] http://127.0.0.1:54321"));
