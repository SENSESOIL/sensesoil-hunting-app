require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');

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
    console.log("員工CRM rows:", res1.data.values ? res1.data.values.length : 0);
    
    console.log("Fetching 專案CRM...");
    const res2 = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: '專案CRM!F4:F' });
    console.log("專案CRM rows:", res2.data.values ? res2.data.values.length : 0);
  } catch (e) {
    console.error("Error:", e.message);
  }
}
test();
