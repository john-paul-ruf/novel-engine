import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PITCH_ROOM_SLUG } from '@domain/constants';
import { makeLibrary, type Library } from '../../test/bookFixtures';
import { cleanupTempDirs, makeTempDir } from '../../test/tempDir';

let lib: Library;

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  lib = await makeLibrary(await makeTempDir());
});

afterEach(async () => {
  await cleanupTempDirs();
  vi.restoreAllMocks();
});

const PITCH = '# The Hollow Crown\n\nA usurper inherits a haunted throne.\n\nMore detail.';

async function makeDraft(conversationId: string, content: string | null, location: 'source' | 'root' = 'source'): Promise<void> {
  const draftDir = path.join(lib.booksDir, PITCH_ROOM_SLUG, 'drafts', conversationId);
  await mkdir(path.join(draftDir, 'source'), { recursive: true });
  if (content !== null) {
    const target =
      location === 'source' ? path.join(draftDir, 'source', 'pitch.md') : path.join(draftDir, 'pitch.md');
    await writeFile(target, content, 'utf-8');
  }
}

describe('shelved pitches', () => {
  it('shelvePitch writes front-mattered markdown to _pitches and extracts the logline', async () => {
    await lib.service.createBook('The Hollow Crown');
    await lib.service.writeFile('the-hollow-crown', 'source/pitch.md', PITCH);

    const meta = await lib.service.shelvePitch('the-hollow-crown');

    expect(meta).toMatchObject({
      slug: 'the-hollow-crown',
      title: 'The Hollow Crown',
      logline: 'A usurper inherits a haunted throne.',
      shelvedFrom: 'the-hollow-crown',
    });

    const raw = await readFile(path.join(lib.booksDir, '_pitches', 'the-hollow-crown.md'), 'utf-8');
    expect(raw.startsWith('---\n')).toBe(true);
    expect(raw).toContain('title: The Hollow Crown');
    expect(raw).toContain(PITCH);
  });

  it('shelvePitch rejects books with a missing or empty pitch', async () => {
    await lib.service.createBook('No Pitch');
    await expect(lib.service.shelvePitch('no-pitch')).rejects.toThrow(/File not found/);

    await lib.service.writeFile('no-pitch', 'source/pitch.md', '   \n');
    await expect(lib.service.shelvePitch('no-pitch')).rejects.toThrow(/has no pitch to shelve/);
  });

  it('listShelvedPitches returns front-matter metadata newest-first', async () => {
    const pitchesDir = path.join(lib.booksDir, '_pitches');
    await mkdir(pitchesDir, { recursive: true });
    await writeFile(
      path.join(pitchesDir, 'older.md'),
      '---\ntitle: Older\nshelvedAt: 2026-01-01T00:00:00.000Z\nshelvedFrom: a\nlogline: old idea\n---\n\n# Older',
      'utf-8'
    );
    await writeFile(
      path.join(pitchesDir, 'newer.md'),
      '---\ntitle: Newer\nshelvedAt: 2026-06-01T00:00:00.000Z\nshelvedFrom: b\nlogline: new idea\n---\n\n# Newer',
      'utf-8'
    );
    await writeFile(path.join(pitchesDir, 'notes.txt'), 'ignored', 'utf-8');

    const pitches = await lib.service.listShelvedPitches();
    expect(pitches.map((p) => p.title)).toEqual(['Newer', 'Older']);
    expect(pitches[0].logline).toBe('new idea');
  });

  it('readShelvedPitch strips front matter; missing pitches throw; delete is idempotent', async () => {
    const pitchesDir = path.join(lib.booksDir, '_pitches');
    await mkdir(pitchesDir, { recursive: true });
    await writeFile(
      path.join(pitchesDir, 'idea.md'),
      '---\ntitle: Idea\nshelvedAt: 2026-01-01T00:00:00.000Z\nshelvedFrom: \nlogline: line\n---\n\n# Idea\n\nBody.',
      'utf-8'
    );

    const pitch = await lib.service.readShelvedPitch('idea');
    expect(pitch.content).toBe('# Idea\n\nBody.');
    expect(pitch.title).toBe('Idea');

    await expect(lib.service.readShelvedPitch('ghost')).rejects.toThrow(/not found/);

    await lib.service.deleteShelvedPitch('idea');
    await expect(lib.service.deleteShelvedPitch('idea')).resolves.toBeUndefined();
    expect(await lib.service.listShelvedPitches()).toEqual([]);
  });

  it('restorePitch creates a book from the pitch and removes it from the shelf', async () => {
    await lib.service.createBook('Restore Me');
    await lib.service.writeFile('restore-me', 'source/pitch.md', PITCH);
    await lib.service.shelvePitch('restore-me');
    await lib.service.archiveBook('restore-me'); // make room for re-creation

    const meta = await lib.service.restorePitch('restore-me');

    expect(meta.title).toBe('Restore Me');
    expect(await lib.service.readFile(meta.slug, 'source/pitch.md')).toContain('haunted throne');
    expect(await lib.service.listShelvedPitches()).toEqual([]);
  });
});

describe('pitch room drafts', () => {
  it('getPitchDraftPath resolves under the reserved pitch-room slug', () => {
    expect(lib.service.getPitchDraftPath('conv-1')).toBe(
      path.join(lib.booksDir, PITCH_ROOM_SLUG, 'drafts', 'conv-1')
    );
  });

  it('listPitchDrafts extracts titles from pitch headings and flags empty drafts', async () => {
    await makeDraft('with-pitch', PITCH);
    await makeDraft('empty-draft', null);

    const drafts = await lib.service.listPitchDrafts();
    const bySlug = Object.fromEntries(drafts.map((d) => [d.conversationId, d]));

    expect(bySlug['with-pitch']).toMatchObject({ title: 'The Hollow Crown', hasPitch: true });
    expect(bySlug['empty-draft']).toMatchObject({ title: 'Untitled Draft', hasPitch: false });
    expect(await lib.service.listPitchDrafts()).toHaveLength(2);
  });

  it('getPitchDraft returns null for unknown conversations', async () => {
    expect(await lib.service.getPitchDraft('nope')).toBeNull();
    await makeDraft('real', PITCH);
    expect((await lib.service.getPitchDraft('real'))?.hasPitch).toBe(true);
  });

  it('readPitchDraftContent falls back to root-level .md files and throws when none exist', async () => {
    await makeDraft('root-writer', PITCH, 'root');
    expect(await lib.service.readPitchDraftContent('root-writer')).toBe(PITCH);

    await makeDraft('no-md', null);
    await expect(lib.service.readPitchDraftContent('no-md')).rejects.toThrow(/No pitch\.md found/);
  });

  it('promotePitchToBook creates the book from the heading title and deletes the draft', async () => {
    await makeDraft('promote-me', PITCH);

    const meta = await lib.service.promotePitchToBook('promote-me');

    expect(meta.title).toBe('The Hollow Crown');
    expect(await lib.service.readFile(meta.slug, 'source/pitch.md')).toBe(PITCH);
    expect(await lib.service.getPitchDraft('promote-me')).toBeNull();
  });

  it('shelvePitchDraft moves the draft onto the pitch shelf and deletes it', async () => {
    await makeDraft('shelve-me', PITCH);

    const meta = await lib.service.shelvePitchDraft('shelve-me');

    expect(meta).toMatchObject({
      slug: 'the-hollow-crown',
      title: 'The Hollow Crown',
      logline: 'A usurper inherits a haunted throne.',
      shelvedFrom: '',
    });
    expect(await lib.service.getPitchDraft('shelve-me')).toBeNull();
    expect((await lib.service.listShelvedPitches())[0].title).toBe('The Hollow Crown');
  });

  it('deletePitchDraft is idempotent', async () => {
    await makeDraft('gone', PITCH);
    await lib.service.deletePitchDraft('gone');
    await expect(lib.service.deletePitchDraft('gone')).resolves.toBeUndefined();
  });
});

describe('author profile + copyright helpers', () => {
  it('getBooksPath and getAuthorProfilePath return the injected roots', () => {
    expect(lib.service.getBooksPath()).toBe(lib.booksDir);
    expect(lib.service.getAuthorProfilePath()).toBe(path.join(lib.userDataDir, 'author-profile.md'));
  });

  it('generateCopyrightContent includes year, title, and author with a fallback', () => {
    const year = String(new Date().getFullYear());
    const withAuthor = lib.service.generateCopyrightContent('My Book', 'Jo');
    expect(withAuthor).toContain(`Copyright © ${year} Jo`);
    expect(withAuthor).toContain('*My Book*');

    const anonymous = lib.service.generateCopyrightContent('My Book', '  ');
    expect(anonymous).toContain('the Author');
  });
});
