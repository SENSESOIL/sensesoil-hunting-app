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
  spreadsheetId: '1aPrtF590zZu7fQYrCZSzZZSDs8zRkqfr7Oqzn-9PyzY',
  range: 'Scoreboard!A:A'
}).then(res => {
  const names = new Set();
  res.data.values.forEach(row => names.add(row[0]));
  console.log('Names in hidden scoreboard:', Array.from(names));
}).catch(e => console.log('hidden error:', e.message));
