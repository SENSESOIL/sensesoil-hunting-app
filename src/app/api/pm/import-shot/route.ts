import { NextResponse } from "next/server";
import { getPmUser } from "@/lib/pm/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 截圖匯入：讀一張 iPhone「提醒事項」的截圖，回傳裡面的分組與任務（含縮排）
 *   POST /api/pm/import-shot   { data: base64（不含 data: 前綴）, mimeType, today: "YYYY-MM-DD" }
 *   →  { listTitle?, items: ShotItem[] }
 *
 * 一次一張；多張截圖由前端用「上下重複的項目」接起來（src/lib/pm/reminder-import.ts）。
 * 需要環境變數 ANTHROPIC_API_KEY（Vercel → Settings → Environment Variables）。
 */

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

const MODEL = process.env.IMPORT_SHOT_MODEL || "claude-sonnet-5";
const MAX_BYTES = 3.3 * 1024 * 1024;

const PROMPT = (today: string) => `這是一張 iPhone「提醒事項」(Apple Reminders) App 的截圖，可能是一份長清單的其中一段（上下可能被切到）。
今天是 ${today}。請把畫面上「清單內容」由上到下逐列讀出來，呼叫 report_list 回報。

規則：
- 最上方的大標題（清單名稱，例如「老佛爺泥牆」）放在 listTitle，不要放進 items。狀態列、時間、電池、「完成」「編輯」按鈕、搜尋框、底部「新增提醒事項」按鈕、已完成數量提示等介面文字一律忽略。
- 分組標題（Section：粗體、前面沒有圓圈的標題列）→ kind "section"。
- 每一個有圓圈的項目 → kind "task"。
  - indent：圓圈在一般位置 = 0；圓圈往右縮排（子任務）= 1。請比較同一張圖裡各圓圈的左邊位置來判斷。
  - done：圓圈是實心／打勾 = true，空心 = false。
  - flagged：右邊有旗子圖示 = true。
  - text：項目標題，照抄原文，不要翻譯、不要改字、不要加標點。
  - note：標題下方的灰色小字中，日期以外的內容（備註、網址、標籤 #xxx）；沒有就省略。
  - dateText：標題下方的日期／時間文字原文（例如「2026/10/20」「明天」「10月20日 下午3:00」）；沒有就省略。
  - dateISO：能換算成確定日期時填 YYYY-MM-DD（以今天 ${today} 推算「今天、明天、星期三」等）；不確定就省略。
- 被圖片上緣或下緣切掉一半、字看不完整的那一列：照樣列出看得到的部分，但 cut 設 true。
- 只回報畫面上真的看得到的東西，不要猜被切掉的部分，也不要合併或去重。順序必須和畫面由上到下一致。`;

const TOOL = {
  name: "report_list",
  description: "回報截圖裡的提醒事項清單內容",
  input_schema: {
    type: "object",
    properties: {
      listTitle: { type: "string", description: "清單名稱（最上方的大標題），沒有就省略" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["section", "task"] },
            text: { type: "string" },
            indent: { type: "integer", enum: [0, 1] },
            done: { type: "boolean" },
            flagged: { type: "boolean" },
            note: { type: "string" },
            dateText: { type: "string" },
            dateISO: { type: "string" },
            cut: { type: "boolean" },
          },
          required: ["kind", "text"],
        },
      },
    },
    required: ["items"],
  },
} as const;

export async function POST(req: Request) {
  const user = await getPmUser();
  if (!user) return json({ error: "未登入或沒有權限" }, 401);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: "截圖辨識還沒設定：請在 Vercel 加上環境變數 ANTHROPIC_API_KEY" }, 503);

  let b: { data?: unknown; mimeType?: unknown; today?: unknown };
  try {
    b = await req.json();
  } catch {
    return json({ error: "格式不正確" }, 400);
  }
  const data = typeof b.data === "string" ? b.data : "";
  const mime = b.mimeType === "image/png" ? "image/png" : "image/jpeg";
  const today = typeof b.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.today) ? b.today : new Date().toISOString().slice(0, 10);
  if (!data || data.length * 0.75 > MAX_BYTES) return json({ error: "圖片太大或是空的" }, 400);

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mime, data } },
              { type: "text", text: PROMPT(today) },
            ],
          },
        ],
      }),
    });
    const out = (await r.json().catch(() => ({}))) as { content?: { type: string; name?: string; input?: unknown }[]; error?: { message?: string } };
    if (!r.ok) return json({ error: `辨識失敗（${r.status}）：${out.error?.message ?? "未知錯誤"}` }, 502);
    const use = out.content?.find((c) => c.type === "tool_use" && c.name === TOOL.name);
    const input = (use?.input ?? {}) as { listTitle?: unknown; items?: unknown };
    const items = (Array.isArray(input.items) ? input.items : [])
      .map((x) => x as Record<string, unknown>)
      .filter((x) => typeof x.text === "string" && x.text.trim())
      .slice(0, 300)
      .map((x) => ({
        kind: x.kind === "section" ? "section" : "task",
        text: String(x.text).trim().slice(0, 200),
        indent: x.indent === 1 ? 1 : 0,
        done: x.done === true,
        flagged: x.flagged === true,
        note: typeof x.note === "string" && x.note.trim() ? x.note.trim().slice(0, 1000) : undefined,
        dateText: typeof x.dateText === "string" && x.dateText.trim() ? x.dateText.trim().slice(0, 40) : undefined,
        dateISO: typeof x.dateISO === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.dateISO) ? x.dateISO : undefined,
        cut: x.cut === true,
      }));
    return json({ listTitle: typeof input.listTitle === "string" ? input.listTitle.trim().slice(0, 80) : undefined, items });
  } catch (e) {
    return json({ error: `辨識失敗：${e instanceof Error ? e.message : String(e)}` }, 502);
  }
}
