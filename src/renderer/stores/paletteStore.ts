import { create } from 'zustand';
import type { IconName } from '../components/common/Icon';
import { useViewStore, navigateToPhase } from './viewStore';
import { useBookStore } from './bookStore';
import { useChatStore } from './chatStore';
import { usePipelineStore } from './pipelineStore';
import { useHelperStore } from './helperStore';
import { usePitchRoomStore } from './pitchRoomStore';
import { agentColor } from '../components/common/agentColors';
import { startHotTake, openAdhocRevisions, openVoiceSetup } from '../actions/agentActions';

export type PaletteItem = {
  id: string;
  group: 'Actions' | 'Phases' | 'Chapters' | 'Books' | 'Navigate';
  label: string;
  hint?: string;            // right-aligned meta ("phase 4", "1,309 words")
  icon?: IconName;          // from common/Icon
  color?: string;           // agent CSS var for dot items
  keywords?: string[];
  enabled?: () => boolean;  // e.g. requires active book
  run: () => void | Promise<void>;
};

const GROUP_ORDER: PaletteItem['group'][] = ['Actions', 'Phases', 'Chapters', 'Books', 'Navigate'];

type PaletteState = {
  isOpen: boolean;
  query: string;
  staticItems: PaletteItem[];
  dynamicProviders: (() => PaletteItem[])[];
  open: () => void;
  close: () => void;
  toggle: () => void;
  setQuery: (query: string) => void;
  registerItems: (items: PaletteItem[]) => void;
  registerProvider: (provider: () => PaletteItem[]) => void;
  /** Static + provider items matching the query, in group order. */
  visibleItems: () => PaletteItem[];
};

export const usePaletteStore = create<PaletteState>((set, get) => ({
  isOpen: false,
  query: '',
  staticItems: [],
  dynamicProviders: [],

  open: () => set({ isOpen: true, query: '' }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen, query: '' })),
  setQuery: (query: string) => set({ query }),

  registerItems: (items: PaletteItem[]) =>
    set((s) => ({ staticItems: [...s.staticItems, ...items] })),

  registerProvider: (provider: () => PaletteItem[]) =>
    set((s) => ({ dynamicProviders: [...s.dynamicProviders, provider] })),

  visibleItems: () => {
    const { staticItems, dynamicProviders, query } = get();
    const all = [...staticItems, ...dynamicProviders.flatMap((p) => p())];
    const q = query.trim().toLowerCase();
    const matched = q
      ? all.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.keywords?.some((k) => k.toLowerCase().includes(q)),
        )
      : all;
    return GROUP_ORDER.flatMap((group) => matched.filter((item) => item.group === group));
  },
}));

// ─── Built-in registrations ──────────────────────────────────────────
// Later sessions (S06/S11/S13) register more via registerItems/registerProvider.

const hasActiveBook = (): boolean => useBookStore.getState().activeSlug !== '';

const NAVIGATE_ITEMS: PaletteItem[] = [
  { id: 'nav-library', group: 'Navigate', label: 'Library', icon: 'library', run: () => useViewStore.getState().navigate('library') },
  { id: 'nav-workspace', group: 'Navigate', label: 'Workspace', icon: 'workspace', enabled: hasActiveBook, run: () => useViewStore.getState().navigate('workspace') },
  { id: 'nav-manuscript', group: 'Navigate', label: 'Manuscript', icon: 'manuscript', enabled: hasActiveBook, run: () => useViewStore.getState().navigate('manuscript') },
  { id: 'nav-exports', group: 'Navigate', label: 'Exports', icon: 'exports', enabled: hasActiveBook, run: () => useViewStore.getState().navigate('exports') },
  { id: 'nav-statistics', group: 'Navigate', label: 'Statistics', icon: 'statistics', run: () => useViewStore.getState().navigate('statistics') },
  { id: 'nav-settings', group: 'Navigate', label: 'Settings', icon: 'settings', run: () => useViewStore.getState().navigate('settings') },
  { id: 'nav-pitch-room', group: 'Navigate', label: 'Pitch Room', icon: 'bulb', keywords: ['brainstorm', 'pitch'], run: () => useViewStore.getState().navigate('pitch-room') },
];

const ACTION_ITEMS: PaletteItem[] = [
  {
    id: 'action-hot-take',
    group: 'Actions',
    label: 'Hot Take — quick reader reaction',
    icon: 'eye',
    color: agentColor('Ghostlight'),
    keywords: ['ghostlight', 'reader', 'reaction'],
    enabled: () => hasActiveBook() && !useChatStore.getState().isStreaming,
    run: () => startHotTake(),
  },
  {
    id: 'action-adhoc-revisions',
    group: 'Actions',
    label: 'Ad Hoc Revisions — open revision queue',
    icon: 'history',
    color: agentColor('Forge'),
    keywords: ['revision', 'queue', 'forge', 'fixes'],
    enabled: hasActiveBook,
    run: () => openAdhocRevisions(),
  },
  {
    id: 'action-help',
    group: 'Actions',
    label: 'Help — open helper',
    icon: 'bulb',
    keywords: ['faq', 'question', 'assistant'],
    run: () => useHelperStore.getState().toggle(),
  },
  {
    id: 'action-voice-setup',
    group: 'Actions',
    label: 'Set Up Voice Profile',
    icon: 'sparkles',
    color: agentColor('Verity'),
    keywords: ['voice', 'profile', 'verity', 'style'],
    enabled: hasActiveBook,
    run: () => openVoiceSetup(),
  },
  {
    id: 'action-pitch-idea',
    group: 'Actions',
    label: 'Pitch an idea with Spark',
    icon: 'bulb',
    color: agentColor('Spark'),
    keywords: ['brainstorm', 'pitch', 'spark', 'idea'],
    run: () => useViewStore.getState().navigate('pitch-room'),
  },
  {
    id: 'action-new-pitch',
    group: 'Actions',
    label: 'New Pitch — fresh Spark session',
    icon: 'plus',
    color: agentColor('Spark'),
    keywords: ['brainstorm', 'pitch', 'spark', 'new'],
    enabled: () => !usePitchRoomStore.getState().isStreaming,
    run: () => {
      useViewStore.getState().navigate('pitch-room');
      void usePitchRoomStore.getState().startNewConversation();
    },
  },
];

function phasesProvider(): PaletteItem[] {
  return usePipelineStore.getState().phases.map((phase, i) => ({
    id: `phase-${phase.id}`,
    group: 'Phases' as const,
    label: phase.agent ? `${phase.label} — ${phase.agent}` : phase.label,
    hint: `phase ${i + 1}`,
    color: phase.agent ? agentColor(phase.agent) : 'var(--ne-ink-faint)',
    keywords: [phase.id, phase.agent ?? 'build'],
    run: () => navigateToPhase(phase.id),
  }));
}

function chaptersProvider(): PaletteItem[] {
  return useBookStore.getState().chapters.map((chapter) => ({
    id: `chapter-${chapter.slug}`,
    group: 'Chapters' as const,
    label: chapter.slug,
    hint: `${chapter.wordCount.toLocaleString()} words`,
    icon: 'manuscript' as const,
    run: () => useViewStore.getState().navigate('manuscript', { chapterSlug: chapter.slug }),
  }));
}

usePaletteStore.getState().registerItems([...ACTION_ITEMS, ...NAVIGATE_ITEMS]);
usePaletteStore.getState().registerProvider(phasesProvider);
usePaletteStore.getState().registerProvider(chaptersProvider);
