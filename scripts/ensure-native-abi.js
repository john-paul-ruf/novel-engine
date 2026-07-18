/**
 * Ensures better-sqlite3 is compiled for the current Node ABI before tests run.
 *
 * `npm start` (Electron Forge) rebuilds native modules for Electron's ABI,
 * which Vitest (plain Node) cannot load. This flips it back only when needed —
 * a no-op when the ABI already matches.
 */
const { execSync } = require('child_process');

try {
  // The native binding loads lazily inside the constructor — requiring alone is not enough.
  const Database = require('better-sqlite3');
  new Database(':memory:').close();
} catch {
  console.log('[pretest] better-sqlite3 ABI mismatch — rebuilding for Node (Electron Forge rebuilds it back on npm start)...');
  execSync('npm rebuild better-sqlite3', { stdio: 'inherit' });
}
