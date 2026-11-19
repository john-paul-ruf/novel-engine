import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Shared options — matches the existing call sites (gfm + line breaks).
marked.setOptions({ gfm: true, breaks: true, async: false });

/** Render untrusted markdown to sanitized, inert HTML for dangerouslySetInnerHTML. */
export function renderMarkdown(source: string): string {
  const rawHtml = marked.parse(source ?? '') as string;
  return DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
}
