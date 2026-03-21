import { usePitchRoomStore } from '../../stores/pitchRoomStore';

export function PitchRoomHeader(): React.ReactElement {
  const startNewPitch = usePitchRoomStore((s) => s.startNewPitch);
  const isStreaming = usePitchRoomStore((s) => s.isStreaming);

  return (
    <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
        <span className="mr-2">💡</span>
        Pitch Room
      </h1>
      <button
        onClick={startNewPitch}
        disabled={isStreaming}
        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        + New Pitch
      </button>
    </div>
  );
}
