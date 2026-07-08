import { useEffect } from 'react';
import { useViewStore } from '../../stores/viewStore';
import { useModalChatStore } from '../../stores/modalChatStore';
import { useChatStore } from '../../stores/chatStore';
import { usePitchRoomStore } from '../../stores/pitchRoomStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTourStore } from '../../stores/tourStore';
import { TOUR_DEFINITIONS } from '../../tours/tourDefinitions';
import { ChatView } from '../Chat/ChatView';
import { FilesView } from '../Files/FilesView';
import { BuildView } from '../Build/BuildView';
import { SettingsView } from '../Settings/SettingsView';
import { RevisionQueueModal } from '../RevisionQueue';
import { PitchRoomView } from '../PitchRoom/PitchRoomView';
import { ReadingModeView } from '../Reading/ReadingModeView';
import { DashboardView } from '../Dashboard/DashboardView';
import { StatisticsView } from '../Statistics/StatisticsView';
import { ChatModal } from '../Chat/ChatModal';
import { CliActivityListener } from '../CliActivity/CliActivityPanel';
import { StatusBar } from '../StatusBar/StatusBar';
import { ActivityDrawer } from '../StatusBar/ActivityDrawer';
import { PipelinePanel } from '../RightPanel';
import { GuidedTourOverlay } from '../common/GuidedTourOverlay';
import { HelperPanel } from '../Helper/HelperPanel';
import { useHelperStore } from '../../stores/helperStore';
import { useRightPanelStore } from '../../stores/rightPanelStore';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { IconRail } from '../Rail/IconRail';
import { CommandPalette } from '../Palette/CommandPalette';
import { usePaletteStore } from '../../stores/paletteStore';

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
 * Renders all views simultaneously but only shows the active one.
 * This keeps ChatView (and other views) mounted so they preserve
 * their local state, scroll position, and stream subscriptions.
 */
function ViewContent(): React.ReactElement {
  const { currentView } = useViewStore();

  return (
    <>
      <div className={`h-full ${currentView === 'dashboard' ? '' : 'hidden'}`}>
        <DashboardView />
      </div>
      <div className={`h-full ${currentView === 'chat' ? '' : 'hidden'}`}>
        <ChatView />
      </div>
      <div className={`h-full ${currentView === 'files' ? '' : 'hidden'}`}>
        <FilesView />
      </div>
      <div className={`h-full ${currentView === 'build' ? '' : 'hidden'}`}>
        <BuildView />
      </div>
      <div className={`h-full ${currentView === 'settings' ? '' : 'hidden'}`}>
        <SettingsView />
      </div>
      <div className={`h-full ${currentView === 'statistics' ? '' : 'hidden'}`}>
        <StatisticsView />
      </div>
      <div className={`h-full ${currentView === 'pitch-room' ? '' : 'hidden'}`}>
        <PitchRoomView />
      </div>
      <div className={`h-full ${currentView === 'reading' ? '' : 'hidden'}`}>
        <ReadingModeView />
      </div>
      {/* Streamlined Workspace placeholders — replaced in Phase B/C sessions */}
      <div className={`h-full ${currentView === 'library' ? '' : 'hidden'}`}>
        <div className="p-8 text-sm opacity-60">Library — arrives in SESSION-06</div>
      </div>
      <div className={`h-full ${currentView === 'workspace' ? '' : 'hidden'}`}>
        <div className="p-8 text-sm opacity-60">Workspace — arrives in SESSION-08</div>
      </div>
      <div className={`h-full ${currentView === 'manuscript' ? '' : 'hidden'}`}>
        <div className="p-8 text-sm opacity-60">Manuscript — arrives in SESSION-11</div>
      </div>
      <div className={`h-full ${currentView === 'exports' ? '' : 'hidden'}`}>
        <div className="p-8 text-sm opacity-60">Exports — arrives in SESSION-12</div>
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
  const pipelineOpen = useRightPanelStore((s) => s.pipelineOpen);

  return (
    <div className="flex h-screen w-screen flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <TitleBar />
      <StreamManager />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <IconRail />
        <Sidebar />
        <main data-tour="main-content" className="flex-1 overflow-hidden">
          <ViewContent />
        </main>
        {pipelineOpen && <PipelinePanel />}
      </div>
      <ActivityDrawer />
      <StatusBar />
      {isModalOpen && <ChatModal />}
      <CommandPalette />
      <PaletteManager />
      <RevisionQueueModal />
      <CliActivityListener />
      <HelperPanel />
      <TourManager />
      <TourOverlayRenderer />
    </div>
  );
}
