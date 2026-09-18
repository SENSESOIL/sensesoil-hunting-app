const fs = require('fs');
const { google } = require('googleapis');
const envStr = fs.readFileSync('.env.local', 'utf8');
const env = {};
envStr.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});
process.env = { ...process.env, ...env };

async function test() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const SPREADSHEET_ID = '11IiXZbVxFAMzd8wEjU2Z9-W3CqoRa6aW1vQ50dJtrDk';
    
    console.log("Fetching 員工CRM...");
    const res1 = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: '員工CRM!A:M' });
    console.log("員工CRM rows:", res1.data.values.length);
    res1.data.values.slice(0, 3).forEach(r => console.log(r));
    
  } catch (e) {
    console.error("Error:", e.message);
  }
}
test();
