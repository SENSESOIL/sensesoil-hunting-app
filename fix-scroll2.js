const fs = require('fs');
let code = fs.readFileSync('src/app/hunting-mgmt/page.tsx', 'utf8');

// Revert root container
code = code.replace(
  /<div className=\"h-\[100dvh\] overflow-hidden bg-\[#FAFAFA\] font-sans selection:bg-\[#F39C12\]\/20 flex flex-col pb-20 md:pb-0 relative\">/, 
  '<div className="min-h-screen bg-[#FAFAFA] font-sans selection:bg-[#F39C12]/20 flex flex-col pb-20 md:pb-0 relative">'
);

// Update Panel 1
code = code.replace(
  /className={`w-1\/3 md:w-full flex-shrink-0 \$\{activeSubTab !== "專案任務" \? "md:hidden" : ""\}`}/g, 
  'className={`w-1/3 md:w-full flex-shrink-0 transition-[height] duration-300 ${activeSubTab !== "專案任務" ? "h-0 overflow-hidden md:h-auto md:overflow-visible md:hidden" : "h-auto"}`}'
);

// Update Panel 2
code = code.replace(
  /className={`w-1\/3 md:w-full flex-shrink-0 h-full overflow-y-auto \$\{activeSubTab !== "每周任務" \? "md:hidden" : ""\}`}/g, 
  'className={`w-1/3 md:w-full flex-shrink-0 transition-[height] duration-300 ${activeSubTab !== "每周任務" ? "h-0 overflow-hidden md:h-auto md:overflow-visible md:hidden" : "h-auto"}`}'
);

// Update Panel 3
code = code.replace(
  /className={`w-1\/3 md:w-full flex-shrink-0 h-full overflow-y-auto \$\{activeSubTab !== "簽收表單" \? "md:hidden" : ""\}`}/g, 
  'className={`w-1/3 md:w-full flex-shrink-0 transition-[height] duration-300 ${activeSubTab !== "簽收表單" ? "h-0 overflow-hidden md:h-auto md:overflow-visible md:hidden" : "h-auto"}`}'
);

fs.writeFileSync('src/app/hunting-mgmt/page.tsx', code);
console.log('done');
