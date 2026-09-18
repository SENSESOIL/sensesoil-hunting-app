const fs = require('fs');
const lines = fs.readFileSync('src/app/hunting-mgmt/page.tsx', 'utf8').split('\n');
lines.forEach((l, i) => {
  if (l.includes(') : (')) {
    console.log(i + 1, l.trim());
  }
});
