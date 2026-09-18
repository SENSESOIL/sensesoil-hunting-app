const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    envVars[match[1]] = val;
  }
});
const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: envVars.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: envVars.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});
const sheets = google.sheets({ version: 'v4', auth });
const sheetId = envVars.SHEET_ID_PERMISSIONS || '14ldpC7mD1wYjouSiR9gizl--fPFcIowGGzkQdkxQNvQ';
async function run() {
  const crmRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: '員工CRM!A:M' });
  const row = crmRes.data.values.find(r => r[0] === '拾壤');
  console.log('Admin row in CRM:', row);
}
run();
