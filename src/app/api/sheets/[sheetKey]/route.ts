// src/app/api/sheets/[sheetKey]/route.ts
// Multi-Sheet CRUD API:
//   GET  /api/sheets/basic-mission        → read (guest + authenticated)
//   POST /api/sheets/basic-mission        → write (authenticated only)

import { NextRequest, NextResponse } from "next/server";
export const dynamic = 'force-dynamic';
import { auth } from "@/lib/auth-options";
import { readSheet, appendSheet, writeSheet } from "@/lib/google-sheets";
import { SHEET_REGISTRY, SheetKey } from "@/lib/sheet-config";

interface RouteParams {
  params: Promise<{ sheetKey: string }>;
}

// ─── GET: Read sheet data (guests allowed) ────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { sheetKey } = await params;

  const config = SHEET_REGISTRY[sheetKey as SheetKey];
  if (!config) {
    return NextResponse.json({ error: `Sheet "${sheetKey}" not found` }, { status: 404 });
  }
  if (!config.spreadsheetId) {
    return NextResponse.json({ error: `Sheet "${sheetKey}" not configured` }, { status: 503 });
  }

  try {
    const rows = await readSheet(config.spreadsheetId, config.defaultRange);
    let settings: string[][] = [];
    try {
      settings = await readSheet(config.spreadsheetId, "設定!A:Z");
    } catch (e) {
      console.warn("Could not read settings sheet", e);
    }
    return NextResponse.json({ rows, settings, label: config.label }, { status: 200 });
  } catch (err) {
    console.error(`[Sheets GET] ${sheetKey}:`, err);
    return NextResponse.json({ error: "Failed to read sheet" }, { status: 500 });
  }
}

// ─── POST: Append row (authenticated only) ────────────────────────────────

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { sheetKey } = await params;

  // Auth guard — only Google-logged-in users can write
  const session = await auth();
  if (!session?.user && process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session?.user) {
    const roles = (session.user as any).roles || {};
    const permissionKey = sheetKey === "basic-mission" ? "basic" : sheetKey;
    const userRole = roles[permissionKey] || "viewer";
    if (userRole !== "editor" && userRole !== "admin") {
      return NextResponse.json({ error: "Forbidden: You do not have edit permissions." }, { status: 403 });
    }
  }

  const config = SHEET_REGISTRY[sheetKey as SheetKey];
  if (!config) {
    return NextResponse.json({ error: `Sheet "${sheetKey}" not found` }, { status: 404 });
  }

  const body = await req.json();
  const { values } = body as { values: string[][] };

  if (!values || !Array.isArray(values)) {
    return NextResponse.json({ error: "Invalid payload: expected { values: string[][] }" }, { status: 400 });
  }

  try {
    await appendSheet(config.spreadsheetId, config.defaultRange, values);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error(`[Sheets POST] ${sheetKey}:`, err);
    return NextResponse.json({ error: "Failed to write sheet" }, { status: 500 });
  }
}

// ─── PATCH: Update row (authenticated only) ───────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { sheetKey } = await params;

  // Auth guard — only Google-logged-in users can write
  const session = await auth();
  if (!session?.user && process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session?.user) {
    const roles = (session.user as any).roles || {};
    const permissionKey = sheetKey === "basic-mission" ? "basic" : sheetKey;
    const userRole = roles[permissionKey] || "viewer";
    if (userRole !== "editor" && userRole !== "admin") {
      return NextResponse.json({ error: "Forbidden: You do not have edit permissions." }, { status: 403 });
    }
  }

  const config = SHEET_REGISTRY[sheetKey as SheetKey];
  if (!config) {
    return NextResponse.json({ error: `Sheet "${sheetKey}" not found` }, { status: 404 });
  }

  const body = await req.json();
  const { range, values, updates } = body as { range?: string; values?: string[][], updates?: { range: string, values: string[][] }[] };

  try {
    if (updates && Array.isArray(updates)) {
      for (const u of updates) {
        if (u.range && u.values) {
          await writeSheet(config.spreadsheetId, u.range, u.values);
        }
      }
    } else if (range && values && Array.isArray(values)) {
      await writeSheet(config.spreadsheetId, range, values);
    } else {
      return NextResponse.json({ error: "Invalid payload: expected updates array or range/values" }, { status: 400 });
    }
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error(`[Sheets PATCH] ${sheetKey}:`, err);
    return NextResponse.json({ error: "Failed to write sheet" }, { status: 500 });
  }
}
