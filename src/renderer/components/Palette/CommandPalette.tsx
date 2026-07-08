import { useEffect, useRef, useState } from 'react';
import { usePaletteStore, type PaletteItem } from '../../stores/paletteStore';
import { Icon } from '../common/Icon';

function isEnabled(item: PaletteItem): boolean {
  return item.enabled ? item.enabled() : true;
}

/**
 * Global ⌘K command palette — phases, chapters, and actions.
 * Opened via the palette store (TitleBar pill, ⌘K keybinding in AppLayout).
 */
export function CommandPalette(): React.ReactElement | null {
  const isOpen = usePaletteStore((s) => s.isOpen);
  const query = usePaletteStore((s) => s.query);
  const setQuery = usePaletteStore((s) => s.setQuery);
  const close = usePaletteStore((s) => s.close);
  // Subscribe to registry changes so late registrations (S06/S11/S13) render
  usePaletteStore((s) => s.staticItems);
  usePaletteStore((s) => s.dynamicProviders);

  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHighlight(0);
  }, [query, isOpen]);

  // Keep the highlighted row in view while arrowing
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-palette-index="${highlight}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  if (!isOpen) return null;

  const items = usePaletteStore.getState().visibleItems();

  const runItem = (item: PaletteItem): void => {
    if (!isEnabled(item)) return;
    close();
    void item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[highlight];
      if (item) runItem(item);
    }
  };

  let lastGroup: PaletteItem['group'] | null = null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[12vh] backdrop-blur-[3px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="w-[590px] max-w-[92vw] overflow-hidden rounded-[13px] border border-ne-line bg-ne-bg2 shadow-2xl">
        {/* Search */}
        <div className="flex items-center gap-2.5 border-b border-ne-line px-4 py-3">
          <span className="text-ne-ink-faint">
            <Icon name="search" size={15} strokeWidth={2} />
          </span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a phase, chapter, or action…"
            className="flex-1 border-none bg-transparent text-sm text-ne-ink outline-none placeholder:text-ne-ink-faint"
          />
        </div>

        {/* Grouped results */}
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto py-1.5">
          {items.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-ne-ink-faint">No matches</div>
          )}
          {items.map((item, i) => {
            const header =
              item.group !== lastGroup ? (
                <div className="px-4 pb-1 pt-3 text-[9.5px] font-bold uppercase tracking-[0.13em] text-ne-ink-faint">
                  {item.group}
                </div>
              ) : null;
            lastGroup = item.group;
            const enabled = isEnabled(item);

            return (
              <div key={item.id}>
                {header}
                <button
                  data-palette-index={i}
                  onClick={() => runItem(item)}
                  onMouseMove={() => setHighlight(i)}
                  className={`flex w-full items-center gap-2.5 px-4 py-[7px] text-left text-[13px] ${
                    !enabled
                      ? 'cursor-default text-ne-ink-faint opacity-45'
                      : i === highlight
                        ? 'bg-ne-brass-dim text-ne-ink'
                        : 'text-ne-ink-dim'
                  }`}
                >
                  {item.color ? (
                    <span
                      className="h-[7px] w-[7px] shrink-0 rounded-full"
                      style={{ background: item.color }}
                    />
                  ) : item.icon ? (
                    <span className={i === highlight && enabled ? 'text-ne-brass-hi' : 'text-ne-ink-faint'}>
                      <Icon name={item.icon} size={14} strokeWidth={1.8} />
                    </span>
                  ) : null}
                  <span className="truncate">{item.label}</span>
                  {item.hint && (
                    <span className="ml-auto shrink-0 text-[10.5px] text-ne-ink-faint">{item.hint}</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex gap-4 border-t border-ne-line px-4 py-2 text-[10.5px] text-ne-ink-faint">
          <span>
            <kbd className="mr-1 rounded border border-ne-line bg-ne-bg0 px-1 font-ne-mono text-[9.5px]">↑↓</kbd>
            navigate
          </span>
          <span>
            <kbd className="mr-1 rounded border border-ne-line bg-ne-bg0 px-1 font-ne-mono text-[9.5px]">↵</kbd>
            run
          </span>
          <span>
            <kbd className="mr-1 rounded border border-ne-line bg-ne-bg0 px-1 font-ne-mono text-[9.5px]">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}
