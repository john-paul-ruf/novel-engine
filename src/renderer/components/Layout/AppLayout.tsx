import { useViewStore } from '../../stores/viewStore';
import { useModalChatStore } from '../../stores/modalChatStore';
import { ChatView } from '../Chat/ChatView';
import { FilesView } from '../Files/FilesView';
import { BuildView } from '../Build/BuildView';
import { SettingsView } from '../Settings/SettingsView';
import { RevisionQueueView } from '../RevisionQueue';
import { ChatModal } from '../Chat/ChatModal';
import { CliActivityPanel } from '../CliActivity/CliActivityPanel';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';

function ViewContent(): React.ReactElement {
  const { currentView } = useViewStore();

  switch (currentView) {
    case 'chat':
      return <ChatView />;
    case 'files':
      return <FilesView />;
    case 'build':
      return <BuildView />;
    case 'settings':
      return <SettingsView />;
    case 'revision-queue':
      return <RevisionQueueView />;
    default:
      return (
        <div className="flex h-full items-center justify-center text-zinc-500">
          <p className="text-lg">Unknown View</p>
        </div>
      );
  }
}

export function AppLayout(): React.ReactElement {
  const isModalOpen = useModalChatStore((s) => s.isOpen);

  return (
    <div className="flex h-screen w-screen flex-col bg-zinc-950 text-zinc-100">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <ViewContent />
        </main>
      </div>
      {isModalOpen && <ChatModal />}
      <CliActivityPanel />
    </div>
  );
}
