import { useEffect } from 'react';
import { useRevisionQueueStore } from '../stores/revisionQueueStore';
import { useFileChangeStore } from '../stores/fileChangeStore';
import { useBookStore } from '../stores/bookStore';
import type { RevisionQueueEvent } from '@domain/types';

/**
 * Helper: check whether a sessionId belongs to the currently-loaded plan.
 * Used to prevent events from Book A's queue from leaking into Book B's UI
 * when both queues are running concurrently.
 */
function sessionBelongsToCurrentPlan(sessionId: string): boolean {
  const { plan } = useRevisionQueueStore.getState();
  if (!plan) return false;
  return plan.sessions.some(s => s.id === sessionId);
}

export function useRevisionQueueEvents() {
  useEffect(() => {
    const cleanup = window.novelEngine.revision.onEvent((event: RevisionQueueEvent) => {
      switch (event.type) {
        case 'session:status': {
          if (!sessionBelongsToCurrentPlan(event.sessionId)) return;

          useRevisionQueueStore.setState(state => {
            if (!state.plan) return state;
            const sessions = state.plan.sessions.map(s =>
              s.id === event.sessionId
                ? {
                    ...s,
                    status: event.status,
                    ...(event.conversationId ? { conversationId: event.conversationId } : {}),
                  }
                : s
            );
            const update: Partial<typeof state> & { plan: typeof state.plan } = {
              plan: { ...state.plan, sessions },
            };
            if (event.status === 'running') {
              update.activeSessionId = event.sessionId;
              update.viewingSessionId = event.sessionId;
              update.streamingResponse = '';
              update.streamingThinking = '';
              update.isRunning = true;
            }
            return update;
          });
          break;
        }

        case 'session:chunk': {
          if (!sessionBelongsToCurrentPlan(event.sessionId)) return;
          useRevisionQueueStore.setState(state => ({
            streamingResponse: state.streamingResponse + event.text,
          }));
          break;
        }

        case 'session:thinking': {
          if (!sessionBelongsToCurrentPlan(event.sessionId)) return;
          useRevisionQueueStore.setState(state => ({
            streamingThinking: state.streamingThinking + event.text,
          }));
          break;
        }

        case 'session:gate': {
          if (!sessionBelongsToCurrentPlan(event.sessionId)) return;

          const state = useRevisionQueueStore.getState();
          const session = state.plan?.sessions.find(s => s.id === event.sessionId);
          const convId = session?.conversationId;

          useRevisionQueueStore.setState({
            gateSessionId: event.sessionId,
            gateText: event.gateText,
            viewingSessionId: event.sessionId,
          });

          if (convId) {
            useRevisionQueueStore.getState().loadPanelMessages(convId);
          }
          break;
        }

        case 'session:done': {
          if (!sessionBelongsToCurrentPlan(event.sessionId)) {
            // Still trigger file-change notifications even for other books
            useFileChangeStore.getState().notifyChange();
            return;
          }

          const state = useRevisionQueueStore.getState();
          const session = state.plan?.sessions.find(s => s.id === event.sessionId);
          const convId = session?.conversationId;

          useRevisionQueueStore.setState(state => {
            if (!state.plan) return state;
            const completedTaskNumbers = [
              ...state.plan.completedTaskNumbers,
              ...event.taskNumbers.filter(n => !state.plan!.completedTaskNumbers.includes(n)),
            ];
            return {
              plan: { ...state.plan, completedTaskNumbers },
              activeSessionId: null,
              streamingResponse: '',
              streamingThinking: '',
            };
          });

          if (convId) {
            useRevisionQueueStore.getState().loadPanelMessages(convId);
          }

          useFileChangeStore.getState().notifyChange();
          useBookStore.getState().refreshWordCount();
          break;
        }

        case 'plan:loading-step': {
          useRevisionQueueStore.setState({ loadingStep: event.step });
          break;
        }

        case 'plan:progress': {
          break;
        }

        case 'queue:done': {
          const doneState = useRevisionQueueStore.getState();
          if (doneState.planId === event.planId) {
            useRevisionQueueStore.setState({
              isRunning: false,
              isPaused: false,
            });
          }
          break;
        }

        case 'error': {
          if (!sessionBelongsToCurrentPlan(event.sessionId)) return;
          useRevisionQueueStore.setState({
            error: event.message,
            isRunning: false,
          });
          break;
        }
      }
    });

    return cleanup;
  }, []);
}
