// src/lib/google-sheets.ts
// Server-side Google Sheets API client using Service Account

import { google } from "googleapis";

// Build authenticated Sheets client via Service Account (private, no public sheet needed)
function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
  return google.sheets({ version: "v4", auth });
}

// ─── READ ───────────────────────────────────────────────────────────────────

export async function readSheet(spreadsheetId: string, range: string) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  return res.data.values ?? [];
}

// ─── WRITE ──────────────────────────────────────────────────────────────────

export async function writeSheet(
  spreadsheetId: string,
  range: string,
  values: string[][]
) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

// ─── APPEND ─────────────────────────────────────────────────────────────────

export async function appendSheet(
  spreadsheetId: string,
  range: string,
  values: string[][]
) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

// ─── NOTES (COMMENTS) ────────────────────────────────────────────────────────

export async function readSheetNotes(spreadsheetId: string, range: string) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [range],
    includeGridData: true,
    fields: "sheets(properties(sheetId),data(rowData(values(note))))",
  });

  const sheet = res.data.sheets?.[0];
  const sheetId = sheet?.properties?.sheetId || 0;
  const rowData = sheet?.data?.[0]?.rowData || [];

  const notes: string[][] = rowData.map(row => {
    return (row.values || []).map(cell => cell.note || "");
  });

  return { sheetId, notes };
}

export async function writeSheetNotes(
  spreadsheetId: string,
  sheetId: number,
  updates: { rowIndex: number; colIndex: number; note: string }[]
) {
  const sheets = getSheetsClient();
  
  if (updates.length === 0) return;

  const requests = updates.map(u => ({
    updateCells: {
      range: {
        sheetId,
        startRowIndex: u.rowIndex,
        endRowIndex: u.rowIndex + 1,
        startColumnIndex: u.colIndex,
        endColumnIndex: u.colIndex + 1,
      },
      rows: [
        {
          values: [{ note: u.note }],
        },
      ],
      fields: "note",
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
}
