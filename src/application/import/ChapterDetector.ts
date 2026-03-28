import type { DetectedChapter } from '@domain/types';

type SplitPoint = {
  lineIndex: number;
  title: string;
};

type DetectionResult = {
  chapters: DetectedChapter[];
  ambiguous: boolean;
};

/**
 * Detect chapter boundaries in a markdown string using pattern matching.
 *
 * Detection strategy (in priority order):
 * 1. "Chapter N" / Prologue / Epilogue / Afterword patterns (bare or bold-wrapped) — if ≥ 3 matches
 * 2. Markdown headings (# or ##) that look like chapter headings — if ≥ 3 found
 * 3. Fallback — entire document as a single chapter
 *
 * Chapter patterns are tried first because they are more specific and
 * avoid false positives from front-matter headings (title, subtitle,
 * table of contents, dedication, etc.).
 */
export function detectChapters(markdown: string): DetectionResult {
  const lines = markdown.split('\n');

  // Try chapter/prologue/afterword patterns first (most specific)
  const chapterSplits = detectByChapterPattern(lines);
  if (chapterSplits.length >= 3) {
    return buildResult(chapterSplits, lines);
  }

  // Try heading-based detection
  const headingSplits = detectByHeadings(lines);
  if (headingSplits.length >= 3) {
    return buildResult(headingSplits, lines);
  }

  // Fallback: entire document as one chapter
  return buildFallbackResult(lines);
}

/**
 * Extract a probable title from the first heading in the markdown.
 */
export function detectTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? '';
}

/**
 * Extract a probable author from common patterns:
 * - "by Author Name"
 * - "Author: Name"
 * - Italic name near the top (*Author Name*)
 */
export function detectAuthor(markdown: string): string {
  const byMatch = markdown.match(/^(?:by|author:?)\s+(.+)$/im);
  if (byMatch?.[1]) return byMatch[1].trim();

  // Look for an italic-only line near the top (within first 20 lines)
  // Common in formatted manuscripts: *Author Name*
  const topLines = markdown.split('\n').slice(0, 20);
  for (const line of topLines) {
    const italicMatch = line.match(/^\*([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z.]+)+)\*$/);
    if (italicMatch) return italicMatch[1].trim();
  }

  return '';
}

// ── Internal helpers ─────────────────────────────────────────────────

const HEADING_PATTERN = /^#{1,2}\s+(.+)$/;

// Matches "Chapter N" patterns — bare or bold-wrapped (**Chapter N**)
const CHAPTER_PATTERN = /^\*{0,2}chapter\s+(\d+|[a-z][a-z]*)\b.*?\*{0,2}$/i;

// Matches Prologue, Epilogue, Afterword, Foreword, Introduction, Preface — bare or bold-wrapped
const SECTION_PATTERN = /^\*{0,2}(prologue|epilogue|afterword|foreword|introduction|preface)\*{0,2}$/i;

// Matches "Part N" patterns — bare or bold-wrapped
const PART_PATTERN = /^\*{0,2}part\s+([IVXLC]+|\d+|[a-z][a-z]*)\b.*?\*{0,2}$/i;

/**
 * Strip bold markers from a chapter title.
 */
function stripBold(text: string): string {
  return text.replace(/^\*{2}/, '').replace(/\*{2}$/, '').trim();
}

/**
 * If the next non-empty line after a chapter heading is italic (*subtitle*),
 * return it as the subtitle.
 */
function findSubtitle(lines: string[], fromIndex: number): string {
  for (let i = fromIndex + 1; i < Math.min(fromIndex + 4, lines.length); i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    const italicMatch = line.match(/^\*([^*]+)\*$/);
    if (italicMatch) return italicMatch[1].trim();
    break; // Non-empty, non-italic line — no subtitle
  }
  return '';
}

function detectByHeadings(lines: string[]): SplitPoint[] {
  const splits: SplitPoint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(HEADING_PATTERN);
    if (match) {
      splits.push({ lineIndex: i, title: match[1].trim() });
    }
  }

  return splits;
}

function detectByChapterPattern(lines: string[]): SplitPoint[] {
  const splits: SplitPoint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    const chapterMatch = line.match(CHAPTER_PATTERN);
    if (chapterMatch) {
      let title = stripBold(line);
      const subtitle = findSubtitle(lines, i);
      if (subtitle) title += ' — ' + subtitle;
      splits.push({ lineIndex: i, title });
      continue;
    }

    const sectionMatch = line.match(SECTION_PATTERN);
    if (sectionMatch) {
      let title = stripBold(line);
      // Capitalize properly: "PROLOGUE" → "Prologue"
      title = title.charAt(0).toUpperCase() + title.slice(1).toLowerCase();
      const subtitle = findSubtitle(lines, i);
      if (subtitle) title += ' — ' + subtitle;
      splits.push({ lineIndex: i, title });
      continue;
    }

    const partMatch = line.match(PART_PATTERN);
    if (partMatch) {
      splits.push({ lineIndex: i, title: stripBold(line) });
    }
  }

  return splits;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function buildResult(splits: SplitPoint[], lines: string[]): DetectionResult {
  const chapters: DetectedChapter[] = [];

  for (let i = 0; i < splits.length; i++) {
    const startLine = splits[i].lineIndex;
    const endLine = i + 1 < splits.length ? splits[i + 1].lineIndex : lines.length;
    const content = lines.slice(startLine, endLine).join('\n');
    const wordCount = countWords(content);

    chapters.push({
      index: i,
      title: splits[i].title,
      startLine,
      endLine,
      wordCount,
      content,
    });
  }

  const ambiguous = detectAmbiguity(chapters, lines);
  return { chapters, ambiguous };
}

function buildFallbackResult(lines: string[]): DetectionResult {
  const content = lines.join('\n');
  const wordCount = countWords(content);

  const chapters: DetectedChapter[] = [
    {
      index: 0,
      title: 'Chapter 1',
      startLine: 0,
      endLine: lines.length,
      wordCount,
      content,
    },
  ];

  // Fallback is always ambiguous
  return { chapters, ambiguous: true };
}

function detectAmbiguity(chapters: DetectedChapter[], lines: string[]): boolean {
  // Few chapters for a long document
  const totalWords = countWords(lines.join('\n'));
  if (chapters.length < 3 && totalWords > 10_000) {
    return true;
  }

  // Wildly uneven chapter sizes
  if (chapters.length >= 2) {
    const wordCounts = chapters.map((c) => c.wordCount).filter((w) => w > 0);
    if (wordCounts.length >= 2) {
      const smallest = Math.min(...wordCounts);
      const largest = Math.max(...wordCounts);
      if (smallest > 0 && largest > 5 * smallest) {
        return true;
      }
    }
  }

  return false;
}
