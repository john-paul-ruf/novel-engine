import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResizeHandle } from './ResizeHandle';

const TITLE = 'Drag to resize · Double-click to reset';

describe('ResizeHandle', () => {
  it('forwards mousedown to the drag handler', () => {
    const onMouseDown = vi.fn();
    render(<ResizeHandle side="left" isDragging={false} onMouseDown={onMouseDown} />);

    fireEvent.mouseDown(screen.getByTitle(TITLE));
    expect(onMouseDown).toHaveBeenCalledTimes(1);
  });

  it('forwards double-click to the reset handler', () => {
    const onDoubleClick = vi.fn();
    render(
      <ResizeHandle side="right" isDragging={false} onMouseDown={vi.fn()} onDoubleClick={onDoubleClick} />,
    );

    fireEvent.doubleClick(screen.getByTitle(TITLE));
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });

  it('highlights the indicator line while dragging', () => {
    const { rerender } = render(
      <ResizeHandle side="left" isDragging={false} onMouseDown={vi.fn()} />,
    );
    const line = (): Element => screen.getByTitle(TITLE).firstElementChild as Element;
    expect(line().className).toContain('bg-transparent');

    rerender(<ResizeHandle side="left" isDragging={true} onMouseDown={vi.fn()} />);
    expect(line().className).toContain('bg-blue-500');
  });
});
