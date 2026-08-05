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
sheets.spreadsheets.values.get({ spreadsheetId: '14ldpC7mD1wYjouSiR9gizl--fPFcIowGGzkQdkxQNvQ', range: 'Permission!A:M' }).then(res => {
  console.log('Permission data:', res.data.values);
}).catch(console.error);
