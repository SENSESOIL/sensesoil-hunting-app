import { NextRequest, NextResponse } from 'next/server';
import { readSheet, writeSheet } from "@/lib/google-sheets";
import { auth } from "@/lib/auth-options";

export const dynamic = 'force-dynamic';

const sheetId = '1bYwZNqQLU-jgmJvz3tB_195QB4uZwqWOVPDI-c4_Pm4';

export async function GET() {
  try {
    const range = 'tracker!B:G';
    
    // Use the existing authenticated Sheets client
    const rows = await readSheet(sheetId, range);
    
    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const records = [];
    // Skip header row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      // Expected: [0]跑步日期, [1]跑者名稱, [2]活動名稱, [3]距離 (Km), [4]海拔高度 (m), [5]時間 (min)
      if (row.length >= 1 && row.some(cell => cell && cell.toString().trim() !== '')) {
        records.push({
          rowIndex: i + 1, // Store the exact 1-based index in the tracker sheet. Wait, range is B:G. So rows[0] is row 1. rows[i] is row i+1.
          date: row[0]?.trim() || "",
          name: row[1]?.trim() || "",
          activity: row[2]?.trim() || '',
          distance: parseFloat(row[3]) || 0,
          elevation: parseFloat(row[4]) || 0,
          timeStr: row[5]?.trim() || '0'
        });
      }
    }
    
    return NextResponse.json({ success: true, data: records });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch running records from tracker!B:G' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    // Auth guard — only Google-logged-in users can write
    const session = await auth();
    if (!session?.user && process.env.NODE_ENV !== "development") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session?.user) {
      const roles = (session.user as any).roles || {};
      const userRole = roles["running"] || "viewer";
      if (userRole !== "editor" && userRole !== "admin") {
        return NextResponse.json({ error: "Forbidden: You do not have edit permissions." }, { status: 403 });
      }
    }

    const body = await req.json();
    const { rowIndex, values } = body as { rowIndex: number; values: string[][] };

    if (!rowIndex || !values) {
      return NextResponse.json({ error: "Invalid payload: expected rowIndex and values" }, { status: 400 });
    }

    // Write to the specific row in the tracker sheet
    const range = `tracker!B${rowIndex}:G${rowIndex}`;
    await writeSheet(sheetId, range, values);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('[Sheets PATCH] running-records:', err);
    return NextResponse.json({ error: "Failed to update running record" }, { status: 500 });
  }
}
