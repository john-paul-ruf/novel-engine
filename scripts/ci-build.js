#!/usr/bin/env node

/**
 * CI Build Helper for Novel Engine
 *
 * Usage: node scripts/ci-build.js [--version=x.y.z]
 *
 * Runs electron-forge make with platform-appropriate targets,
 * then collects outputs into dist/ with consistent naming:
 *
 *   Novel-Engine-{version}-{platform}-{arch}.{ext}
 *   Novel-Engine-{version}-{platform}-{arch}.{ext}.sha256
 *
 * Environment:
 *   GITHUB_REF_NAME  — git tag (e.g. "v1.2.3"), used if --version not provided
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist-installers');
const platform = os.platform();
const arch = os.arch();

// ── Parse version ──────────────────────────────────────────────────
function getVersion() {
  const flag = process.argv.find(a => a.startsWith('--version='));
  if (flag) return flag.split('=')[1].replace(/^v/, '');

  const ref = process.env.GITHUB_REF_NAME || '';
  if (ref.startsWith('v')) return ref.slice(1);

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  return pkg.version;
}

// ── Verify prerequisites ───────────────────────────────────────────
function verify() {
  const checks = [
    ['assets/icon.png', 'PNG icon'],
  ];

  if (platform === 'darwin') {
    checks.push(['assets/icon.icns', 'macOS icon']);
  }
  if (platform === 'win32') {
    checks.push(['assets/icon.ico', 'Windows icon']);
  }

  // Pandoc binary for this platform
  const ext = platform === 'win32' ? '.exe' : '';
  checks.push([`resources/pandoc/pandoc-${platform}-${arch}${ext}`, 'Pandoc binary']);

  const missing = checks.filter(([p]) => !fs.existsSync(path.join(ROOT, p)));
  if (missing.length > 0) {
    console.error('Missing required files:');
    missing.forEach(([p, label]) => console.error(`  ✗ ${label}: ${p}`));
    process.exit(1);
  }

  console.log('All prerequisites verified ✓');
}

// ── Sync version into package.json ─────────────────────────────────
function syncVersion(version) {
  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  if (pkg.version !== version) {
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`Version synced to ${version}`);
  }
}

// ── Run electron-forge make ────────────────────────────────────────
function make() {
  console.log(`\nBuilding for ${platform}-${arch}...\n`);

  // electron-forge make will use all configured makers that match the current platform
  execSync('npx electron-forge make', {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });
}

// ── Collect and rename outputs ─────────────────────────────────────
function collectOutputs(version) {
  fs.mkdirSync(DIST, { recursive: true });

  const makeDir = path.join(ROOT, 'out', 'make');
  if (!fs.existsSync(makeDir)) {
    console.error('No make output found at out/make/');
    process.exit(1);
  }

  const collected = [];

  // Walk the make directory recursively to find installer files
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (isInstallerFile(entry.name)) {
        collected.push(fullPath);
      }
    }
  }

  walk(makeDir);

  if (collected.length === 0) {
    console.error('No installer files found in out/make/');
    process.exit(1);
  }

  const renamed = [];
  for (const src of collected) {
    const ext = getFullExtension(src);
    const destName = `Novel-Engine-${version}-${platform}-${arch}${ext}`;
    const dest = path.join(DIST, destName);

    fs.copyFileSync(src, dest);
    renamed.push(dest);
    console.log(`  → ${destName}`);
  }

  return renamed;
}

function isInstallerFile(name) {
  const installerExts = ['.dmg', '.zip', '.exe', '.deb', '.rpm', '.AppImage', '.snap', '.msi', '.nupkg'];
  return installerExts.some(ext => name.endsWith(ext));
}

function getFullExtension(filePath) {
  const name = path.basename(filePath);
  // Handle .tar.gz style extensions
  if (name.endsWith('.tar.gz')) return '.tar.gz';
  return path.extname(name);
}

// ── Generate checksums ─────────────────────────────────────────────
function generateChecksums(files) {
  console.log('\nGenerating checksums...');

  for (const file of files) {
    const content = fs.readFileSync(file);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const checksumFile = `${file}.sha256`;
    const fileName = path.basename(file);

    fs.writeFileSync(checksumFile, `${hash}  ${fileName}\n`);
    console.log(`  ${hash.slice(0, 16)}...  ${fileName}`);
  }

  // Also create an aggregated CHECKSUMS.txt
  const allChecksums = files.map(file => {
    const content = fs.readFileSync(file);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    return `${hash}  ${path.basename(file)}`;
  }).join('\n') + '\n';

  fs.writeFileSync(path.join(DIST, 'CHECKSUMS.txt'), allChecksums);
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  const version = getVersion();
  console.log(`Novel Engine build pipeline v${version}`);
  console.log(`Platform: ${platform}-${arch}\n`);

  verify();
  syncVersion(version);
  make();

  console.log('\nCollecting outputs...');
  const files = collectOutputs(version);

  generateChecksums(files);

  console.log(`\n✓ Build complete — ${files.length} installer(s) in dist-installers/`);
}

main().catch(err => {
  console.error('Build failed:', err.message);
  process.exit(1);
});
