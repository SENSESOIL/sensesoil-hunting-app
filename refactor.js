const fs = require('fs');
const path = './src/app/hunting-mgmt/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const startMarker = '{/* 沿用卡片設計 */}';
const endMarker = '          </div>\n        </div>\n      </div>\n    </div>\n  );\n}';

const startIndex = content.indexOf(startMarker);
const endIndex = content.lastIndexOf('          </div>\n        </div>\n      </div>\n    </div>\n  );\n}');

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find markers.");
    process.exit(1);
}

let cardsJSX = content.substring(startIndex + startMarker.length, endIndex);
cardsJSX = cardsJSX.replace(/flex flex-col mt-4/g, 'flex flex-col h-full');
cardsJSX = cardsJSX.replace(/overflow-hidden flex flex-col"/, 'overflow-hidden flex flex-col h-full"');
cardsJSX = cardsJSX.replace(/<div className="p-6 bg-white">/g, '<div className="p-6 bg-white flex-1">');

const manualCardsComponent = `
const ManualCards = () => (
  <>
    ${cardsJSX}
  </>
);
`;

content = content.replace('export default function SensesoilHuntingApp() {', manualCardsComponent + '\nexport default function SensesoilHuntingApp() {');

const mobileParentStart = content.lastIndexOf('<div className="p-4">', startIndex);
if (mobileParentStart !== -1) {
    const afterCards = content.substring(endIndex);
    content = content.substring(0, mobileParentStart) + 
              '<div className="p-4 flex flex-col gap-4">\n            <ManualCards />\n' + 
              afterCards;
} else {
    console.error("Could not find mobile parent.");
    process.exit(1);
}

content = content.replace(
    'className="absolute top-[3px] bottom-[3px] rounded-[8px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]"',
    "className={`absolute top-[3px] bottom-[3px] rounded-[8px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${showManual ? 'opacity-0' : 'opacity-100'}`}"
);

content = content.replace(
    'onClick={() => setActiveSubTab(activeSubTab === "專案任務" ? "每周任務" : "專案任務")}',
    `onClick={() => {
                      if (showManual) {
                        setShowManual(false);
                        setActiveSubTab("每周任務");
                      } else {
                        setActiveSubTab(activeSubTab === "專案任務" ? "每周任務" : "專案任務");
                      }
                    }}`
);

content = content.replace(
    '<button \n                  onClick={() => setShowManual(true)} \n                  className="w-8 h-8 flex items-center justify-center rounded-full text-[#71717A] hover:bg-[#F4F4F5] transition-colors"',
    "<button \n                  onClick={() => setShowManual(!showManual)} \n                  className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${showManual ? 'text-[#F39C12] bg-[#F39C12]/10' : 'text-[#71717A] hover:bg-[#F4F4F5]'}`}"
);

content = content.replace(
    '<div className="px-6 pb-20 md:px-10 max-w-5xl mx-auto h-full">\n                   <HuntingTasksView ref={tasksViewRef} />\n                </div>',
    `<div className="px-6 pb-20 md:px-10 max-w-[1400px] mx-auto h-full flex flex-col">
                   <div className={\`flex-1 \${showManual ? 'md:hidden' : ''}\`}>
                     <HuntingTasksView ref={tasksViewRef} />
                   </div>
                   {showManual && (
                     <div className="hidden md:grid grid-cols-3 gap-6 h-full items-stretch pt-2 pb-6">
                        <ManualCards />
                     </div>
                   )}
                </div>`
);

fs.writeFileSync(path, content, 'utf8');
console.log("Refactoring complete");
