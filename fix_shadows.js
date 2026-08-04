const fs = require('fs');
const files = ['src/app/hunting-mgmt/page.tsx', 'src/components/HuntingTasksView.tsx'];
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/shadow-\[([^\]]+?)_rgb\(/g, 'shadow-[$1_rgba(');
  fs.writeFileSync(file, content);
});
console.log('Fixed shadow classes');
