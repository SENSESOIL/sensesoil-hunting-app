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
sheets.spreadsheets.get({ spreadsheetId: '1uRnOIQ3vhINawQYGJFq4alHlS2uTKatn41NIM_reMGE' }).then(res => {
  console.log('1uRnOIQ3vhINawQYGJFq4alHlS2uTKatn41NIM_reMGE sheets:');
  console.log(res.data.sheets.map(s => s.properties.title));
}).catch(console.error);
