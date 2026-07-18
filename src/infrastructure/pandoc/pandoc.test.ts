import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { resolvePandocPath } from './index';

// resolvePandocPath takes resourcesPath as an argument (dev = app.getAppPath(),
// packaged = process.resourcesPath) — no electron involved. Platform/arch come
// from node:os, mocked here to pin both naming branches.
const osState = vi.hoisted(() => ({ platform: 'darwin', arch: 'arm64' }));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  const mocked = {
    ...actual,
    platform: () => osState.platform as NodeJS.Platform,
    arch: () => osState.arch,
  };
  return { ...mocked, default: mocked };
});

describe('resolvePandocPath', () => {
  it('builds {resourcesPath}/pandoc/pandoc-{platform}-{arch} on unix platforms', () => {
    osState.platform = 'darwin';
    osState.arch = 'arm64';
    expect(resolvePandocPath('/project/root')).toBe(
      path.join('/project/root', 'pandoc', 'pandoc-darwin-arm64')
    );
  });

  it('appends .exe on win32', () => {
    osState.platform = 'win32';
    osState.arch = 'x64';
    expect(resolvePandocPath('C:\\resources')).toBe(
      path.join('C:\\resources', 'pandoc', 'pandoc-win32-x64.exe')
    );
  });

  it('respects packaged-style resources paths', () => {
    osState.platform = 'linux';
    osState.arch = 'x64';
    const resources = '/Applications/Novel Engine.app/Contents/Resources';
    expect(resolvePandocPath(resources)).toBe(
      path.join(resources, 'pandoc', 'pandoc-linux-x64')
    );
  });
});
