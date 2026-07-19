import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IPipelineService } from '@domain/interfaces';
import type { PhaseStatus, PipelinePhase, PipelinePhaseId } from '@domain/types';
import { DashboardService } from './DashboardService';
import { makeConversation, makeDb } from '../test/db';
import { makeFakeFs, type FakeFileSystem } from '../test/fakes';

function phase(id: PipelinePhaseId, status: PhaseStatus): PipelinePhase {
  return { id, label: id, agent: 'Spark', status, description: '' };
}

function makeFakePipeline(phases: PipelinePhase[], active: PipelinePhase | null): IPipelineService {
  return {
    detectPhases: async () => phases,
    getActivePhase: async () => active,
  } as unknown as IPipelineService;
}

const PHASES = [phase('pitch', 'complete'), phase('scaffold', 'complete'), phase('first-draft', 'active')];

let db: ReturnType<typeof makeDb>;
let fs: FakeFileSystem;
let service: DashboardService;

beforeEach(() => {
  db = makeDb();
  fs = makeFakeFs(
    {
      'chapters/00-0-copyright/draft.md': 'legal boilerplate text',
      'chapters/01-first/draft.md': 'one two three four five',
      'chapters/02-second/draft.md': 'six seven eight',
    },
    { bookSlug: 'test-book' }
  );
  service = new DashboardService(db, fs, makeFakePipeline(PHASES, PHASES[2]));
});

afterEach(() => {
  db.close();
});

describe('getDashboardData', () => {
  it('aggregates meta, pipeline progress, word counts, last interaction, and recent files', async () => {
    fs.meta.created = new Date(Date.now() - 10.5 * 24 * 60 * 60 * 1000).toISOString();
    fs.recentFiles = [{ path: 'chapters/01-first/draft.md', modifiedAt: '2026-07-18T00:00:00.000Z', wordCount: 5 }];
    makeConversation(db, { bookSlug: 'other-book', agentName: 'Verity' });
    const conv = makeConversation(db, { bookSlug: 'test-book', agentName: 'Spark' });

    const data = await service.getDashboardData('test-book');

    expect(data.bookSlug).toBe('test-book');
    expect(data.bookTitle).toBe('Test Book');
    expect(data.bookStatus).toBe('first-draft');
    expect(data.pipeline).toEqual({ currentPhase: PHASES[2], completedCount: 2, totalCount: 3 });
    // front matter contributes 0 words but stays in the per-chapter list
    expect(data.wordCount).toEqual({
      current: 8,
      target: null,
      perChapter: [
        { slug: '00-0-copyright', wordCount: 0 },
        { slug: '01-first', wordCount: 5 },
        { slug: '02-second', wordCount: 3 },
      ],
    });
    expect(data.lastInteraction).toEqual({
      agentName: 'Spark',
      timestamp: conv.updatedAt,
      conversationTitle: conv.title,
    });
    expect(data.recentFiles).toEqual(fs.recentFiles);
    expect(data.daysInProgress).toBe(10);
  });

  it('handles a freshly scaffolded book — no chapters, conversations, or tasks', async () => {
    const emptyFs = makeFakeFs({}, { bookSlug: 'empty-book' });
    const emptyService = new DashboardService(db, emptyFs, makeFakePipeline([phase('pitch', 'active')], null));

    const data = await emptyService.getDashboardData('empty-book');

    expect(data.pipeline).toEqual({ currentPhase: null, completedCount: 0, totalCount: 1 });
    expect(data.wordCount).toEqual({ current: 0, target: null, perChapter: [] });
    expect(data.lastInteraction).toBeNull();
    expect(data.revisionTasks).toEqual({ total: 0, completed: 0, items: [] });
    expect(data.recentFiles).toEqual([]);
  });

  it('clamps daysInProgress to 0 for a future created date', async () => {
    fs.meta.created = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect((await service.getDashboardData('test-book')).daysInProgress).toBe(0);
  });
});

describe('revision task parsing', () => {
  it('parses - and * checkbox lines, case-insensitive [x], numbering sequentially', async () => {
    fs.files.set(
      'test-book/source/project-tasks.md',
      [
        '# Tasks',
        '- [x] fix chapter 1 pacing',
        '* [X] tighten dialogue',
        '- [ ] rework ending',
        '  - [ ] indented tasks are ignored',
        'plain prose line',
        '- not a checkbox',
      ].join('\n')
    );

    const { revisionTasks } = await service.getDashboardData('test-book');

    expect(revisionTasks.total).toBe(3);
    expect(revisionTasks.completed).toBe(2);
    expect(revisionTasks.items).toEqual([
      { text: 'fix chapter 1 pacing', isCompleted: true, taskNumber: 1 },
      { text: 'tighten dialogue', isCompleted: true, taskNumber: 2 },
      { text: 'rework ending', isCompleted: false, taskNumber: 3 },
    ]);
  });
});
