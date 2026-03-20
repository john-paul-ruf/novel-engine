import { mkdir, readdir, copyFile, writeFile, access } from 'node:fs/promises';
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
    return true;
  }
}

/**
 * Perform first-run initialization:
 *
 * 1. Create `books/` and `custom-agents/` directories.
 * 2. Copy bundled agent `.md` files into `custom-agents/` (skip if already present).
 * 3. Create a template `author-profile.md` (skip if already present).
 * 4. Create `active-book.json` pointing to no book (skip if already present).
 * 5. Write the `.initialized` flag with the current ISO timestamp.
 */
export async function bootstrap(userDataPath: string, resourcesPath: string): Promise<void> {
  const booksDir = path.join(userDataPath, 'books');
  const agentsDir = path.join(userDataPath, 'custom-agents');

  // 1. Create directories (recursive — idempotent)
  await mkdir(booksDir, { recursive: true });
  await mkdir(agentsDir, { recursive: true });

  // 2. Copy bundled agent .md files (don't overwrite user customizations)
  const bundledAgentsDir = path.join(resourcesPath, 'agents');
  try {
    const entries = await readdir(bundledAgentsDir);
    const mdFiles = entries.filter((f) => f.endsWith('.md') || f.endsWith('.MD'));

    await Promise.all(
      mdFiles.map(async (filename) => {
        const src = path.join(bundledAgentsDir, filename);
        const dest = path.join(agentsDir, filename);
        try {
          // COPYFILE_EXCL: fail if destination already exists
          await copyFile(src, dest, fsConstants.COPYFILE_EXCL);
        } catch (err: unknown) {
          // EEXIST means the user already has this file — skip silently
          if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EEXIST') {
            return;
          }
          throw err;
        }
      }),
    );
  } catch (err: unknown) {
    // If the bundled agents directory doesn't exist (e.g., dev mode without agents/),
    // log a warning but don't fail bootstrap — the app can still function.
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('[bootstrap] Bundled agents directory not found:', bundledAgentsDir);
    } else {
      throw err;
    }
  }

  // 3. Create author-profile.md template (if not already present)
  const authorProfilePath = path.join(userDataPath, 'author-profile.md');
  await writeFileIfMissing(authorProfilePath, AUTHOR_PROFILE_TEMPLATE);

  // 4. Create active-book.json pointing to no book (if not already present)
  const activeBookPath = path.join(userDataPath, 'active-book.json');
  await writeFileIfMissing(activeBookPath, JSON.stringify({ book: '' }, null, 2) + '\n');

  // 5. Write the initialization flag
  const flagPath = path.join(userDataPath, INITIALIZED_FLAG);
  await writeFile(flagPath, new Date().toISOString(), 'utf-8');
}

/**
 * Write a file only if it doesn't already exist.
 */
async function writeFileIfMissing(filePath: string, content: string): Promise<void> {
  try {
    await access(filePath, fsConstants.F_OK);
    // File exists — leave it alone
  } catch {
    await writeFile(filePath, content, 'utf-8');
  }
}
