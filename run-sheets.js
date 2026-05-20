// run-sheets.js
const { google } = require('googleapis');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1'); // strip quotes
  }
});

const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
if (privateKey) {
  privateKey = privateKey.replace(/\\n/g, '\n');
}

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: clientEmail,
    private_key: privateKey,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.SHEET_ID_PERMISSIONS;

async function run() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A:M',
    });
    console.log(JSON.stringify(response.data.values, null, 2));
  } catch (error) {
    console.error(error.message);
  }
}
run();
