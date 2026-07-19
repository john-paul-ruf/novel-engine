/**
 * Detection strategy checklist (all branches covered):
 *   chapter-pattern: bare "Chapter N" ✓  bold "**Chapter One**" ✓  word numbers ✓
 *     standalone-heading guard rejects prose-embedded mentions ✓
 *   sections: Prologue/Epilogue (capitalized) ✓  subtitles via italic line ✓
 *   Part pattern ✓  false-positive prose line rejected ✓ (Decision 1)
 *   heading strategy: H1-title-page skipped when H2s present ✓  H1-only keeps all H1s ✓ (Decision 2)
 *   front matter: captured as index -1 pseudo-chapter when first split > line 0 ✓ (Decision 3)
 *     excluded from ambiguity math ✓  no empty Front Matter when first split at line 0 ✓
 *   fallback single chapter (ambiguous) ✓  empty input ✓  CRLF ✓
 *   ambiguity: uneven sizes (>5×) ✓  fallback always-ambiguous ✓
 *   detectTitle ✓  detectAuthor (by / Author: / italic) ✓
 */
import { describe, expect, it } from 'vitest';
import { detectAuthor, detectChapters, detectTitle } from './ChapterDetector';
import {
  BOLD_WORD_CHAPTERS,
  HEADING_CHAPTERS,
  H1_ONLY_CHAPTERS,
  MID_PROSE_FALSE_POSITIVE,
  NO_CHAPTERS,
  NUMBERED_CHAPTERS,
} from '../../test/fixtures/manuscripts';

describe('chapter-pattern strategy', () => {
  it('splits bare Chapter N manuscripts with prologue/epilogue, capturing leading front matter', () => {
    const { chapters, ambiguous } = detectChapters(NUMBERED_CHAPTERS);

    expect(chapters.map((c) => c.title)).toEqual([
      'Front Matter',
      'Prologue',
      'Chapter 1',
      'Chapter 2',
      'Chapter 3',
      'Epilogue',
    ]);
    expect(ambiguous).toBe(false);

    expect(chapters[0].index).toBe(-1);
    expect(chapters[0].title).toBe('Front Matter');
    expect(chapters[0].content).toContain('by Jane Author');
    expect(chapters.slice(1).map((c) => c.index)).toEqual([0, 1, 2, 3, 4]);
    expect(chapters[1].content).toContain('cold wind');
    expect(chapters[1].content).not.toContain('by Jane Author');
    expect(chapters[2].content).toContain('first chapter prose');
    expect(chapters[2].content).not.toContain('second chapter');
    expect(chapters[5].endLine).toBe(NUMBERED_CHAPTERS.split('\n').length);
  });

  it('strips bold wrappers, capitalizes sections, and attaches italic subtitles', () => {
    const { chapters } = detectChapters(BOLD_WORD_CHAPTERS);

    expect(chapters.map((c) => c.title)).toEqual([
      'Prologue — Before the Storm',
      'Chapter One — The Fall',
      'Chapter Two',
      'Chapter Three — The Return',
    ]);
  });

  it('treats Part headings as splits alongside chapters', () => {
    const text = ['Part I', 'p', '', 'Chapter 1', 'p', '', 'Chapter 2', 'p'].join('\n');
    const { chapters } = detectChapters(text);
    expect(chapters.map((c) => c.title)).toEqual(['Part I', 'Chapter 1', 'Chapter 2']);
  });

  it('handles CRLF line endings', () => {
    const crlf = NUMBERED_CHAPTERS.replace(/\n/g, '\r\n');
    const { chapters } = detectChapters(crlf);
    expect(chapters.length).toBe(6);
    expect(chapters[0].title).toBe('Front Matter');
    expect(chapters[2].title).toBe('Chapter 1');
  });

  it('rejects mid-prose lines beginning with "Chapter N" (standalone-heading guard)', () => {
    const { chapters } = detectChapters(MID_PROSE_FALSE_POSITIVE);

    expect(chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
    expect(chapters[0].index).toBe(0);
    expect(chapters[0].content).toContain('Chapter 3 was her favorite');
  });
});

describe('heading strategy + fallback', () => {
  it('uses #/## headings (unicode-safe) when chapter patterns are scarce, skipping a title-page H1 when H2s follow', () => {
    const { chapters, ambiguous } = detectChapters(HEADING_CHAPTERS);

    expect(chapters.map((c) => c.title)).toEqual([
      'Front Matter',
      'La Chute',
      'Der Aufstieg',
      '帰還',
    ]);
    expect(chapters[0].index).toBe(-1);
    expect(chapters[0].content).toContain('# Étoiles Mortes');
    expect(ambiguous).toBe(false);
  });

  it('H1-only manuscripts (no H2) keep every H1 as a split — title-page rule does not fire', () => {
    const { chapters, ambiguous } = detectChapters(H1_ONLY_CHAPTERS);
    expect(chapters.map((c) => c.title)).toEqual(['Book One', 'Book Two', 'Book Three']);
    expect(chapters[0].index).toBe(0);
    expect(ambiguous).toBe(false);
  });

  it('does not emit an empty Front Matter entry when the first line is a chapter heading', () => {
    const text = [
      'Chapter 1',
      'First prose.',
      '',
      'Chapter 2',
      'Second prose.',
      '',
      'Chapter 3',
      'Third prose.',
    ].join('\n');
    const { chapters } = detectChapters(text);
    expect(chapters[0].title).toBe('Chapter 1');
    expect(chapters[0].index).toBe(0);
    expect(chapters).toHaveLength(3);
    expect(chapters.every((c) => c.index >= 0)).toBe(true);
  });

  it('falls back to a single ambiguous chapter for unstructured prose and empty input', () => {
    const prose = detectChapters(NO_CHAPTERS);
    expect(prose.chapters).toEqual([
      expect.objectContaining({ index: 0, title: 'Chapter 1', startLine: 0 }),
    ]);
    expect(prose.ambiguous).toBe(true);
    expect(prose.chapters[0].content).toBe(NO_CHAPTERS);

    const empty = detectChapters('');
    expect(empty.chapters[0].wordCount).toBe(0);
    expect(empty.ambiguous).toBe(true);
  });

  it('flags wildly uneven chapter sizes as ambiguous', () => {
    const text = [
      'Chapter 1',
      'tiny',
      'Chapter 2',
      'word '.repeat(200).trim(),
      'Chapter 3',
      'also tiny',
    ].join('\n');

    expect(detectChapters(text).ambiguous).toBe(true);
  });
});

describe('title + author detection', () => {
  it('detectTitle takes the first # heading, empty otherwise', () => {
    expect(detectTitle(HEADING_CHAPTERS)).toBe('Étoiles Mortes');
    expect(detectTitle(NO_CHAPTERS)).toBe('');
  });

  it('detectAuthor tries by-lines, Author: lines, then top italic names', () => {
    expect(detectAuthor(NUMBERED_CHAPTERS)).toBe('Jane Author');
    expect(detectAuthor(HEADING_CHAPTERS)).toBe('Aya Grün');
    expect(detectAuthor('# Title\n\n*Marta K. Vale*\n\nprose')).toBe('Marta K. Vale');
    expect(detectAuthor(NO_CHAPTERS)).toBe('');
  });
});