const fs = require('fs');
const execSync = require('child_process').execSync;

const originalContent = execSync('git show HEAD~2:src/app/hunting-mgmt/page.tsx').toString();

const startMarker = '{/* 沿用卡片設計 */}';
const startIndex = originalContent.indexOf(startMarker);
const endIndex = originalContent.lastIndexOf('          </div>\n        </div>\n      </div>\n    </div>\n  );\n}');

let cardsJSX = originalContent.substring(startIndex + startMarker.length, endIndex);
cardsJSX = cardsJSX.replace(/flex flex-col mt-4/g, 'flex flex-col h-full');
cardsJSX = cardsJSX.replace(/overflow-hidden flex flex-col"/g, 'overflow-hidden flex flex-col h-full"');
cardsJSX = cardsJSX.replace(/<div className="p-6 bg-white">/g, '<div className="p-6 bg-white flex-1">');

const manualCardsComponent = `
const ManualCards = () => (
  <>
    ${cardsJSX}
  </>
);
`;

const path = './src/app/hunting-mgmt/page.tsx';
let content = fs.readFileSync(path, 'utf8');
content = content.replace('export default function HuntingManagementPage() {', manualCardsComponent + '\nexport default function HuntingManagementPage() {');
fs.writeFileSync(path, content, 'utf8');
console.log('Fixed ManualCards injection');
