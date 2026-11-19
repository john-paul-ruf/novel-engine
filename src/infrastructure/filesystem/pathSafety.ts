import * as path from 'node:path';

/** Resolve `relativePath` under <booksDir>/<slug>, rejecting any escape. */
export function resolveWithinBook(booksDir: string, slug: string, relativePath: string): string {
  const bookRoot = path.resolve(booksDir, slug);
  const resolved = path.resolve(bookRoot, relativePath);
  const rel = path.relative(bookRoot, resolved);
  if (rel === '') return resolved; // the book root itself
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes book directory: ${relativePath}`);
  }
  return resolved;
}
