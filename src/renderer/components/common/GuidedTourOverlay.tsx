import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { TourStep, TourStepPlacement } from '@domain/types';
import { useViewStore } from '../../stores/viewStore';

type GuidedTourOverlayProps = {
  steps: TourStep[];
  isActive: boolean;
  onComplete: () => void;
  onDismiss: () => void;
};

type SpotlightRect = { top: number; left: number; width: number; height: number };

const SPOTLIGHT_PADDING = 8;
const SPOTLIGHT_RADIUS = 8;
const POPOVER_GAP = 12;

/** Build a CSS polygon that covers the full viewport except the spotlight rectangle. */
function buildClipPath(rect: SpotlightRect | null): string {
  if (!rect) return 'none';

  const { top, left, width, height } = rect;
  const r = SPOTLIGHT_RADIUS;

  const t = top;
  const l = left;
  const b = top + height;
  const ri = left + width;

  return `polygon(
    0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
    ${l + r}px ${t}px,
    ${l}px ${t + r}px,
    ${l}px ${b - r}px,
    ${l + r}px ${b}px,
    ${ri - r}px ${b}px,
    ${ri}px ${b - r}px,
    ${ri}px ${t + r}px,
    ${ri - r}px ${t}px,
    ${l + r}px ${t}px
  )`;
}

function computePopoverPosition(
  targetRect: SpotlightRect,
  placement: TourStepPlacement,
  popoverWidth: number,
  popoverHeight: number,
): { top: number; left: number } {
  let top: number;
  let left: number;

  const padded = {
    top: targetRect.top - SPOTLIGHT_PADDING,
    left: targetRect.left - SPOTLIGHT_PADDING,
    width: targetRect.width + SPOTLIGHT_PADDING * 2,
    height: targetRect.height + SPOTLIGHT_PADDING * 2,
  };

  switch (placement) {
    case 'top':
      top = padded.top - popoverHeight - POPOVER_GAP;
      left = padded.left + padded.width / 2 - popoverWidth / 2;
      break;
    case 'bottom':
      top = padded.top + padded.height + POPOVER_GAP;
      left = padded.left + padded.width / 2 - popoverWidth / 2;
      break;
    case 'left':
      top = padded.top + padded.height / 2 - popoverHeight / 2;
      left = padded.left - popoverWidth - POPOVER_GAP;
      break;
    case 'right':
      top = padded.top + padded.height / 2 - popoverHeight / 2;
      left = padded.left + padded.width + POPOVER_GAP;
      break;
  }

  // Viewport clamping
  const vp = 12;
  const maxLeft = window.innerWidth - popoverWidth - vp;
  const maxTop = window.innerHeight - popoverHeight - vp;
  left = Math.max(vp, Math.min(left, maxLeft));
  top = Math.max(vp, Math.min(top, maxTop));

  return { top, left };
}

export function GuidedTourOverlay({ steps, isActive, onComplete, onDismiss }: GuidedTourOverlayProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const navigate = useViewStore((s) => s.navigate);

  const currentStep = steps[currentStepIndex] as TourStep | undefined;

  const positionElements = useCallback(() => {
    if (!currentStep) return;

    const target = document.querySelector(currentStep.targetSelector);
    if (!target) {
      console.warn(`[GuidedTour] Target not found: ${currentStep.targetSelector}, skipping step "${currentStep.id}"`);
      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex((i) => i + 1);
      } else {
        onComplete();
      }
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const rect = target.getBoundingClientRect();
    const spotlight: SpotlightRect = {
      top: rect.top - SPOTLIGHT_PADDING,
      left: rect.left - SPOTLIGHT_PADDING,
      width: rect.width + SPOTLIGHT_PADDING * 2,
      height: rect.height + SPOTLIGHT_PADDING * 2,
    };
    setSpotlightRect(spotlight);

    requestAnimationFrame(() => {
      const popEl = popoverRef.current;
      const popWidth = popEl?.offsetWidth ?? 320;
      const popHeight = popEl?.offsetHeight ?? 200;
      setPopoverPos(computePopoverPosition(
        { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        currentStep.placement,
        popWidth,
        popHeight,
      ));
    });
  }, [currentStep, currentStepIndex, steps.length, onComplete]);

  // On step change: navigate if needed, then position
  useEffect(() => {
    if (!isActive || !currentStep) return;

    if (currentStep.requiredView) {
      navigate(currentStep.requiredView as Parameters<typeof navigate>[0]);
    }

    const rafId = requestAnimationFrame(() => {
      positionElements();
    });

    return () => cancelAnimationFrame(rafId);
  }, [isActive, currentStep, navigate, positionElements]);

  // Reset step index when tour becomes active
  useEffect(() => {
    if (isActive) {
      setCurrentStepIndex(0);
      setSpotlightRect(null);
    }
  }, [isActive]);

  // Reposition on window resize
  useEffect(() => {
    if (!isActive) return;

    const handleResize = () => positionElements();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isActive, positionElements]);

  // ResizeObserver on target element (handles sidebar collapse/expand)
  useEffect(() => {
    if (!isActive || !currentStep) return;

    const target = document.querySelector(currentStep.targetSelector);
    if (!target) return;

    const observer = new ResizeObserver(() => positionElements());
    observer.observe(target);
    return () => observer.disconnect();
  }, [isActive, currentStep, positionElements]);

  // Auto-focus "Next" button on step change
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (isActive && nextButtonRef.current) {
      nextButtonRef.current.focus();
    }
  }, [isActive, currentStepIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'Enter':
          e.preventDefault();
          if (currentStepIndex < steps.length - 1) {
            setCurrentStepIndex((i) => i + 1);
          } else {
            onComplete();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (currentStepIndex > 0) {
            setCurrentStepIndex((i) => i - 1);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onDismiss();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, currentStepIndex, steps.length, onComplete, onDismiss]);

  if (!isActive || !currentStep) return null;

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((i) => i + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((i) => i - 1);
    }
  };

  const isLastStep = currentStepIndex === steps.length - 1;

  return createPortal(
    <>
      {/* Backdrop with spotlight cutout */}
      <div
        className="fixed inset-0 z-[9998] bg-black/50"
        style={{
          clipPath: spotlightRect ? buildClipPath(spotlightRect) : 'none',
          transition: 'clip-path 400ms ease-in-out',
        }}
        onClick={onDismiss}
        aria-hidden="true"
      />

      {/* Popover */}
      <div
        ref={popoverRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Tour step ${currentStepIndex + 1} of ${steps.length}: ${currentStep.title}`}
        className="fixed z-[10000] bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl p-5 max-w-[320px]"
        style={{
          top: popoverPos.top,
          left: popoverPos.left,
          transition: 'top 300ms ease-in-out, left 300ms ease-in-out',
        }}
      >
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {currentStep.title}
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2" aria-live="polite">
          {currentStep.body}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            {currentStepIndex + 1} of {steps.length}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onDismiss}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              Skip Tour
            </button>

            {currentStepIndex > 0 && (
              <button
                onClick={handleBack}
                className="px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded-lg transition-colors"
              >
                Back
              </button>
            )}

            <button
              ref={nextButtonRef}
              onClick={handleNext}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
            >
              {isLastStep ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
