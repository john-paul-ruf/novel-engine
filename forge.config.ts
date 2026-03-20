import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
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

    // Ignore dev-only files from the app bundle.
    // NOTE: Do NOT ignore all .md files — agent .md files are needed at runtime.
    // Agent files are bundled via extraResource (above), so the ignore pattern
    // only affects the app's source directory, not extra resources.
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
