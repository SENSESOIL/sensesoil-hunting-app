import { NextResponse } from "next/server";
import { explainDbError, getPmUser, pmDbConfigured, readRegistry, rpc } from "@/lib/pm/server";
import { photoConfigured, uploadToDrive } from "@/lib/pm/drive";
import { rowToPhoto, rowToProject } from "@/lib/pm/model";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 工程照
 *   GET  /api/pm/photos?code=A08    這個專案的照片（縮圖＋雲端連結）
 *   POST /api/pm/photos             上傳一張（前端已壓縮到長邊 2048px），一次一張，可以並行
 *
 * 檔名：日期_代碼_說明_序號.jpg，例：20260928_A08_打底_01.jpg
 * Drive「說明」欄：說明文字＋專案、工項、拍攝日、上傳者（Drive 搜尋得到）
 */

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  const user = await getPmUser();
  if (!user) return json({ error: "未登入或沒有權限" }, 401);
  if (!pmDbConfigured()) return json({ items: [] });
  const code = new URL(req.url).searchParams.get("code") ?? "";
  try {
    const r = await rpc<{ items: Record<string, unknown>[] }>("pm_photos_list", { code, limit: 300 });
    return json({ items: r.items.map(rowToPhoto) });
  } catch (e) {
    return json({ error: explainDbError(e) }, 500);
  }
}

interface UploadBody {
  id: string;
  code: string;
  taskId?: string;
  taskTitle?: string;
  caption?: string;
  fileName: string;
  takenOn?: string;
  mimeType?: string;
  /** base64，不含 data: 前綴 */
  data: string;
  /** 小縮圖 data URL */
  thumb?: string;
  width?: number;
  height?: number;
}

const MAX_BYTES = 3.3 * 1024 * 1024; // Vercel 單次請求上限 4.5MB（base64 會再大 1/3）

export async function POST(req: Request) {
  const user = await getPmUser();
  if (!user) return json({ error: "未登入或沒有權限" }, 401);
  if (!pmDbConfigured()) return json({ error: "資料庫尚未設定" }, 503);
  if (!photoConfigured()) return json({ error: "工程照上傳尚未設定（Apps Script）" }, 503);

  let b: UploadBody;
  try {
    b = (await req.json()) as UploadBody;
  } catch {
    return json({ error: "照片太大或格式錯誤" }, 400);
  }
  const bytes = Math.floor((b.data?.length ?? 0) * 0.75);
  if (!b.id || !b.code || !b.data || !b.fileName) return json({ error: "資料不完整" }, 400);
  if (bytes > MAX_BYTES) return json({ error: "照片太大" }, 413);
  if (!/^[\w.\-一-鿿（）() ]{1,120}\.(jpe?g|png|heic|webp)$/i.test(b.fileName)) return json({ error: "檔名不正確" }, 400);
  if (b.thumb && (!b.thumb.startsWith("data:image/") || b.thumb.length > 60000)) delete b.thumb;

  try {
    // 專案名稱與已知的資料夾
    const [reg, data] = await Promise.all([
      readRegistry(),
      rpc<{ projects: Record<string, unknown>[] }>("pm_data", { actor: user.email, role: "member" }),
    ]);
    const row = data.projects.find((p) => p.code === b.code);
    const project = row ? rowToProject(row) : undefined;
    const projectName = reg.data.find((p) => p.code === b.code)?.name || project?.name || b.code;

    const caption = (b.caption ?? "").trim().slice(0, 200);
    const description = [
      caption || "工程照",
      `專案：${b.code} ${projectName}`,
      b.taskTitle ? `工項：${b.taskTitle}` : "",
      b.takenOn ? `拍攝：${b.takenOn}` : "",
      `上傳：${user.name}（${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false })}）`,
      "#工程照 #" + b.code + (caption ? " #" + caption.replace(/\s+/g, "") : ""),
    ]
      .filter(Boolean)
      .join("\n");

    const up = await uploadToDrive({
      code: b.code,
      projectName,
      folderId: project?.driveFolderId,
      fileName: b.fileName,
      mimeType: b.mimeType || "image/jpeg",
      description,
      data: b.data,
    });

    if (up.folderId && !project?.driveFolderId) {
      await rpc("pm_project_set_folder", { actor: user.email, code: b.code, folder_id: up.folderId }).catch(() => {});
    }
    const r = await rpc<{ photo: Record<string, unknown> | null }>("pm_photo_add", {
      actor: user.email,
      actor_name: user.name,
      photo: {
        id: b.id,
        project_code: b.code,
        task_id: b.taskId || null,
        drive_file_id: up.fileId,
        drive_url: up.url,
        file_name: b.fileName,
        caption: caption || null,
        taken_on: b.takenOn && /^\d{4}-\d{2}-\d{2}$/.test(b.takenOn) ? b.takenOn : null,
        thumb: b.thumb || null,
        width: b.width ?? null,
        height: b.height ?? null,
        bytes,
      },
    });
    return json({ status: "ok", photo: r.photo ? rowToPhoto(r.photo) : undefined, url: up.url });
  } catch (e) {
    console.error("[api/pm/photos]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: /資料庫|Supabase|function/i.test(msg) ? explainDbError(e) : msg.slice(0, 200) }, 502);
  }
}
