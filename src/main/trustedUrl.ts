/**
 * Single source of truth for "is this URL the app's own trusted page?" — used by
 * both the navigation guard (main/index.ts) and the IPC sender guard
 * (main/ipc/handlers.ts). A prefix/scheme check (`startsWith('file://')`,
 * `startsWith('http://localhost')`) is NOT enough: any `file://` page the agent
 * writes into the books folder, or a host like `localhost.evil.com` /
 * `localhost:5173.evil.com`, would pass. We match the exact dev-server origin, or
 * in a packaged build the exact `index.html` file URL.
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface TrustedUrlConfig {
  /** MAIN_WINDOW_VITE_DEV_SERVER_URL when running against the Vite dev server. */
  devServerUrl?: string;
  /** pathToFileURL(indexHtmlPath).href for a packaged build. */
  prodIndexHref?: string;
}

/** Compare two file:// URLs by resolved filesystem path, so encoding or
 *  drive-letter-case differences (notably on Windows) don't fail closed. */
function sameFilePath(aHref: string, bHref: string): boolean {
  try {
    const a = path.resolve(fileURLToPath(aHref));
    const b = path.resolve(fileURLToPath(bHref));
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch {
    return false;
  }
}

/** Pure check — exported for testing. Fail closed on anything unparsable. */
export function isTrustedUrl(url: string, cfg: TrustedUrlConfig): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (cfg.devServerUrl) {
    let dev: URL;
    try {
      dev = new URL(cfg.devServerUrl);
    } catch {
      return false;
    }
    return u.origin === dev.origin;
  }
  if (cfg.prodIndexHref) {
    // The exact packaged index.html, allowing hash/query routing on it.
    // Compared by filesystem path, not raw href, so a Windows packaged build
    // whose window URL is encoded slightly differently still matches.
    if (u.protocol !== 'file:') return false;
    const base = u.href.split('#')[0].split('?')[0];
    return sameFilePath(base, cfg.prodIndexHref);
  }
  return false;
}

let activeConfig: TrustedUrlConfig = {};

/** Set once at window creation, before the page loads or any IPC can fire. */
export function setTrustedUrlConfig(cfg: TrustedUrlConfig): void {
  activeConfig = cfg;
}

/** Runtime check against the configured app URL. Deny-all until configured. */
export function isTrustedAppUrl(url: string): boolean {
  return isTrustedUrl(url, activeConfig);
}
