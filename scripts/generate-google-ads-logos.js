/**
 * Rasterize the Med Connect Google Ads SVG sources to PNG at the exact
 * dimensions Google Ads requires.
 *
 *   logo-google-ads-square.png    — 1200×1200 (1:1 aspect, Performance Max + RSA)
 *   logo-google-ads-landscape.png — 1200×300  (4:1 aspect, Performance Max optional)
 *
 * Both are PNGs with transparent background, well under Google's 5120 KB cap.
 *
 * Run: node scripts/generate-google-ads-logos.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'brand');

async function rasterize(svgPath, outPath, width, height) {
  const svg = fs.readFileSync(svgPath);
  // density=300 → crisp text + curves at any target size. The output is
  // then explicitly resized to width×height so dimensions are guaranteed.
  await sharp(svg, { density: 300 })
    .resize({ width, height, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: false })
    .toFile(outPath);
  const stat = fs.statSync(outPath);
  console.log(`✓ ${path.basename(outPath)}  →  ${width}×${height}, ${Math.round(stat.size / 1024)} KB`);
}

(async () => {
  await rasterize(
    path.join(PUBLIC_DIR, 'logo-google-ads-square.svg'),
    path.join(PUBLIC_DIR, 'logo-google-ads-square.png'),
    1200, 1200,
  );
  await rasterize(
    path.join(PUBLIC_DIR, 'logo-google-ads-landscape.svg'),
    path.join(PUBLIC_DIR, 'logo-google-ads-landscape.png'),
    1200, 300,
  );
})();
