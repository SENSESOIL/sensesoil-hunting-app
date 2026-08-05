// src/lib/sheet-config.ts
// Multi-Sheet registry — add new sheets here as the system grows

export const SHEET_REGISTRY = {
  // 基礎任務試煉
  "basic-mission": {
    // 強制指定回正確的「基礎任務」Google Sheet ID，避免 Vercel 環境變數錯誤導致讀不到數據
    spreadsheetId: "1uRnOIQ3vhINawQYGJFq4alHlS2uTKatn41NIM_reMGE",
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
  // 隱藏任務 (投資激勵)
  "hidden-mission": {
    spreadsheetId: process.env.SHEET_ID_HIDDEN_MISSION ?? "1aPrtF590zZu7fQYrCZSzZZSDs8zRkqfr7Oqzn-9PyzY",
    defaultRange: "Scoreboard!A:Z",
    label: "隱藏任務",
    permissions: {
      guest: "read" as const,
      authenticated: "read-write" as const,
    },
  },
} as const;

export type SheetKey = keyof typeof SHEET_REGISTRY;
