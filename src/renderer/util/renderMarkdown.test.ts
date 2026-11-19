import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './renderMarkdown';

describe('renderMarkdown', () => {
  it('strips <meta http-equiv="refresh"> redirects', () => {
    const out = renderMarkdown('<meta http-equiv="refresh" content="0;url=https://evil">');
    expect(out).not.toContain('<meta');
    expect(out).not.toContain('http-equiv');
  });

  it('strips <script> tags', () => {
    const out = renderMarkdown('<script>alert(1)</script>');
    expect(out).not.toContain('<script');
  });

  it('drops onerror and other event-handler attributes', () => {
    const out = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(out).not.toContain('onerror');
  });

  it('drops javascript: hrefs', () => {
    const out = renderMarkdown('[click](javascript:alert(1))');
    expect(out).not.toContain('javascript:');
  });

  it('preserves safe markdown formatting', () => {
    const out = renderMarkdown('**bold**');
    expect(out).toContain('<strong>bold</strong>');
  });

  it('preserves a plain https link and its href', () => {
    const out = renderMarkdown('[example](https://example.com)');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('>example</a>');
  });
});
