import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PipelinePhase } from '@domain/types';
import { usePaletteStore } from './paletteStore';
import { useViewStore } from './viewStore';
import { useBookStore } from './bookStore';
import { usePipelineStore } from './pipelineStore';
import { installNovelEngineMock } from '../../test/novelEngineMock';
import { resetStoresBeforeEach } from '../../test/resetStores';

// The snapshot includes the built-in Actions/Navigate registrations that run
// at module import — each test starts from that registered baseline.
resetStoresBeforeEach(useViewStore, useBookStore, usePipelineStore, usePaletteStore);

beforeEach(() => {
  installNovelEngineMock();
});

const phase = (id: PipelinePhase['id']): PipelinePhase => ({
  id,
  label: id,
  agent: 'Spark',
  status: 'active',
  description: '',
});

describe('paletteStore', () => {
  it('open/close/toggle manage visibility and reset the query', () => {
    usePaletteStore.getState().setQuery('leftover');
    usePaletteStore.getState().open();
    expect(usePaletteStore.getState().isOpen).toBe(true);
    expect(usePaletteStore.getState().query).toBe('');

    usePaletteStore.getState().close();
    expect(usePaletteStore.getState().isOpen).toBe(false);

    usePaletteStore.getState().toggle();
    expect(usePaletteStore.getState().isOpen).toBe(true);
    usePaletteStore.getState().toggle();
    expect(usePaletteStore.getState().isOpen).toBe(false);
  });

  it('visibleItems returns built-in items in group order (Actions before Navigate)', () => {
    const items = usePaletteStore.getState().visibleItems();
    const groups = [...new Set(items.map((i) => i.group))];

    expect(groups).toEqual(['Actions', 'Navigate']);
    expect(items.some((i) => i.id === 'nav-library')).toBe(true);
    expect(items.some((i) => i.id === 'action-hot-take')).toBe(true);
  });

  it('filters by label and by keywords, case-insensitively', () => {
    usePaletteStore.getState().setQuery('LIBRARY');
    expect(usePaletteStore.getState().visibleItems().map((i) => i.id)).toContain('nav-library');

    // 'faq' only appears in the Help action's keywords
    usePaletteStore.getState().setQuery('faq');
    const ids = usePaletteStore.getState().visibleItems().map((i) => i.id);
    expect(ids).toEqual(['action-help']);
  });

  it('dynamic providers surface pipeline phases and book chapters with hints', () => {
    usePipelineStore.setState({ phases: [phase('pitch'), phase('scaffold')] });
    useBookStore.setState({ chapters: [{ slug: '01-opening', wordCount: 1309 }] });

    const items = usePaletteStore.getState().visibleItems();
    const phaseItem = items.find((i) => i.id === 'phase-pitch');
    const chapterItem = items.find((i) => i.id === 'chapter-01-opening');

    expect(phaseItem).toMatchObject({ group: 'Phases', hint: 'phase 1' });
    expect(chapterItem).toMatchObject({ group: 'Chapters', hint: '1,309 words' });

    // Group order: Actions, Phases, Chapters, Books, Navigate
    const groups = [...new Set(items.map((i) => i.group))];
    expect(groups).toEqual(['Actions', 'Phases', 'Chapters', 'Navigate']);
  });

  it('registerItems and registerProvider extend the palette', () => {
    const run = vi.fn();
    usePaletteStore.getState().registerItems([
      { id: 'custom-1', group: 'Books', label: 'Custom Book Item', run },
    ]);
    usePaletteStore.getState().registerProvider(() => [
      { id: 'custom-2', group: 'Actions', label: 'Provided Action', run },
    ]);

    const ids = usePaletteStore.getState().visibleItems().map((i) => i.id);
    expect(ids).toContain('custom-1');
    expect(ids).toContain('custom-2');
  });

  it('running a navigate item dispatches through viewStore', () => {
    const item = usePaletteStore.getState().visibleItems().find((i) => i.id === 'nav-settings');
    item?.run();
    expect(useViewStore.getState().currentView).toBe('settings');
  });

  it('enabled() is advisory metadata — visibleItems does NOT filter by it (pinned)', () => {
    // No active book: workspace nav is disabled but still listed
    const items = usePaletteStore.getState().visibleItems();
    const workspace = items.find((i) => i.id === 'nav-workspace');

    expect(workspace).toBeDefined();
    expect(workspace?.enabled?.()).toBe(false);

    useBookStore.setState({ activeSlug: 'book-a' });
    expect(workspace?.enabled?.()).toBe(true);
  });
});
