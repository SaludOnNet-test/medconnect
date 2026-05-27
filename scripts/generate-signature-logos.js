/**
 * Rasterize the Med Connect SVG logos to PNG for Outlook / Gmail / Apple Mail
 * signatures. SVG in email signatures is fragile — Outlook desktop (Word
 * rendering engine) often renders it as a broken image. PNG is the safe
 * universal format.
 *
 * Outputs (all in /public/brand/):
 *   logo-medconnect-signature.png       — 300×65   (1x baseline)
 *   logo-medconnect-signature@2x.png    — 600×131  (retina)
 *   logo-medconnect-light-signature.png — 300×65   for dark-themed signatures
 *   logo-mark-signature.png             — 96×69    just the mark
 *
 * Run: node scripts/generate-signature-logos.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'brand');

async function rasterize(svgPath, outPath, width) {
  const svg = fs.readFileSync(svgPath);
  await sharp(svg, { density: Math.max(72, width * 4) }) // high density → crisp text
    .resize({ width, withoutEnlargement: false })
    .png({ compressionLevel: 9, palette: false })
    .toFile(outPath);
  const stat = fs.statSync(outPath);
  console.log(`✓ ${path.basename(outPath)}  →  ${width}px wide, ${Math.round(stat.size / 1024)}KB`);
}

(async () => {
  // Horizontal wordmark on transparent — the typical signature usage.
  await rasterize(
    path.join(PUBLIC_DIR, 'logo-medconnect.svg'),
    path.join(PUBLIC_DIR, 'logo-medconnect-signature.png'),
    300,
  );
  await rasterize(
    path.join(PUBLIC_DIR, 'logo-medconnect.svg'),
    path.join(PUBLIC_DIR, 'logo-medconnect-signature@2x.png'),
    600,
  );
  // Light variant for dark signature backgrounds.
  await rasterize(
    path.join(PUBLIC_DIR, 'logo-medconnect-light.svg'),
    path.join(PUBLIC_DIR, 'logo-medconnect-light-signature.png'),
    300,
  );
  await rasterize(
    path.join(PUBLIC_DIR, 'logo-medconnect-light.svg'),
    path.join(PUBLIC_DIR, 'logo-medconnect-light-signature@2x.png'),
    600,
  );
  // Mark only — useful as a small badge in mobile-clipped signatures.
  await rasterize(
    path.join(PUBLIC_DIR, 'logo-mark.svg'),
    path.join(PUBLIC_DIR, 'logo-mark-signature.png'),
    96,
  );
  await rasterize(
    path.join(PUBLIC_DIR, 'logo-mark.svg'),
    path.join(PUBLIC_DIR, 'logo-mark-signature@2x.png'),
    192,
  );
})();
