import { useCallback, useRef, useEffect, useState } from 'react';

type ResizeDirection = 'left' | 'right';

type UseResizeHandleOptions = {
  /** Which side of the panel the handle sits on */
  direction: ResizeDirection;
  /** Initial width in pixels */
  initialWidth: number;
  /** Minimum width in pixels */
  minWidth: number;
  /** Maximum width in pixels */
  maxWidth: number;
  /** localStorage key to persist the width (optional) */
  storageKey?: string;
};

type UseResizeHandleResult = {
  /** Current width in pixels */
  width: number;
  /** Whether the user is actively dragging */
  isDragging: boolean;
  /** Attach this to the drag handle element's onMouseDown */
  onMouseDown: (e: React.MouseEvent) => void;
  /** Reset width to initialWidth */
  resetWidth: () => void;
};

function loadPersistedWidth(key: string | undefined, fallback: number, min: number, max: number): number {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= min && parsed <= max) return parsed;
    }
  } catch {
    // localStorage might be unavailable
  }
  return fallback;
}

function persistWidth(key: string | undefined, value: number): void {
  if (!key) return;
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // ignore
  }
}

export function useResizeHandle({
  direction,
  initialWidth,
  minWidth,
  maxWidth,
  storageKey,
}: UseResizeHandleOptions): UseResizeHandleResult {
  const [width, setWidth] = useState(() =>
    loadPersistedWidth(storageKey, initialWidth, minWidth, maxWidth),
  );
  const [isDragging, setIsDragging] = useState(false);
  const widthRef = useRef(width);

  // Keep ref in sync so the mouseUp handler can read the latest width
  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: widthRef.current };
      setIsDragging(true);
    },
    [],
  );

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { startX, startWidth } = dragRef.current;
      const delta = e.clientX - startX;

      // For a panel on the right side, dragging left = wider
      // For a panel on the left side, dragging right = wider
      const newWidth =
        direction === 'right'
          ? startWidth - delta
          : startWidth + delta;

      const clamped = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setWidth(clamped);
    };

    const onMouseUp = () => {
      dragRef.current = null;
      setIsDragging(false);
      persistWidth(storageKey, widthRef.current);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, direction, minWidth, maxWidth, storageKey]);

  const resetWidth = useCallback(() => {
    setWidth(initialWidth);
    persistWidth(storageKey, initialWidth);
  }, [initialWidth, storageKey]);

  return { width, isDragging, onMouseDown, resetWidth };
}
