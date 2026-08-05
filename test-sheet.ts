import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
const sheetIdLine = envFile.split('\n').find(line => line.startsWith('SHEET_ID_BASIC_MISSION='));
process.env.SHEET_ID_BASIC_MISSION = sheetIdLine.split('=')[1].trim();
const emailLine = envFile.split('\n').find(line => line.startsWith('GOOGLE_SERVICE_ACCOUNT_EMAIL='));
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = emailLine.split('=')[1].trim();
const pkLine = envFile.split('\n').find(line => line.startsWith('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY='));
process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = pkLine.substring(pkLine.indexOf('=') + 1).trim().replace(/\\n/g, '\n');

import { readSheet } from './src/lib/google-sheets.ts';

async function run() {
  const spreadsheetId = process.env.SHEET_ID_BASIC_MISSION;
  const rows = await readSheet(spreadsheetId, 'A:Z');
  console.log('Row 0 (headers):', rows[0]);
  console.log('Row 1 (headers):', rows[1]);
  // Find 陳德霖
  const row = rows.find(r => r[2] === '陳德霖' || r[1] === '陳德霖');
  if (row) {
    console.log('陳德霖 row:', row);
    for (let i = 13; i <= 22; i++) {
      console.log(`Index ${i}:`, row[i]);
    }
  } else {
    console.log('陳德霖 not found');
  }
}
run();
