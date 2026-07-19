/** Fixture manuscripts for ChapterDetector / import pipeline tests. */

/** Bare "Chapter N" style with front matter, prologue, and epilogue. */
export const NUMBERED_CHAPTERS = [
  'The Hollow Crown',
  'by Jane Author',
  '',
  'Prologue',
  'A cold wind rose over the battlements before the story began.',
  '',
  'Chapter 1',
  'The first chapter prose sits here with enough words to count.',
  '',
  'Chapter 2',
  'The second chapter continues the tale in earnest fashion.',
  '',
  'Chapter 3',
  'The third chapter concludes this fixture manuscript neatly.',
  '',
  'Epilogue',
  'And so it ended.',
].join('\n');

/** Bold-wrapped word-number chapters with italic subtitles. */
export const BOLD_WORD_CHAPTERS = [
  '**PROLOGUE**',
  '',
  '*Before the Storm*',
  'Prologue prose.',
  '',
  '**Chapter One**',
  '',
  '*The Fall*',
  'The first bold chapter begins here.',
  '',
  '**Chapter Two**',
  '',
  'The second bold chapter has no subtitle line.',
  '',
  '**Chapter Three**',
  '',
  '*The Return*',
  'The third bold chapter closes the fixture.',
].join('\n');

/** Markdown-heading style (## per chapter) with a # title heading up top. */
export const HEADING_CHAPTERS = [
  '# Étoiles Mortes',
  '',
  'Author: Aya Grün',
  '',
  '## La Chute',
  'First heading chapter prose.',
  '',
  '## Der Aufstieg',
  'Second heading chapter prose.',
  '',
  '## 帰還',
  'Third heading chapter prose.',
].join('\n');

/** Plain prose — nothing that looks like a chapter boundary. */
export const NO_CHAPTERS = [
  'It was a dark and stormy night; the rain fell in torrents.',
  '',
  'The prose continued without any structural markers at all.',
].join('\n');
