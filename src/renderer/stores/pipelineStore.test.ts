import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PipelinePhase, PipelinePhaseId } from '@domain/types';
import { usePipelineStore } from './pipelineStore';
import { installNovelEngineMock, type NovelEngineMock } from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(usePipelineStore);

function phase(id: PipelinePhaseId, status: PipelinePhase['status'] = 'active'): PipelinePhase {
  return { id, label: id, agent: 'Spark', status, description: '' };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

let mock: NovelEngineMock;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mock = installNovelEngineMock();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('pipelineStore', () => {
  it('loadPipeline for the displayed book shows the spinner and updates the derived phases', async () => {
    usePipelineStore.setState({ displayedSlug: 'book-a' });
    const detect = deferred<PipelinePhase[]>();
    mock.pipeline.detect.mockImplementation(() => detect.promise);
    mock.pipeline.getActive.mockResolvedValue(phase('scaffold'));

    const pending = usePipelineStore.getState().loadPipeline('book-a');
    expect(usePipelineStore.getState().loading).toBe(true);

    detect.resolve([phase('pitch', 'complete'), phase('scaffold')]);
    await pending;

    const state = usePipelineStore.getState();
    expect(state.loading).toBe(false);
    expect(state.phases.map((p) => p.id)).toEqual(['pitch', 'scaffold']);
    expect(state.activePhase?.id).toBe('scaffold');
    expect(state.cache['book-a'].phases).toHaveLength(2);
  });

  it('loadPipeline for a background book caches silently without touching the displayed state', async () => {
    usePipelineStore.setState({
      displayedSlug: 'book-a',
      phases: [phase('pitch')],
      activePhase: phase('pitch'),
    });
    mock.pipeline.detect.mockResolvedValue([phase('first-draft')]);
    mock.pipeline.getActive.mockResolvedValue(phase('first-draft'));

    await usePipelineStore.getState().loadPipeline('book-b');

    const state = usePipelineStore.getState();
    expect(state.loading).toBe(false);
    expect(state.phases.map((p) => p.id)).toEqual(['pitch']); // displayed untouched
    expect(state.cache['book-b'].activePhase?.id).toBe('first-draft');

    // Switching to the background book shows the cached entry instantly (no bridge call)
    mock.pipeline.detect.mockClear();
    usePipelineStore.getState().setDisplayedBook('book-b');
    expect(usePipelineStore.getState().phases.map((p) => p.id)).toEqual(['first-draft']);
    expect(mock.pipeline.detect).not.toHaveBeenCalled();
  });

  it('a load that finishes after the displayed book changed only updates the cache (stale guard)', async () => {
    usePipelineStore.setState({ displayedSlug: 'book-a' });
    const detect = deferred<PipelinePhase[]>();
    mock.pipeline.detect.mockImplementation(() => detect.promise);
    mock.pipeline.getActive.mockResolvedValue(null);

    const pending = usePipelineStore.getState().loadPipeline('book-a');
    usePipelineStore.getState().setDisplayedBook('book-b');

    detect.resolve([phase('pitch')]);
    await pending;

    const state = usePipelineStore.getState();
    expect(state.displayedSlug).toBe('book-b');
    expect(state.phases).toEqual([]); // book-b has no cache — display not hijacked
    expect(state.cache['book-a'].phases.map((p) => p.id)).toEqual(['pitch']);
  });

  it('setDisplayedBook with no cache entry shows an empty pipeline', () => {
    usePipelineStore.setState({ phases: [phase('pitch')], activePhase: phase('pitch') });

    usePipelineStore.getState().setDisplayedBook('unknown-book');

    expect(usePipelineStore.getState().displayedSlug).toBe('unknown-book');
    expect(usePipelineStore.getState().phases).toEqual([]);
    expect(usePipelineStore.getState().activePhase).toBeNull();
  });

  it('clears the spinner and keeps state on bridge failure', async () => {
    usePipelineStore.setState({ displayedSlug: 'book-a', phases: [phase('pitch')] });
    mock.pipeline.detect.mockRejectedValue(new Error('fs error'));

    await usePipelineStore.getState().loadPipeline('book-a');

    expect(usePipelineStore.getState().loading).toBe(false);
    expect(usePipelineStore.getState().phases.map((p) => p.id)).toEqual(['pitch']);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('every mutator calls its bridge method with the right args, then reloads the pipeline', async () => {
    const store = usePipelineStore.getState();

    await store.markPhaseComplete('book-a', 'pitch');
    expect(mock.pipeline.markPhaseComplete).toHaveBeenCalledWith('book-a', 'pitch');

    await store.completeRevision('book-a');
    expect(mock.pipeline.completeRevision).toHaveBeenCalledWith('book-a');

    await store.confirmPhaseAdvancement('book-a', 'scaffold');
    expect(mock.pipeline.confirmAdvancement).toHaveBeenCalledWith('book-a', 'scaffold');

    await store.revertPhase('book-a', 'scaffold');
    expect(mock.pipeline.revertPhase).toHaveBeenCalledWith('book-a', 'scaffold');

    // Each of the four mutators triggered a reload (detect + getActive)
    expect(mock.pipeline.detect).toHaveBeenCalledTimes(4);
    expect(mock.pipeline.detect).toHaveBeenCalledWith('book-a');
  });
});
