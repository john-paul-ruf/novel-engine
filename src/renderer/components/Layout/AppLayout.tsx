import { useEffect } from 'react';
import { useViewStore } from '../../stores/viewStore';
import { useModalChatStore } from '../../stores/modalChatStore';
import { useCliActivityStore } from '../../stores/cliActivityStore';
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
import { CliActivityPanel, CliActivityListener } from '../CliActivity/CliActivityPanel';
import { PipelinePanel } from '../RightPanel';
import { GuidedTourOverlay } from '../common/GuidedTourOverlay';
import { HelperPanel } from '../Helper/HelperPanel';
import { useHelperStore } from '../../stores/helperStore';
import { useRightPanelStore } from '../../stores/rightPanelStore';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';

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
    </>
  );
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
  const isCliPanelOpen = useCliActivityStore((s) => s.isOpen);
  const pipelineOpen = useRightPanelStore((s) => s.pipelineOpen);

  return (
    <div className="flex h-screen w-screen flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <TitleBar />
      <StreamManager />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main data-tour="main-content" className="flex-1 overflow-hidden">
          <ViewContent />
        </main>
        {pipelineOpen && <PipelinePanel />}
        {isCliPanelOpen && <CliActivityPanel />}
      </div>
      {isModalOpen && <ChatModal />}
      <RevisionQueueModal />
      <CliActivityListener />
      <HelperPanel />
      <TourManager />
      <TourOverlayRenderer />
    </div>
  );
}
