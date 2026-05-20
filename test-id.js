// test-id.js
const { google } = require('googleapis');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf-8');
let clientEmail, privateKey;
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    if (match[1] === 'GOOGLE_SERVICE_ACCOUNT_EMAIL') clientEmail = match[2].trim();
    if (match[1] === 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY') privateKey = match[2].trim().replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n');
  }
});

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: clientEmail,
    private_key: privateKey,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

const idTemplate = "14%dpC7mD1wYjouSiR9giz%--fPFc%owGGzkQdkxQNvQ";

async function testPermutations() {
  const chars = ['l', 'I'];
  for (const c1 of chars) {
    for (const c2 of chars) {
      for (const c3 of chars) {
        const id = idTemplate.replace('%', c1).replace('%', c2).replace('%', c3);
        console.log(`Testing ID: ${id}`);
        try {
          const response = await sheets.spreadsheets.get({ spreadsheetId: id });
          console.log(`SUCCESS! Found ID: ${id}`);
          console.log(`Title: ${response.data.properties.title}`);
          return;
        } catch (error) {
          // Ignore
        }
      }
    }
  }
  console.log('All permutations failed.');
}

testPermutations();
