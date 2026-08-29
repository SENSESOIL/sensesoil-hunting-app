const fs = require('fs');
const path = './src/app/hunting-mgmt/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Change text-[15px] to text-[17px] for the card titles
content = content.replace(/<h2 className="text-\[15px\] font-bold text-\[#18181B\]">(子任務|主任務|複製任務)<\/h2>/g, '<h2 className="text-[17px] font-bold text-[#18181B]">$1</h2>');

// 2. Remove the mock UI headers (本週任務 and 下週任務)
const card1_2_header_regex = /<div className="flex justify-between items-center mb-6">\s*<h3 className="text-\[17px\] font-bold text-\[#18181B\]">本週任務<\/h3>\s*<div className="text-\[11px\] font-medium text-\[#A1A1AA\] tracking-wider uppercase flex items-center gap-1">\s*<span className="material-symbols-outlined text-\[14px\]">\s*chevron_left\s*<\/span>\s*W33 · 8\/10 - 8\/15\s*<span className="material-symbols-outlined text-\[14px\]">\s*chevron_right\s*<\/span>\s*<\/div>\s*<\/div>/g;

const card3_header_regex = /<div className="flex justify-between items-center mb-6">\s*<h3 className="text-\[17px\] font-bold text-\[#18181B\]">下週任務<\/h3>\s*<div className="text-\[11px\] font-medium text-\[#A1A1AA\] tracking-wider uppercase flex items-center">\s*W34 · 8\/17 - 8\/22\s*<\/div>\s*<\/div>/g;

content = content.replace(card1_2_header_regex, '');
content = content.replace(card3_header_regex, '');

fs.writeFileSync(path, content, 'utf8');
console.log('Update complete');
