import { NextResponse } from "next/server";
import { readSheet } from "@/lib/google-sheets";

export async function GET() {
  const rows = await readSheet(process.env.SHEET_ID_BASIC_MISSION!, "A:Z");
  
  // Find 陳德霖
  const row = rows.find((r: any) => r.includes("陳德霖"));
  
  return NextResponse.json({
    row1: rows[0],
    row2: rows[1],
    row3: rows[2],
    chenRow: row,
    chenIndex14: row ? row[14] : null,
    chenIndex15: row ? row[15] : null,
    chenIndex16: row ? row[16] : null,
    chenIndex17: row ? row[17] : null,
  });
}
