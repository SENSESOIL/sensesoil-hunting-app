import { NextResponse } from "next/server";
import { readSheet } from "@/lib/google-sheets";

export async function GET() {
  const spreadsheetId = process.env.SHEET_ID_PERMISSIONS?.trim() || "14ldpC7mD1wYjouSiR9gizl--fPFcIowGGzkQdkxQNvQ";
  const rows = await readSheet(spreadsheetId, "Permission!A1:M2").catch(() => null) 
    || await readSheet(spreadsheetId, "A1:M2");
  
  return NextResponse.json({
    headers: rows[1],
  });
}
