/**
 * Detection strategy checklist (all branches covered):
 *   chapter-pattern: bare "Chapter N" ✓  bold "**Chapter One**" ✓  word numbers ✓
 *   sections: Prologue/Epilogue (capitalized) ✓  subtitles via italic line ✓
 *   Part pattern ✓  false-positive prose line starting "Chapter N …" ✓ (limitation)
 *   heading strategy (≥3 #/## when <3 chapter matches) ✓  incl. title-page heading FP ✓
 *   fallback single chapter (ambiguous) ✓  empty input ✓  CRLF ✓
 *   ambiguity: uneven sizes (>5×) ✓  fallback always-ambiguous ✓
 *   detectTitle ✓  detectAuthor (by / Author: / italic) ✓
 */
import { describe, expect, it } from 'vitest';
import { detectAuthor, detectChapters, detectTitle } from './ChapterDetector';
import {
  BOLD_WORD_CHAPTERS,
  HEADING_CHAPTERS,
  NO_CHAPTERS,
  NUMBERED_CHAPTERS,
} from '../../test/fixtures/manuscripts';

describe('chapter-pattern strategy', () => {
  it('splits bare Chapter N manuscripts with prologue/epilogue, dropping leading front matter', () => {
    const { chapters, ambiguous } = detectChapters(NUMBERED_CHAPTERS);

    expect(chapters.map((c) => c.title)).toEqual([
      'Prologue',
      'Chapter 1',
      'Chapter 2',
      'Chapter 3',
      'Epilogue',
    ]);
    expect(ambiguous).toBe(false);

    // Content spans from each split to the next; title/byline before the first split is dropped
    expect(chapters[0].content).toContain('cold wind');
    expect(chapters.every((c) => !c.content.includes('by Jane Author'))).toBe(true);
    expect(chapters[1].content).toContain('first chapter prose');
    expect(chapters[1].content).not.toContain('second chapter');
    expect(chapters[4].endLine).toBe(NUMBERED_CHAPTERS.split('\n').length);
    expect(chapters.map((c) => c.index)).toEqual([0, 1, 2, 3, 4]);
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
    expect(chapters.length).toBe(5);
    expect(chapters[1].title).toBe('Chapter 1');
  });

  it('LIMITATION: prose lines beginning with "Chapter N" are false-positive splits', () => {
    const text = [
      'Chapter 1',
      'Opening prose.',
      'Chapter 3 was her favorite of all the rooms in the house.',
      '',
      'Chapter 2',
      'More prose.',
    ].join('\n');

    const { chapters } = detectChapters(text);

    // The mid-prose sentence becomes its own split — recorded as a detector limitation
    expect(chapters.map((c) => c.title)).toEqual([
      'Chapter 1',
      'Chapter 3 was her favorite of all the rooms in the house.',
      'Chapter 2',
    ]);
  });
});

describe('heading strategy + fallback', () => {
  it('uses #/## headings (unicode-safe) when chapter patterns are scarce', () => {
    const { chapters, ambiguous } = detectChapters(HEADING_CHAPTERS);

    // NOTE: the title-page "# Étoiles Mortes" heading is counted as a chapter
    // too — a known false positive of the heading strategy.
    expect(chapters.map((c) => c.title)).toEqual(['Étoiles Mortes', 'La Chute', 'Der Aufstieg', '帰還']);
    expect(ambiguous).toBe(false);
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
