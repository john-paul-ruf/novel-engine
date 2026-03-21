#!/usr/bin/env node

/**
 * Generates platform-specific icon files for Novel Engine from a source PNG.
 *
 * Usage: node scripts/generate-icons.js [source.png]
 *
 * Default source: assets/icon.png
 *
 * Creates:
 *   assets/icon.icns — macOS icon (16x16 through 512x512@2x)
 *   assets/icon.ico  — Windows icon (16x16 through 256x256)
 *
 * Requirements:
 *   macOS:  sips + iconutil (built-in)
 *   .ico:   ImageMagick (brew install imagemagick)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const assetsDir = path.resolve(__dirname, '..', 'assets');
const sourcePng = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(assetsDir, 'icon.png');

if (!fs.existsSync(sourcePng)) {
  console.error(`Source PNG not found: ${sourcePng}`);
  process.exit(1);
}

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

// ── macOS .icns ──────────────────────────────────────────────────────────────

function generateIcns() {
  const iconsetDir = path.join(assetsDir, 'icon.iconset');
  fs.mkdirSync(iconsetDir, { recursive: true });

  const sizes = [16, 32, 64, 128, 256, 512, 1024];

  for (const size of sizes) {
    const out = path.join(iconsetDir, `icon_${size}x${size}.png`);
    run(`sips -z ${size} ${size} "${sourcePng}" --out "${out}" > /dev/null 2>&1`);
  }

  // Create @2x variants from the next-size-up renders
  const retinaMap = {
    '16x16@2x': '32x32',
    '32x32@2x': '64x64',
    '128x128@2x': '256x256',
    '256x256@2x': '512x512',
    '512x512@2x': '1024x1024',
  };

  for (const [retina, source] of Object.entries(retinaMap)) {
    fs.copyFileSync(
      path.join(iconsetDir, `icon_${source}.png`),
      path.join(iconsetDir, `icon_${retina}.png`)
    );
  }

  // Remove intermediate sizes not part of the iconset spec
  for (const extra of ['64x64', '1024x1024']) {
    const p = path.join(iconsetDir, `icon_${extra}.png`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  const icnsPath = path.join(assetsDir, 'icon.icns');
  run(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`);

  // Clean up
  fs.rmSync(iconsetDir, { recursive: true, force: true });

  console.log(`Created: ${icnsPath}`);
}

// ── Windows .ico ─────────────────────────────────────────────────────────────

function generateIco() {
  const icoPath = path.join(assetsDir, 'icon.ico');
  const sizes = [16, 32, 48, 64, 128, 256];
  const resizeArgs = sizes
    .map((s) => `\\( -clone 0 -resize ${s}x${s} \\)`)
    .join(' ');

  run(`magick "${sourcePng}" ${resizeArgs} -delete 0 "${icoPath}"`);

  console.log(`Created: ${icoPath}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log(`Source: ${sourcePng}\n`);

try {
  generateIcns();
} catch (err) {
  console.warn(`⚠ Skipped .icns generation (requires macOS sips + iconutil): ${err.message}`);
}

try {
  generateIco();
} catch (err) {
  console.warn(`⚠ Skipped .ico generation (requires ImageMagick): ${err.message}`);
}

console.log('\nDone.');
