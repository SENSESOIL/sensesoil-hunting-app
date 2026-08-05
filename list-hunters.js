const fs = require('fs');
const { google } = require('googleapis');
const env = fs.readFileSync('c:\\Users\\User\\.antigravity\\Sensesoilhunting_APP\\.env.local', 'utf8');
const emailMatch = env.match(/GOOGLE_SERVICE_ACCOUNT_EMAIL=(.*)/);
const keyMatch = env.match(/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="(.*)"/);
const email = emailMatch[1];
const key = keyMatch[1].replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: email,
    private_key: key
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});

const sheets = google.sheets({ version: 'v4', auth });
sheets.spreadsheets.values.get({ spreadsheetId: '1uRnOIQ3vhINawQYGJFq4alHlS2uTKatn41NIM_reMGE', range: 'A:Z' }).then(res => {
  const rows = res.data.values;
  const hunters = new Set();
  for(let i=2; i<rows.length; i++) {
    if(rows[i][1]) hunters.add(rows[i][1]);
  }
  console.log('Hunters in basic-mission sheet:', Array.from(hunters));
}).catch(console.error);
