const fs = require('fs');

function replaceFile(path) {
  let code = fs.readFileSync(path, 'utf8');
  code = code.replace(/r === \"admin\" \|\| r === \"editor\" \|\| r === \"viewer\"/g, 'r === \"admin\" || r === \"editor\" || r === \"user\" || r === \"viewer\"');
  code = code.replace(/role === \"admin\" \|\| role === \"editor\" \|\| role === \"viewer\"/g, 'role === \"admin\" || role === \"editor\" || role === \"user\" || role === \"viewer\"');
  code = code.replace(/userRole !== \"viewer\"/g, '(userRole !== \"viewer\" && userRole !== \"user\")');
  fs.writeFileSync(path, code);
}

replaceFile('src/app/hunting-mgmt/page.tsx');
replaceFile('src/app/running-records/page.tsx');
replaceFile('src/app/hidden-mission/page.tsx');
replaceFile('src/app/basic-mission/page.tsx');
replaceFile('src/app/api/sheets/running-records/route.ts');
replaceFile('src/app/api/sheets/hidden-mission/route.ts');
replaceFile('src/app/api/sheets/[sheetKey]/route.ts');
