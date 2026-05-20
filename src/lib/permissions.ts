import { readSheet } from "./google-sheets";

export interface UserPermissions {
  email: string;
  hunterName: string;
  roles: {
    [key: string]: "admin" | "editor" | "viewer" | "none";
  };
}

// Memory cache to avoid hitting Google Sheets API rate limits
let cachedPermissions: string[][] | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 30000; // 30 seconds

async function fetchPermissionsFromSheet(): Promise<string[][]> {
  const spreadsheetId = process.env.SHEET_ID_PERMISSIONS?.trim();
  console.log(`[Permissions Debug] Using SHEET_ID_PERMISSIONS: '${spreadsheetId}'`);
  if (!spreadsheetId) {
    console.error("[Permissions] SHEET_ID_PERMISSIONS is not set");
    return [];
  }

  const now = Date.now();
  if (cachedPermissions && (now - lastFetchTime < CACHE_TTL)) {
    return cachedPermissions;
  }

  try {
    // Try reading "Permission" tab first, fallback to first sheet. Expanded range to A:M.
    let rows = await readSheet(spreadsheetId, "Permission!A:M").catch(() => null);
    if (!rows) {
      rows = await readSheet(spreadsheetId, "A:M"); // Fallback to first sheet
    }
    
    if (rows && rows.length > 0) {
      cachedPermissions = rows;
      lastFetchTime = now;
      return rows;
    }
  } catch (err) {
    console.error("[Permissions] Failed to fetch permissions sheet:", err);
    if (cachedPermissions) return cachedPermissions; // fallback to stale cache if failed
  }
  return [];
}

export async function checkPermissions(email: string): Promise<UserPermissions | null> {
  const rows = await fetchPermissionsFromSheet();
  console.log(`[Permissions Debug] Fetch returned ${rows.length} rows.`);
  if (rows.length < 3) {
    // Fallback: If no permissions tab or empty, return null (restrict access)
    console.log("[Permissions Debug] Not enough rows, returning null.");
    return null;
  }

  // According to the new format, headers are on row 2 (index 1)
  const headers = rows[1].map(h => h.trim().toLowerCase());
  console.log(`[Permissions Debug] Headers:`, headers);
  const emailIdx = headers.indexOf("gmail");
  const hunterIdx = headers.indexOf("狩獵者") !== -1 ? headers.indexOf("狩獵者") : 0;
  if (emailIdx === -1) {
    console.error("[Permissions] No 'Gmail' column found in Permissions sheet headers:", headers);
    return null;
  }

  // Find user row (case-insensitive) starting from row 3 (index 2)
  const userRow = rows.slice(2).find(r => r[emailIdx]?.trim().toLowerCase() === email.toLowerCase());
  if (!userRow) {
    console.log(`[Permissions Debug] Could not find userRow for email: ${email}`);
    // Log all available emails to see if there is a mismatch
    const allEmails = rows.slice(2).map(r => r[emailIdx]?.trim().toLowerCase());
    console.log(`[Permissions Debug] Available emails in sheet:`, allEmails);
    return null; // User not registered in the Permissions sheet
  }
  console.log(`[Permissions Debug] Found userRow:`, userRow);

  const roles: { [key: string]: "admin" | "editor" | "viewer" | "none" } = {};
  headers.forEach((header, idx) => {
    if (!header || idx === emailIdx || idx === hunterIdx) return; // Skip empty headers, email, or hunterName column
    const rawVal = userRow[idx]?.trim().toLowerCase();
    
    let role: "admin" | "editor" | "viewer" | "none" = "none";
    if (rawVal === "admin") {
      role = "admin";
    } else if (rawVal === "editor") {
      role = "editor";
    } else if (rawVal === "viewer" || rawVal === "view") {
      role = "viewer";
    }
    
    roles[header] = role;
  });

  return {
    email,
    hunterName: userRow[hunterIdx]?.trim() || "",
    roles
  };
}
