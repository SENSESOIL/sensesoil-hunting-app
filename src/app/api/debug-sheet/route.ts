import { NextResponse } from "next/server";
import { readSheet } from "@/lib/google-sheets";

export const dynamic = 'force-dynamic';

export async function GET() {
  const spreadsheetId = process.env.SHEET_ID_PERMISSIONS || "14ldpC7mD1wYjouSiR9gizl--fPFcIowGGzkQdkxQNvQ";
  let rows = await readSheet(spreadsheetId, "Permission!A:M").catch(() => null);
  if (!rows) {
    rows = await readSheet(spreadsheetId, "A:M"); 
  }
  
  if (!rows || rows.length < 3) return NextResponse.json({ error: "no rows" });
  
  const headers = rows[1];
  const emailIdx = headers.findIndex(h => h.trim().toLowerCase() === "gmail");
  const userRow = rows.slice(2).find(r => r[emailIdx]?.trim().toLowerCase() === "atw007wj@gmail.com");

  return NextResponse.json({
    headers,
    userRow,
    emailIdx
  });
}
