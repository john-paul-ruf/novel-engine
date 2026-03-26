import { useCallback, useRef, useEffect, useState } from 'react';

type UseVerticalResizeOptions = {
  /** Initial height in pixels */
  initialHeight: number;
  /** Minimum height in pixels */
  minHeight: number;
  /** Maximum height in pixels */
  maxHeight: number;
  /** localStorage key to persist the height (optional) */
  storageKey?: string;
};

type UseVerticalResizeResult = {
  /** Current height in pixels */
  height: number;
  /** Whether the user is actively dragging */
  isDragging: boolean;
  /** Attach this to the drag handle element's onMouseDown */
  onMouseDown: (e: React.MouseEvent) => void;
  /** Reset height to initialHeight */
  resetHeight: () => void;
};

function loadPersistedHeight(key: string | undefined, fallback: number, min: number, max: number): number {
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

function persistHeight(key: string | undefined, value: number): void {
  if (!key) return;
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // ignore
  }
}

export function useVerticalResize({
  initialHeight,
  minHeight,
  maxHeight,
  storageKey,
}: UseVerticalResizeOptions): UseVerticalResizeResult {
  const [height, setHeight] = useState(() =>
    loadPersistedHeight(storageKey, initialHeight, minHeight, maxHeight),
  );
  const [isDragging, setIsDragging] = useState(false);
  const heightRef = useRef(height);

  useEffect(() => {
    heightRef.current = height;
  }, [height]);

  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startHeight: heightRef.current };
      setIsDragging(true);
    },
    [],
  );

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { startY, startHeight } = dragRef.current;
      const delta = e.clientY - startY;
      const newHeight = startHeight + delta;
      const clamped = Math.max(minHeight, Math.min(maxHeight, newHeight));
      setHeight(clamped);
    };

    const onMouseUp = () => {
      dragRef.current = null;
      setIsDragging(false);
      persistHeight(storageKey, heightRef.current);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, minHeight, maxHeight, storageKey]);

  const resetHeight = useCallback(() => {
    setHeight(initialHeight);
    persistHeight(storageKey, initialHeight);
  }, [initialHeight, storageKey]);

  return { height, isDragging, onMouseDown, resetHeight };
}
