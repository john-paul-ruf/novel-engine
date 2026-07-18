import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const created: string[] = [];

/** Create a unique temp directory, tracked for cleanup. */
export async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'novel-engine-test-'));
  created.push(dir);
  return dir;
}

/** Remove every directory from makeTempDir. Call from afterEach. */
export async function cleanupTempDirs(): Promise<void> {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
}
