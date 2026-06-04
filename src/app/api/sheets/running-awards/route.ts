import { NextResponse } from 'next/server';
import { readSheet } from "@/lib/google-sheets";

export async function GET() {
  try {
    const sheetId = '1bYwZNqQLU-jgmJvz3tB_195QB4uZwqWOVPDI-c4_Pm4';
    const range = 'Award!A4:BA100';
    
    const rows = await readSheet(sheetId, range);
    
    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const records = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue; // Skip if no name

      const name = row[0].trim();
      
      const record = {
        name,
        L1: {
          runs: row[1] || '0',
          reward: row[2] || '',
          date: row[3] || ''
        },
        L2: {
          prs: row[4] || '0',
          reward: row[5] || '',
          date: row[6] || ''
        },
        L3: {
          prs: row[7] || '0',
          reward: row[8] || '',
          date: row[9] || ''
        },
        L4: {
          months: [] as { month: number, target: string, reward: string, date: string }[],
          totalB: parseFloat((row[50] || '0').replace(/,/g, '')) // B is index 50
        },
        L5: {
          distance: row[46] || '0',
          reward: row[47] || '',
          date: row[48] || '',
          totalC: parseFloat((row[51] || '0').replace(/,/g, '')) // C is index 51
        },
        totals: {
          A: parseFloat((row[49] || '0').replace(/,/g, '')),
          B: parseFloat((row[50] || '0').replace(/,/g, '')),
          C: parseFloat((row[51] || '0').replace(/,/g, '')),
          total: parseFloat((row[52] || '0').replace(/,/g, ''))
        }
      };

      // Parse all 12 months for L4
      // Month 1 starts at index 10 (target), 11 (reward), 12 (date)
      for (let m = 0; m < 12; m++) {
        const baseIdx = 10 + (m * 3);
        const target = row[baseIdx] || '';
        const reward = row[baseIdx + 1] || '';
        const date = row[baseIdx + 2] || '';
        
        if (target || reward || date) {
          record.L4.months.push({
            month: m + 1,
            target,
            reward,
            date
          });
        }
      }

      records.push(record);
    }
    
    return NextResponse.json({ success: true, data: records });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch running awards from Award!A4:BA100' },
      { status: 500 }
    );
  }
}
