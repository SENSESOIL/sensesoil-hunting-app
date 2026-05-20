// src/lib/sheet-config.ts
// Multi-Sheet registry — add new sheets here as the system grows

export const SHEET_REGISTRY = {
  // 基礎任務試煉
  "basic-mission": {
    spreadsheetId: process.env.SHEET_ID_BASIC_MISSION!,
    defaultRange: "A:Z",
    label: "基礎任務試煉",
    permissions: {
      guest: "read" as const,
      authenticated: "read-write" as const,
    },
  },
  // 狩獵管理 (fill SHEET_ID_HUNTING_MGMT in .env.local when ready)
  "hunting-mgmt": {
    spreadsheetId: process.env.SHEET_ID_HUNTING_MGMT ?? "",
    defaultRange: "A:Z",
    label: "狩獵管理",
    permissions: {
      guest: "read" as const,
      authenticated: "read-write" as const,
    },
  },
} as const;

export type SheetKey = keyof typeof SHEET_REGISTRY;
