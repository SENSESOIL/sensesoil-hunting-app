import { NextResponse } from 'next/server';
import { readSheet } from "@/lib/google-sheets";

export async function GET() {
  try {
    const sheetId = '1bYwZNqQLU-jgmJvz3tB_195QB4uZwqWOVPDI-c4_Pm4';
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
      if (row.length >= 6 && row[0]) {
        records.push({
          date: row[0].trim(),
          name: row[1].trim(),
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
