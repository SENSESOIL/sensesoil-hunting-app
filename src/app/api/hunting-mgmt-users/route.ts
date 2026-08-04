import { NextResponse } from "next/server";
import { readSheet } from "@/lib/google-sheets";

export const dynamic = 'force-dynamic';

export async function GET() {
  const spreadsheetId = process.env.SHEET_ID_PERMISSIONS?.trim();
  if (!spreadsheetId) {
    return NextResponse.json({ users: [] });
  }

  try {
    let rows = await readSheet(spreadsheetId, "Permission!A:L").catch(() => null);
    if (!rows) {
      rows = await readSheet(spreadsheetId, "A:L");
    }

    if (!rows || rows.length < 3) {
      return NextResponse.json({ users: [] });
    }

    const headers = rows[1].map((h: string) => h.trim());
    const hunterIdx = 0; // Column A: 狩獵者
    const emailIdx = 1;  // Column B: Gmail
    
    // Hunting management columns: H(7) ~ L(11)
    const mgmtKeys = ["專案情報", "工進排程", "任務追蹤", "狩獵任務", "指揮中心"];
    const mgmtIndices = mgmtKeys.map(key => headers.indexOf(key)).filter(i => i !== -1);

    const users: { name: string; email: string }[] = [];

    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      const name = row[hunterIdx]?.trim();
      const email = row[emailIdx]?.trim();
      if (!name || !email) continue;

      // Check if user has any hunting-mgmt permission
      const hasAccess = mgmtIndices.some(idx => {
        const val = row[idx]?.trim().toLowerCase();
        return val === 'admin' || val === 'editor' || val === 'viewer';
      });

      if (hasAccess) {
        users.push({ name, email });
      }
    }

    return NextResponse.json({ users });
  } catch (err) {
    console.error("[hunting-mgmt-users] Error:", err);
    return NextResponse.json({ users: [] });
  }
}
