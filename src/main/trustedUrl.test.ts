import { afterEach, describe, expect, it } from 'vitest';
import { isTrustedUrl } from './trustedUrl';

describe('isTrustedUrl — dev server', () => {
  const cfg = { devServerUrl: 'http://localhost:5173' };

  it('accepts the exact dev origin and its routes', () => {
    expect(isTrustedUrl('http://localhost:5173/', cfg)).toBe(true);
    expect(isTrustedUrl('http://localhost:5173/#/chapters', cfg)).toBe(true);
  });

  it('rejects look-alike hosts that a prefix check would pass', () => {
    expect(isTrustedUrl('http://localhost:5173.evil.com/', cfg)).toBe(false);
    expect(isTrustedUrl('http://localhost.evil.com/', cfg)).toBe(false);
    expect(isTrustedUrl('http://127.0.0.1:5173/', cfg)).toBe(false);
    expect(isTrustedUrl('https://evil.test/phish.html', cfg)).toBe(false);
  });
});

describe('isTrustedUrl — packaged build', () => {
  const cfg = { prodIndexHref: 'file:///app/renderer/main_window/index.html' };

  it('accepts the exact index document and hash/query routes', () => {
    expect(isTrustedUrl('file:///app/renderer/main_window/index.html', cfg)).toBe(true);
    expect(isTrustedUrl('file:///app/renderer/main_window/index.html#/x', cfg)).toBe(true);
    expect(isTrustedUrl('file:///app/renderer/main_window/index.html?q=1', cfg)).toBe(true);
  });

  it('rejects any other file:// page, including one planted in the books folder', () => {
    expect(isTrustedUrl('file:///app/renderer/main_window/evil.html', cfg)).toBe(false);
    expect(isTrustedUrl('file:///Users/me/books/mybook/pwn.html', cfg)).toBe(false);
    expect(isTrustedUrl('file:///etc/passwd', cfg)).toBe(false);
    expect(isTrustedUrl('http://localhost:5173/', cfg)).toBe(false);
  });
});

describe('isTrustedUrl — packaged build, path-based comparison', () => {
  const realPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform });
  });

  it('matches a drive-letter-case difference on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const cfg = { prodIndexHref: 'file:///C:/app/index.html' };
    // Electron may hand back the drive letter in a different case.
    expect(isTrustedUrl('file:///c:/app/index.html', cfg)).toBe(true);
    expect(isTrustedUrl('file:///C:/app/evil.html', cfg)).toBe(false);
  });
});

describe('isTrustedUrl — fail closed', () => {
  it('rejects everything when unconfigured', () => {
    expect(isTrustedUrl('file:///app/index.html', {})).toBe(false);
    expect(isTrustedUrl('http://localhost:5173/', {})).toBe(false);
  });

  it('rejects unparsable input', () => {
    expect(isTrustedUrl('not a url', { devServerUrl: 'http://localhost:5173' })).toBe(false);
  });
});
