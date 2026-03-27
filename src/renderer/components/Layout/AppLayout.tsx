import { useEffect } from 'react';
import { useViewStore } from '../../stores/viewStore';
import { useModalChatStore } from '../../stores/modalChatStore';
import { useCliActivityStore } from '../../stores/cliActivityStore';
import { useChatStore } from '../../stores/chatStore';
import { usePitchRoomStore } from '../../stores/pitchRoomStore';
import { ChatView } from '../Chat/ChatView';
import { FilesView } from '../Files/FilesView';
import { BuildView } from '../Build/BuildView';
import { SettingsView } from '../Settings/SettingsView';
import { RevisionQueueView } from '../RevisionQueue';
import { PitchRoomView } from '../PitchRoom/PitchRoomView';
import { MotifLedgerView } from '../MotifLedger/MotifLedgerView';
import { ChatModal } from '../Chat/ChatModal';
import { CliActivityPanel, CliActivityListener } from '../CliActivity/CliActivityPanel';
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
      <div className={`h-full ${currentView === 'revision-queue' ? '' : 'hidden'}`}>
        <RevisionQueueView />
      </div>
      <div className={`h-full ${currentView === 'pitch-room' ? '' : 'hidden'}`}>
        <PitchRoomView />
      </div>
      <div className={`h-full ${currentView === 'motif-ledger' ? '' : 'hidden'}`}>
        <MotifLedgerView />
      </div>
    </>
  );
}

export function AppLayout(): React.ReactElement {
  const isModalOpen = useModalChatStore((s) => s.isOpen);
  const isCliPanelOpen = useCliActivityStore((s) => s.isOpen);

  return (
    <div className="flex h-screen w-screen flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <TitleBar />
      <StreamManager />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <ViewContent />
        </main>
        {isCliPanelOpen && <CliActivityPanel />}
      </div>
      {isModalOpen && <ChatModal />}
      <CliActivityListener />
    </div>
  );
}
