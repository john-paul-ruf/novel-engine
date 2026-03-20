import { useViewStore } from '../../stores/viewStore';
import { SettingsView } from '../Settings/SettingsView';
import { Sidebar } from './Sidebar';

function ViewContent(): React.ReactElement {
  const { currentView } = useViewStore();

  switch (currentView) {
    case 'chat':
      return (
        <div className="flex h-full items-center justify-center text-zinc-500">
          <p className="text-lg">Chat View</p>
        </div>
      );
    case 'files':
      return (
        <div className="flex h-full items-center justify-center text-zinc-500">
          <p className="text-lg">Files View</p>
        </div>
      );
    case 'build':
      return (
        <div className="flex h-full items-center justify-center text-zinc-500">
          <p className="text-lg">Build View</p>
        </div>
      );
    case 'settings':
      return <SettingsView />;
    default:
      return (
        <div className="flex h-full items-center justify-center text-zinc-500">
          <p className="text-lg">Unknown View</p>
        </div>
      );
  }
}

export function AppLayout(): React.ReactElement {
  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <ViewContent />
      </main>
    </div>
  );
}
