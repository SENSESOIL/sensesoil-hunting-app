const fs = require('fs');
const path = './src/app/hunting-mgmt/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /<div className="px-6 pb-20 md:px-10 max-w-5xl mx-auto h-full">\s*<HuntingTasksView ref=\{tasksViewRef\} \/>\s*<\/div>/g;

content = content.replace(regex, `<div className="px-6 pb-20 md:px-10 max-w-[1400px] mx-auto h-full flex flex-col">
                  <div className={\`flex-1 \${showManual ? "md:hidden" : ""}\`}>
                    <HuntingTasksView ref={tasksViewRef} />
                  </div>
                  {showManual && (
                    <div className="hidden md:grid grid-cols-3 gap-6 flex-1 w-full items-stretch pt-2 pb-6">
                      <ManualCards />
                    </div>
                  )}
                </div>`);

fs.writeFileSync(path, content, 'utf8');
console.log("Fix complete");
