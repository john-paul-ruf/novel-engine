import * as path from 'node:path';

/** True when `slug` is a single, literal directory name (no path, no traversal). */
function isValidSlug(slug: string): boolean {
  return (
    slug.length > 0 &&
    slug !== '.' &&
    slug !== '..' &&
    !path.isAbsolute(slug) &&
    slug === path.basename(slug) // rejects separators and parent refs
  );
}

/** Resolve `relativePath` under <booksDir>/<slug>, rejecting any escape. */
export function resolveWithinBook(booksDir: string, slug: string, relativePath: string): string {
  // The slug is caller-supplied too: an absolute or `../` slug would escape
  // before relativePath is even considered, so validate it first.
  if (!isValidSlug(slug)) {
    throw new Error(`Invalid book slug: ${slug}`);
  }
  const root = path.resolve(booksDir);
  const bookRoot = path.resolve(root, slug);
  // Defense in depth: the book root must sit directly under booksDir.
  if (bookRoot !== path.join(root, slug) || !(bookRoot + path.sep).startsWith(root + path.sep)) {
    throw new Error(`Invalid book slug: ${slug}`);
  }
  const resolved = path.resolve(bookRoot, relativePath);
  const rel = path.relative(bookRoot, resolved);
  if (rel === '') return resolved; // the book root itself
  // Reject only genuine escapes: `..`, a `../` prefix, or an absolute result.
  // A plain `..startsWith` check wrongly rejects legitimate names like `..notes.md`.
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error(`Path escapes book directory: ${relativePath}`);
  }
  return resolved;
}
