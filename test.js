const fs = require('fs');
const { google } = require('googleapis');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length) {
    let v = val.join('=').trim();
    if (v.startsWith('"') && v.endsWith('"')) {
      v = v.slice(1, -1);
    }
    env[key.trim()] = v;
  }
});

async function run() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  
  const sheets = google.sheets({ version: 'v4', auth });
  
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: '14ldpC7mD1wYjouSiR9gizl--fPFcIowGGzkQdkxQNvQ',
    range: 'Permission!A1:M2',
  });
  
  console.log("HEADERS:", res.data.values[1]);
}

run().catch(console.error);
