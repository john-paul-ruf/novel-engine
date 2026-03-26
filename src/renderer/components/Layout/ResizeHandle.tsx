import React from 'react';

type ResizeHandleProps = {
  /** Which edge of the panel this handle sits on */
  side: 'left' | 'right';
  /** Whether the handle is currently being dragged */
  isDragging: boolean;
  /** Mouse down handler from useResizeHandle */
  onMouseDown: (e: React.MouseEvent) => void;
  /** Double-click to reset to default width */
  onDoubleClick?: () => void;
};

/**
 * A thin, draggable resize handle that sits on the edge of a panel.
 * Shows a subtle line that highlights on hover/drag.
 */
export function ResizeHandle({
  side,
  isDragging,
  onMouseDown,
  onDoubleClick,
}: ResizeHandleProps): React.ReactElement {
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className={`group absolute top-0 bottom-0 z-10 flex w-[5px] cursor-col-resize items-center justify-center ${
        side === 'left' ? '-left-[3px]' : '-right-[3px]'
      }`}
      title="Drag to resize · Double-click to reset"
    >
      {/* Visible line indicator */}
      <div
        className={`h-full w-px transition-colors duration-150 ${
          isDragging
            ? 'bg-blue-500'
            : 'bg-transparent group-hover:bg-blue-400/60'
        }`}
      />
    </div>
  );
}
