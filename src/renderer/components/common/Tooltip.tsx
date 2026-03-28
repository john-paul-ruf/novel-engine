import React, { cloneElement, useRef, useLayoutEffect, useState, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import type { TourStepPlacement } from '@domain/types';
import { useTooltip } from '../../hooks/useTooltip';
import { useTourStore } from '../../stores/tourStore';

type TooltipProps = {
  /** The tooltip text content. Supports \n for line breaks. */
  content: string;
  /** Placement relative to the trigger. Default: 'top'. */
  placement?: TourStepPlacement;
  /** Delay before showing in ms. Default: 300. */
  enterDelay?: number;
  /** Whether the tooltip is disabled (won't show). */
  disabled?: boolean;
  /** The trigger element. */
  children: React.ReactElement;
};

const ARROW_SIZE = 6;

function getArrowStyle(placement: TourStepPlacement): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: ARROW_SIZE * 2,
    height: ARROW_SIZE * 2,
    transform: 'rotate(45deg)',
  };

  switch (placement) {
    case 'top':
      return { ...base, bottom: -ARROW_SIZE, left: '50%', marginLeft: -ARROW_SIZE };
    case 'bottom':
      return { ...base, top: -ARROW_SIZE, left: '50%', marginLeft: -ARROW_SIZE };
    case 'left':
      return { ...base, right: -ARROW_SIZE, top: '50%', marginTop: -ARROW_SIZE };
    case 'right':
      return { ...base, left: -ARROW_SIZE, top: '50%', marginTop: -ARROW_SIZE };
  }
}

function getEntryTransform(placement: TourStepPlacement, visible: boolean): string {
  if (visible) return 'translate(0, 0)';
  switch (placement) {
    case 'top':    return 'translate(0, 4px)';
    case 'bottom': return 'translate(0, -4px)';
    case 'left':   return 'translate(4px, 0)';
    case 'right':  return 'translate(-4px, 0)';
  }
}

function renderContent(content: string): React.ReactNode {
  const parts = content.split('\n');
  if (parts.length === 1) return content;
  return parts.map((part, i) => (
    <React.Fragment key={i}>
      {part}
      {i < parts.length - 1 && <br />}
    </React.Fragment>
  ));
}

export function Tooltip({ content, placement = 'top', enterDelay = 300, disabled = false, children }: TooltipProps) {
  const isTourActive = useTourStore((s) => s.activeTourId !== null);
  const tooltipDescId = useId();

  const { isVisible, position, triggerRef, triggerProps } = useTooltip({
    placement,
    enterDelay,
    disabled: disabled || isTourActive,
  });

  const tooltipRef = useRef<HTMLDivElement>(null);
  const [refinedPosition, setRefinedPosition] = useState(position);
  const [mounted, setMounted] = useState(false);

  // Stable ID for querying the trigger element from the portal
  const tooltipId = useRef(`tooltip-${Math.random().toString(36).slice(2, 9)}`);

  // After portal mounts, measure actual tooltip and refine position
  useLayoutEffect(() => {
    if (!isVisible) {
      setMounted(false);
      return;
    }

    const el = tooltipRef.current;
    if (!el) return;

    const triggerEl = document.querySelector(`[data-tooltip-id="${tooltipId.current}"]`);

    if (triggerEl) {
      const rect = triggerEl.getBoundingClientRect();
      const tooltipRect = el.getBoundingClientRect();
      const gap = 8;
      const padding = 8;
      let top: number;
      let left: number;

      switch (placement) {
        case 'top':
          top = rect.top - tooltipRect.height - gap;
          left = rect.left + rect.width / 2 - tooltipRect.width / 2;
          break;
        case 'bottom':
          top = rect.bottom + gap;
          left = rect.left + rect.width / 2 - tooltipRect.width / 2;
          break;
        case 'left':
          top = rect.top + rect.height / 2 - tooltipRect.height / 2;
          left = rect.left - tooltipRect.width - gap;
          break;
        case 'right':
          top = rect.top + rect.height / 2 - tooltipRect.height / 2;
          left = rect.right + gap;
          break;
      }

      const maxLeft = window.innerWidth - tooltipRect.width - padding;
      const maxTop = window.innerHeight - tooltipRect.height - padding;
      left = Math.max(padding, Math.min(left!, maxLeft));
      top = Math.max(padding, Math.min(top!, maxTop));

      setRefinedPosition({ top, left });
    } else {
      setRefinedPosition(position);
    }

    // Trigger animation on next frame
    requestAnimationFrame(() => setMounted(true));
  }, [isVisible, position, placement]);

  // Merge refs: our triggerRef + child's existing ref
  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      triggerRef(node);
      const childRef = (children as { ref?: React.Ref<HTMLElement> }).ref;
      if (typeof childRef === 'function') {
        childRef(node);
      } else if (childRef && typeof childRef === 'object') {
        (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    [triggerRef, children],
  );

  const trigger = cloneElement(children, {
    ...triggerProps,
    ref: mergedRef,
    'data-tooltip-id': tooltipId.current,
    'aria-describedby': isVisible ? tooltipDescId : undefined,
  } as Record<string, unknown>);

  if (!isVisible) return trigger;

  const tooltip = createPortal(
    <div
      ref={tooltipRef}
      id={tooltipDescId}
      role="tooltip"
      className="bg-zinc-800 dark:bg-zinc-700 text-zinc-100 text-xs px-2.5 py-1.5 rounded-md shadow-lg max-w-[240px] z-[9999] pointer-events-none"
      style={{
        position: 'fixed',
        top: refinedPosition.top,
        left: refinedPosition.left,
        opacity: mounted ? 1 : 0,
        transform: getEntryTransform(placement, mounted),
        transition: 'opacity 150ms ease-out, transform 150ms ease-out',
      }}
    >
      {renderContent(content)}
      <span
        className="bg-zinc-800 dark:bg-zinc-700"
        style={getArrowStyle(placement)}
      />
    </div>,
    document.body,
  );

  return (
    <>
      {trigger}
      {tooltip}
    </>
  );
}
