# Session 18 — Packaging, Pandoc Bundling, CI/CD

## Context

Novel Engine Electron app. Sessions 01–17 built the complete working app. Now I need to **package it for distribution** — create installers, bundle Pandoc, and set up CI/CD.

---

## Task 1: Pandoc Download Script

### `scripts/download-pandoc.js`

A Node.js script that downloads the Pandoc binary for the current platform and places it in `resources/pandoc/`.

```javascript
// Usage: node scripts/download-pandoc.js
// Downloads Pandoc for the current OS/arch into resources/pandoc/

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
```

Steps:
1. Determine platform key: `${os.platform()}-${os.arch()}`
2. Create `resources/pandoc/` directory
3. Download the archive using `https` module (follow redirects from GitHub)
4. Extract using `child_process` (`unzip` or `tar`)
5. Find the `pandoc` binary in the extracted contents
6. Copy it to `resources/pandoc/pandoc-{platform}-{arch}{ext}`
7. Make it executable on Unix: `chmod +x`
8. Clean up the downloaded archive and extracted temp files

Add to `package.json`:
```json
"scripts": {
  "download-pandoc": "node scripts/download-pandoc.js"
}
```

---

## Task 2: Forge Configuration

### Update `forge.config.ts`

```typescript
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Novel Engine',
    executableName: 'novel-engine',
    appBundleId: 'com.novel-engine.app',
    icon: './assets/icon', // .icns / .ico resolved per platform

    // Bundle these with the app
    extraResource: [
      './resources/pandoc',   // Pandoc binary
      './agents',             // Agent .md definitions
    ],

    // macOS signing (environment variables)
    ...(process.env.APPLE_ID && {
      osxSign: {},
      osxNotarize: {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
      },
    }),

    // Ignore dev-only files from the app bundle.
    // NOTE: Do NOT ignore all .md files — agent .md files are needed at runtime.
    // Agent files are bundled via extraResource (above), so the ignore pattern
    // only affects the app's source directory, not extra resources. However,
    // to be safe, use a more targeted pattern.
    ignore: [
      /^\/scripts$/,
      /^\/docs$/,
      /^\/prompts$/,
      /^\/prep-work$/,
      /^\/\.git/,
      /^\/README\.md$/,
    ],
  },

  makers: [
    new MakerZIP({}, ['darwin']),
    new MakerDMG({ format: 'ULFO' }),
    new MakerSquirrel({
      name: 'NovelEngine',
      setupIcon: './assets/icon.ico',
    }),
    new MakerDeb({
      options: {
        name: 'novel-engine',
        productName: 'Novel Engine',
        genericName: 'AI Writing Tool',
        description: 'Multi-agent AI system for writing novels',
        categories: ['Office', 'TextEditor'],
        icon: './assets/icon.png',
      },
    }),
  ],

  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        { entry: 'src/main/index.ts', config: 'vite.main.config.ts' },
        { entry: 'src/preload/index.ts', config: 'vite.preload.config.ts' },
      ],
      renderer: [
        { name: 'main_window', config: 'vite.renderer.config.ts' },
      ],
    }),
  ],
};

export default config;
```

Install the makers if not already present:
```bash
npm install --save-dev @electron-forge/maker-squirrel @electron-forge/maker-dmg @electron-forge/maker-zip @electron-forge/maker-deb @electron-forge/plugin-auto-unpack-natives
```

---

## Task 3: App Icons

Create placeholder icon files. The user can replace these later.

### `scripts/generate-icons.js`

A simple script that generates placeholder icons using Node.js Canvas (or just create them manually):
- `assets/icon.png` — 1024x1024 PNG (for Linux and as source)
- `assets/icon.icns` — macOS icon (can be generated from PNG using `iconutil` on macOS)
- `assets/icon.ico` — Windows icon (can be generated from PNG using `png2ico` or similar)

For now, just create a simple `assets/icon.png` placeholder (a colored square with "NE" text). The `.icns` and `.ico` can be generated later or created from the PNG using online tools.

---

## Task 4: GitHub Actions CI/CD

### `.github/workflows/release.yml`

Triggered on tag push (`v*`). Builds for all three platforms.

```yaml
name: Build & Release

on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-14        # ARM runner
            platform: darwin
            arch: arm64
          - os: macos-13        # Intel runner
            platform: darwin
            arch: x64
          - os: windows-latest
            platform: win32
            arch: x64
          - os: ubuntu-latest
            platform: linux
            arch: x64

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Download Pandoc
        run: npm run download-pandoc

      - name: Build
        run: npm run make
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-${{ matrix.platform }}-${{ matrix.arch }}
          path: out/make/**/*

  release:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/download-artifact@v4
        with:
          path: artifacts/

      - name: Create Release
        uses: softprops/action-gh-release@v2
        with:
          draft: true
          files: artifacts/**/*
```

---

## Task 5: Package Scripts

Update `package.json` scripts:

```json
{
  "scripts": {
    "start": "electron-forge start",
    "package": "electron-forge package",
    "make": "electron-forge make",
    "publish": "electron-forge publish",
    "download-pandoc": "node scripts/download-pandoc.js",
    "lint": "tsc --noEmit",
    "clean": "rm -rf out .vite dist"
  }
}
```

---

## Task 6: .gitignore Updates

Make sure these are in `.gitignore`:

```
out/
.vite/
dist/
resources/pandoc/
node_modules/
*.db
*.db-wal
*.db-shm
.env
```

---

## Task 7: Content Security Policy

Add a CSP meta tag to the renderer's `index.html` to prevent XSS attacks. The main risk is HTML rendered via `marked.parse()` — while the content comes from the Anthropic API, defense in depth is important.

Add this to the `<head>` of `index.html`:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';">
```

This allows:
- Scripts only from the app itself (no remote scripts)
- Styles from the app + inline (needed for Tailwind)
- Images from the app + data URIs
- No external network connections from the renderer (API calls go through the main process)

---

## Task 8: README

Create a `README.md` for the Electron project:

```markdown
# Novel Engine

A standalone desktop app for AI-assisted novel writing. Uses Claude to orchestrate
seven specialized agents through a structured publishing pipeline.

## Development

​```bash
npm install
npm run download-pandoc
npm start
​```

## Build

​```bash
npm run make
​```

## Architecture

See `prompts/00-MASTER-GUIDE.md` for the full architecture documentation.
​```

---

## Verification

- `npm run download-pandoc` downloads Pandoc for the current platform
- `npm run package` creates a packaged app in `out/`
- `npm run make` creates platform-specific installers in `out/make/`
- The packaged app launches and works (agent files load, database creates)
- Pandoc binary is found in the packaged app's resources
- `.github/workflows/release.yml` is syntactically valid
- The app icon appears in the dock/taskbar
