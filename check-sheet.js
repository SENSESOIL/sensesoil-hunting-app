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
sheets.spreadsheets.values.get({
  spreadsheetId: '14ldpC7mD1wYjouSiR9gizl--fPFcIowGGzkQdkxQNvQ',
  range: 'Permission!A:M'
}).then(res => console.log('Permission:', res.data.values?.slice(0, 4))).catch(e => console.log('Permission error:', e.message));
sheets.spreadsheets.values.get({
  spreadsheetId: '14ldpC7mD1wYjouSiR9gizl--fPFcIowGGzkQdkxQNvQ',
  range: '員工CRM!A:M'
}).then(res => {
  if (res.data.values) {
    console.log('員工CRM row 0:', res.data.values[0]);
    console.log('員工CRM row 1:', res.data.values[1]);
    console.log('員工CRM row 12:', res.data.values[12]);
  }
}).catch(e => console.log('員工CRM error:', e.message));
