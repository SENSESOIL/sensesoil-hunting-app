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
