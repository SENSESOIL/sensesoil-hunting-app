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
  const crmRows = crmRes.data.values;
  const crmHeaders = crmRows[1].map(h => h.trim().toLowerCase());
  const crmHunterIdx = crmHeaders.indexOf("狩獵者") !== -1 ? crmHeaders.indexOf("狩獵者") : crmHeaders.indexOf("姓名");
  const leaveDateIdx = crmHeaders.indexOf("離線登出日");
  const resigned = [];
  crmRows.slice(2).forEach(r => {
    if (r[leaveDateIdx] && r[leaveDateIdx].trim() && r[crmHunterIdx] && r[crmHunterIdx].trim()) {
      resigned.push(r[crmHunterIdx].trim());
    }
  });
  console.log("Resigned hunters:", resigned);

  const permRes = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Permission!A:M' });
  const permRows = permRes.data.values;
  const permHeaders = permRows[1].map(h => h.trim().toLowerCase());
  const emailIdx = permHeaders.indexOf("gmail");
  const permHunterIdx = permHeaders.indexOf("狩獵者") !== -1 ? permHeaders.indexOf("狩獵者") : permHeaders.indexOf("姓名");
  
  const userRow = permRows.slice(2).find(r => r[emailIdx]?.trim().toLowerCase() === 'sensesoil.tw@gmail.com');
  console.log("User row:", userRow);
  if (userRow) {
    const hunterName = userRow[permHunterIdx]?.trim() || "";
    console.log("Hunter name:", hunterName);
    console.log("Is resigned?", resigned.includes(hunterName));
  } else {
    console.log("User not found!");
  }
}
run();
