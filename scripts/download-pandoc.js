#!/usr/bin/env node

/**
 * Downloads the Pandoc binary for the current platform and places it in resources/pandoc/.
 *
 * Usage: node scripts/download-pandoc.js
 *
 * The binary is named pandoc-{platform}-{arch}[.exe] to match the resolution
 * logic in src/infrastructure/pandoc/index.ts.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PANDOC_VERSION = '3.6.4';

const DOWNLOADS = {
  'darwin-arm64': {
    url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-arm64-macOS.zip`,
    extract: 'zip',
    binary: 'pandoc',
  },
  'darwin-x64': {
    url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-x86_64-macOS.zip`,
    extract: 'zip',
    binary: 'pandoc',
  },
  'win32-x64': {
    url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-windows-x86_64.zip`,
    extract: 'zip',
    binary: 'pandoc.exe',
  },
  'linux-x64': {
    url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-amd64.tar.gz`,
    extract: 'tar',
    binary: 'pandoc',
  },
};

const platformKey = `${os.platform()}-${os.arch()}`;
const config = DOWNLOADS[platformKey];

if (!config) {
  console.error(`Unsupported platform: ${platformKey}`);
  console.error(`Supported platforms: ${Object.keys(DOWNLOADS).join(', ')}`);
  process.exit(1);
}

const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'resources', 'pandoc');
const tmpDir = path.join(os.tmpdir(), `pandoc-download-${Date.now()}`);
const ext = config.extract === 'zip' ? '.zip' : '.tar.gz';
const archivePath = path.join(tmpDir, `pandoc${ext}`);
const platform = os.platform();
const arch = os.arch();
const binaryExt = platform === 'win32' ? '.exe' : '';
const finalBinaryName = `pandoc-${platform}-${arch}${binaryExt}`;
const finalBinaryPath = path.join(outputDir, finalBinaryName);

/**
 * Follow redirects (GitHub releases use 302 -> S3).
 * Returns a Promise that resolves when the file is fully downloaded.
 */
function download(url, dest, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects'));
    }

    const file = fs.createWriteStream(dest);
    const request = https.get(url, { headers: { 'User-Agent': 'novel-engine-pandoc-downloader' } }, (response) => {
      // Follow redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return download(response.headers.location, dest, maxRedirects - 1).then(resolve, reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`Download failed: HTTP ${response.statusCode} for ${url}`));
      }

      const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0) {
          const pct = ((downloadedBytes / totalBytes) * 100).toFixed(1);
          process.stdout.write(`\r  Downloading: ${pct}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        if (totalBytes > 0) {
          process.stdout.write('\n');
        }
        resolve();
      });
    });

    request.on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

/**
 * Recursively find a file by name within a directory tree.
 */
function findFile(dir, name) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(fullPath, name);
      if (found) return found;
    } else if (entry.name === name) {
      return fullPath;
    }
  }
  return null;
}

async function main() {
  console.log(`Platform: ${platformKey}`);
  console.log(`Pandoc version: ${PANDOC_VERSION}`);
  console.log(`Download URL: ${config.url}`);
  console.log();

  // Check if binary already exists
  if (fs.existsSync(finalBinaryPath)) {
    console.log(`Pandoc binary already exists at: ${finalBinaryPath}`);
    console.log('Delete it manually to re-download.');
    return;
  }

  // Create directories
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // Step 1: Download the archive
    console.log('Downloading Pandoc...');
    await download(config.url, archivePath);
    console.log(`  Archive saved to: ${archivePath}`);

    // Step 2: Extract the archive
    console.log('Extracting...');
    const extractDir = path.join(tmpDir, 'extracted');
    fs.mkdirSync(extractDir, { recursive: true });

    if (config.extract === 'zip') {
      if (platform === 'win32') {
        execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${extractDir}'"`, { stdio: 'inherit' });
      } else {
        execSync(`unzip -q "${archivePath}" -d "${extractDir}"`, { stdio: 'inherit' });
      }
    } else {
      execSync(`tar -xzf "${archivePath}" -C "${extractDir}"`, { stdio: 'inherit' });
    }

    // Step 3: Find the pandoc binary in the extracted contents
    console.log(`Looking for binary: ${config.binary}`);
    const foundBinary = findFile(extractDir, config.binary);

    if (!foundBinary) {
      throw new Error(`Could not find '${config.binary}' in extracted archive`);
    }

    console.log(`  Found: ${foundBinary}`);

    // Step 4: Copy to resources/pandoc/ with platform-specific name
    fs.copyFileSync(foundBinary, finalBinaryPath);
    console.log(`  Copied to: ${finalBinaryPath}`);

    // Step 5: Make executable on Unix
    if (platform !== 'win32') {
      fs.chmodSync(finalBinaryPath, 0o755);
      console.log('  Made executable');
    }

    // Verify
    const version = execSync(`"${finalBinaryPath}" --version`, { encoding: 'utf8' }).split('\n')[0];
    console.log(`  Verified: ${version}`);

    console.log('\nPandoc downloaded successfully!');
  } finally {
    // Step 6: Clean up temp files
    console.log('Cleaning up...');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\nError:', err.message);
  // Clean up on failure
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  process.exit(1);
});
