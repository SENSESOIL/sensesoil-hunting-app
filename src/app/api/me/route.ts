import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-options";
import { checkPermissions } from "@/lib/permissions";
import { readSheet } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";

const CRM_SPREADSHEET_ID = "11IiXZbVxFAMzd8wEjU2Z9-W3CqoRa6aW1vQ50dJtrDk";

// 員工CRM 的欄位是人工維護、會增減的，所以不寫死 schema：
// 動態找出標題列，把該名狩獵者那一列的非空欄位原樣回傳。
function findHeaderRow(rows: string[][]) {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i].map((h) => (h ? String(h).trim() : ""));
    const idx = row.indexOf("狩獵者") !== -1 ? row.indexOf("狩獵者") : row.indexOf("姓名");
    if (idx !== -1) return { headerRowIndex: i, headers: row, nameIdx: idx };
  }
  return null;
}

export async function GET() {
  try {
    const session = await auth();
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const perms = await checkPermissions(email);
    const hunterName = perms?.hunterName?.trim() || "";

    if (!hunterName) {
      return NextResponse.json({
        hunterName: "",
        fields: [],
        note: "權限表中找不到對應的狩獵者姓名",
      });
    }

    const rows = await readSheet(CRM_SPREADSHEET_ID, "員工CRM!A:Z").catch(() => null);
    if (!rows || rows.length === 0) {
      return NextResponse.json({ hunterName, fields: [], note: "讀不到員工CRM" });
    }

    const found = findHeaderRow(rows as string[][]);
    if (!found) {
      return NextResponse.json({ hunterName, fields: [], note: "員工CRM 找不到標題列" });
    }

    const { headerRowIndex, headers, nameIdx } = found;
    const myRow = (rows as string[][])
      .slice(headerRowIndex + 1)
      .find((r) => (r[nameIdx] ? String(r[nameIdx]).trim() : "") === hunterName);

    if (!myRow) {
      return NextResponse.json({ hunterName, fields: [], note: "員工CRM 中沒有這位狩獵者" });
    }

    const fields = headers
      .map((label, idx) => ({
        label: label.trim(),
        value: myRow[idx] ? String(myRow[idx]).trim() : "",
      }))
      .filter((f) => f.label && f.value && f.label !== "狩獵者" && f.label !== "姓名");

    return NextResponse.json({ hunterName, fields });
  } catch (error) {
    console.error("API Error /api/me:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
