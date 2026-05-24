const fs = require('fs');
const getBounds = require('svg-path-bounds');
const svg = fs.readFileSync('public/Logo｜Orange.svg', 'utf8');
const paths = [...svg.matchAll(/d="([^"]+)"/g)].map(m => m[1]);
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const p of paths) {
  const b = getBounds(p);
  if (b[0] < minX) minX = b[0];
  if (b[1] < minY) minY = b[1];
  if (b[2] > maxX) maxX = b[2];
  if (b[3] > maxY) maxY = b[3];
}
console.log(minX, minY, maxX, maxY);
