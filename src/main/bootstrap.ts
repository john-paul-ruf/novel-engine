import { mkdir, readdir, copyFile, writeFile, access, rename } from 'node:fs/promises';
import path from 'node:path';
import { constants as fsConstants } from 'node:fs';

const INITIALIZED_FLAG = '.initialized';

const AUTHOR_PROFILE_TEMPLATE = `# Author Profile

Describe your writing voice, themes, genres, and style here.
This is loaded by Spark and Quill to understand your creative DNA.
`;

/**
 * Check whether the first-run bootstrap has already completed.
 * Returns `true` if the `.initialized` flag file does NOT exist.
 */
export async function needsBootstrap(userDataPath: string): Promise<boolean> {
  try {
    await access(path.join(userDataPath, INITIALIZED_FLAG), fsConstants.F_OK);
    return false;
  } catch {
    // ENOENT — flag file doesn't exist, bootstrap needed
    return true;
  }
}

/**
 * Copy any missing agent `.md` files from `agentsSourceDir` into the user's
 * `custom-agents/` directory. Runs on every startup — idempotent and
 * non-destructive (COPYFILE_EXCL ensures user customisations are never
 * overwritten).
 *
 * This is intentionally separate from the one-time bootstrap so that users
 * who ran the app before the source directory was properly populated can
 * recover automatically without manual intervention.
 */
export async function ensureAgents(agentsDir: string, agentsSourceDir: string): Promise<void> {
  // Ensure the destination directory exists (idempotent).
  await mkdir(agentsDir, { recursive: true });

  // One-time rename migration: standardize agent filenames to UPPER-CASE.md
  const AGENT_RENAMES: [string, string][] = [
    ['FORGE.MD', 'FORGE.md'],
    ['Quill.md', 'QUILL.md'],
  ];
  for (const [oldName, newName] of AGENT_RENAMES) {
    const oldPath = path.join(agentsDir, oldName);
    const newPath = path.join(agentsDir, newName);
    try {
      await access(oldPath, fsConstants.F_OK);
      // Old file exists — check if new file already exists
      try {
        await access(newPath, fsConstants.F_OK);
        // Both exist — leave it alone (user may have both from a partial migration)
      } catch {
        // New file doesn't exist — rename
        await rename(oldPath, newPath);
      }
    } catch {
      // Old file doesn't exist — nothing to migrate
    }
  }

  let entries: string[];
  try {
    entries = await readdir(agentsSourceDir);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('[bootstrap] Agent source directory not found:', agentsSourceDir);
      return;
    }
    throw err;
  }

  /** Files to skip during agent restoration — legacy files that should not be copied. */
  const SKIP_FILES = new Set(['VERITY-LEGACY.md']);

  const mdFiles = entries.filter((f) => (f.endsWith('.md') || f.endsWith('.MD')) && !SKIP_FILES.has(f));

  await Promise.all(
    mdFiles.map(async (filename) => {
      const src = path.join(agentsSourceDir, filename);
      const dest = path.join(agentsDir, filename);
      try {
        // COPYFILE_EXCL: silently skip files the user already has (preserves customisations).
        await copyFile(src, dest, fsConstants.COPYFILE_EXCL);
      } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EEXIST') {
          return; // User already has this file — leave it alone.
        }
        throw err;
      }
    }),
  );
}

/**
 * Perform first-run initialization:
 *
 * 1. Create `books/` and `custom-agents/` directories.
 * 2. Copy bundled agent `.md` files into `custom-agents/` via `ensureAgents`.
 * 3. Create a template `author-profile.md` (skip if already present).
 * 4. Create `active-book.json` pointing to no book (skip if already present).
 * 5. Write the `.initialized` flag with the current ISO timestamp.
 *
 * `agentsSourceDir` — the directory containing the bundled agent `.md` files.
 * In production this is `process.resourcesPath/agents`; in dev it is
 * `{projectRoot}/agents` (the directory tracked in source control).
 */
export async function bootstrap(userDataPath: string, agentsSourceDir: string): Promise<void> {
  const booksDir = path.join(userDataPath, 'books');
  const agentsDir = path.join(userDataPath, 'custom-agents');

  // 1. Create directories (recursive — idempotent).
  await mkdir(booksDir, { recursive: true });

  // 2. Copy bundled agent .md files (shared logic with the recovery path).
  await ensureAgents(agentsDir, agentsSourceDir);

  // 3. Create author-profile.md template (if not already present).
  const authorProfilePath = path.join(userDataPath, 'author-profile.md');
  await writeFileIfMissing(authorProfilePath, AUTHOR_PROFILE_TEMPLATE);

  // 4. Create active-book.json pointing to no book (if not already present).
  const activeBookPath = path.join(userDataPath, 'active-book.json');
  await writeFileIfMissing(activeBookPath, JSON.stringify({ book: '' }, null, 2) + '\n');

  // 5. Write the initialization flag.
  const flagPath = path.join(userDataPath, INITIALIZED_FLAG);
  await writeFile(flagPath, new Date().toISOString(), 'utf-8');
}

/**
 * Write a file only if it doesn't already exist.
 */
async function writeFileIfMissing(filePath: string, content: string): Promise<void> {
  try {
    await access(filePath, fsConstants.F_OK);
    // File exists — leave it alone.
  } catch {
    await writeFile(filePath, content, 'utf-8');
  }
}
