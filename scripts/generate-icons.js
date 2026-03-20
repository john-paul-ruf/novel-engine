
#!/usr/bin/env node

/**
 * Generates placeholder icon files for Novel Engine.
 *
 * Usage: node scripts/generate-icons.js
 *
 * Creates:
 *   assets/icon.svg  — SVG source icon (dark rounded square with "NE" text)
 *   assets/icon.png  — Minimal placeholder PNG (replace with real 1024x1024 icon)
 *
 * To generate platform-specific icons from a real PNG:
 *   macOS (.icns):  mkdir icon.iconset && sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png && iconutil -c icns icon.iconset
 *   Windows (.ico): npx png-to-ico assets/icon.png > assets/icon.ico
 *   Linux:          uses icon.png directly
 */

const fs = require('fs');
const path = require('path');

const assetsDir = path.resolve(__dirname, '..', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

// Create an SVG icon — a dark rounded square with "NE" text in the Novel Engine brand colors
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="180" fill="#18181b"/>
  <rect x="40" y="40" width="944" height="944" rx="150" fill="#27272a" stroke="#3b82f6" stroke-width="8"/>
  <text x="512" y="440" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="320" font-weight="700" fill="#3b82f6">NE</text>
  <text x="512" y="620" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="100" font-weight="400" fill="#a1a1aa">Novel Engine</text>
</svg>`;

const svgPath = path.join(assetsDir, 'icon.svg');
fs.writeFileSync(svgPath, svg, 'utf8');
console.log(`Created: ${svgPath}`);

// Create a minimal valid PNG (1x1 transparent pixel) as a build placeholder.
// This is the smallest valid PNG file. Replace with a real 1024x1024 PNG for production.
const pngBuffer = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk length + type
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // width=1, height=1
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, // bit depth=8, color=RGBA
  0x89,                                             // IHDR CRC
  0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, // IDAT chunk length + type
  0x78, 0x9C, 0x62, 0x00, 0x00, 0x00, 0x02, 0x00, // zlib-compressed pixel data
  0x01, 0xE5, 0x27, 0xDE, 0xFC,                    // IDAT CRC
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, // IEND chunk
  0xAE, 0x42, 0x60, 0x82,                          // IEND CRC
]);

const pngPath = path.join(assetsDir, 'icon.png');
fs.writeFileSync(pngPath, pngBuffer);
console.log(`Created: ${pngPath} (placeholder - replace with a real 1024x1024 icon)`);

console.log('\nTo generate platform-specific icons from a real PNG:');
console.log('  macOS (.icns): mkdir icon.iconset && sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png && iconutil -c icns icon.iconset');
console.log('  Windows (.ico): npx png-to-ico assets/icon.png > assets/icon.ico');
console.log('  Linux: uses icon.png directly');
