import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
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

    // Ignore dev-only files from the app bundle
    ignore: [
      /^\/scripts$/,
      /^\/docs$/,
      /^\/prompts$/,
      /^\/prep-work$/,
      /^\/screenshots$/,
      /^\/\.git/,
      /^\/\.github$/,
      /^\/README\.md$/,
      /^\/AGENTS\.md$/,
    ],
  },

  makers: [
    // macOS
    new MakerZIP({}, ['darwin']),
    new MakerDMG({
      format: 'ULFO',
      icon: './assets/icon.icns',
      overwrite: true,
    }),

    // Windows
    new MakerSquirrel({
      name: 'NovelEngine',
      setupIcon: './assets/icon.ico',
      // Windows code signing (if cert available)
      ...(process.env.WINDOWS_CERTIFICATE_FILE && {
        certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
        certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
      }),
    }),

    // Linux
    new MakerDeb({
      options: {
        name: 'novel-engine',
        productName: 'Novel Engine',
        genericName: 'AI Writing Tool',
        description: 'Multi-agent AI system for writing novels',
        categories: ['Office', 'TextEditor'],
        section: 'text',
        icon: './assets/icon.png',
        mimeType: ['application/x-novel-engine'],
      },
    }),
    new MakerRpm({
      options: {
        name: 'novel-engine',
        productName: 'Novel Engine',
        genericName: 'AI Writing Tool',
        description: 'Multi-agent AI system for writing novels',
        categories: ['Office', 'TextEditor'],
        license: 'AGPL-3.0-only',
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
