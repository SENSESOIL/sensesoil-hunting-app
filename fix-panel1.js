const fs = require('fs');
let code = fs.readFileSync('src/app/hunting-mgmt/page.tsx', 'utf8');

code = code.replace(
  /className={`w-1\/3 md:w-full flex-shrink-0 h-full overflow-y-auto \$\{activeSubTab !== "專案任務" \? "md:hidden" : ""\}`}/g, 
  'className={`w-1/3 md:w-full flex-shrink-0 transition-[height] duration-300 ${activeSubTab !== "專案任務" ? "h-0 overflow-hidden md:h-auto md:overflow-visible md:hidden" : "h-auto"}`}'
);

fs.writeFileSync('src/app/hunting-mgmt/page.tsx', code);
console.log('done');
