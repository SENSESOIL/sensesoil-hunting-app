const { google } = require('googleapis');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf-8');
let clientEmail, privateKey, spreadsheetId;
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    if (match[1] === 'GOOGLE_SERVICE_ACCOUNT_EMAIL') clientEmail = match[2].trim();
    if (match[1] === 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY') privateKey = match[2].trim().replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n');
    if (match[1] === 'SHEET_ID_PERMISSIONS') spreadsheetId = match[2].trim();
  }
});

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: clientEmail, private_key: privateKey },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function run() {
  try {
    const res1 = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Permission!A:M' });
    console.log('Permission!A:M length:', res1.data.values ? res1.data.values.length : 'undefined');
  } catch(e) { console.log('Permission!A:M ERROR:', e.message); }

  try {
    const res2 = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'A:M' });
    console.log('A:M length:', res2.data.values ? res2.data.values.length : 'undefined');
  } catch(e) { console.log('A:M ERROR:', e.message); }
}
run();
