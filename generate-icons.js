const fs = require('fs');
const sharp = require('sharp');

const svgBuffer = fs.readFileSync('public/Logo｜Orange.svg');

// Generate different sizes
async function generateIcons() {
  await sharp(svgBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile('public/icon-512x512.png');
    
  await sharp(svgBuffer)
    .resize(192, 192, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile('public/icon-192x192.png');

  // Also replace icon.png, maybe using 512x512
  await sharp(svgBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile('public/icon.png');
    
  console.log('Icons generated successfully.');
}

generateIcons().catch(console.error);
