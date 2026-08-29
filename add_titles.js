const fs = require('fs');
const path = './src/app/hunting-mgmt/page.tsx';
let content = fs.readFileSync(path, 'utf8');

let parts = content.split('<div className="bg-white rounded-3xl border border-[#E4E4E7] shadow-sm overflow-hidden flex flex-col h-full">');

if (parts.length === 4) { // 1 before, and 3 after (for 3 cards)
    const titles = ["子任務", "主任務", "複製任務"];
    let newContent = parts[0];
    for (let i = 1; i <= 3; i++) {
        newContent += `<div className="bg-white rounded-3xl border border-[#E4E4E7] shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-4 px-6 bg-white">
        <h2 className="text-[15px] font-bold text-[#18181B]">${titles[i-1]}</h2>
      </div>
      <hr className="border-[#E4E4E7] m-0" />\n` + parts[i].trimStart();
    }
    fs.writeFileSync(path, newContent, 'utf8');
    console.log("Titles injected successfully");
} else {
    console.log("Could not find the exact 3 cards. Found: " + (parts.length - 1));
}
