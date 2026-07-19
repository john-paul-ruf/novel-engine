import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VersionService } from './VersionService';
import { makeDb } from '../test/db';
import { makeFakeFs, type FakeFileSystem } from '../test/fakes';

let db: ReturnType<typeof makeDb>;
let fs: FakeFileSystem;
let service: VersionService;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  db = makeDb();
  fs = makeFakeFs({ 'chapters/02-two/draft.md': 'line one\nline two\nline three' }, { bookSlug: 'book' });
  service = new VersionService(db, fs);
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

describe('snapshots', () => {
  it('snapshots versionable content, deduplicating identical states', async () => {
    const first = await service.snapshotContent('book', 'source/pitch.md', 'v1 content', 'agent');
    expect(first).toMatchObject({ source: 'agent', filePath: 'source/pitch.md' });

    // Identical content → dedup
    expect(await service.snapshotContent('book', 'source/pitch.md', 'v1 content', 'user')).toBeNull();

    // Changed content → new version
    const second = await service.snapshotContent('book', 'source/pitch.md', 'v2 content', 'user');
    expect(second?.source).toBe('user');
    expect(await service.getVersionCount('book', 'source/pitch.md')).toBe(2);
  });

  it('ignores non-versionable extensions and missing files', async () => {
    expect(await service.snapshotContent('book', 'assets/cover.png', 'bytes', 'user')).toBeNull();
    expect(await service.snapshotFile('book', 'source/ghost.md', 'user')).toBeNull();

    const fromDisk = await service.snapshotFile('book', 'chapters/02-two/draft.md', 'agent');
    expect(fromDisk?.content).toBe('line one\nline two\nline three');
  });
});

describe('diffs', () => {
  it('computes structured hunks with add/remove/context lines and totals', async () => {
    const v1 = await service.snapshotContent('book', 'a.md', 'alpha\nbeta\ngamma', 'agent');
    const v2 = await service.snapshotContent('book', 'a.md', 'alpha\nBETA!\ngamma\ndelta', 'user');

    const diff = await service.getDiff(v1!.id, v2!.id);

    // 'gamma' is rewritten too: the old content ends without a trailing newline,
    // so the diff lib reports it as -gamma/+gamma alongside beta→BETA! and +delta.
    expect(diff.totalAdditions).toBe(3);
    expect(diff.totalDeletions).toBe(2);
    expect(diff.oldVersion?.id).toBe(v1!.id);
    expect(diff.newVersion.id).toBe(v2!.id);

    const lines = diff.hunks[0].lines;
    expect(lines.find((l) => l.type === 'remove')).toMatchObject({ content: 'beta', oldLineNumber: 2 });
    expect(lines.find((l) => l.content === 'BETA!')?.type).toBe('add');
    expect(lines.find((l) => l.content === 'alpha')).toMatchObject({ type: 'context', oldLineNumber: 1, newLineNumber: 1 });
  });

  it('diffs against nothing when oldVersionId is null and rejects unknown versions', async () => {
    const v1 = await service.snapshotContent('book', 'a.md', 'one\ntwo', 'agent');

    const diff = await service.getDiff(null, v1!.id);
    expect(diff.oldVersion).toBeNull();
    expect(diff.totalAdditions).toBe(2);
    expect(diff.totalDeletions).toBe(0);

    await expect(service.getDiff(null, 9999)).rejects.toThrow(/Version 9999 not found/);
    await expect(service.getDiff(9999, v1!.id)).rejects.toThrow(/Version 9999 not found/);
  });
});

describe('revertToVersion', () => {
  it('writes the historical content back and records a revert snapshot even without changes', async () => {
    const v1 = await service.snapshotContent('book', 'chapters/02-two/draft.md', 'original prose', 'agent');
    await service.snapshotContent('book', 'chapters/02-two/draft.md', 'rewritten prose', 'user');

    const reverted = await service.revertToVersion('book', 'chapters/02-two/draft.md', v1!.id);

    expect(fs.files.get('book/chapters/02-two/draft.md')).toBe('original prose');
    expect(reverted.source).toBe('revert');
    expect(reverted.content).toBe('original prose');
    expect(await service.getVersionCount('book', 'chapters/02-two/draft.md')).toBe(3);

    // A version can be restored even after the live file was deleted
    fs.files.delete('book/chapters/02-two/draft.md');
    await service.revertToVersion('book', 'chapters/02-two/draft.md', v1!.id);
    expect(fs.files.get('book/chapters/02-two/draft.md')).toBe('original prose');
  });

  it('validates ownership and existence', async () => {
    const v1 = await service.snapshotContent('book', 'a.md', 'content', 'agent');
    await expect(service.revertToVersion('book', 'b.md', v1!.id)).rejects.toThrow(/does not belong to/);
    await expect(service.revertToVersion('book', 'a.md', 424242)).rejects.toThrow(/not found/);
  });
});

describe('author edit tracking', () => {
  it('reports user edits relative to the latest agent baseline with a -1 sentinel id', async () => {
    // No baseline yet
    expect(await service.getUserEditsSinceAgentBaseline('book', 'chapters/02-two/draft.md')).toBeNull();

    await service.snapshotContent('book', 'chapters/02-two/draft.md', 'line one\nline two\nline three', 'agent');
    // Disk matches baseline → null
    expect(await service.getUserEditsSinceAgentBaseline('book', 'chapters/02-two/draft.md')).toBeNull();

    // Author edits the file on disk
    fs.files.set('book/chapters/02-two/draft.md', 'line one\nline 2 EDITED\nline three');
    const diff = await service.getUserEditsSinceAgentBaseline('book', 'chapters/02-two/draft.md');

    expect(diff?.newVersion.id).toBe(-1);
    expect(diff?.totalAdditions).toBe(1);
    expect(diff?.totalDeletions).toBe(1);

    // Deleted file → null
    fs.files.delete('book/chapters/02-two/draft.md');
    expect(await service.getUserEditsSinceAgentBaseline('book', 'chapters/02-two/draft.md')).toBeNull();
  });

  it('summarizes body-chapter edit statuses (front matter excluded)', async () => {
    fs.files.set('book/chapters/00-0-copyright/draft.md', 'legal');
    await service.snapshotContent('book', 'chapters/02-two/draft.md', 'line one\nline two\nline three', 'agent');
    fs.files.set('book/chapters/02-two/draft.md', 'line one\nEDIT\nline three');

    const statuses = await service.getChapterEditStatuses('book');

    expect(statuses).toEqual([
      expect.objectContaining({
        chapterSlug: '02-two',
        hasUserEdits: true,
        addedLines: 1,
        removedLines: 1,
      }),
    ]);
  });

  it('builds the author-edits prompt section with unified diffs, or null when clean', async () => {
    expect(await service.buildAuthorEditsSection('book')).toBeNull(); // no baseline → no edits

    await service.snapshotContent('book', 'chapters/02-two/draft.md', 'line one\nline two\nline three', 'agent');
    fs.files.set('book/chapters/02-two/draft.md', 'line one\nAUTHOR CHANGE\nline three');

    const section = await service.buildAuthorEditsSection('book');
    expect(section).toContain('## Author Edits Since Your Last Draft');
    expect(section).toContain('### `chapters/02-two/draft.md` (+1 / -1 lines)');
    expect(section).toContain('```diff');
    expect(section).toContain('-line two');
    expect(section).toContain('+AUTHOR CHANGE');
  });

  it('truncates very large diffs with a continuation note', async () => {
    const baseline = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const edited = Array.from({ length: 200 }, (_, i) => `edited ${i}`).join('\n');
    await service.snapshotContent('book', 'chapters/02-two/draft.md', baseline, 'agent');
    fs.files.set('book/chapters/02-two/draft.md', edited);

    const section = await service.buildAuthorEditsSection('book');
    expect(section).toContain('more edited lines — read the file for the full text');
  });
});

describe('pruning', () => {
  it('prunes every versioned path down to the keep count', async () => {
    for (let i = 0; i < 5; i++) {
      await service.snapshotContent('book', 'a.md', `a v${i}`, 'user');
      await service.snapshotContent('book', 'b.md', `b v${i}`, 'user');
    }

    const deleted = await service.pruneVersions('book', 2);

    expect(deleted).toBe(6);
    expect(await service.getVersionCount('book', 'a.md')).toBe(2);
    expect(await service.getVersionCount('book', 'b.md')).toBe(2);
    expect((await service.getHistory('book', 'a.md')).map((v) => v.id).length).toBe(2);
  });
});
