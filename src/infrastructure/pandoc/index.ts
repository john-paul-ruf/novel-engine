import path from 'node:path';
import os from 'node:os';

/**
 * Resolve the path to the bundled Pandoc binary based on the current platform and architecture.
 *
 * In development, `resourcesPath` points to the project root (via `app.getAppPath()`).
 * In production, it points to `process.resourcesPath` inside the packaged app.
 *
 * Expected layout: `{resourcesPath}/pandoc/pandoc-{platform}-{arch}[.exe]`
 */
export function resolvePandocPath(resourcesPath: string): string {
  const platform = os.platform();
  const arch = os.arch();
  const ext = platform === 'win32' ? '.exe' : '';
  return path.join(resourcesPath, 'pandoc', `pandoc-${platform}-${arch}${ext}`);
}
