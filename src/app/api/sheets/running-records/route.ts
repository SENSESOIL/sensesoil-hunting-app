import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const sheetId = '1bYwZNqQLU-jgmJvz3tB_195QB4uZwqWOVPDI-c4_Pm4';
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
    
    const response = await fetch(csvUrl, { next: { revalidate: 60 } }); // Cache for 1 minute
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV: ${response.statusText}`);
    }
    
    const csvText = await response.text();
    
    // Simple CSV parser that handles quotes
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;
    
    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];
      
      if (char === '"' && inQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // Skip the escaped quote
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentCell);
        currentCell = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++; // Skip \n in \r\n
        }
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    
    // Add the last row if not empty
    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell);
      rows.push(currentRow);
    }
    
    // Parse records
    // Headers: [0]資料下載日期, [1]跑步日期, [2]跑者名稱, [3]活動名稱, [4]距離 (Km), [5]海拔高度 (m), [6]時間 (min), [7]Activity ID
    const records = [];
    // Skip header row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length >= 7 && row[1]) {
        records.push({
          date: row[1].trim(),
          name: row[2].trim(),
          activity: row[3].trim(),
          distance: parseFloat(row[4]) || 0,
          elevation: parseFloat(row[5]) || 0,
          timeStr: row[6].trim() // time in minutes
        });
      }
    }
    
    return NextResponse.json({ success: true, data: records });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch running records' },
      { status: 500 }
    );
  }
}
