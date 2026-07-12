import { useEffect } from 'react';
import { useViewStore } from '../../stores/viewStore';
import { useModalChatStore } from '../../stores/modalChatStore';
import { useChatStore } from '../../stores/chatStore';
import { usePitchRoomStore } from '../../stores/pitchRoomStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTourStore } from '../../stores/tourStore';
import { useBookStore } from '../../stores/bookStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useFileChangeStore } from '../../stores/fileChangeStore';
import { useImportStore } from '../../stores/importStore';
import { useSeriesImportStore } from '../../stores/seriesImportStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { TOUR_DEFINITIONS } from '../../tours/tourDefinitions';
import { SettingsView } from '../Settings/SettingsView';
import { RevisionQueueModal } from '../RevisionQueue';
import { PitchRoomView } from '../PitchRoom/PitchRoomView';
import { StatisticsView } from '../Statistics/StatisticsView';
import { ChatModal } from '../Chat/ChatModal';
import { CliActivityListener } from '../CliActivity/CliActivityPanel';
import { StatusBar } from '../StatusBar/StatusBar';
import { ActivityDrawer } from '../StatusBar/ActivityDrawer';
import { GuidedTourOverlay } from '../common/GuidedTourOverlay';
import { HelperPanel } from '../Helper/HelperPanel';
import { useHelperStore } from '../../stores/helperStore';
import { TitleBar } from './TitleBar';
import { IconRail } from '../Rail/IconRail';
import { LibraryView } from '../Library/LibraryView';
import { WorkspaceView } from '../Workbench/WorkspaceView';
import { CommandPalette } from '../Palette/CommandPalette';
import { ManuscriptView } from '../Manuscript/ManuscriptView';
import { ExportsView } from '../Exports/ExportsView';
import { QueryManagerView } from '../QueryManager/QueryManagerView';
import { usePaletteStore } from '../../stores/paletteStore';
import { PitchPreviewModal } from '../Sidebar/PitchPreviewModal';
import { ImportWizard } from '../Import/ImportWizard';
import { ImportSeriesWizard } from '../Import/ImportSeriesWizard';
import { SeriesModal } from '../Series/SeriesModal';

/**
 * Keeps the stream listener alive for the entire app lifecycle,
 * independent of which view is currently visible.
 */
function StreamManager(): null {
  const { initStreamListener, destroyStreamListener, recoverActiveStream } = useChatStore();

  useEffect(() => {
    initStreamListener();
    recoverActiveStream();
    return () => destroyStreamListener();
  }, [initStreamListener, destroyStreamListener, recoverActiveStream]);

  // Pitch room stream listener — persists across view changes so
  // done/error events are never missed when navigating away from PitchRoomView
  useEffect(() => {
    usePitchRoomStore.getState().initStreamListener();
    return () => usePitchRoomStore.getState().destroyStreamListener();
  }, []);

  // Helper stream listener — persists across the entire app lifecycle
  useEffect(() => {
    useHelperStore.getState().initStreamListener();
    return () => useHelperStore.getState().destroyStreamListener();
  }, []);

  return null;
}

/**
 * Book-scoped data wiring, re-homed from the legacy BookPanel (SESSION-14):
 * whenever the active book changes (including the initial load), point the
 * pipeline store at it, load its pipeline + conversations, and refresh word
 * counts; file changes keep the word-count/chapter cache fresh.
 */
function BookDataManager(): null {
  const activeSlug = useBookStore((s) => s.activeSlug);
  const revision = useFileChangeStore((s) => s.revision);

  useEffect(() => {
    if (!activeSlug) return;
    usePipelineStore.getState().setDisplayedBook(activeSlug);
    void usePipelineStore.getState().loadPipeline(activeSlug);
    void useChatStore.getState().loadConversations(activeSlug);
    void useBookStore.getState().refreshWordCount();
  }, [activeSlug]);

  useEffect(() => {
    if (revision > 0 && activeSlug) {
      void useBookStore.getState().refreshWordCount();
    }
  }, [revision]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

/**
 * Book-management modals, re-homed from the legacy BookPanel (SESSION-14).
 * Their stores are triggered from the Library view, the Pitch Room rail and
 * the command palette; the mounts live here so they are always available.
 */
function GlobalBookModals(): React.ReactElement {
  const importStep = useImportStore((s) => s.step);
  const seriesImportStep = useSeriesImportStore((s) => s.step);
  const seriesModalOpen = useSeriesStore((s) => s.isModalOpen);

  return (
    <>
      <PitchPreviewModal />
      {importStep !== 'idle' && <ImportWizard />}
      {seriesImportStep !== 'idle' && <ImportSeriesWizard />}
      {seriesModalOpen && <SeriesModal />}
    </>
  );
}

/**
 * Renders all views simultaneously but only shows the active one.
 * This keeps every view mounted so it preserves its local state,
 * scroll position, and stream subscriptions.
 */
function ViewContent(): React.ReactElement {
  const { currentView } = useViewStore();

  return (
    <>
      <div className={`h-full ${currentView === 'settings' ? '' : 'hidden'}`}>
        <SettingsView />
      </div>
      <div className={`h-full ${currentView === 'statistics' ? '' : 'hidden'}`}>
        <StatisticsView />
      </div>
      <div className={`h-full ${currentView === 'pitch-room' ? '' : 'hidden'}`}>
        <PitchRoomView />
      </div>
      <div className={`h-full ${currentView === 'library' ? '' : 'hidden'}`}>
        <LibraryView />
      </div>
      <div className={`h-full ${currentView === 'workspace' ? '' : 'hidden'}`}>
        <WorkspaceView />
      </div>
      <div className={`h-full ${currentView === 'manuscript' ? '' : 'hidden'}`}>
        <ManuscriptView />
      </div>
      <div className={`h-full ${currentView === 'exports' ? '' : 'hidden'}`}>
        <ExportsView />
      </div>
      <div className={`h-full ${currentView === 'query-manager' ? '' : 'hidden'}`}>
        <QueryManagerView />
      </div>
    </>
  );
}

/**
 * Global command palette keybinding: ⌘K/Ctrl+K toggles, Escape closes.
 * Also honors the `ne:open-palette` CustomEvent (TitleBar pill fallback).
 */
function PaletteManager(): null {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        usePaletteStore.getState().toggle();
      } else if (e.key === 'Escape' && usePaletteStore.getState().isOpen) {
        usePaletteStore.getState().close();
      }
    };
    const onOpenEvent = (): void => usePaletteStore.getState().open();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('ne:open-palette', onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('ne:open-palette', onOpenEvent);
    };
  }, []);

  return null;
}

/** Hydrates the tour store from settings on app mount. */
function TourManager(): null {
  const settings = useSettingsStore((s) => s.settings);
  const { hydrate, isHydrated } = useTourStore();

  useEffect(() => {
    if (settings && !isHydrated) {
      hydrate(settings.completedTours ?? []);
    }
  }, [settings, isHydrated, hydrate]);

  return null;
}

/** Renders the guided tour overlay when a tour is active. */
function TourOverlayRenderer(): React.ReactElement | null {
  const activeTourId = useTourStore((s) => s.activeTourId);
  const completeTour = useTourStore((s) => s.completeTour);
  const dismissTour = useTourStore((s) => s.dismissTour);

  if (!activeTourId) return null;

  const steps = TOUR_DEFINITIONS[activeTourId];
  if (!steps) return null;

  return (
    <GuidedTourOverlay
      steps={steps}
      isActive={true}
      onComplete={completeTour}
      onDismiss={dismissTour}
    />
  );
}

export function AppLayout(): React.ReactElement {
  const isModalOpen = useModalChatStore((s) => s.isOpen);

  return (
    <div className="flex h-screen w-screen flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <TitleBar />
      <StreamManager />
      <BookDataManager />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <IconRail />
        <main data-tour="main-content" className="flex-1 overflow-hidden">
          <ViewContent />
        </main>
      </div>
      <ActivityDrawer />
      <StatusBar />
      {isModalOpen && <ChatModal />}
      <CommandPalette />
      <PaletteManager />
      <RevisionQueueModal />
      <GlobalBookModals />
      <CliActivityListener />
      <HelperPanel />
      <TourManager />
      <TourOverlayRenderer />
    </div>
  );
}
