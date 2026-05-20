const fs = require('fs');
const { execSync } = require('child_process');

// Parse .env.local
const envContent = fs.readFileSync('.env.local', 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1'); // strip quotes
  }
});

// Since Next.js uses standard imports, we can compile the permissions file and run it
execSync('npx tsc src/lib/permissions.ts src/lib/google-sheets.ts --outDir ./dist --esModuleInterop --skipLibCheck');

const { checkPermissions } = require('./dist/permissions.js');

checkPermissions('sensesoil.tw@gmail.com').then(console.log).catch(console.error);
