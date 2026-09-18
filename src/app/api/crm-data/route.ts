import { NextResponse } from 'next/server';
import { readSheet } from "@/lib/google-sheets";

const SPREADSHEET_ID = '11IiXZbVxFAMzd8wEjU2Z9-W3CqoRa6aW1vQ50dJtrDk';

export async function GET() {
  try {
    // 1. Fetch Hunters from 員工CRM
    const huntersRows = await readSheet(SPREADSHEET_ID, "員工CRM!A:M").catch(() => null);
    const activeHunters: string[] = [];

    if (huntersRows && huntersRows.length > 1) {
      // Find header row dynamically
      let headerRowIndex = 0;
      let headers: string[] = [];
      let hunterIdx = -1;
      let leaveDateIdx = -1;

      for (let i = 0; i < Math.min(5, huntersRows.length); i++) {
        const row = huntersRows[i].map(h => h ? String(h).trim() : "");
        const hIdx = row.indexOf("狩獵者") !== -1 ? row.indexOf("狩獵者") : row.indexOf("姓名");
        if (hIdx !== -1) {
          headerRowIndex = i;
          headers = row;
          hunterIdx = hIdx;
          leaveDateIdx = row.indexOf("離線登出日");
          break;
        }
      }

      if (hunterIdx !== -1) {
        const startIdx = headerRowIndex + 1;
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

    return NextResponse.json({ 
      success: true, 
      activeHunters, 
      projects: uniqueProjects
    });
  } catch (error) {
    console.error('API Error /api/crm-data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch CRM data' },
      { status: 500 }
    );
  }
}
