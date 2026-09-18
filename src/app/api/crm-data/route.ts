import { NextResponse } from 'next/server';
import { readSheet } from "@/lib/google-sheets";

const SPREADSHEET_ID = '11IiXZbVxFAMzd8wEjU2Z9-W3CqoRa6aW1vQ50dJtrDk';

export async function GET() {
  try {
    // 1. Fetch Hunters from 員工CRM
    const huntersRows = await readSheet(SPREADSHEET_ID, "員工CRM!A:M").catch(() => null);
    const activeHunters: string[] = [];

    if (huntersRows && huntersRows.length > 1) {
      // Find header row (usually row 2, index 1)
      const headerRow = huntersRows.length >= 3 ? huntersRows[1] : huntersRows[0];
      const headers = headerRow.map(h => h ? String(h).trim() : "");
      const hunterIdx = headers.indexOf("狩獵者") !== -1 ? headers.indexOf("狩獵者") : headers.indexOf("姓名");
      const leaveDateIdx = headers.indexOf("離線登出日");

      if (hunterIdx !== -1) {
        const startIdx = huntersRows.length >= 3 ? 2 : 1;
        huntersRows.slice(startIdx).forEach(row => {
          const name = row[hunterIdx] ? String(row[hunterIdx]).trim() : "";
          const leaveDate = (leaveDateIdx !== -1 && row[leaveDateIdx]) ? String(row[leaveDateIdx]).trim() : "";
          
          if (name && !leaveDate) {
            activeHunters.push(name);
          }
        });
      }
    }

    // 2. Fetch Projects from 專案CRM
    const projectRows = await readSheet(SPREADSHEET_ID, "專案CRM!F4:F").catch(() => null);
    const projects: string[] = [];
    
    if (projectRows) {
      projectRows.forEach(row => {
        const pCode = row[0] ? String(row[0]).trim() : "";
        if (pCode) {
          projects.push(pCode);
        }
      });
    }

    // Deduplicate projects
    const uniqueProjects = Array.from(new Set(projects));

    return NextResponse.json({ success: true, activeHunters, projects: uniqueProjects });
  } catch (error) {
    console.error('API Error /api/crm-data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch CRM data' },
      { status: 500 }
    );
  }
}
