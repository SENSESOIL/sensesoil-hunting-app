const sharp = require('sharp');

async function resize() {
  try {
    await sharp('src/app/icon.png').resize(192, 192).toFile('public/icon-192x192.png');
    console.log("Created 192x192");
    await sharp('src/app/icon.png').resize(512, 512).toFile('public/icon-512x512.png');
    console.log("Created 512x512");
  } catch (err) {
    console.error("Error:", err);
  }
}

resize();
