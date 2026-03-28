import { useState, useRef, useCallback } from 'react';
import type { TourStepPlacement } from '@domain/types';

const GAP = 8;
const VIEWPORT_PADDING = 8;

type UseTooltipOptions = {
  placement?: TourStepPlacement;
  enterDelay?: number;
  exitDelay?: number;
  disabled?: boolean;
};

type TooltipPosition = { top: number; left: number };

type UseTooltipReturn = {
  isVisible: boolean;
  position: TooltipPosition;
  show: () => void;
  hide: () => void;
  triggerRef: (node: HTMLElement | null) => void;
  triggerProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  };
};

function computePosition(
  rect: DOMRect,
  placement: TourStepPlacement,
  tooltipWidth: number,
  tooltipHeight: number,
): TooltipPosition {
  let top: number;
  let left: number;

  switch (placement) {
    case 'top':
      top = rect.top - tooltipHeight - GAP;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      break;
    case 'bottom':
      top = rect.bottom + GAP;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - tooltipWidth - GAP;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + GAP;
      break;
  }

  // Clamp to viewport
  const maxLeft = window.innerWidth - tooltipWidth - VIEWPORT_PADDING;
  const maxTop = window.innerHeight - tooltipHeight - VIEWPORT_PADDING;
  left = Math.max(VIEWPORT_PADDING, Math.min(left, maxLeft));
  top = Math.max(VIEWPORT_PADDING, Math.min(top, maxTop));

  return { top, left };
}

export function useTooltip(options: UseTooltipOptions = {}): UseTooltipReturn {
  const {
    placement = 'top',
    enterDelay = 300,
    exitDelay = 100,
    disabled = false,
  } = options;

  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({ top: 0, left: 0 });

  const triggerElRef = useRef<HTMLElement | null>(null);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerRef = useCallback((node: HTMLElement | null) => {
    triggerElRef.current = node;
  }, []);

  const clearTimers = useCallback(() => {
    if (enterTimerRef.current !== null) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    if (exitTimerRef.current !== null) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    if (disabled) return;
    clearTimers();

    enterTimerRef.current = setTimeout(() => {
      const el = triggerElRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      // Estimate tooltip size — actual size depends on content, use reasonable defaults
      // The portal component will refine position once rendered
      const estimatedWidth = 200;
      const estimatedHeight = 32;
      setPosition(computePosition(rect, placement, estimatedWidth, estimatedHeight));
      setIsVisible(true);
    }, enterDelay);
  }, [disabled, clearTimers, enterDelay, placement]);

  const hide = useCallback(() => {
    clearTimers();

    exitTimerRef.current = setTimeout(() => {
      setIsVisible(false);
    }, exitDelay);
  }, [clearTimers, exitDelay]);

  const triggerProps = {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  };

  return { isVisible, position, show, hide, triggerRef, triggerProps };
}
