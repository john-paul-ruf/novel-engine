import { beforeEach, describe, expect, it } from 'vitest';
import { PipelineService } from './PipelineService';
import { makeFakeFs, type FakeFileSystem } from '../test/fakes';

const WORDS_60 = 'word '.repeat(60).trim();
const WORDS_250 = 'word '.repeat(250).trim();
const TINY = 'stub content here';

let fs: FakeFileSystem;
let service: PipelineService;

function seed(files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    fs.files.set(`book/${path}`, content);
  }
}

function stateOnDisk(): string[] {
  const raw = fs.files.get('book/pipeline-state.json');
  return raw ? (JSON.parse(raw) as { confirmedPhases: string[] }).confirmedPhases : [];
}

async function statusOf(phaseId: string): Promise<string> {
  const phases = await service.detectPhases('book');
  return phases.find((p) => p.id === phaseId)?.status ?? 'missing';
}

beforeEach(() => {
  fs = makeFakeFs({}, { bookSlug: 'book' });
  service = new PipelineService(fs);
});

describe('detectPhases', () => {
  it('a fresh book starts at pitch=active with all later phases locked, creating the state file', async () => {
    const phases = await service.detectPhases('book');

    expect(phases[0]).toMatchObject({ id: 'pitch', status: 'active' });
    expect(phases.slice(1).every((p) => p.status === 'locked')).toBe(true);
    expect(stateOnDisk()).toEqual([]); // state file auto-created
  });

  it('legacy books auto-confirm every file-complete phase on first run', async () => {
    seed({ 'source/pitch.md': WORDS_60, 'source/scene-outline.md': WORDS_250 });

    const phases = await service.detectPhases('book');

    expect(phases[0].status).toBe('complete'); // pitch
    expect(phases[1].status).toBe('complete'); // scaffold
    expect(phases[2].status).toBe('active'); // first-draft
    expect(stateOnDisk()).toEqual(['pitch', 'scaffold']);
  });

  it('file-complete but unconfirmed phases show pending-completion', async () => {
    seed({ 'pipeline-state.json': JSON.stringify({ confirmedPhases: [] }), 'source/pitch.md': WORDS_60 });

    expect(await statusOf('pitch')).toBe('pending-completion');
    expect(await statusOf('scaffold')).toBe('locked');
  });

  it('placeholder stubs below the word thresholds do not complete phases', async () => {
    seed({
      'pipeline-state.json': JSON.stringify({ confirmedPhases: [] }),
      'source/pitch.md': TINY, // < 50 words
    });
    expect(await statusOf('pitch')).toBe('active');

    seed({ 'source/pitch.md': WORDS_60, 'source/scene-outline.md': WORDS_60 }); // outline < 200
    await service.confirmPhaseAdvancement('book', 'pitch');
    expect(await statusOf('scaffold')).toBe('active');

    seed({ 'source/scene-outline.md': WORDS_250 });
    expect(await statusOf('scaffold')).toBe('pending-completion');
  });

  it('first-draft requires >1000 chapter words AND an advanced book status', async () => {
    seed({
      'pipeline-state.json': JSON.stringify({ confirmedPhases: ['pitch', 'scaffold'] }),
      'source/pitch.md': WORDS_60,
      'source/scene-outline.md': WORDS_250,
      'chapters/02-two/draft.md': 'word '.repeat(1500).trim(),
    });
    fs.meta.status = 'first-draft';
    expect(await statusOf('first-draft')).toBe('active');

    fs.meta.status = 'revision-1';
    expect(await statusOf('first-draft')).toBe('pending-completion');
  });

  it('second-read demands a live report that differs from the v1 archive', async () => {
    const confirmed = ['pitch', 'scaffold', 'first-draft', 'first-read', 'first-assessment', 'revision-plan-1', 'revision'];
    seed({
      'pipeline-state.json': JSON.stringify({ confirmedPhases: confirmed }),
      'source/pitch.md': WORDS_60,
      'source/scene-outline.md': WORDS_250,
      'chapters/02-two/draft.md': 'word '.repeat(1500).trim(),
      'source/reader-report.md': WORDS_60,
      'source/dev-report.md': WORDS_60,
      'source/project-tasks.md': WORDS_60,
      'source/revision-prompts.md': WORDS_60,
      'source/reader-report-v1.md': WORDS_60, // identical word count → not a new read
    });
    fs.meta.status = 'revision-1';

    expect(await statusOf('second-read')).toBe('active');

    seed({ 'source/reader-report.md': WORDS_250 }); // fresh second read
    expect(await statusOf('second-read')).toBe('pending-completion');
  });

  it('getActivePhase returns the attention phase; getAgentForPhase maps agents with build → null', async () => {
    seed({ 'pipeline-state.json': JSON.stringify({ confirmedPhases: [] }), 'source/pitch.md': WORDS_60 });

    expect((await service.getActivePhase('book'))?.id).toBe('pitch');
    expect(service.getAgentForPhase('pitch')).toBe('Spark');
    expect(service.getAgentForPhase('build')).toBeNull();
  });
});

describe('confirmation flow', () => {
  it('confirmPhaseAdvancement promotes the phase and unlocks the next, idempotently', async () => {
    seed({ 'pipeline-state.json': JSON.stringify({ confirmedPhases: [] }), 'source/pitch.md': WORDS_60 });

    await service.confirmPhaseAdvancement('book', 'pitch');
    expect(await statusOf('pitch')).toBe('complete');
    expect(await statusOf('scaffold')).toBe('active');

    await service.confirmPhaseAdvancement('book', 'pitch');
    expect(stateOnDisk()).toEqual(['pitch']); // no duplicates
  });

  it('markPhaseComplete writes a stub that passes every threshold and auto-confirms', async () => {
    seed({ 'pipeline-state.json': JSON.stringify({ confirmedPhases: [] }) });

    await service.markPhaseComplete('book', 'pitch');

    expect(await statusOf('pitch')).toBe('complete');
    const stub = fs.files.get('book/source/pitch.md') ?? '';
    expect(stub).toContain('Manual Advancement Notice');
    expect(stub.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(200);

    // Existing content is never replaced by the stub
    seed({ 'source/scene-outline.md': 'authored outline content' });
    await service.markPhaseComplete('book', 'scaffold');
    expect(fs.files.get('book/source/scene-outline.md')).toBe('authored outline content');
  });

  it('markPhaseComplete advances status-based phases via book meta', async () => {
    await service.markPhaseComplete('book', 'first-draft');
    expect(fs.meta.status).toBe('revision-1');

    await service.markPhaseComplete('book', 'mechanical-fixes');
    expect(fs.meta.status).toBe('final');
    expect(stateOnDisk()).toEqual(expect.arrayContaining(['first-draft', 'mechanical-fixes']));
  });

  it('completeRevision archives the reports to v1 and confirms the revision phase', async () => {
    seed({
      'source/reader-report.md': 'reader findings',
      'source/dev-report.md': 'dev findings',
    });

    await service.completeRevision('book');

    expect(fs.files.get('book/source/reader-report-v1.md')).toBe('reader findings');
    expect(fs.files.get('book/source/dev-report-v1.md')).toBe('dev findings');
    expect(stateOnDisk()).toContain('revision');
  });
});

describe('revertPhase', () => {
  it('drops confirmation for the phase and everything after it', async () => {
    seed({
      'pipeline-state.json': JSON.stringify({ confirmedPhases: ['pitch', 'scaffold', 'first-draft'] }),
    });

    await service.revertPhase('book', 'scaffold');

    expect(stateOnDisk()).toEqual(['pitch']);
  });

  it('reverting revision deletes the v1 archives; unknown phases throw', async () => {
    seed({
      'pipeline-state.json': JSON.stringify({ confirmedPhases: ['revision'] }),
      'source/reader-report-v1.md': 'archived',
      'source/dev-report-v1.md': 'archived',
    });

    await service.revertPhase('book', 'revision');

    expect(fs.files.has('book/source/reader-report-v1.md')).toBe(false);
    expect(fs.files.has('book/source/dev-report-v1.md')).toBe(false);

    await expect(service.revertPhase('book', 'not-a-phase' as never)).rejects.toThrow(/Unknown pipeline phase/);
  });

  it('reverting first-draft rolls the book status back', async () => {
    fs.meta.status = 'revision-1';
    seed({ 'pipeline-state.json': JSON.stringify({ confirmedPhases: ['first-draft'] }) });

    await service.revertPhase('book', 'first-draft');

    expect(fs.meta.status).toBe('first-draft');
    expect(stateOnDisk()).toEqual([]);
  });
});
